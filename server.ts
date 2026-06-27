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
app.post("/api/parse-pdf", async (req, res) => {
  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "No se ha proporcionado el contenido base64 del PDF." });
    }

    const clientApiKey = req.headers["x-gemini-api-key"] || process.env.GEMINI_API_KEY;
    if (!clientApiKey) {
      return res.status(401).json({ error: "No se ha proporcionado una clave API de Gemini. Configúrala en la interfaz o en las variables de entorno." });
    }

    const keyStr = String(clientApiKey).trim();
    const maskedKey = keyStr.length > 8 
      ? `${keyStr.substring(0, 4)}...${keyStr.substring(keyStr.length - 4)}` 
      : '***';
    const keySource = req.headers["x-gemini-api-key"] ? 'Cabecera del Cliente' : 'Env del Servidor';
    console.log(`[Parse PDF] Utilizando clave API Gemini: ${maskedKey} (Origen: ${keySource})`);

    // Strip raw data scheme URI prefix if any
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");

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

    // Strip markdown code block wrappers if modern models append them
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
