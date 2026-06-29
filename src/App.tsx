/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, ChangeEvent } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { 
  FileSpreadsheet, 
  Upload, 
  FileText, 
  Printer, 
  Download, 
  Trash2, 
  Plus, 
  Sparkles, 
  Sliders, 
  CheckCircle, 
  AlertCircle, 
  HelpCircle, 
  Maximize2, 
  SlidersHorizontal,
  ChevronRight,
  Database,
  FileCheck,
  Edit2,
  X,
  BrainCircuit,
  Loader2,
  ExternalLink,
  Package,
  Truck,
  Settings,
  Sun,
  Moon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { DistributionItem, PalletResult } from './types';
import { DEMO_DISTRIBUTIONS, SAMPLE_EXCEL_CSV } from './demoData';
import { 
  calculatePalletsForQuantity, 
  generateModifiedPdf, 
  generateSinglePagePreview, 
  formatQuantitySpain,
  generateAlbaranesPdf,
  generateSinglePageAlbaranesPreview
} from './pdfEngine';
import CubicajeModule from './CubicajeModule';
import { PalletEditorModal } from './PalletEditorModal';
import { exportDesgloseToExcel, exportDesgloseToPdf } from './exportUtils';
import { Transport, MaquetaStylesConfig } from './types';
import { TransportManager } from './TransportManager';

export default function App() {
  // Application parameters (committed values used by the PDF engine)
  const [fullPalletSize, setFullPalletSize] = useState<number | ''>('');
  const [minPico, setMinPico] = useState<number | ''>('');

  // Draft values bound to the numeric inputs — only committed on "Aplicar" click
  const [draftFullPalletSize, setDraftFullPalletSize] = useState<string>('');
  const [draftMinPico, setDraftMinPico] = useState<string>('');
  // Track whether drafts differ from committed values (to show the apply button as active)
  const [paramsAreDirty, setParamsAreDirty] = useState<boolean>(false);

  // Tab switcher
  const [activeTab, setActiveTab] = useState<'etiquetas' | 'albaranes' | 'cubicaje'>('etiquetas');

  // Albaranes PDF state
  const [albaranesPdfFileBytes, setAlbaranesPdfFileBytes] = useState<ArrayBuffer | null>(null);
  const [albaranesPdfFileName, setAlbaranesPdfFileName] = useState<string>('');

  // Albaranes Stamping parameters
  const [albaranesFullPalletSize, setAlbaranesFullPalletSize] = useState<number | ''>('');
  const [albaranesMinPico, setAlbaranesMinPico] = useState<number | ''>('');
  const [albaranesTextTemplate, setAlbaranesTextTemplate] = useState<string>("");
  const [albaranesFontSize, setAlbaranesFontSize] = useState<number>(22);
  const [albaranesTextColor, setAlbaranesTextColor] = useState<string>('#000000'); // Standard official black for delivery notes
  const [albaranesPositionY, setAlbaranesPositionY] = useState<number>(80); // Fits inside "Firma de Recepción y Sello" box
  const [albaranesPositionX, setAlbaranesPositionX] = useState<number>(380); // Good default right-offset
  const [albaranesCenterAlign, setAlbaranesCenterAlign] = useState<boolean>(false);

  // Lists & uploaded assets
  const [distributionList, setDistributionList] = useState<DistributionItem[]>([]);
  const [pdfFileBytes, setPdfFileBytes] = useState<ArrayBuffer | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [templateEtiquetasCount, setTemplateEtiquetasCount] = useState<number>(0);
  const [templateAlbaranesCount, setTemplateAlbaranesCount] = useState<number>(0);

  // UI state
  const [manualVersion, setManualVersion] = useState<string>('');
  const [manualAddress, setManualAddress] = useState<string>('');
  const [manualQuantity, setManualQuantity] = useState<number | ''>('');
  const [manualBarcode, setManualBarcode] = useState<string>('');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingPalletItemIndex, setEditingPalletItemIndex] = useState<number | null>(null);

  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);
  
  // Customization styling parameters for PDF writing
  const [textTemplate, setTextTemplate] = useState<string>("");
  const [fontSize, setFontSize] = useState<number>(36);
  const [textColor, setTextColor] = useState<string>('#e11d48'); // Red accent, highly standout and clear
  const [positionY, setPositionY] = useState<number>(420); // Standard height from bottom of page
  const [positionX, setPositionX] = useState<number>(50); 
  const [centerAlign, setCenterAlign] = useState<boolean>(true);
  
  // Estilo Base Maqueta Maestra
  const [maquetaStyles, setMaquetaStyles] = useState<MaquetaStylesConfig>({
    header: { color: '#000000', sizeOffset: 0 },
    sender: { color: '#000000', sizeOffset: 0 },
    address: { color: '#000000', sizeOffset: 0 },
    version: { color: '#000000', sizeOffset: 0 },
    palletQty: { color: '#000000', sizeOffset: 0 },
    palletNo: { color: '#000000', sizeOffset: 0 },
    totalQty: { color: '#000000', sizeOffset: 0 },
  });

  const [etiquetasPreviewUrl, setEtiquetasPreviewUrl] = useState<string | null>(null);
  const [albaranesPreviewUrl, setAlbaranesPreviewUrl] = useState<string | null>(null);
  const activePreviewUrl = activeTab === 'etiquetas' ? etiquetasPreviewUrl : albaranesPreviewUrl;
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

  // Configuración de Remitente
  const [senderName, setSenderName] = useState<string>(() => localStorage.getItem('paletik_senderName') || "ALTAVIA IBERICA");
  const [senderDetails, setSenderDetails] = useState<string>(() => localStorage.getItem('paletik_senderDetails') || "ALTAVIA IBERICA S.A.\nPLANIFICACION LOGISTICA INDUSTRIAL");

  useEffect(() => {
    localStorage.setItem('paletik_senderName', senderName);
  }, [senderName]);

  useEffect(() => {
    localStorage.setItem('paletik_senderDetails', senderDetails);
  }, [senderDetails]);

  // Clave API de Gemini y visibilidad de ajustes
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem('paletik_gemini_api_key') || '');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('paletik_gemini_api_key', geminiApiKey);
  }, [geminiApiKey]);

  // Módulo de Albaranes - Transportes
  const [transports, setTransports] = useState<Transport[]>([]);

  // Statuses
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isProcessingPdf, setIsProcessingPdf] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<number>(0);
  const [isAnalyzingPdf, setIsAnalyzingPdf] = useState<boolean>(false);

  // Safe async arrayBuffer to base64 converter using native browser FileReader to prevent heap/thread blocking and call stack errors on mobile devices
  const arrayBufferToBase64 = (buffer: ArrayBuffer): Promise<string> => {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrlStr = evt.target?.result as string;
        if (!dataUrlStr) {
          reject(new Error("No se pudo leer el archivo cargado."));
          return;
        }
        const base64 = dataUrlStr.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => {
        reject(new Error("Error al convertir PDF en base64."));
      };
      reader.readAsDataURL(blob);
    });
  };

  // Analyze page content sequentially using server-side Gemini API
  const handleAnalyzePdfWithAI = async () => {
    const activePdf = activeTab === 'etiquetas' ? pdfFileBytes : albaranesPdfFileBytes;
    if (!activePdf) {
      setErrorMsg(`Debe cargar un documento de ${activeTab === 'etiquetas' ? 'etiquetas' : 'albaranes'} PDF antes de iniciar el análisis.`);
      return;
    }

    setIsAnalyzingPdf(true);
    setSuccessMsg(`Iniciando análisis del PDF de ${activeTab === 'etiquetas' ? 'etiquetas' : 'albaranes'} (procesamiento local gratuito)... Por favor espere.`);
    setErrorMsg("");

    try {
      const base64Data = await arrayBufferToBase64(activePdf);
      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (geminiApiKey.trim()) {
        reqHeaders["x-gemini-api-key"] = geminiApiKey.trim();
      }

      const response = await fetch("/api/parse-pdf", {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({ pdfBase64: base64Data })
      });

      if (!response.ok) {
        const errDetails = await response.json().catch(() => ({}));
        throw new Error(errDetails.error || `Error del servidor (Código ${response.status})`);
      }

      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        if (result.data.length === 0) {
          throw new Error("No se pudo detectar ninguna página o dato de distribución en el PDF.");
        }

        const parsedItems = result.data.map((item: any, idx: number) => ({
          id: `AI-LOG-${idx}-${Date.now()}`,
          version: String((item && item.version) || "Estándar").trim(),
          address: String((item && item.address) || "Dirección no identificada").trim(),
          quantity: item && typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 10000
        }));

        setDistributionList(parsedItems);
        setSelectedPreviewItemIdx(0);
        setSuccessMsg(`¡Sincronización Exitosa! Se han extraído e inyectado ${parsedItems.length} partidas de distribución desde el PDF.`);
      } else {
        throw new Error("El formato de respuesta de la IA es inesperado.");
      }
    } catch (err: any) {
      console.error("Error running AI analysis on PDF pages:", err);
      setErrorMsg(`Error de análisis por IA: ${err?.message || err}`);
    } finally {
      setIsAnalyzingPdf(false);
    }
  };

  // Selected line for real-time visual alignment preview
  const [selectedPreviewItemIdx, setSelectedPreviewItemIdx] = useState<number>(0);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string>('');
  const [previewMode, setPreviewMode] = useState<'simulated' | 'pdf'>('pdf');

  // Floating Help Panel
  const [showFormulaExplanation, setShowFormulaExplanation] = useState<boolean>(false);

  // Ref for file uploads
  const excelInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Autoclear notifications
  useEffect(() => {
    if (successMsg || errorMsg) {
      const timer = setTimeout(() => {
        setSuccessMsg('');
        setErrorMsg('');
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [successMsg, errorMsg]);

  // Sincronización automática Módulo 1 → Módulo 2:
  // Los parámetros de albaranes se actualizan siempre que cambien los de etiquetas,
  // de forma que el usuario no tenga que introducirlos dos veces.
  useEffect(() => {
    setAlbaranesFullPalletSize(fullPalletSize);
  }, [fullPalletSize]);

  useEffect(() => {
    setAlbaranesMinPico(minPico);
  }, [minPico]);

  // Keep draft inputs in sync when committed values change from external sources
  // (e.g. when switching tabs or loading demo data)
  useEffect(() => {
    if (!paramsAreDirty) {
      setDraftFullPalletSize(fullPalletSize === '' ? '' : String(fullPalletSize));
    }
  }, [fullPalletSize]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!paramsAreDirty) {
      setDraftMinPico(minPico === '' ? '' : String(minPico));
    }
  }, [minPico]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handler: commit draft values → real state → triggers preview regeneration
  const handleApplyParams = () => {
    const parsedFull = draftFullPalletSize === '' ? '' : parseInt(draftFullPalletSize, 10);
    const parsedPico = draftMinPico === '' ? '' : parseInt(draftMinPico, 10);

    if (draftFullPalletSize !== '' && (isNaN(parsedFull as number) || (parsedFull as number) <= 0)) {
      setErrorMsg('Capacidad Palet Completo debe ser un número positivo.');
      return;
    }
    if (draftMinPico !== '' && (isNaN(parsedPico as number) || (parsedPico as number) <= 0)) {
      setErrorMsg('Corte de Pico Mínimo debe ser un número positivo.');
      return;
    }

    setFullPalletSize(parsedFull);
    setMinPico(parsedPico);
    setParamsAreDirty(false);
    setSuccessMsg('Parámetros aplicados. Previsualizando cambios...');
  };

  // Debounced preview: evita regenerar el PDF en cada pulsación de tecla
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePreviewAbortRef = useRef<boolean>(false);

  useEffect(() => {
    // Cancelar cualquier timer pendiente
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
    }
    // Señal para cancelar la operación async anterior si aún estaba en vuelo
    activePreviewAbortRef.current = false;

    // Solo regenerar el PDF real si el modo es 'pdf' y hay PDF cargado
    // En modo 'simulated' no hace falta generar ningún PDF
    const activePdfBytes = activeTab === 'etiquetas' ? pdfFileBytes : albaranesPdfFileBytes;
    if (!activePdfBytes || previewMode !== 'pdf') {
      if (!activePdfBytes) setPreviewPdfUrl('');
      return;
    }

    previewDebounceRef.current = setTimeout(async () => {
      const localActive = { current: true };
      activePreviewAbortRef.current = true;

      const activeItem = distributionList[selectedPreviewItemIdx] || distributionList[0];
      if (!activeItem) return;

      const safeFullPalletSize = typeof fullPalletSize === 'number' ? fullPalletSize : 21000;
      const safeMinPico = typeof minPico === 'number' ? minPico : 2800;
      const safeAlbaranesFullPalletSize = typeof albaranesFullPalletSize === 'number' ? albaranesFullPalletSize : 21000;
      const safeAlbaranesMinPico = typeof albaranesMinPico === 'number' ? albaranesMinPico : 2800;

      try {
        let previewBytes: Uint8Array | null = null;
        if (activeTab === 'etiquetas') {
          previewBytes = await generateSinglePagePreview(
            activeItem,
            selectedPreviewItemIdx,
            activePdfBytes,
            safeFullPalletSize,
            safeMinPico,
            textTemplate,
            fontSize,
            textColor,
            positionY,
            positionX,
            centerAlign,
            pdfFileName.includes('Original.pdf')
          );
        } else {
          previewBytes = await generateSinglePageAlbaranesPreview(
            activeItem,
            selectedPreviewItemIdx,
            activePdfBytes,
            safeAlbaranesFullPalletSize,
            safeAlbaranesMinPico,
            albaranesTextTemplate,
            albaranesFontSize,
            albaranesTextColor,
            albaranesPositionY,
            albaranesPositionX,
            albaranesCenterAlign,
            albaranesPdfFileName.includes('Original.pdf')
          );
        }

        if (previewBytes && localActive.current) {
          const blob = new Blob([previewBytes], { type: 'application/pdf' });
          setPreviewPdfUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        }
      } catch (err) {
        console.error('Preview generation error:', err);
      }
    }, 600); // 600ms debounce — rápido pero sin bloquear al escribir

    return () => {
      if (previewDebounceRef.current) {
        clearTimeout(previewDebounceRef.current);
      }
    };
  }, [
    pdfFileBytes,
    albaranesPdfFileBytes,
    activeTab,
    previewMode,
    selectedPreviewItemIdx,
    distributionList,
    fullPalletSize,
    minPico,
    textTemplate,
    fontSize,
    textColor,
    positionY,
    positionX,
    centerAlign,
    albaranesFullPalletSize,
    albaranesMinPico,
    albaranesTextTemplate,
    albaranesFontSize,
    albaranesTextColor,
    albaranesPositionY,
    albaranesPositionX,
    albaranesCenterAlign
  ]);

  // Revoke preview URL only on unmount (no en cada render)
  const previewPdfUrlRef = useRef(previewPdfUrl);
  previewPdfUrlRef.current = previewPdfUrl;
  useEffect(() => {
    return () => {
      if (previewPdfUrlRef.current) {
        URL.revokeObjectURL(previewPdfUrlRef.current);
      }
    };
  }, []); // Solo al desmontar el componente

  // Compute stats of current palletization layout
  const distributionStats = useMemo(() => {
    let totalLeaflets = 0;
    let totalPalletsCount = 0;
    let totalFullPallets = 0;
    let totalPeakPallets = 0;
    let adjustedPalletsCount = 0;

    const size = activeTab === 'etiquetas' 
      ? (typeof fullPalletSize === 'number' ? fullPalletSize : 21000) 
      : (typeof albaranesFullPalletSize === 'number' ? albaranesFullPalletSize : 21000);
    const pico = activeTab === 'etiquetas' 
      ? (typeof minPico === 'number' ? minPico : 2800) 
      : (typeof albaranesMinPico === 'number' ? albaranesMinPico : 2800);

    distributionList.forEach(item => {
      totalLeaflets += item.quantity;
      const pallets = item.customPallets || calculatePalletsForQuantity(item.quantity, size, pico);
      totalPalletsCount += pallets.length;
      
      pallets.forEach(p => {
        if (p.quantity === size) {
          totalFullPallets++;
        } else {
          totalPeakPallets++;
        }
        if (p.isAdjusted) {
          adjustedPalletsCount++;
        }
      });
    });

    return {
      totalLeaflets,
      totalPalletsCount,
      totalFullPallets,
      totalPeakPallets,
      adjustedPalletsCount
    };
  }, [distributionList, activeTab, fullPalletSize, minPico, albaranesFullPalletSize, albaranesMinPico]);

  // Import custom pasted CSV data
  const handleLoadCsvPaste = () => {
    try {
      const rows = SAMPLE_EXCEL_CSV.trim().split('\n');
      const header = rows[0]; // Versión,Dirección,Tirada
      
      const parsed: DistributionItem[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        
        // Simple CSV splitter that respects quotes
        const matches = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (!matches || matches.length < 3) continue;
        
        const version = matches[0].replace(/"/g, '').trim();
        const address = matches[1].replace(/"/g, '').trim();
        const qty = parseInt(matches[2].replace(/"/g, '').replace(/\D/g, '')) || 0;
        
        parsed.push({
          id: `PASTE-${i}-${Date.now()}`,
          version,
          address,
          quantity: qty
        });
      }

      if (parsed.length > 0) {
        setDistributionList(parsed);
        setSelectedPreviewItemIdx(0);
        setSuccessMsg(`Se han cargado ${parsed.length} registros del lote de ejemplo de Euskera, Galicia y estándar.`);
      }
    } catch (err) {
      setErrorMsg('No se pudo procesar la información del CSV de ejemplo.');
    }
  };

  // Excel Loader via sheetjs
  const handleExcelUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear value to allow selecting/uploading the same file again
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const arrayBuf = evt.target?.result as ArrayBuffer;
        const dataBytes = new Uint8Array(arrayBuf);
        const workbook = XLSX.read(dataBytes, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (jsonData.length === 0) {
          setErrorMsg('El archivo Excel cargado está vacío.');
          return;
        }

        const mapped = jsonData.map((row, idx) => {
          const keys = Object.keys(row);
          // Auto-detection of columns
          const versionKey = keys.find(k => k.toLowerCase().includes('vers') || k.toLowerCase().includes('idiom') || k.toLowerCase().includes('tipo')) || keys[0];
          const addressKey = keys.find(k => k.toLowerCase().includes('dir') || k.toLowerCase().includes('dest') || k.toLowerCase().includes('pob') || k.toLowerCase().includes('cli') || k.toLowerCase().includes('lugar')) || keys[1];
          const qtyKey = keys.find(k => k.toLowerCase().includes('tir') || k.toLowerCase().includes('cant') || k.toLowerCase().includes('ej') || k.toLowerCase().includes('uni') || k.toLowerCase().includes('tot')) || keys[2];
          const barcodeKey = keys.find(k => k.toLowerCase().includes('barr') || k.toLowerCase().includes('obs') || k.toLowerCase().includes('cod')) || keys[3];

          // parse digits cleanly
          let numericVal = 5000;
          if (row[qtyKey] !== undefined) {
            const rawVal = String(row[qtyKey]).replace(/\./g, '').replace(/,/g, '').trim();
            numericVal = parseInt(rawVal.replace(/\D/g, '')) || 5000;
          }

          return {
            id: `XLS-${idx}-${Date.now()}`,
            version: String(row[versionKey] || 'Estándar').trim(),
            address: String(row[addressKey] || 'Dirección no especificada').trim(),
            quantity: numericVal,
            barcode: barcodeKey && row[barcodeKey] ? String(row[barcodeKey]).trim() : undefined
          };
        });

        setDistributionList(mapped);
        setSelectedPreviewItemIdx(0);
        setSuccessMsg(`Se han importado exitosamente ${mapped.length} filas desde el Excel "${file.name}".`);
      } catch (err) {
        setErrorMsg('Error al leer el archivo Excel. Revisa el formato.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // PDF Loader File
  const handlePdfUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear value to allow selecting/uploading the same file again
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        if (activeTab === 'etiquetas') {
          setPdfFileBytes(evt.target.result as ArrayBuffer);
          setPdfFileName(file.name);
          setSuccessMsg(`PDF con etiquetas cargado correctamente: ${file.name}`);
        } else {
          setAlbaranesPdfFileBytes(evt.target.result as ArrayBuffer);
          setAlbaranesPdfFileName(file.name);
          setSuccessMsg(`PDF con albaranes cargado correctamente: ${file.name}`);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const buildOriginalPdfBytes = async (itemsToCreate: DistributionItem[]) => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    for (let i = 0; i < itemsToCreate.length; i++) {
      const item = itemsToCreate[i];
      const page = pdfDoc.addPage([595.27, 841.89]); // A4 Size
      const { width, height } = page.getSize();
      
      const hexToRgbCustom = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return rgb(r, g, b);
      };
      const blackColor = rgb(0, 0, 0);
      const grayColor = rgb(0.3, 0.3, 0.3);

      // 1. Draw Outer Border (thick line)
      page.drawRectangle({
        x: 30, y: 30, width: width - 60, height: height - 60, borderColor: blackColor, borderWidth: 2,
      });

      // 2. Draw Horizontal Grid lines
      page.drawLine({ start: { x: 30, y: 750 }, end: { x: width - 30, y: 750 }, thickness: 1.5, color: blackColor });
      page.drawLine({ start: { x: 30, y: 690 }, end: { x: width - 30, y: 690 }, thickness: 1.5, color: blackColor });
      page.drawLine({ start: { x: 30, y: 490 }, end: { x: width - 30, y: 490 }, thickness: 1.5, color: blackColor });
      page.drawLine({ start: { x: 30, y: 410 }, end: { x: width - 30, y: 410 }, thickness: 1.5, color: blackColor });
      page.drawLine({ start: { x: 30, y: 270 }, end: { x: width - 30, y: 270 }, thickness: 1.5, color: blackColor });

      // 3. Draw Vertical Grid lines
      page.drawLine({ start: { x: width / 2, y: 690 }, end: { x: width / 2, y: 750 }, thickness: 1.5, color: blackColor });
      page.drawLine({ start: { x: 210, y: 270 }, end: { x: 210, y: 410 }, thickness: 1.5, color: blackColor });
      page.drawLine({ start: { x: 380, y: 270 }, end: { x: 380, y: 410 }, thickness: 1.5, color: blackColor });

      // 4. Fill Header content
      page.drawText(senderName || "ALTAVIA IBERICA", {
        x: 45, y: 770, size: 22 + maquetaStyles.header.sizeOffset, font: boldFont, color: hexToRgbCustom(maquetaStyles.header.color),
      });

      // 5. Fill Sender / Date content
      page.drawText("DE / FROM:", { x: 45, y: 735, size: 7, font: boldFont, color: grayColor });
      const detailsLines = (senderDetails || "ALTAVIA IBERICA S.A.\nPLANIFICACION LOGISTICA INDUSTRIAL").split('\n');
      if (detailsLines[0]) page.drawText(detailsLines[0], { x: 45, y: 720, size: 10 + maquetaStyles.sender.sizeOffset, font: boldFont, color: hexToRgbCustom(maquetaStyles.sender.color) });
      if (detailsLines[1]) page.drawText(detailsLines[1], { x: 45, y: 705, size: 8 + maquetaStyles.sender.sizeOffset, font: font, color: hexToRgbCustom(maquetaStyles.sender.color) });
      if (detailsLines[2]) page.drawText(detailsLines[2], { x: 45, y: 690, size: 8 + maquetaStyles.sender.sizeOffset, font: font, color: hexToRgbCustom(maquetaStyles.sender.color) });

      const currentDate = new Date().toLocaleDateString('es-ES');
      page.drawText("FECHA / DATE:", { x: width / 2 + 15, y: 735, size: 7, font: boldFont, color: grayColor });
      page.drawText(currentDate, { x: width / 2 + 15, y: 715, size: 12 + maquetaStyles.sender.sizeOffset, font: boldFont, color: hexToRgbCustom(maquetaStyles.sender.color) });

      // 6. Fill Destination content (A / SHIP TO)
      page.drawText("A / SHIP TO (DESTINATARIO):", { x: 45, y: 665, size: 8, font: boldFont, color: grayColor });
      
      const rawAddr = item.address;
      let addrFontSize = 18;
      let addrLineLen = 38;
      let addrLineSpacing = 26;
      
      if (rawAddr.length > 150) { addrFontSize = 12; addrLineLen = 55; addrLineSpacing = 16; } 
      else if (rawAddr.length > 80) { addrFontSize = 14; addrLineLen = 48; addrLineSpacing = 20; }

      const addrLines = [];
      for (let idx = 0; idx < rawAddr.length; idx += addrLineLen) {
        addrLines.push(rawAddr.substring(idx, idx + addrLineLen));
      }
      addrLines.slice(0, 6).forEach((line, index) => {
        page.drawText(line.trim().toUpperCase(), {
          x: 45, y: 635 - (index * addrLineSpacing), size: addrFontSize + maquetaStyles.address.sizeOffset, font: boldFont, color: hexToRgbCustom(maquetaStyles.address.color),
        });
      });

      // 7. Fill Version content (VERSIÓN / ITEM VERSION)
      page.drawText("VERSION DE LA PUBLICACION / ITEM VERSION:", { x: 45, y: 472, size: 8, font: boldFont, color: grayColor });
      const rawVersion = item.version.toUpperCase();
      let versionFontSize = 26;
      if (rawVersion.length > 20) versionFontSize = 14;
      else if (rawVersion.length > 12) versionFontSize = 18;

      page.drawText(rawVersion, {
        x: 45, y: 430, size: versionFontSize + maquetaStyles.version.sizeOffset, font: boldFont, color: hexToRgbCustom(maquetaStyles.version.color),
      });

      // 8. Fill Pallet Details labels and static total quantity
      page.drawText("CANTIDAD ESTE PALET / PALLET QTY", { x: 45, y: 392, size: 7, font: boldFont, color: grayColor });
      page.drawText("PALET N° / PALLET NO.", { x: 225, y: 392, size: 7, font: boldFont, color: grayColor });
      page.drawText("TIRADA TOTAL / TOTAL RUN QTY", { x: 395, y: 392, size: 7, font: boldFont, color: grayColor });
      page.drawText(`${formatQuantitySpain(item.quantity)} EJEM.`, {
        x: 395, y: 340, size: 18 + maquetaStyles.totalQty.sizeOffset, font: boldFont, color: hexToRgbCustom(maquetaStyles.totalQty.color),
      });

      // 9. Fill Barcode area label - REPURPOSED AS OBSERVACIONES AS REQUESTED
      page.drawText("OBSERVACIONES / OBSERVATIONS", { x: 45, y: 250, size: 7, font: boldFont, color: grayColor });
      page.drawRectangle({ x: 45, y: 150, width: 250, height: 90, color: rgb(0.95, 0.95, 0.95), borderColor: grayColor, borderWidth: 1 });
      
      if (item.barcode) {
        const obsWords = item.barcode.split(' ');
        let obsLine = '';
        let obsY = 225;
        for (const word of obsWords) {
          if ((obsLine + word).length > 40) {
            page.drawText(obsLine, { x: 55, y: obsY, size: 9, font: font, color: blackColor });
            obsLine = word + ' ';
            obsY -= 12;
          } else {
            obsLine += word + ' ';
          }
        }
        if (obsLine) page.drawText(obsLine, { x: 55, y: obsY, size: 9, font: font, color: blackColor });
      }
    }
    return await pdfDoc.save();
  };

  const buildAlbaranPdfBytes = async (transportsList: Transport[], dList: DistributionItem[]) => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const hexToRgbCustom = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return rgb(r, g, b);
    };

    const accentColor = hexToRgbCustom(maquetaStyles.header.color || '#e11d48');
    const blackColor = rgb(0.1, 0.1, 0.1);
    const grayColor = rgb(0.4, 0.4, 0.4);
    const lightGray = rgb(0.9, 0.9, 0.9);

    const iterations = transportsList.length > 0 ? transportsList.length : (dList.length > 0 ? dList.length : 1);

    for (let i = 0; i < iterations; i++) {
      let page = pdfDoc.addPage([595.27, 841.89]);
      let { width, height } = page.getSize();
      
      let transportName = '';
      let transportItems: DistributionItem[] = [];
      let totalQty = 0;
      let firstVersion = '';

      if (transportsList.length > 0) {
        const t = transportsList[i];
        transportName = t.name;
        transportItems = dList.filter(d => t.items.includes(d.id));
        totalQty = transportItems.reduce((acc, it) => acc + it.quantity, 0);
        if (transportItems.length > 0) firstVersion = transportItems[0].version;
      } else if (dList.length > 0) {
        const it = dList[i];
        transportName = 'Envío Directo';
        transportItems = [it];
        totalQty = it.quantity;
        firstVersion = it.version;
      } else {
        transportName = 'Sin items';
      }

      let currentY = height - 40;
      let pageNum = 1;

      const drawHeader = () => {
        // Sender Block
        const defaultSender = 'COMECO INTEGRA S.L.U.\nC/ Meridiano, 19\n28850 Torrejón de Ardoz - N.I.F. B87584793';
        let rawSender = senderDetails || defaultSender;
        rawSender = rawSender.replace(/\\n/g, '\n');
        const detailsLines = rawSender.split('\n');
        
        let headerY = height - 40;
        detailsLines.forEach((line, idx) => {
          page.drawText(line, { x: 40, y: headerY, size: idx === 0 ? 10 : 8, font: idx === 0 ? boldFont : font, color: blackColor });
          headerY -= 12;
        });

        // Copies Options
        page.drawRectangle({ x: width - 150, y: height - 42, width: 8, height: 8, color: rgb(1,1,1), borderColor: blackColor, borderWidth: 1 });
        page.drawText('COPIA COMECO', { x: width - 135, y: height - 42, size: 8, font: font, color: blackColor });
        
        page.drawRectangle({ x: width - 150, y: height - 54, width: 8, height: 8, color: rgb(1,1,1), borderColor: blackColor, borderWidth: 1 });
        page.drawText('COPIA RECEPTOR', { x: width - 135, y: height - 54, size: 8, font: font, color: blackColor });

        currentY = headerY - 15;
        
        // ALBARÁN ENTREGA
        page.drawText('ALBARÁN ENTREGA', { x: 40, y: currentY, size: 24, font: boldFont, color: accentColor });
        
        // Data Row 1
        currentY -= 30;
        page.drawText('Nº Orden:', { x: 40, y: currentY, size: 8, font: boldFont, color: grayColor });
        page.drawText(`ALB-${new Date().getFullYear()}-${String(i+1).padStart(4, '0')}`, { x: 40, y: currentY - 12, size: 10, font: boldFont, color: blackColor });

        page.drawText('Nº Albarán:', { x: 180, y: currentY, size: 8, font: boldFont, color: grayColor });
        page.drawText(`ALB-${new Date().getFullYear()}-${String(i+1).padStart(4, '0')}`, { x: 180, y: currentY - 12, size: 10, font: boldFont, color: blackColor });
        
        // Barcode visualization
        page.drawText(`*ALB-${new Date().getFullYear()}-${String(i+1).padStart(4, '0')}*`, { x: 180, y: currentY - 22, size: 8, font: font, color: grayColor });

        page.drawText('Fecha de Entrega:', { x: 380, y: currentY, size: 8, font: boldFont, color: grayColor });
        page.drawText(new Date().toLocaleDateString('es-ES'), { x: 380, y: currentY - 12, size: 10, font: boldFont, color: blackColor });
        
        page.drawText(`Pág ${pageNum}`, { x: width - 70, y: currentY - 12, size: 10, font: font, color: grayColor });

        // Data Row 2
        currentY -= 35;
        page.drawText('ORIGEN:', { x: 40, y: currentY, size: 8, font: boldFont, color: grayColor });
        page.drawText(detailsLines[0], { x: 40, y: currentY - 12, size: 9, font: boldFont, color: blackColor });

        page.drawText('Campaña / Versión:', { x: 380, y: currentY, size: 8, font: boldFont, color: grayColor });
        page.drawText(firstVersion.substring(0, 30), { x: 380, y: currentY - 12, size: 9, font: boldFont, color: blackColor });

        // Data Row 3
        currentY -= 35;
        page.drawText('Modo Transporte:', { x: 40, y: currentY, size: 8, font: boldFont, color: grayColor });
        page.drawText(transportName, { x: 40, y: currentY - 12, size: 10, font: boldFont, color: blackColor });
        
        // Table Header
        currentY -= 30;
        page.drawRectangle({ x: 40, y: currentY - 15, width: width - 80, height: 25, color: accentColor });
        page.drawText('CANTIDAD ENTREGADA', { x: 50, y: currentY - 6, size: 9, font: boldFont, color: rgb(1,1,1) });
        page.drawText('CONCEPTO', { x: 220, y: currentY - 6, size: 9, font: boldFont, color: rgb(1,1,1) });
        page.drawText('DESTINO', { x: 380, y: currentY - 6, size: 9, font: boldFont, color: rgb(1,1,1) });
        currentY -= 35;
      };

      const checkPageBreak = (neededSpace: number) => {
        // Need space for footer (approx 160px)
        if (currentY - neededSpace < 160) {
          drawFooter();
          page = pdfDoc.addPage([595.27, 841.89]);
          pageNum++;
          drawHeader();
        }
      };

      const drawFooter = () => {
        const footerY = 120;
        
        // Observations block (full width)
        page.drawRectangle({ x: 40, y: footerY - 30, width: width - 80, height: 30, color: rgb(0.96,0.96,0.96), borderColor: grayColor, borderWidth: 1 });
        page.drawText('Comentario:', { x: 45, y: footerY - 12, size: 8, font: boldFont, color: grayColor });
        
        const transportObs = Array.from(new Set(transportItems.map(it => it.barcode).filter(Boolean))).join(' | ');
        if (transportObs) {
          page.drawText(transportObs.length > 100 ? transportObs.substring(0, 100) + '...' : transportObs, { x: 100, y: footerY - 12, size: 8, font: font, color: blackColor });
        }
        
        // Signature block (full width)
        page.drawRectangle({ x: 40, y: footerY - 80, width: width - 80, height: 45, color: rgb(0.98, 0.98, 0.98), borderColor: lightGray, borderWidth: 1 });
        page.drawText('Recibí: Firma y sello:', { x: 45, y: footerY - 45, size: 9, font: boldFont, color: grayColor });
        page.drawLine({ start: { x: width - 250, y: footerY - 65 }, end: { x: width - 60, y: footerY - 65 }, color: grayColor, thickness: 1 });
        page.drawText('Nombre / DNI / Fecha', { x: width - 180, y: footerY - 75, size: 7, font: font, color: grayColor });
        
        // Legal Text
        const legal1 = "Los residuos derivados de los embalajes de los productos suministrados, (Flejes, film plástico y cartón), son residuos no peligrosos y deberán";
        const legal2 = "gestionarse por ustedes de manera adecuada, mediante su depósito en los contenedores municipales convenientemente segregados, o bien mediante su";
        const legal3 = "entrega a gestor autorizado para su reciclado. No obstante, antes de considerar estos materiales como residuos, considere la posibilidad de";
        const legal4 = "reutilizarlos internamente. El responsable de la entrega del residuo del envase o envase usado, para su gestión ambiental, será su poseedor final.";
        page.drawText(legal1, { x: 40, y: 25, size: 5.5, font: font, color: grayColor });
        page.drawText(legal2, { x: 40, y: 20, size: 5.5, font: font, color: grayColor });
        page.drawText(legal3, { x: 40, y: 15, size: 5.5, font: font, color: grayColor });
        page.drawText(legal4, { x: 40, y: 10, size: 5.5, font: font, color: grayColor });
        
        const certs = "Sólo los productos que se identifican como tal son PEFC Certificado: Nº Certificado BMC-PEFC-COC-00237 | certificados FSC®. Nº Certificado BMC-COC-007865 | Nº Registro RD 1055/2022: ENV/2023/000029862";
        page.drawText(certs, { x: 40, y: 5, size: 5, font: boldFont, color: grayColor });
      };

      let totalPalletsCount = 0;

      drawHeader();

      transportItems.forEach((item) => {
        checkPageBreak(30);
        page.drawLine({ start: { x: 40, y: currentY - 5 }, end: { x: width - 40, y: currentY - 5 }, color: lightGray, thickness: 1 });
        page.drawText(item.quantity.toLocaleString('es-ES') + ' ej.', { x: 50, y: currentY, size: 9, font: boldFont, color: blackColor });
        page.drawText(item.version.substring(0, 35), { x: 220, y: currentY, size: 8, font: font, color: blackColor });
        page.drawText(item.address.substring(0, 45), { x: 380, y: currentY, size: 7.5, font: font, color: grayColor });
        currentY -= 20;

        const itemPallets = item.customPallets || calculatePalletsForQuantity(item.quantity, Number(albaranesFullPalletSize) || 21000, Number(albaranesMinPico) || 100);
        totalPalletsCount += itemPallets.length;
        
        itemPallets.forEach((pallet, pIdx) => {
          checkPageBreak(15);
          const isPalletPico = pallet.quantity < (Number(albaranesFullPalletSize) || 21000);
          page.drawText(`|- Palet ${pIdx + 1}${isPalletPico ? ' (Pico)' : ''} : ${pallet.quantity.toLocaleString('es-ES')} ej.`, { x: 230, y: currentY, size: 8, font: font, color: grayColor });
          currentY -= 14;
        });
        currentY -= 6;
      });

      checkPageBreak(40);
      page.drawLine({ start: { x: 40, y: currentY }, end: { x: width - 40, y: currentY }, color: rgb(0, 0, 0), thickness: 2 });
      currentY -= 20;
      
      // Totals
      page.drawText('Nº palés:', { x: 50, y: currentY, size: 10, font: boldFont, color: blackColor });
      page.drawText(`${totalPalletsCount} palé(s)`, { x: 105, y: currentY, size: 10, font: boldFont, color: accentColor });

      page.drawText('TOTAL EJEMPLARES:', { x: 220, y: currentY, size: 10, font: boldFont, color: blackColor });
      page.drawText(`${totalQty.toLocaleString('es-ES')} ej.`, { x: 340, y: currentY, size: 10, font: boldFont, color: accentColor });

      drawFooter();
    }

    return await pdfDoc.save();
  };

  // Generate blank Altavia-stylized template if user has no template handy
  const handleGeneratePdfTemplate = async () => {
    setIsProcessingPdf(true);
    setPdfProgress(10);
    try {
      const activePdfBytes = activeTab === 'etiquetas' ? pdfFileBytes : albaranesPdfFileBytes;
      const activePdfName = activeTab === 'etiquetas' ? pdfFileName : albaranesPdfFileName;
      const isUsingCustomBase = !!(activePdfBytes && !activePdfName.includes('Original.pdf'));
      
      const itemsToCreate = distributionList.length > 0 ? distributionList : DEMO_DISTRIBUTIONS;
      const totalToCreate = itemsToCreate.length; // Process the full list without limiting to 30 pages
      
      let builtTemplateBytes: Uint8Array;

      if (isUsingCustomBase) {
        // CASE A: User has uploaded their own original PDF. We copy pages from it to create a template matching the distribution list.
        const srcPdfDoc = await PDFDocument.load(activePdfBytes);
        const srcPagesCount = srcPdfDoc.getPageCount();
        const pdfDoc = await PDFDocument.create();
        
        for (let i = 0; i < totalToCreate; i++) {
          const pageIndexToCopy = i % srcPagesCount;
          const [copiedPage] = await pdfDoc.copyPages(srcPdfDoc, [pageIndexToCopy]);
          pdfDoc.addPage(copiedPage);
        }
        builtTemplateBytes = await pdfDoc.save();
      } else {
        // CASE B: Generate universal design dynamically using distribution list values
        if (activeTab === 'etiquetas') {
          builtTemplateBytes = await buildOriginalPdfBytes(itemsToCreate);
        } else {
          builtTemplateBytes = await buildAlbaranPdfBytes(transports, itemsToCreate);
        }
      }
      if (activeTab === 'etiquetas') {
        setPdfFileBytes(builtTemplateBytes.buffer);
        setPdfFileName('Plan_Etiquetas_Original.pdf');
        setTemplateEtiquetasCount(itemsToCreate.length);
      } else {
        setAlbaranesPdfFileBytes(builtTemplateBytes.buffer);
        setAlbaranesPdfFileName('Plan_Albaranes_Original.pdf');
        setTemplateAlbaranesCount(itemsToCreate.length);
      }
      
      setPdfProgress(100);
      setTimeout(() => {
        setIsProcessingPdf(false);
        setPdfProgress(0);
        setSuccessMsg(
          isUsingCustomBase
            ? `¡Correcto! Se ha generado la plantilla duplicando las páginas del PDF original para adaptarlo a las ${itemsToCreate.length} partidas.`
            : `¡Correcto! Se ha generado un PDF con un diseño universal profesional basado en las ${itemsToCreate.length} partidas del Excel.`
        );
      }, 500);

    } catch (e) {
      console.error(e);
      setIsProcessingPdf(false);
      setPdfProgress(0);
      setErrorMsg('No se pudo generar la plantilla PDF.');
    }
  };

  const handleUpdatePreviewPdf = async () => {
    if (distributionList.length === 0) return;
    setIsPreviewLoading(true);
    try {
      const activeItem = distributionList[selectedPreviewItemIdx] || distributionList[0];
      const fileName = activeTab === 'etiquetas' ? pdfFileName : albaranesPdfFileName;
      const uploadedPdfBytes = activeTab === 'etiquetas' ? pdfFileBytes : albaranesPdfFileBytes;

      let pdfBytesBase;
      if (uploadedPdfBytes && !fileName.includes('Original.pdf')) {
        const srcPdfDoc = await PDFDocument.load(uploadedPdfBytes);
        const previewDoc = await PDFDocument.create();
        const pageIdx = (selectedPreviewItemIdx || 0) % srcPdfDoc.getPageCount();
        const [copiedPage] = await previewDoc.copyPages(srcPdfDoc, [pageIdx]);
        previewDoc.addPage(copiedPage);
        pdfBytesBase = await previewDoc.save();
      } else {
        if (activeTab === 'albaranes') {
          if (transports.length > 0) {
            const activeTransport = transports[selectedPreviewItemIdx] || transports[0];
            pdfBytesBase = await buildAlbaranPdfBytes([activeTransport], distributionList);
          } else {
            pdfBytesBase = await buildAlbaranPdfBytes([], [activeItem]);
          }
        } else {
          pdfBytesBase = await buildOriginalPdfBytes([activeItem]);
        }
      }

      const currentFullPalletSize = Number(activeTab === 'etiquetas' ? activeFullPalletSize : albaranesFullPalletSize) || 21000;
      const currentMinPico = Number(activeTab === 'etiquetas' ? activeMinPico : albaranesMinPico) || 100;

      let finalPdfBytes;
      if (activeTab === 'etiquetas') {
        finalPdfBytes = await generateModifiedPdf({
          fullPalletSize: currentFullPalletSize,
          minPico: currentMinPico,
          items: [activeItem],
          pdfBytes: pdfBytesBase,
          textTemplate: activeTab === 'etiquetas' ? textTemplate : albaranesTextTemplate,
          fontSize: activeTab === 'etiquetas' ? fontSize : albaranesFontSize,
          textColor: activeTab === 'etiquetas' ? textColor : albaranesTextColor,
          positionY: activeTab === 'etiquetas' ? positionY : albaranesPositionY,
          positionX: activeTab === 'etiquetas' ? positionX : albaranesPositionX,
          centerAlign: activeTab === 'etiquetas' ? centerAlign : albaranesCenterAlign,
          isGeneratedTemplate: fileName.includes('Original.pdf'),
          maquetaStyles
        });
      } else {
        const activeTransport = transports.length > 0 ? (transports[selectedPreviewItemIdx] || transports[0]) : null;
        const targetItems = activeTransport 
          ? distributionList.filter(d => activeTransport.items.includes(d.id))
          : [activeItem];
          
        finalPdfBytes = await generateAlbaranesPdf({
          fullPalletSize: currentFullPalletSize,
          minPico: currentMinPico,
          items: targetItems,
          transports: activeTransport ? [activeTransport] : [],
          pdfBytes: pdfBytesBase,
          textTemplate: albaranesTextTemplate,
          fontSize: albaranesFontSize,
          textColor: albaranesTextColor,
          positionY: albaranesPositionY,
          positionX: albaranesPositionX,
          centerAlign: albaranesCenterAlign,
          isGeneratedTemplate: fileName.includes('Original.pdf'),
          maquetaStyles
        });
      }

      if (!finalPdfBytes) throw new Error("Could not generate preview bytes");

      const finalDoc = await PDFDocument.load(finalPdfBytes);
      const previewDoc = await PDFDocument.create();
      const [copiedPage] = await previewDoc.copyPages(finalDoc, [0]);
      previewDoc.addPage(copiedPage);

      const previewBytes = await previewDoc.save();

      const blob = new Blob([previewBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (activeTab === 'etiquetas') {
        if (etiquetasPreviewUrl) URL.revokeObjectURL(etiquetasPreviewUrl);
        setEtiquetasPreviewUrl(url);
      } else {
        if (albaranesPreviewUrl) URL.revokeObjectURL(albaranesPreviewUrl);
        setAlbaranesPreviewUrl(url);
      }
    } catch (error) {
      console.error("Preview generation failed", error);
      setErrorMsg('No se pudo generar la previsualización del PDF.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (distributionList.length > 0 && !activePreviewUrl) {
      handleUpdatePreviewPdf();
    }
  }, [distributionList]);

  // Update preview automatically when switching tabs or generating a new template
  useEffect(() => {
    if (distributionList.length > 0) {
      handleUpdatePreviewPdf();
    }
  }, [activeTab, pdfFileBytes, albaranesPdfFileBytes]);

  // Helper placeholder because standard page doesn't embed font styles
  function italicFontPlaceholder(standardFont: any) {
    return standardFont;
  }

  // Row operations
  const handleAddRow = () => {
    if (!manualVersion.trim()) {
      setErrorMsg('La versión es requerida (ej. Estándar, Catalán, Galicia).');
      return;
    }
    if (!manualAddress.trim()) {
      setErrorMsg('La dirección/destino es requerida.');
      return;
    }
    const numericQuantity = typeof manualQuantity === 'number' ? manualQuantity : parseInt(String(manualQuantity), 10);
    if (!numericQuantity || numericQuantity <= 0) {
      setErrorMsg('El número de ejemplares debe ser mayor que 0.');
      return;
    }

    const newItem: DistributionItem = {
      id: `MANUAL-${Date.now()}`,
      version: manualVersion,
      address: manualAddress,
      quantity: numericQuantity,
      barcode: manualBarcode.trim() || undefined
    };

    setDistributionList([...distributionList, newItem]);
    setManualVersion('');
    setManualAddress('');
    setManualQuantity('');
    setManualBarcode('');
    setSuccessMsg('Partida añadida exitosamente.');
  };

  const handleDeleteRow = (id: string) => {
    const filt = distributionList.filter(item => item.id !== id);
    setDistributionList(filt);
    if (selectedPreviewItemIdx >= filt.length && filt.length > 0) {
      setSelectedPreviewItemIdx(filt.length - 1);
    }
    setSuccessMsg('Fila eliminada.');
  };

  const handleClearList = () => {
    setDistributionList([]);
    if (excelInputRef.current) excelInputRef.current.value = '';
    setSuccessMsg('Lista de partidas vaciada.');
  };

  const handleResetApp = () => {
    setDistributionList([]);
    setPdfFileBytes(null);
    setPdfFileName('');
    setAlbaranesPdfFileBytes(null);
    setAlbaranesPdfFileName('');
    setTransports([]);
    setEtiquetasPreviewUrl(null);
    setAlbaranesPreviewUrl(null);
    if (excelInputRef.current) excelInputRef.current.value = '';
    if (pdfInputRef.current) pdfInputRef.current.value = '';
    setSuccessMsg('Aplicación reiniciada correctamente. Lista para nuevos datos.');
  };

  const handleSaveCustomPallets = (pallets: PalletResult[]) => {
    if (editingPalletItemIndex === null) return;
    const newList = [...distributionList];
    
    // Filter out pallets with 0 quantity and reindex
    const cleanedPallets = pallets
      .filter(p => p.quantity > 0)
      .map((p, idx, arr) => ({
        ...p,
        palletIndex: idx + 1,
        totalPallets: arr.length,
        isAdjusted: true
      }));

    const newTotal = cleanedPallets.reduce((sum, p) => sum + p.quantity, 0);
    newList[editingPalletItemIndex].customPallets = cleanedPallets;
    newList[editingPalletItemIndex].quantity = newTotal; // Approve balance and recalculate total
    setDistributionList(newList);
    setSuccessMsg(`Palets ajustados manualmente para la partida: ${newList[editingPalletItemIndex].version}`);
  };

  const handleEditRowInline = (id: string) => {
    setEditingRowId(id);
  };

  const handleSaveRowValue = (id: string, field: keyof DistributionItem, val: string | number) => {
    setDistributionList(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: val };
      }
      return item;
    }));
  };

  // Launch the PDF generation
  const handleProcessAndDownloadPdf = async () => {
    if (distributionList.length === 0) {
      setErrorMsg('No hay partidas de distribución en la lista.');
      return;
    }

    setIsProcessingPdf(true);
    setPdfProgress(20);

    try {
      let activePdf = activeTab === 'etiquetas' ? pdfFileBytes : albaranesPdfFileBytes;
      let fileName = activeTab === 'etiquetas' ? pdfFileName : albaranesPdfFileName;

      // If no PDF is loaded or it's the original template, we can just GENERATE it on the fly!
      if (!activePdf || fileName.includes('Original.pdf')) {
        if (activeTab === 'albaranes') {
          const freshBasePdf = await buildAlbaranPdfBytes(transports, distributionList);
          activePdf = freshBasePdf.buffer;
          setAlbaranesPdfFileBytes(activePdf);
          setAlbaranesPdfFileName('Plan_Albaranes_Original.pdf');
        } else {
          const freshBasePdf = await buildOriginalPdfBytes(distributionList);
          activePdf = freshBasePdf.buffer;
          setPdfFileBytes(activePdf);
          setPdfFileName('Plan_Etiquetas_Original.pdf');
        }
      }

      let outputBytes: Uint8Array;
      if (activeTab === 'etiquetas') {
        const safeFullPalletSize = typeof fullPalletSize === 'number' ? fullPalletSize : 21000;
        const safeMinPico = typeof minPico === 'number' ? minPico : 2800;
        outputBytes = await generateModifiedPdf({
          fullPalletSize: safeFullPalletSize,
          minPico: safeMinPico,
          items: distributionList,
          pdfBytes: activePdf,
          textTemplate,
          fontSize,
          textColor,
          positionY,
          positionX,
          centerAlign,
          isGeneratedTemplate: pdfFileName.includes('Original.pdf'),
          maquetaStyles,
          onProgress: (prog) => {
            setPdfProgress(prog);
          }
        });
      } else {
        if (albaranesPdfFileName.includes('Original.pdf')) {
          outputBytes = new Uint8Array(activePdf);
          setPdfProgress(100);
        } else {
          const safeAlbaranesFullPalletSize = typeof albaranesFullPalletSize === 'number' ? albaranesFullPalletSize : 21000;
          const safeAlbaranesMinPico = typeof albaranesMinPico === 'number' ? albaranesMinPico : 2800;
          outputBytes = await generateAlbaranesPdf({
            fullPalletSize: safeAlbaranesFullPalletSize,
            minPico: safeAlbaranesMinPico,
            items: distributionList,
            transports,
            pdfBytes: activePdf,
            textTemplate: albaranesTextTemplate,
            fontSize: albaranesFontSize,
            textColor: albaranesTextColor,
            positionY: albaranesPositionY,
            positionX: albaranesPositionX,
            centerAlign: albaranesCenterAlign,
            isGeneratedTemplate: false,
            maquetaStyles,
            onProgress: (prog) => {
              setPdfProgress(prog);
            }
          });
        }
      }

      // Save blob files
      const blob = new Blob([outputBytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = activeTab === 'etiquetas'
        ? `Etiquetas_Paletizado_Optimizado_${Date.now()}.pdf`
        : `Albaranes_Distribucion_Marcados_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 15000);

      setSuccessMsg(
        activeTab === 'etiquetas'
          ? '¡Distribución optimizada y PDF de etiquetas generado exitosamente!'
          : '¡Albaranes marcados y PDF de albaranes generado exitosamente!'
      );
    } catch (err: any) {
      setErrorMsg(`Error procesando el PDF: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsProcessingPdf(false);
      setPdfProgress(0);
    }
  };

  const activeFullPalletSize = activeTab === 'etiquetas' 
    ? (typeof fullPalletSize === 'number' ? fullPalletSize : 21000) 
    : (typeof albaranesFullPalletSize === 'number' ? albaranesFullPalletSize : 21000);
  const activeMinPico = activeTab === 'etiquetas' 
    ? (typeof minPico === 'number' ? minPico : 2800) 
    : (typeof albaranesMinPico === 'number' ? albaranesMinPico : 2800);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header Bar */}
      <header className="border-b border-apple-border dark:border-apple-dark-border glass dark:glass-dark sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-apple-blue dark:bg-apple-dark-blue rounded-xl text-white font-bold text-xs tracking-wider shadow-sm">LOGISTIK</span>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                Gestor de Paletizado Auto-Optimizado
              </h1>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Cálculo de bultos por partidas con duplicado inteligente de etiquetas PDF (Apple & Altavia Style)
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shadow-sm text-zinc-600 dark:text-zinc-400 mr-2"
              title="Alternar Modo Oscuro"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleResetApp}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-200 dark:border-rose-900/50 bg-red-50 dark:bg-rose-950/20 hover:bg-red-100 dark:hover:bg-rose-900/40 text-red-600 dark:text-rose-400 transition-colors shadow-sm flex items-center gap-1.5 mr-2"
              title="Reiniciar aplicación y borrar todos los datos actuales"
            >
              <Trash2 className="w-3.5 h-3.5" /> Reset
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center gap-2 ${
                showSettings 
                  ? 'border-rose-500 bg-rose-500/10 text-white font-semibold' 
                  : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800 text-zinc-300'
              }`}
              title="Configurar clave de la API de Gemini para la extracción con IA"
            >
              <Settings className={`w-3.5 h-3.5 ${showSettings ? 'rotate-45' : ''} transition-transform`} />
              Configurar API Key
            </button>
            <button 
              onClick={() => setShowFormulaExplanation(!showFormulaExplanation)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800 text-zinc-300 transition-all flex items-center gap-2.5"
            >
              <HelpCircle className="w-3.5 h-3.5 text-rose-500" />
              ¿Cómo funciona el Algoritmo?
            </button>
            <button
              onClick={handleLoadCsvPaste}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 transition"
              title="Carga una distribución con variaciones de marcas e idiomas de ejemplo"
            >
              Cargar Ejemplo Completo
            </button>
            <button
              onClick={handleResetApp}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-950 text-red-300 border border-red-900/40 hover:bg-red-900/60 transition"
              title="Reiniciar aplicación para introducir nuevos datos"
            >
              Reset App
            </button>
          </div>
        </div>
      </header>

      {/* API Key settings panel */}
      {showSettings && (
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 animate-fade-in">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                Configurar API de Gemini (AI Studio)
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Ingresa tu clave de API de Gemini para realizar el análisis de albaranes PDF de manera gratuita. Se guarda de forma local en tu navegador.
              </p>
            </div>
            <div className="w-full sm:w-auto flex items-center gap-2">
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="Clave API (AI Studio)..."
                className="w-full sm:w-80 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-rose-500 font-mono"
              />
              {geminiApiKey ? (
                <button
                  onClick={() => {
                    setGeminiApiKey('');
                    setSuccessMsg('API Key eliminada. El servidor usará la clave predeterminada.');
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold text-rose-400 bg-rose-950/20 hover:bg-rose-950/40 rounded transition border border-rose-900/30 whitespace-nowrap"
                >
                  Limpiar
                </button>
              ) : (
                <span className="text-[10px] text-amber-500 whitespace-nowrap">Usando clave de servidor (si existe)</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="border-b border-apple-border dark:border-apple-dark-border bg-apple-surface/80 dark:bg-apple-dark-surface/80 backdrop-blur-md px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('etiquetas')}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'etiquetas'
                  ? 'bg-apple-blue dark:bg-apple-dark-blue text-white shadow-md shadow-apple-blue/20 font-bold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800'
              }`}
            >
              <FileCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              Módulo 1: ETIQUETAS
            </button>
            <button
              onClick={() => setActiveTab('albaranes')}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'albaranes'
                  ? 'bg-apple-blue dark:bg-apple-dark-blue text-white shadow-md shadow-apple-blue/20 font-bold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800'
              }`}
            >
              <FileText className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              Módulo 2: ALBARANES
            </button>
            <button
              onClick={() => setActiveTab('cubicaje')}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'cubicaje'
                  ? 'bg-apple-blue dark:bg-apple-dark-blue text-white shadow-md shadow-apple-blue/20 font-bold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800'
              }`}
            >
              <Package className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              Módulo 3: CUBICAJE
            </button>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Modo Activo:</span>
            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition-all shadow-sm ${
              activeTab === 'etiquetas' ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/45' :
              activeTab === 'albaranes' ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/45' :
              'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/40'
            }`}>
              {activeTab === 'etiquetas' ? 'Duplicación por bulto' : activeTab === 'albaranes' ? 'Estructura 1-a-1 sin duplicar' : 'Cubicaje de folletos en palet'}
            </span>
          </div>
        </div>
      </div>

      {/* Main dashboard content */}
      {activeTab === 'cubicaje' ? (
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">
          <CubicajeModule distributionList={distributionList} />
        </main>
      ) : (
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* UPPER/FORMULA PANEL (IF EXPANDED) */}
        {showFormulaExplanation && (
          <div className="col-span-12 bg-white dark:bg-zinc-900 border border-rose-500/30 rounded-xl p-5 relative overflow-hidden transition-all animate-fade-in shadow-sm">
            <div className="absolute right-4 top-4">
              <button 
                onClick={() => setShowFormulaExplanation(false)}
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-rose-500" />
              Algoritmo de Optimización del Resto ("Pico de Palet")
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed max-w-4xl">
              Cuando el volumen total de folletos <code className="text-rose-400 font-mono bg-zinc-950 px-1 py-0.5 rounded">Q</code> se divide por la capacidad de un palet completo <code className="text-rose-400 font-mono bg-zinc-950 px-1 py-0.5 rounded">F</code>, a menudo obtenemos un resto o pico <code className="text-rose-400 font-mono bg-zinc-950 px-1 py-0.5 rounded">R</code>. 
              Si este resto <code className="text-rose-400 font-mono bg-zinc-950 px-1 py-0.5 rounded">R</code> es menor que el valor personalizable de pico mínimo <code className="text-rose-400 font-mono bg-zinc-950 px-1 py-0.5 rounded">M</code> (por ejemplo, 2.800 ejemplares), el sistema balancea la carga automáticamente:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 max-w-5xl">
              <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300">
                <span className="font-semibold text-rose-500 dark:text-rose-400 block mb-1">Caso Estándar (R ≥ M):</span>
                Si el resto supera el mínimo, se asignan <code className="bg-zinc-200 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-1 rounded">k</code> palets llenos a capacidad máxima y <code className="bg-zinc-200 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-1 rounded">1</code> palet final pico con el remanente <code className="text-amber-600 dark:text-amber-400 font-mono">R</code>.
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300">
                <span className="font-semibold text-rose-500 dark:text-rose-400 block mb-1">Caso Balanceado (R &lt; M):</span>
                Se toman ejemplares prestados del último palet completo para engrosar el resto hasta llegar exactamente a <code className="text-emerald-600 dark:text-emerald-400 font-mono">M</code>. El penúltimo palet pasa a cargar <code className="text-amber-600 dark:text-amber-400 font-mono">F - (M - R)</code>, cumpliendo así el mínimo legal en ambos.
              </div>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-3 italic">
              * Si el total general es muy pequeño o el ajuste no es viable numéricamente, el algoritmo reparte el residuo de forma equitativa.
            </p>
          </div>
        )}

        {/* System parameters settings */}
        <section className="col-span-12 bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            {/* Campo 1: Capacidad Palet */}
            <div className="md:col-span-4">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest block mb-2">
                1. Capacidad Palet Completo ({activeTab === 'etiquetas' ? 'Etiquetas' : 'Albaranes'})
              </label>
              <div className="relative">
                <input 
                  type="number"
                  value={draftFullPalletSize}
                  onChange={(e) => {
                    setDraftFullPalletSize(e.target.value);
                    setParamsAreDirty(true);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleApplyParams(); }}
                  className={`w-full bg-zinc-50 dark:bg-zinc-950 border rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white font-mono focus:outline-none focus:ring-1 ${
                    paramsAreDirty
                      ? 'border-amber-400 dark:border-amber-500/70 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-amber-500/40'
                      : 'border-zinc-300 dark:border-zinc-700 focus:border-apple-blue dark:focus:border-rose-500 focus:ring-apple-blue/20 dark:focus:ring-rose-500'
                  }`}
                  placeholder="Ej. 21000"
                />
                <span className="absolute right-3 top-2.5 text-xs text-zinc-500 font-semibold font-mono">ej.</span>
              </div>
              <span className="text-[11px] text-zinc-500 mt-1 block">Tamaño nominal para cargar 100% el palet.</span>
            </div>

            {/* Campo 2: Pico Mínimo */}
            <div className="md:col-span-4">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest block mb-2">
                2. Corte de Pico Mínimo (&quot;Floor&quot;)
              </label>
              <div className="relative">
                <input 
                  type="number"
                  value={draftMinPico}
                  onChange={(e) => {
                    setDraftMinPico(e.target.value);
                    setParamsAreDirty(true);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleApplyParams(); }}
                  className={`w-full bg-zinc-50 dark:bg-zinc-950 border rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white font-mono focus:outline-none focus:ring-1 ${
                    paramsAreDirty
                      ? 'border-amber-400 dark:border-amber-500/70 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-amber-500/40'
                      : 'border-zinc-300 dark:border-zinc-700 focus:border-apple-blue dark:focus:border-rose-500 focus:ring-apple-blue/20 dark:focus:ring-rose-500'
                  }`}
                  placeholder="Ej. 2800"
                />
                <span className="absolute right-3 top-2.5 text-xs text-zinc-500 font-semibold font-mono">ej.</span>
              </div>
              <span className="text-[11px] text-zinc-500 mt-1 block">Los picos de palet no podrán ser menores a esto.</span>
            </div>

            {/* Botón Aplicar */}
            <div className="md:col-span-2 flex flex-col justify-end">
              <button
                onClick={handleApplyParams}
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                  paramsAreDirty
                    ? 'bg-amber-500 hover:bg-amber-400 text-zinc-900 border-amber-400 shadow-lg shadow-amber-900/30 animate-pulse'
                    : 'bg-emerald-700/50 hover:bg-emerald-700 text-emerald-200 border-emerald-700/50'
                }`}
                title="Aplicar parámetros y regenerar previsualización"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {paramsAreDirty ? 'Aplicar ↵' : 'Aplicado ✓'}
              </button>
              <span className="text-[10px] text-zinc-500 mt-1 block text-center">
                {paramsAreDirty ? 'Pendiente de aplicar' : 'Parámetros activos'}
              </span>
            </div>

            {/* Resumen lote */}
            <div className="md:col-span-2 flex flex-col justify-end">
              <div className="bg-zinc-950 border border-zinc-850 p-2.5 rounded-lg text-xs leading-normal flex items-start gap-2 text-zinc-300 h-full">
                <Database className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white block">Resumen ({activeTab === 'etiquetas' ? 'Etiq.' : 'Alb.'})</span>
                  <span className="font-mono text-emerald-400 font-bold">{formatQuantitySpain(distributionStats.totalLeaflets)}</span> ej. en <span className="font-mono text-rose-400 font-bold">{distributionStats.totalPalletsCount}</span> palets.
                </div>
              </div>
            </div>
          </div>

          {/* Aviso visible cuando hay valores pendientes de aplicar */}
          {paramsAreDirty && (
            <div className="mt-3 px-3 py-2 bg-amber-950/40 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Tienes parámetros sin aplicar. Haz clic en <strong>Aplicar ↵</strong> o pulsa <kbd className="bg-zinc-800 px-1 rounded text-zinc-300">Enter</kbd> en cualquier campo para actualizar el cálculo y el preview.</span>
            </div>
          )}
        </section>

        {/* LEFT COLUMN: distribution items (Cols 1 to 6) */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-6">
          
          {/* File Upload Area */}
          <div className="bg-white dark:bg-apple-dark-surface rounded-2xl border border-zinc-200 dark:border-apple-dark-border shadow-sm p-6">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>Cargar Información de Distribución</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md">Excel / CSV</span>
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* File input spreadsheet */}
              <div 
                onClick={() => excelInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-apple-blue dark:hover:border-apple-blue cursor-pointer rounded-xl p-5 flex flex-col items-center justify-center text-center hover:bg-apple-blue/5 transition-all group"
              >
                <input 
                  type="file" 
                  ref={excelInputRef}
                  onChange={handleExcelUpload}
                  accept=".xlsx, .xls, .csv"
                  className="hidden" 
                />
                <FileSpreadsheet className="w-8 h-8 text-apple-blue dark:text-apple-dark-blue group-hover:scale-110 transition-transform mb-3" />
                <span className="text-xs font-bold text-zinc-900 dark:text-white">Subir listado Excel</span>
                <span className="text-[10px] text-zinc-500 mt-1">Soporta .xlsx, .csv</span>
              </div>

              {/* Paste preview csv template */}
              <div 
                onClick={handleLoadCsvPaste}
                className="border-2 border-dashed border-amber-300 dark:border-amber-900/30 hover:border-amber-500/50 cursor-pointer rounded-xl p-5 flex flex-col items-center justify-center text-center hover:bg-amber-50 dark:hover:bg-amber-500/5 transition-all group"
              >
                <SlidersHorizontal className="w-8 h-8 text-amber-500 group-hover:scale-110 transition-transform mb-3" />
                <span className="text-xs font-bold text-zinc-900 dark:text-white">Usar lote de demostración</span>
                <span className="text-[10px] text-zinc-500 mt-1">Versión Euskera / Galicia</span>
              </div>
            </div>
          </div>

          {/* Records list + manual addition */}
          <div className="bg-white dark:bg-apple-dark-surface rounded-2xl border border-zinc-200 dark:border-apple-dark-border shadow-sm p-6 flex-1 flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <span>Partidas de Distribución</span>
                <span className="px-2 py-0.5 bg-apple-blue/10 dark:bg-apple-dark-blue/20 text-apple-blue dark:text-apple-dark-blue rounded-full text-xs font-bold border border-apple-blue/20">{distributionList.length}</span>
              </h2>
              {distributionList.length > 0 && (
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => exportDesgloseToExcel(distributionList, Number(activeFullPalletSize) || 21000, Number(activeMinPico) || 100)}
                    className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-lg"
                  >
                    <Download className="w-3 h-3" />
                    Excel
                  </button>
                  <button 
                    onClick={() => exportDesgloseToPdf(distributionList, Number(activeFullPalletSize) || 21000, Number(activeMinPico) || 100)}
                    className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-lg"
                  >
                    <Download className="w-3 h-3" />
                    PDF
                  </button>
                  <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1"></div>
                  <button 
                    onClick={handleClearList}
                    className="text-xs font-semibold text-zinc-500 hover:text-red-500 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Vaciar Todo
                  </button>
                </div>
              )}
            </div>

            {/* List Table scroll region */}
            <div className="overflow-x-auto flex-1 max-h-[440px] border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 shadow-inner">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 backdrop-blur-md bg-white/90 dark:bg-zinc-900/90 shadow-sm">
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold">
                    <th className="py-3 px-4">Versión</th>
                    <th className="py-3 px-4">Dirección del Cliente</th>
                    <th className="py-3 px-4">Observaciones</th>
                    <th className="py-3 px-4 text-right">Ejemplares</th>
                    <th className="py-3 px-4 text-center">Bultos</th>
                    <th className="py-3 px-4 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 text-xs text-zinc-700 dark:text-zinc-300">
                  {distributionList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-500 font-medium">
                        No hay partidas en la lista. Sube un Excel o añade manualmente una partida abajo.
                      </td>
                    </tr>
                  ) : (
                    distributionList.map((item, index) => {
                      const calculatedPallets = item.customPallets || calculatePalletsForQuantity(item.quantity, activeFullPalletSize, activeMinPico);
                      const isItemActive = selectedPreviewItemIdx === index;
                      
                      return (
                        <tr 
                          key={item.id}
                          className={`hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors group cursor-pointer ${isItemActive ? 'bg-apple-blue/5 dark:bg-apple-blue/10 border-l-4 border-apple-blue' : 'border-l-4 border-transparent'}`}
                          onClick={() => setSelectedPreviewItemIdx(index)}
                        >
                          <td className="py-2.5 px-4 font-bold text-zinc-900 dark:text-white">
                            {editingRowId === item.id ? (
                              <input 
                                type="text"
                                value={item.version}
                                onChange={(e) => handleSaveRowValue(item.id, 'version', e.target.value)}
                                className="bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-apple-blue shadow-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              item.version
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-600 dark:text-zinc-400 max-w-[200px] truncate" title={item.address}>
                            {editingRowId === item.id ? (
                              <input 
                                type="text"
                                value={item.address}
                                onChange={(e) => handleSaveRowValue(item.id, 'address', e.target.value)}
                                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-apple-blue shadow-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              item.address
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-500 dark:text-zinc-500 max-w-[150px] truncate" title={item.barcode}>
                            {item.barcode || '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                            {editingRowId === item.id ? (
                              <input 
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleSaveRowValue(item.id, 'quantity', parseInt(e.target.value) || 0)}
                                className="w-24 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-xs text-zinc-900 dark:text-white text-right focus:outline-none focus:border-apple-blue shadow-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              formatQuantitySpain(item.quantity)
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="px-2 py-1 rounded-md text-[10px] bg-apple-blue/10 dark:bg-apple-dark-blue/20 text-apple-blue dark:text-apple-dark-blue font-bold border border-apple-blue/20 shadow-sm">
                              {calculatedPallets.length} bulto{calculatedPallets.length > 1 ? 's' : ''}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1">
                              {editingRowId === item.id ? (
                                <button 
                                  onClick={() => setEditingRowId(null)}
                                  className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 bg-emerald-50 dark:bg-zinc-800 rounded-md font-bold text-xs shadow-sm transition-colors"
                                >
                                  OK
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleEditRowInline(item.id)}
                                  className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-apple-blue dark:hover:text-white rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                  title="Editar"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button 
                                onClick={() => setEditingPalletItemIndex(index)}
                                className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                title="Balanceo Manual (Editar Palets)"
                              >
                                <Package className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteRow(item.id)}
                                className="p-1.5 text-zinc-500 dark:text-zinc-500 hover:text-red-500 dark:hover:text-rose-400 rounded-md hover:bg-red-50 dark:hover:bg-zinc-800 transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Quick calculations per calculated pallet breakdown */}
            {distributionList.length > 0 && selectedPreviewItemIdx < distributionList.length && (
              <div className="mt-4 bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div className="flex justify-between items-center mb-2 bg-white dark:bg-zinc-900/60 p-2 rounded-lg shadow-sm border border-zinc-100 dark:border-zinc-800">
                  <span className="font-bold text-zinc-900 dark:text-zinc-300 text-xs">Desglose de Paletizado para partida actual (#{(selectedPreviewItemIdx + 1)}):</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditingPalletItemIndex(selectedPreviewItemIdx)}
                      className="text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-300 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors font-medium shadow-sm"
                    >
                      <Edit2 className="w-3 h-3" /> Editar Palets
                    </button>
                    <span className="font-bold text-apple-blue dark:text-apple-dark-blue">{distributionList[selectedPreviewItemIdx].version}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  { (distributionList[selectedPreviewItemIdx].customPallets || calculatePalletsForQuantity(
                    distributionList[selectedPreviewItemIdx].quantity, 
                    activeFullPalletSize, 
                    activeMinPico
                  )).map((pallet, pIdx) => (
                    <div 
                      key={pIdx} 
                      className={`px-3 py-2 rounded-lg border flex flex-col text-center shadow-sm ${pallet.isAdjusted ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/45 text-amber-800 dark:text-amber-300' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-300'}`}
                    >
                      <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">Palet {pallet.palletIndex} de {pallet.totalPallets}</span>
                      <span className="font-mono font-bold text-sm text-zinc-900 dark:text-white">{formatQuantitySpain(pallet.quantity)} ej</span>
                      {pallet.isAdjusted && <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold mt-0.5">Balanceado (Pico)</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual item adder */}
            <div className="mt-5 pt-5 border-t border-zinc-200 dark:border-zinc-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-400 mb-4 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Añadir partida manualmente
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-zinc-600 dark:text-zinc-400 font-bold block mb-1.5">Versión de folleto</label>
                  <input 
                    type="text" 
                    value={manualVersion} 
                    onChange={e => setManualVersion(e.target.value)}
                    placeholder="Ej. Estándar"
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:border-apple-blue focus:outline-none shadow-sm transition-colors"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="text-[10px] text-zinc-600 dark:text-zinc-400 font-bold block mb-1.5">Dirección / Localidad</label>
                  <input 
                    type="text" 
                    value={manualAddress} 
                    onChange={e => setManualAddress(e.target.value)}
                    placeholder="Ej. REPAPUBLI Cuenca"
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:border-apple-blue focus:outline-none shadow-sm transition-colors"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-zinc-600 dark:text-zinc-400 font-bold block mb-1.5">Tirada (Ejemplares)</label>
                  <input 
                    type="number" 
                    value={manualQuantity} 
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setManualQuantity('');
                      } else {
                        const n = parseInt(raw, 10);
                        if (!isNaN(n)) setManualQuantity(n);
                      }
                    }}
                    placeholder="Ej. 10000"
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:border-apple-blue focus:outline-none text-right font-mono shadow-sm transition-colors"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-[10px] text-zinc-600 dark:text-zinc-400 font-bold block mb-1.5">Observaciones</label>
                  <input 
                    type="text" 
                    value={manualBarcode} 
                    onChange={e => setManualBarcode(e.target.value)}
                    placeholder="Ej. Entregar por la mañana"
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:border-apple-blue focus:outline-none shadow-sm transition-colors"
                  />
                </div>
                <div className="sm:col-span-1">
                  <button 
                    onClick={handleAddRow}
                    className="w-full bg-apple-blue dark:bg-apple-dark-blue hover:bg-blue-600 text-white rounded-lg py-2 flex items-center justify-center font-bold text-sm transition-colors shadow-sm"
                    title="Añadir partida"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {activeTab === 'albaranes' && (
              <div className="mt-6 pt-6 border-t border-zinc-800">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                  <Truck className="w-5 h-5 text-emerald-500" />
                  Asignación de Transportes
                </h3>
                <TransportManager 
                  transports={transports}
                  distributionList={distributionList}
                  onChange={setTransports}
                />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: PDF upload & stamping layout settings (Cols 7 to 12) */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-6">
          
          {/* PDF Template inputs */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>{activeTab === 'etiquetas' ? 'Etiquetas' : 'Albaranes'} PDF original del cliente</span>
              <span className="text-xs text-zinc-400 font-medium">Ficheros de reparto</span>
            </h2>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <div className="sm:col-span-8">
                  <div 
                    onClick={() => pdfInputRef.current?.click()}
                    className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 cursor-pointer rounded-lg p-3 flex items-center gap-3 bg-zinc-50 dark:bg-zinc-950/60 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <input 
                      type="file" 
                      ref={pdfInputRef}
                      onChange={handlePdfUpload}
                      accept=".pdf"
                      className="hidden" 
                    />
                    <FileText className="w-6 h-6 text-rose-500 shrink-0" />
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 truncate">
                        {(activeTab === 'etiquetas' ? pdfFileName : albaranesPdfFileName) || `Subir ${activeTab === 'etiquetas' ? 'etiquetas' : 'albaranes'} original (.pdf)`}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {(activeTab === 'etiquetas' ? pdfFileName : albaranesPdfFileName) ? 'Fichero cargado listo para procesar' : 'Haz clic para seleccionar o soltar archivo'}
                      </p>
                    </div>
                    {(activeTab === 'etiquetas' ? pdfFileName : albaranesPdfFileName) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeTab === 'etiquetas') {
                            setPdfFileBytes(null);
                            setPdfFileName('');
                            setTemplateEtiquetasCount(0);
                          } else {
                            setAlbaranesPdfFileBytes(null);
                            setAlbaranesPdfFileName('');
                            setTemplateAlbaranesCount(0);
                          }
                          setSuccessMsg('Archivo PDF removido.');
                        }}
                        className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-zinc-800 rounded-lg transition shrink-0"
                        title="Quitar PDF"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="sm:col-span-4">
                  <button 
                    onClick={handleGeneratePdfTemplate}
                    disabled={isProcessingPdf}
                    className="w-full text-xs font-semibold py-3 px-3 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-900/40 hover:border-rose-800 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    title={`Crea una plantilla base de ${activeTab === 'etiquetas' ? 'etiquetas' : 'albaranes'} en PDF con la información de las partidas actuales`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                    Generar Plantilla
                  </button>
                </div>
              </div>

              {(() => {
                const hasTemplateActive = (activeTab === 'etiquetas' ? pdfFileName : albaranesPdfFileName).includes('Original.pdf');
                const activeTemplateCount = activeTab === 'etiquetas' ? templateEtiquetasCount : templateAlbaranesCount;
                const needsTemplateRegeneration = hasTemplateActive && distributionList.length !== activeTemplateCount;
                if (needsTemplateRegeneration) {
                  return (
                    <div className="px-3 py-2 bg-amber-950/40 text-amber-300 rounded-md border border-amber-900/45 text-xs flex gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block text-amber-200">Plantilla desactualizada</span>
                        <span>La plantilla generada tiene {activeTemplateCount} páginas, pero la lista actual tiene {distributionList.length} partidas. Haz clic en <strong>Generar Plantilla</strong> para renovarla.</span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {(activeTab === 'etiquetas' ? pdfFileBytes : albaranesPdfFileBytes) && (
                <div className="mt-1 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-3 shadow-sm">
                  <div className="flex items-center gap-2.5 mr-auto">
                    <BrainCircuit className={`w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0 ${isAnalyzingPdf ? 'animate-pulse text-rose-500' : ''}`} />
                    <div className="text-left font-sans">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">PDF cargado: <span className="font-mono text-emerald-600 dark:text-emerald-400 text-[11px]">{activeTab === 'etiquetas' ? pdfFileName : albaranesPdfFileName}</span></p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">¿Quieres extraer la versión, dirección y tirada de cada página del PDF de forma local, instantánea y gratuita?</p>
                    </div>
                  </div>
                  <button
                    onClick={handleAnalyzePdfWithAI}
                    disabled={isAnalyzingPdf}
                    className={`w-full md:w-auto text-xs font-bold py-2 px-3.5 rounded-lg flex items-center justify-center gap-1.5 transition border whitespace-nowrap ${isAnalyzingPdf ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border-zinc-700' : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/50 hover:border-emerald-400 shadow-md shadow-emerald-950/20'}`}
                  >
                    {isAnalyzingPdf ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        Analizando...
                      </>
                    ) : (
                      <>
                        <BrainCircuit className="w-3.5 h-3.5" />
                        Sincronizar PDF
                      </>
                    )}
                  </button>
                </div>
              )}

              {!(activeTab === 'etiquetas' ? pdfFileBytes : albaranesPdfFileBytes) && (
                <div className="px-3 py-2 bg-amber-950/30 text-amber-300 rounded-md border border-amber-900/45 text-xs flex gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    No has cargado el documento de {activeTab === 'etiquetas' ? 'etiquetas' : 'albaranes'} original. Haz clic en <strong>Generar Plantilla</strong> si no tienes un PDF propio para testear la descarga completa o previsualizar marcas.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Stamping Layout customizer */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 flex-1 flex flex-col gap-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-rose-500" />
                <span>Configuración del Sello ({activeTab === 'etiquetas' ? 'Etiquetas' : 'Albaranes'})</span>
              </h2>
              {activeTab === 'etiquetas' && (
                <div className="text-[10px] text-zinc-500 italic">Maqueta base dinámica</div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Remitente Info */}
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-950/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div>
                  <label className="text-xs text-zinc-600 dark:text-zinc-400 font-bold block mb-1.5">Empresa / Remitente (Cabecera)</label>
                  <input 
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:border-apple-blue dark:focus:border-rose-500 focus:outline-none font-bold shadow-sm transition-colors"
                    placeholder="Ej: MI EMPRESA S.A."
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 font-semibold block mb-1">Subtítulo / Detalles (Multilínea)</label>
                  <textarea 
                    value={senderDetails}
                    onChange={(e) => setSenderDetails(e.target.value)}
                    rows={2}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded px-2.5 py-1.5 text-[10px] text-zinc-900 dark:text-white focus:border-apple-blue dark:focus:border-rose-500 focus:outline-none leading-tight shadow-sm"
                    placeholder="Línea 1&#10;Línea 2..."
                  />
                </div>
              </div>

              {/* Estilos Individuales Maqueta */}
              <div className="sm:col-span-2 bg-zinc-50 dark:bg-zinc-950/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <label className="text-xs text-zinc-600 dark:text-zinc-400 font-bold block mb-3">Personalización de Campos de la Maqueta</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { key: 'header', label: 'Empresa (Cabecera)' },
                    { key: 'sender', label: 'Detalles Remitente' },
                    { key: 'address', label: 'Dirección (Destino)' },
                    { key: 'version', label: 'Versión' },
                    { key: 'palletQty', label: 'Cantidad Palet' },
                    { key: 'palletNo', label: 'Nº de Palet' },
                    { key: 'totalQty', label: 'Tirada Total' },
                  ].map((field) => (
                    <div key={field.key} className="bg-white dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800/50 flex flex-col justify-between shadow-sm">
                      <div className="text-[10px] text-zinc-600 dark:text-zinc-300 font-bold mb-1.5">{field.label}</div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="color"
                          value={maquetaStyles[field.key as keyof typeof maquetaStyles].color}
                          onChange={(e) => setMaquetaStyles({...maquetaStyles, [field.key]: { ...maquetaStyles[field.key as keyof typeof maquetaStyles], color: e.target.value }})}
                          className="w-5 h-5 rounded cursor-pointer bg-zinc-200 dark:bg-zinc-900 border-0 p-0"
                          title="Color del texto"
                        />
                        <div className="flex-1 flex items-center gap-1">
                          <span className="text-[9px] text-zinc-500">T:</span>
                          <input 
                            type="range"
                            min="-10"
                            max="20"
                            value={maquetaStyles[field.key as keyof typeof maquetaStyles].sizeOffset}
                            onChange={(e) => setMaquetaStyles({...maquetaStyles, [field.key]: { ...maquetaStyles[field.key as keyof typeof maquetaStyles], sizeOffset: parseInt(e.target.value) }})}
                            className="w-full accent-rose-500"
                            title="Tamaño del texto"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Template Text Area */}
              <div className="sm:col-span-2">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-zinc-400 font-semibold block">Cuerpo del Sello Informativo</label>
                  {activeTab === 'albaranes' && (
                    <span className="text-[10px] text-emerald-400 font-semibold">Consejo: Estampado sobre "Total bultos : "</span>
                  )}
                </div>
                <textarea 
                  value={activeTab === 'etiquetas' ? textTemplate : albaranesTextTemplate} 
                  onChange={(e) => activeTab === 'etiquetas' ? setTextTemplate(e.target.value) : setAlbaranesTextTemplate(e.target.value)}
                  rows={3}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white font-mono focus:border-apple-blue dark:focus:border-rose-500 focus:outline-none shadow-sm"
                  placeholder="Introduce texto con variables..."
                />
                
                {/* Interactive Variable Toggles */}
                <div className="mt-2">
                  <span className="text-[10px] text-zinc-500 font-medium block mb-1">Haz click para añadir/quitar campos del sello:</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: '{version}', label: 'Versión', defaultFormat: 'VERSIÓN: {version}' },
                      { key: '{address}', label: 'Destino', defaultFormat: 'DESTINO: {address}' },
                      { key: '{quantity}', label: 'Ejemplares', defaultFormat: 'CANTIDAD: {quantity} ej.' },
                      { key: '{total_quantity}', label: 'Tirada Total', defaultFormat: 'TIRADA TOTAL: {total_quantity} ej.' },
                      { key: '{barcode}', label: 'Observaciones', defaultFormat: 'OBS: {barcode}' },
                      ...(activeTab === 'etiquetas' 
                        ? [{ key: '{current}', label: 'Nº Palet', defaultFormat: 'PALET: {current}/{total}' }] 
                        : [{ key: '{total}', label: 'Total Bultos', defaultFormat: 'TOTAL BULTOS: {total}' }])
                    ].map(field => {
                      const currentText = activeTab === 'etiquetas' ? textTemplate : albaranesTextTemplate;
                      const setFn = activeTab === 'etiquetas' ? setTextTemplate : setAlbaranesTextTemplate;
                      const isActive = currentText.includes(field.key);
                      
                      return (
                        <button
                          key={field.key}
                          onClick={() => {
                            if (isActive) {
                              const lines = currentText.split('\n').filter(line => !line.includes(field.key));
                              setFn(lines.join('\n').trim());
                            } else {
                              setFn((currentText + (currentText ? '\n' : '') + field.defaultFormat).trim());
                            }
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors flex items-center gap-1 ${
                            isActive 
                              ? 'bg-rose-900/40 border-rose-500/50 text-rose-300 hover:bg-rose-900/60' 
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                          }`}
                        >
                          <span className="text-[12px] leading-none mb-[1px]">{isActive ? '✓' : '+'}</span>
                          {field.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Pos Y slider */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-zinc-400 font-semibold">Altura Vertical (Eje Y)</label>
                  <span className="text-xs text-rose-400 font-mono font-bold">{activeTab === 'etiquetas' ? positionY : albaranesPositionY} pt</span>
                </div>
                <input 
                  type="range" 
                  min={20} 
                  max={800} 
                  value={activeTab === 'etiquetas' ? positionY : albaranesPositionY} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (activeTab === 'etiquetas') {
                      setPositionY(val);
                    } else {
                      setAlbaranesPositionY(val);
                    }
                  }}
                  className="w-full accent-rose-500" 
                />
                <span className="text-[10px] text-zinc-500 block">Medido desde la base inferior del PDF.</span>
              </div>

              {/* Font Size slider */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-zinc-400 font-semibold">Tamaño de Letra</label>
                  <span className="text-xs text-rose-400 font-mono font-bold">{activeTab === 'etiquetas' ? fontSize : albaranesFontSize} px</span>
                </div>
                <input 
                  type="range" 
                  min={12} 
                  max={55} 
                  value={activeTab === 'etiquetas' ? fontSize : albaranesFontSize} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (activeTab === 'etiquetas') {
                      setFontSize(val);
                    } else {
                      setAlbaranesFontSize(val);
                    }
                  }}
                  className="w-full accent-rose-500" 
                />
                <span className="text-[10px] text-zinc-500 block">Letras Helvética en Negrita grande.</span>
              </div>

              {/* Color picker & align button */}
              <div>
                <label className="text-xs text-zinc-400 font-semibold block mb-1">Color del Sello</label>
                <div className="flex gap-2">
                  <input 
                    type="color" 
                    value={activeTab === 'etiquetas' ? textColor : albaranesTextColor} 
                    onChange={(e) => {
                      const val = e.target.value;
                      if (activeTab === 'etiquetas') {
                        setTextColor(val);
                      } else {
                        setAlbaranesTextColor(val);
                      }
                    }}
                    className="w-8 h-8 rounded border border-zinc-700 bg-transparent block cursor-pointer" 
                  />
                  <input 
                    type="text" 
                    value={activeTab === 'etiquetas' ? textColor : albaranesTextColor} 
                    onChange={(e) => {
                      const val = e.target.value;
                      if (activeTab === 'etiquetas') {
                        setTextColor(val);
                      } else {
                        setAlbaranesTextColor(val);
                      }
                    }}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-2.5 py-1 text-xs font-mono text-zinc-900 dark:text-white shadow-sm" 
                  />
                </div>
              </div>

              {/* Alignment constraints */}
              <div className="flex flex-col justify-end">
                <div className="flex items-center gap-2 mb-2">
                  <input 
                    type="checkbox" 
                    id="chkCenter"
                    checked={activeTab === 'etiquetas' ? centerAlign : albaranesCenterAlign} 
                    onChange={(e) => {
                      const val = e.target.checked;
                      if (activeTab === 'etiquetas') {
                        setCenterAlign(val);
                      } else {
                        setAlbaranesCenterAlign(val);
                      }
                    }}
                    className="w-4 h-4 accent-rose-500" 
                  />
                  <label htmlFor="chkCenter" className="text-xs text-zinc-300 select-none">
                    Centrar Horizontalmente
                  </label>
                </div>
                {!(activeTab === 'etiquetas' ? centerAlign : albaranesCenterAlign) && (
                  <div>
                    <input 
                      type="range" 
                      min={0} 
                      max={500} 
                      value={activeTab === 'etiquetas' ? positionX : albaranesPositionX} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (activeTab === 'etiquetas') {
                          setPositionX(val);
                        } else {
                          setAlbaranesPositionX(val);
                        }
                      }}
                      className="w-full accent-rose-500" 
                    />
                    <span className="text-[9px] text-zinc-500 font-mono">Margen Izquierdo: {activeTab === 'etiquetas' ? positionX : albaranesPositionX} px</span>
                  </div>
                )}
              </div>
            </div>

            {/* Simulated Live preview frame OR real PDF iframe embedded with Chrome Sandbox Bypasses */}
            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-lg overflow-hidden flex flex-col flex-1 min-h-[480px] relative shadow-sm">
              <div className="bg-zinc-50 dark:bg-zinc-900 px-3 py-2.5 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <FileCheck className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-zinc-200">Previsualizador de la Marca Impresa</span>
                  <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                    Fila #{selectedPreviewItemIdx + 1}
                  </span>
                </div>
                
                {/* Control Toggles */}
                <div className="flex gap-2 items-center">
                  {isPreviewLoading && <span className="text-xs text-rose-400 font-bold animate-pulse">Generando...</span>}
                  <button
                    onClick={handleUpdatePreviewPdf}
                    disabled={isPreviewLoading || distributionList.length === 0}
                    className="px-3 py-1.5 text-xs font-bold rounded-md bg-rose-600 text-stone-50 shadow-md shadow-rose-950/30 hover:bg-rose-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Actualizar Previsualización
                  </button>
                  {activePreviewUrl && (
                    <a
                      href={activePreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 text-xs font-bold rounded-md bg-emerald-600 text-stone-50 shadow-md shadow-emerald-950/30 hover:bg-emerald-500 transition flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir en Pantalla Completa
                    </a>
                  )}
                </div>
              </div>

              {/* View Modes Rendering */}
              <div className="flex-1 flex items-center justify-center p-3 sm:p-5 overflow-auto bg-zinc-100 dark:bg-zinc-950">
                  {/* Lector PDF Real Mode iframe */}
                  {activePreviewUrl ? (
                    <div className="w-full h-[600px] relative flex flex-col justify-between">
                      <iframe 
                        src={`${activePreviewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                        className="w-full h-full bg-stone-100 flex-1 rounded border border-zinc-800"
                        title="Live PDF preview frame"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                      <SlidersHorizontal className="w-8 h-8 text-zinc-600 mb-1.5 animate-pulse" />
                      <p className="text-xs text-zinc-400 font-semibold mb-0.5">Vista previa PDF inactiva</p>
                      <p className="text-[10px] text-zinc-600 leading-normal max-w-sm">
                        Carga un reparto y haz clic en "Actualizar Previsualización" para renderizar el PDF oficial.
                      </p>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>

        {/* NOTIFICATION FLASHER AND PDF PROCESS BAR */}
        <div className="col-span-12">
          {successMsg && (
            <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 p-4 rounded-xl flex items-start gap-3 text-sm animate-fade-in mb-4">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 p-4 rounded-xl flex items-start gap-3 text-sm animate-fade-in mb-4">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isProcessingPdf && (
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-3 animate-pulse mb-4 shadow-sm">
              <div className="flex justify-between text-xs text-zinc-700 dark:text-zinc-300 font-bold">
                <span>{activeTab === 'etiquetas' ? 'Calculando palets por partida y duplicando páginas en el PDF...' : 'Marcando albaranes originales página a página...'}</span>
                <span>{pdfProgress}%</span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-200 dark:border-zinc-800">
                <div 
                  className="bg-gradient-to-r from-rose-500 to-amber-500 h-full transition-all duration-300" 
                  style={{ width: `${pdfProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Large Execution Button — with prerequisite checklist */}
          {(() => {
            const activePdf = activeTab === 'etiquetas' ? pdfFileBytes : albaranesPdfFileBytes;
            const hasDistribution = distributionList.length > 0;
            const hasPdf = true; // Automatically generated if not present
            const hasFullPalletSize = fullPalletSize !== '' && (fullPalletSize as number) > 0;
            const hasMinPico = minPico !== '' && (minPico as number) > 0;
            const paramsApplied = !paramsAreDirty;

            const allReady = hasPdf && hasDistribution && hasFullPalletSize && hasMinPico && paramsApplied && !isProcessingPdf;

            const checks: { label: string; ok: boolean; hint: string }[] = [
              {
                label: activePdf ? (activeTab === 'etiquetas' ? 'PDF de etiquetas cargado' : 'PDF de albaranes cargado') : 'Plantilla por defecto lista',
                ok: hasPdf,
                hint: activePdf ? 'PDF cargado correctamente' : 'Se autogenerará la plantilla base al procesar'
              },
              {
                label: 'Lista de distribución con partidas',
                ok: hasDistribution,
                hint: 'Importa un Excel o añade partidas manualmente'
              },
              {
                label: 'Capacidad Palet Completo definida',
                ok: hasFullPalletSize,
                hint: 'Introduce un valor en el campo 1 y haz clic en Aplicar'
              },
              {
                label: 'Corte de Pico Mínimo (Floor) definido',
                ok: hasMinPico,
                hint: 'Introduce un valor en el campo 2 y haz clic en Aplicar'
              },
              {
                label: 'Parámetros confirmados (Aplicar)',
                ok: paramsApplied,
                hint: 'Haz clic en el botón "Aplicar ↵" o pulsa Enter'
              },
            ];

            const pendingCount = checks.filter(c => !c.ok).length;

            return (
              <div className="mt-2 flex flex-col items-center gap-4">

                {/* Checklist de requisitos */}
                <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-rose-400" />
                      Requisitos para generar el PDF
                    </span>
                    {allReady ? (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-700/40 px-2 py-0.5 rounded-full">
                        ✓ Todo listo
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-950/50 border border-amber-700/40 px-2 py-0.5 rounded-full">
                        {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {checks.map((check, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs transition-all ${
                          check.ok
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700/30 text-emerald-800 dark:text-emerald-300'
                            : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        <span className={`mt-0.5 shrink-0 text-base leading-none ${check.ok ? 'text-emerald-400' : 'text-zinc-600'}`}>
                          {check.ok ? '✓' : '○'}
                        </span>
                        <div>
                          <span className={`font-semibold block ${check.ok ? 'text-emerald-200' : 'text-zinc-300'}`}>
                            {check.label}
                          </span>
                          {!check.ok && (
                            <span className="text-[10px] text-zinc-500 italic">{check.hint}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Botón principal */}
                <button
                  onClick={handleProcessAndDownloadPdf}
                  disabled={!allReady}
                  title={!allReady ? `Faltan ${pendingCount} requisito(s) para ejecutar` : 'Iniciar generación del PDF final'}
                  className={`w-full md:w-auto md:min-w-[480px] inline-flex items-center justify-center gap-3 px-10 py-4 rounded-xl text-sm font-bold shadow-2xl transition-all duration-200 ${
                    allReady
                      ? 'bg-rose-600 hover:bg-rose-500 text-stone-50 cursor-pointer active:scale-95 shadow-rose-950/40'
                      : 'bg-zinc-800 border border-zinc-700/60 text-zinc-500 cursor-not-allowed opacity-60'
                  }`}
                >
                  {isProcessingPdf ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Printer className="w-5 h-5" />
                  )}
                  {isProcessingPdf
                    ? 'Procesando...'
                    : activeTab === 'etiquetas'
                      ? 'GENERAR PDF FINAL CON DUPLICADO Y MARCAS'
                      : 'GENERAR PDF FINAL DE ALBARANES LOGÍSTICOS'}
                </button>

                <p className="text-[11px] text-zinc-500">
                  {allReady
                    ? activeTab === 'etiquetas'
                      ? `Se creará un duplicado exacto para cada uno de los ${distributionStats.totalPalletsCount} bultos calculados, inyectando el sello en cada página individual.`
                      : 'Se estampará secuencialmente el total de palets y desglose de reparto en cada albarán, respetando la estructura 1-a-1 sin duplicar páginas.'
                    : 'Completa todos los requisitos marcados arriba para habilitar la generación.'}
                </p>
              </div>
            );
          })()}
        </div>

      </main>
      )}

      <PalletEditorModal
        isOpen={editingPalletItemIndex !== null}
        onClose={() => setEditingPalletItemIndex(null)}
        item={editingPalletItemIndex !== null ? distributionList[editingPalletItemIndex] : null}
        defaultFullSize={Number(activeFullPalletSize) || 21000}
        defaultMinPico={Number(activeMinPico) || 100}
        onSave={handleSaveCustomPallets}
      />


      <footer className="border-t border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 py-6 text-center text-xs text-zinc-500 dark:text-zinc-600 mt-12">
        <p>© 2026 Gestor de Paletizado & Logística. Algoritmo de optimización automática de picos para impresión rápida.</p>
      </footer>
    </div>
  );
}
