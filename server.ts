/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import * as pdf from "pdf-parse";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Security and CORS middleware configurations
app.use(helmet({
  contentSecurityPolicy: false, // Avoid blocking styling/images and modules loaded in preview frames
  frameguard: false,            // Crucial so the application can render seamlessly in AI Studio iframe
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
}));

app.use(cors({
  origin: true, // Allow credential sharing and dynamic origins from the platform preview url
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Set high request body limits for handling uploaded base64 PDF graphics cleanly
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Init server-side Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

/**
 * Endpoint to parse delivery labels from uploaded PDF multi-page doc
 */
/**
 * Helper to parse page text using regex heuristics.
 * Supports the 3 main types of delivery labels in the project.
 */
function parsePageText(text: string): { version: string; address: string; quantity: number } {
  // Clean up whitespace
  const cleanText = text.replace(/\s+/g, ' ').trim();

  // 1. Find quantity: looking for digits followed by "ej" (case-insensitive)
  const qtyMatch = cleanText.match(/(\d+)\s*ej/i);
  if (!qtyMatch) {
    return {
      version: 'Desconocido',
      address: cleanText,
      quantity: 0
    };
  }

  const quantity = parseInt(qtyMatch[1], 10);
  const qtyString = qtyMatch[0]; // e.g. "21865 ej" or "25 ej"

  // 2. Split the text into before and after the quantity
  const qtyIndex = cleanText.indexOf(qtyString);
  const textBefore = cleanText.substring(0, qtyIndex).trim();
  const textAfter = cleanText.substring(qtyIndex + qtyString.length).trim();

  let version = 'Estándar';
  let address = '';

  // 3. Determine Template Type & Extract Version and Address
  const entregaMatch = cleanText.match(/Entrega en\s*:\s*(.*)/i);
  if (entregaMatch) {
    address = entregaMatch[1].trim();
    const versionMatch = textBefore.match(/([^-–]+)\s*[-–]\s*$/);
    if (versionMatch) {
      version = versionMatch[1].trim();
    } else {
      const segments = textBefore.split(/[-–]/);
      version = segments[segments.length - 1]?.trim() || 'Estándar';
    }
  } else {
    const knownVersions = ['ahorramás', 'catalán', 'galicia', 'euskera', 'estándar', 'castellano', 'atracción'];
    const firstWordAfter = textAfter.split(' ')[0]?.trim() || '';
    
    if (knownVersions.includes(firstWordAfter.toLowerCase())) {
      version = firstWordAfter;
      address = textAfter.substring(firstWordAfter.length).trim();
    } else {
      address = textAfter;
      const versionMatch = textBefore.match(/(ATRACCIÓN\s+)?(CASTELLANO|EUSKERA|GALICIA|CATALÁN|ESTÁNDAR)/i);
      if (versionMatch) {
        version = versionMatch[0].trim();
      } else {
        const segments = textBefore.split(' ');
        version = segments.slice(-2).join(' ').trim();
      }
    }
  }

  // Clean campaign metadata
  version = version.replace(/FAMILY CASH|1Q|2Q|JUNIO|JULIO|FOLLETO|MARKET|\d+/gi, '').replace(/\s+/g, ' ').trim();
  if (!version) {
    version = 'Estándar';
  }

  return {
    version: version,
    address: address || 'Dirección no identificada',
    quantity: quantity
  };
}

/**
 * Endpoint to parse delivery labels from uploaded PDF multi-page doc
 */
app.post("/api/parse-pdf", async (req, res) => {
  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "No se ha proporcionado el contenido base64 del PDF." });
    }

    // Strip raw data scheme URI prefix if any
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
    const pdfBuffer = Buffer.from(cleanBase64, "base64");

    // 1. Attempt local parsing first (100% Free & Fast)
    try {
      console.log("[Parse PDF] Intentando parseo local gratuito con pdf-parse...");
      const parser = new pdf.PDFParse({ data: pdfBuffer });
      const textResult = await parser.getText();
      const parsedData: Array<{ version: string; address: string; quantity: number }> = [];

      for (const page of textResult.pages) {
        const itemResult = parsePageText(page.text);
        parsedData.push(itemResult);
      }

      await parser.destroy();

      // Verify that we parsed at least one page with valid quantities
      const validResults = parsedData.filter(item => item.quantity > 0);
      if (validResults.length > 0) {
        console.log(`[Parse PDF] Parseo local exitoso de forma gratuita. Páginas procesadas: ${parsedData.length}`);
        return res.json({ success: true, count: parsedData.length, data: parsedData });
      }
    } catch (localError) {
      console.warn("[Parse PDF] El parseo local no devolvió resultados válidos o falló. Reintentando con Gemini...", localError);
    }

    // 2. Fallback to Gemini AI if a valid client API key is configured
    const clientApiKey = req.headers["x-gemini-api-key"] || process.env.GEMINI_API_KEY;
    const isKeyConfigured = clientApiKey && !String(clientApiKey).startsWith("AQ.Ab8RN6LG");

    if (!isKeyConfigured) {
      return res.status(400).json({
        error: "El parseo automático local falló y no hay ninguna clave API de Gemini válida configurada en el servidor ni en la interfaz para el fallback por IA. Por favor, introduce tu API Key en la barra superior (icono ⚙️)."
      });
    }

    const keyStr = String(clientApiKey).trim();
    const maskedKey = keyStr.length > 8 
      ? `${keyStr.substring(0, 4)}...${keyStr.substring(keyStr.length - 4)}` 
      : '***';
    const keySource = req.headers["x-gemini-api-key"] ? 'Cabecera del Cliente' : 'Env del Servidor';
    console.log(`[Parse PDF] Ejecutando análisis por IA (Gemini). Clave: ${maskedKey} (Origen: ${keySource})`);

    const requestAi = new GoogleGenAI({
      apiKey: String(clientApiKey),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const response = await requestAi.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: cleanBase64
              }
            },
            {
              text: "Analiza el documento PDF de albaranes de distribución de Altavia Iberica u otra logística. " +
                "Estudia secuencialmente CADA pág/etiqueta y extrae la versión, dirección completa y tirada (ejemplares). " +
                "Determina exactamente una partida de distribución por cada página del PDF en el exacto orden secuencial de aparición. " +
                "No omitas ninguna página."
            }
          ]
        }
      ],
      config: {
        systemInstruction: "Eres un ingeniero logístico experto en procesar albaranes e impresos masivos. " +
          "Debes extraer los siguientes campos de cada página del PDF de etiquetas:\n" +
          "1. version: El idioma o tipo de folleto (ej: 'Catalán', 'Euskera', 'Galicia', 'Ahorramás', 'Estándar'). Si no dice explícitamente se asume 'Estándar'.\n" +
          "2. address: El bloque continuo de dirección del cliente o transporte con su nombre de empresa, calle, código postal, localidad (ej: 'Transportes Germans - C/ Joan Brossa, 8 Reus Tarragona', etc).\n" +
          "3. quantity: El valor de la tirada. Busca cifras grandes al lado del sufijo 'ej' o 'ejemplares' (ej: '296395 ej' -> 296395). Extrae el valor puramente numérico entero.\n\n" +
          "Devuelve de forma obligatoria un array JSON válido donde cada item corresponda estrictamente con la página del PDF secuencial.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "Lista ordenada de partidas de distribución, una para cada página del PDF en orden secuencial.",
          items: {
            type: Type.OBJECT,
            properties: {
              version: {
                type: Type.STRING,
                description: "Idioma o nombre de la versión de folleto (ej: 'Euskera')."
              },
              address: {
                type: Type.STRING,
                description: "Dirección, receptor y teléfonos unificados en una sola línea."
              },
              quantity: {
                type: Type.INTEGER,
                description: "Tirada completa en número entero (ej: 159541)."
              }
            },
            required: ["version", "address", "quantity"]
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("La IA no devolvió ningún JSON estructurado para el PDF.");
    }

    let cleanJson = jsonText.trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }

    const data = JSON.parse(cleanJson.trim());
    return res.json({ success: true, count: data.length, data });
  } catch (error: any) {
    console.error("Error parsing labels PDF via Gemini API:", error);
    const keySource = req.headers["x-gemini-api-key"] ? 'la interfaz del navegador (Client Header)' : 'las variables del servidor (Server Env)';
    const errMsg = error?.message || JSON.stringify(error);
    return res.status(500).json({ 
      error: `Error de análisis por IA (Clave usada de: ${keySource}): ${errMsg}. Por favor, comprueba que tu API Key sea válida, activa y con cuota de uso en Google AI Studio.`
    });
  }
});

// Configure Vite or Serve static built directory
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server logs: running on port ${PORT}`);
  });
}

bootstrap();
