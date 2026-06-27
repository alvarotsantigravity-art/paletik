/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PDFDocument, StandardFonts, rgb, degrees, PDFPage } from 'pdf-lib';
import { PalletResult, BrochureSpec, PalletConfig, PackageConfig, CubicageResult, Transport, MaquetaStylesConfig } from './types';

export interface ProcessPdfOptions {
  fullPalletSize: number;
  minPico: number;
  items: {
    id: string;
    version: string;
    address: string;
    quantity: number;
    customPallets?: PalletResult[];
  }[];
  transports?: Transport[];
  pdfBytes: ArrayBuffer | null;
  textTemplate: string;
  fontSize: number;
  textColor: string; // e.g. '#FF0000'
  positionY: number; // Y offset from bottom (0 - height)
  positionX: number; // X offset if not centered or offset from center
  centerAlign: boolean;
  isGeneratedTemplate?: boolean;
  maquetaStyles?: MaquetaStylesConfig;
  onProgress?: (progress: number) => void;
}

/**
 * Parses hex color to pdf-lib rgb values (0.0 to 1.0)
 */
function hexToRgb(hex: string) {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(char => char + char).join('');
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
}

/**
 * Draws text safely on a page, taking the page's current rotation into account.
 * This ensures the text is always upright relative to the viewer.
 */
export function drawUprightText(
  page: PDFPage,
  font: any,
  text: string,
  fontSize: number,
  color: any,
  visualX: number,
  visualY: number,
  rotationAngle: number,
  centerAlign: boolean
) {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const r = ((rotationAngle % 360) + 360) % 360;

  let visualWidth = pageWidth;
  if (r === 90 || r === 270) {
    visualWidth = pageHeight;
  }

  let finalVisualX = visualX;
  if (centerAlign) {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    finalVisualX = (visualWidth - textWidth) / 2;
  }

  let finalX = finalVisualX;
  let finalY = visualY;
  let textRotation = degrees(0);

  if (r === 0) {
    finalX = finalVisualX;
    finalY = visualY;
    textRotation = degrees(0);
  } else if (r === 90) {
    finalX = pageWidth - visualY;
    finalY = finalVisualX;
    textRotation = degrees(90);
  } else if (r === 180) {
    finalX = pageWidth - finalVisualX;
    finalY = pageHeight - visualY;
    textRotation = degrees(180);
  } else if (r === 270) {
    finalX = visualY;
    finalY = pageHeight - finalVisualX;
    textRotation = degrees(270);
  }

  page.drawText(text, {
    x: finalX,
    y: finalY,
    size: fontSize,
    font,
    color,
    rotate: textRotation,
  });
}

/**
 * Format quantity with Spanish thousand separator (e.g., 21.000)
 */
export function formatQuantitySpain(q: number): string {
  return q.toLocaleString('de-DE'); // 'de-DE' uses dots for thousands and commas for decimals, same as Spain
}

/**
 * Pallet distribution algorithm
 */
export function calculatePalletsForQuantity(quantity: number, fullPalletSize: number, minPico: number): PalletResult[] {
  const safeFullPalletSize = Math.max(1, fullPalletSize || 21000);

  if (quantity <= 0) return [];
  
  if (quantity <= safeFullPalletSize) {
    return [{
      palletIndex: 1,
      totalPallets: 1,
      quantity,
      isAdjusted: false
    }];
  }

  const k = Math.floor(quantity / safeFullPalletSize);
  const R = quantity % safeFullPalletSize;

  if (R === 0) {
    const results: PalletResult[] = [];
    for (let i = 1; i <= k; i++) {
      results.push({
        palletIndex: i,
        totalPallets: k,
        quantity: safeFullPalletSize,
        isAdjusted: false
      });
    }
    return results;
  }

  const total = k + 1;
  const results: PalletResult[] = [];
  for (let i = 1; i <= k; i++) {
    results.push({
      palletIndex: i,
      totalPallets: total,
      quantity: safeFullPalletSize,
      isAdjusted: false
    });
  }
  results.push({
    palletIndex: total,
    totalPallets: total,
    quantity: R,
    isAdjusted: false
  });
  return results;
}

/**
 * Builds the modified PDF based on calculated pallets
 */
export async function generateModifiedPdf(options: ProcessPdfOptions): Promise<Uint8Array> {
  const {
    items,
    pdfBytes,
    fullPalletSize,
    minPico,
    textTemplate,
    fontSize,
    textColor,
    positionY,
    positionX,
    centerAlign,
    isGeneratedTemplate,
    onProgress
  } = options;

  if (!pdfBytes) {
    throw new Error('No se ha cargado ningún PDF con etiquetas de distribución.');
  }

  // Load the primary PDF
  const srcPdfDoc = await PDFDocument.load(pdfBytes);
  const srcPagesCount = srcPdfDoc.getPageCount();

  // Create a new PDF to hold the output
  const outputPdfDoc = await PDFDocument.create();
  
  // Embed the standard bold font
  const helveticaFont = await outputPdfDoc.embedFont(StandardFonts.HelveticaBold);
  const parsedColor = hexToRgb(textColor);

  // For index reporting
  let processedItemsCount = 0;
  const totalItems = items.length;

  for (let i = 0; i < totalItems; i++) {
    const item = items[i];
    
    // Calculate pallets for this distribution item
    const pallets = item.customPallets && item.customPallets.length > 0 
      ? item.customPallets 
      : calculatePalletsForQuantity(item.quantity, fullPalletSize, minPico);
    const palletCount = pallets.length;

    // Associate this row i with the corresponding page of the upload.
    // If the PDF has fewer pages than items, wrap around or skip the rest, but 
    // ideally sequential match: page index = i
    const pageIndexToCopy = i % srcPagesCount;

    // We copy the page 'pageCount' times (one for each pallet)
    for (let pIdx = 0; pIdx < palletCount; pIdx++) {
      const pallet = pallets[pIdx];

      // Copy the source page to our output PDF
      const [copiedPage] = await outputPdfDoc.copyPages(srcPdfDoc, [pageIndexToCopy]);
      const addedPage = outputPdfDoc.addPage(copiedPage);

      const { width, height } = addedPage.getSize();
      const rotation = addedPage.getRotation ? addedPage.getRotation() : { angle: 0 };
      const rotationAngle = rotation && typeof rotation.angle === 'number' ? rotation.angle : 0;

      // Custom formatting variables
      const formattedQty = formatQuantitySpain(pallet.quantity);
      const totalQtyFormatted = formatQuantitySpain(item.quantity);
      
      // Fallback for generated template without layout
      if (isGeneratedTemplate) {
        const palletQtyText = `${formattedQty} EJ.`;
        drawUprightText(
          addedPage,
          helveticaFont,
          palletQtyText,
          18,
          rgb(0, 0, 0),
          45,
          340,
          rotationAngle,
          false
        );

        const palletNoText = `${pallet.palletIndex} DE ${pallet.totalPallets}`;
        drawUprightText(
          addedPage,
          helveticaFont,
          palletNoText,
          18,
          rgb(0, 0, 0),
          225,
          340,
          rotationAngle,
          false
        );
      }
      // Barcode generation removed as requested
      
      // Draw the custom text template (now works on both custom and generated templates)
      let textToDraw = textTemplate;
      textToDraw = textToDraw
        .replace(/\{version\}/g, item.version)
        .replace(/\{address\}/g, item.address)
        .replace(/\{quantity\}/g, pallet.quantity.toLocaleString('es-ES'))
        .replace(/\{total_quantity\}/g, item.quantity.toLocaleString('es-ES'))
        .replace(/\{current\}/g, String(pallet.palletIndex))
        .replace(/\{total\}/g, String(pallet.totalPallets))
        .replace(/\{barcode\}/g, (item as any).barcode || '');
      const renderedLines = textToDraw.split('\n');

      const lineSpacing = fontSize * 1.35;
      for (let lineIndex = 0; lineIndex < renderedLines.length; lineIndex++) {
        const lineText = renderedLines[lineIndex].trim();
        if (!lineText) continue;
        const finalY = positionY - (lineIndex * lineSpacing);
        drawUprightText(
          addedPage,
          helveticaFont,
          lineText,
          fontSize,
          parsedColor,
          positionX,
          finalY,
          rotationAngle,
          centerAlign
        );
      }
    }

    processedItemsCount++;
    if (onProgress) {
      onProgress(Math.min(100, Math.floor((processedItemsCount / totalItems) * 100)));
    }
  }

  // Save the complete output document
  return await outputPdfDoc.save();
}

/**
 * Generate a single-page preview PDF for the selected item so the user can see alignment
 */
export async function generateSinglePagePreview(
  item: { version: string; address: string; quantity: number; customPallets?: PalletResult[]; barcode?: string },
  itemIdx: number,
  pdfBytes: ArrayBuffer | null,
  fullPalletSize: number,
  minPico: number,
  textTemplate: string,
  fontSize: number,
  textColor: string,
  positionY: number,
  positionX: number,
  centerAlign: boolean,
  isGeneratedTemplate?: boolean
): Promise<Uint8Array | null> {
  if (!pdfBytes) return null;

  try {
    const srcPdfDoc = await PDFDocument.load(pdfBytes);
    const srcPagesCount = srcPdfDoc.getPageCount();
    
    // Create new PDF doc for preview
    const previewPdfDoc = await PDFDocument.create();
    const helveticaFont = await previewPdfDoc.embedFont(StandardFonts.HelveticaBold);
    const parsedColor = hexToRgb(textColor);

    // Calculate pallets
    const pallets = item.customPallets && item.customPallets.length > 0 
      ? item.customPallets 
      : calculatePalletsForQuantity(item.quantity, fullPalletSize, minPico);
    if (pallets.length === 0) return null;

    // Use the first pallet as preview
    const firstPallet = pallets[0];

    const pageIndexToCopy = itemIdx % srcPagesCount;
    const [copiedPage] = await previewPdfDoc.copyPages(srcPdfDoc, [pageIndexToCopy]);
    const addedPage = previewPdfDoc.addPage(copiedPage);

    const { width, height } = addedPage.getSize();
    const rotation = addedPage.getRotation ? addedPage.getRotation() : { angle: 0 };
    const rotationAngle = rotation && typeof rotation.angle === 'number' ? rotation.angle : 0;

    const formattedQty = formatQuantitySpain(firstPallet.quantity);

    if (isGeneratedTemplate) {
      // BarTender template mode: Stamp values directly in the empty boxes of the grid layout
      const palletQtyText = `${formattedQty} EJ.`;
      drawUprightText(
        addedPage,
        helveticaFont,
        palletQtyText,
        18,
        rgb(0, 0, 0),
        45,
        340,
        rotationAngle,
        false
      );

      const palletNoText = `${firstPallet.palletIndex} DE ${firstPallet.totalPallets}`;
      drawUprightText(
        addedPage,
        helveticaFont,
        palletNoText,
        18,
        rgb(0, 0, 0),
        225,
        340,
        rotationAngle,
        false
      );
    }

    let textToDraw = textTemplate;
    textToDraw = textToDraw
      .replace(/\{version\}/g, item.version)
      .replace(/\{address\}/g, item.address)
      .replace(/\{quantity\}/g, item.quantity.toLocaleString('es-ES'))
      .replace(/\{total_quantity\}/g, item.quantity.toLocaleString('es-ES'))
      .replace(/\{total\}/g, String(item.customPallets?.length || 1))
      .replace(/\{barcode\}/g, item.barcode || '');
    const renderedLines = textToDraw.split('\n');

    const lineSpacing = fontSize * 1.35;

    for (let lineIndex = 0; lineIndex < renderedLines.length; lineIndex++) {
      const lineText = renderedLines[lineIndex].trim();
      if (!lineText) continue;

      const finalY = positionY - (lineIndex * lineSpacing);

      drawUprightText(
        addedPage,
        helveticaFont,
        lineText,
        fontSize,
        parsedColor,
        positionX,
        finalY,
        rotationAngle,
        centerAlign
      );
    }

    return await previewPdfDoc.save();
  } catch (err) {
    console.error('Error generating preview', err);
    return null;
  }
}

/**
 * Builds the modified PDF for Albaranes mode (1-to-1 without page duplication)
 */
export async function generateAlbaranesPdf(options: ProcessPdfOptions): Promise<Uint8Array> {
  const {
    items,
    pdfBytes,
    fullPalletSize,
    minPico,
    textTemplate,
    fontSize,
    textColor,
    positionY,
    positionX,
    centerAlign,
    onProgress
  } = options;

  if (!pdfBytes) {
    throw new Error('No se ha cargado ningún PDF con albaranes de distribución.');
  }

  const srcPdfDoc = await PDFDocument.load(pdfBytes);
  const srcPagesCount = srcPdfDoc.getPageCount();

  const outputPdfDoc = await PDFDocument.create();
  const helveticaFont = await outputPdfDoc.embedFont(StandardFonts.HelveticaBold);
  const parsedColor = hexToRgb(textColor);

  const activeEntities = options.transports && options.transports.length > 0 
    ? options.transports 
    : items; // fallback to items if no transports are defined

  let processedItemsCount = 0;
  const totalItems = activeEntities.length;

  for (let i = 0; i < totalItems; i++) {
    const entity = activeEntities[i];
    
    let totalQuantity = 0;
    let palletCount = 0;
    let addresses: string[] = [];
    let entityName = '';

    if ('items' in entity && Array.isArray(entity.items)) {
      // It's a Transport
      entityName = entity.name;
      for (const itemId of entity.items) {
        const item = items.find(it => it.id === itemId);
        if (item) {
          totalQuantity += item.quantity;
          const pallets = item.customPallets && item.customPallets.length > 0 
            ? item.customPallets 
            : calculatePalletsForQuantity(item.quantity, fullPalletSize, minPico);
          palletCount += pallets.length;
          if (!addresses.includes(item.address)) addresses.push(item.address);
        }
      }
    } else {
      // It's a DistributionItem
      const item = entity as any;
      entityName = item.version;
      totalQuantity = item.quantity;
      const pallets = item.customPallets && item.customPallets.length > 0 
        ? item.customPallets 
        : calculatePalletsForQuantity(item.quantity, fullPalletSize, minPico);
      palletCount = pallets.length;
      addresses.push(item.address);
    }
    
    const pageIndexToCopy = i % srcPagesCount;

    // Copy only ONE page for this item/transport (no duplication)
    const [copiedPage] = await outputPdfDoc.copyPages(srcPdfDoc, [pageIndexToCopy]);
    const addedPage = outputPdfDoc.addPage(copiedPage);

    const { width, height } = addedPage.getSize();
    const rotation = addedPage.getRotation ? addedPage.getRotation() : { angle: 0 };
    const rotationAngle = rotation && typeof rotation.angle === 'number' ? rotation.angle : 0;
    const totalQtyFormatted = formatQuantitySpain(totalQuantity);

    let textToDraw = textTemplate;
    textToDraw = textToDraw
      .replace(/\{version\}/g, entityName)
      .replace(/\{address\}/g, addresses.join(', ').substring(0, 50))
      .replace(/\{quantity\}/g, totalQtyFormatted)
      .replace(/\{total_quantity\}/g, totalQtyFormatted)
      .replace(/\{current\}/g, '1')
      .replace(/\{total\}/g, String(palletCount))
      .replace(/\{barcode\}/g, (entity as any).barcode || '');
    const renderedLines = textToDraw.split('\n');

    const lineSpacing = fontSize * 1.35;
    
    for (let lineIndex = 0; lineIndex < renderedLines.length; lineIndex++) {
      const lineText = renderedLines[lineIndex].trim();
      if (!lineText) continue;

      const finalY = positionY - (lineIndex * lineSpacing);

      drawUprightText(
        addedPage,
        helveticaFont,
        lineText,
        fontSize,
        parsedColor,
        positionX,
        finalY,
        rotationAngle,
        centerAlign
      );
    }

    processedItemsCount++;
    if (onProgress) {
      onProgress(Math.min(100, Math.floor((processedItemsCount / totalItems) * 100)));
    }
  }

  return await outputPdfDoc.save();
}

/**
 * Generate a single-page preview for Albaranes mode
 */
export async function generateSinglePageAlbaranesPreview(
  item: { version: string; address: string; quantity: number; customPallets?: PalletResult[] },
  itemIdx: number,
  pdfBytes: ArrayBuffer | null,
  fullPalletSize: number,
  minPico: number,
  textTemplate: string,
  fontSize: number,
  textColor: string,
  positionY: number,
  positionX: number,
  centerAlign: boolean,
  isGeneratedTemplate?: boolean
): Promise<Uint8Array | null> {
  if (!pdfBytes) return null;

  try {
    const srcPdfDoc = await PDFDocument.load(pdfBytes);
    const srcPagesCount = srcPdfDoc.getPageCount();
    
    const previewPdfDoc = await PDFDocument.create();
    const helveticaFont = await previewPdfDoc.embedFont(StandardFonts.HelveticaBold);
    const parsedColor = hexToRgb(textColor);

    const pallets = item.customPallets && item.customPallets.length > 0 
      ? item.customPallets 
      : calculatePalletsForQuantity(item.quantity, fullPalletSize, minPico);
    const palletCount = pallets.length;

    const pageIndexToCopy = itemIdx % srcPagesCount;
    const [copiedPage] = await previewPdfDoc.copyPages(srcPdfDoc, [pageIndexToCopy]);
    const addedPage = previewPdfDoc.addPage(copiedPage);

    const { width, height } = addedPage.getSize();
    const rotation = addedPage.getRotation ? addedPage.getRotation() : { angle: 0 };
    const rotationAngle = rotation && typeof rotation.angle === 'number' ? rotation.angle : 0;

    const totalQtyFormatted = formatQuantitySpain(item.quantity);

    let textToDraw = textTemplate;
    textToDraw = textToDraw
      .replace(/\{version\}/g, item.version)
      .replace(/\{address\}/g, item.address)
      .replace(/\{quantity\}/g, totalQtyFormatted)
      .replace(/\{total_quantity\}/g, totalQtyFormatted)
      .replace(/\{current\}/g, '1')
      .replace(/\{total\}/g, String(palletCount))
      .replace(/\{total_pallets\}/g, String(palletCount))
      .replace(/\{barcode\}/g, (item as any).barcode || '');
    const renderedLines = textToDraw.split('\n');

    const lineSpacing = fontSize * 1.35;

    for (let lineIndex = 0; lineIndex < renderedLines.length; lineIndex++) {
      const lineText = renderedLines[lineIndex].trim();
      if (!lineText) continue;

      const finalY = positionY - (lineIndex * lineSpacing);

      drawUprightText(
        addedPage,
        helveticaFont,
        lineText,
        fontSize,
        parsedColor,
        positionX,
        finalY,
        rotationAngle,
        centerAlign
      );
    }

    return await previewPdfDoc.save();
  } catch (err) {
    console.error('Error generating preview', err);
    return null;
  }
}

/**
 * Generates a complete premium PDF report for pallet cubicaje calculations.
 */
export async function generateCubicajePdf(
  brochureSpec: BrochureSpec,
  packageConfig: PackageConfig,
  palletConfig: PalletConfig,
  result: CubicageResult,
  customQuantity?: number
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const page = pdfDoc.addPage([595.27, 841.89]);
  const { width, height } = page.getSize();

  // Helper colors
  const colorPrimary = rgb(0.14, 0.44, 0.94); // Blue
  const colorSecondary = rgb(0.49, 0.23, 0.93); // Purple
  const colorDark = rgb(0.09, 0.09, 0.11);
  const colorText = rgb(0.18, 0.18, 0.2);
  const colorTextMuted = rgb(0.45, 0.45, 0.47);
  const colorLightBg = rgb(0.96, 0.96, 0.96);
  const colorBorder = rgb(0.88, 0.88, 0.88);
  const colorAmber = rgb(0.96, 0.62, 0.04);
  const colorRed = rgb(0.93, 0.27, 0.27);
  const colorGreen = rgb(0.1, 0.63, 0.35);

  // 1. Draw Header
  page.drawRectangle({
    x: 40,
    y: height - 100,
    width: width - 80,
    height: 60,
    color: colorDark,
  });

  page.drawText('INFORME DE CUBICAJE DE PALET', {
    x: 55,
    y: height - 68,
    size: 16,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  const palletName = palletConfig.type === 'european' ? 'Palet Europeo (1200x800 mm)' : 'Palet Americano (1200x1000 mm)';
  page.drawText(`PALETIK Logística · ${palletName}`, {
    x: 55,
    y: height - 85,
    size: 10,
    font: helveticaFont,
    color: rgb(0.7, 0.7, 0.7),
  });

  const dateStr = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  page.drawText(`Fecha: ${dateStr}`, {
    x: width - 260,
    y: height - 76,
    size: 9,
    font: helveticaFont,
    color: rgb(0.9, 0.9, 0.9),
  });

  // Helper for drawing rows of data
  const drawRow = (label: string, value: string, x: number, y: number, font = helveticaFont, valFont = helveticaBold, size = 9) => {
    page.drawText(label, { x, y, size, font, color: colorTextMuted });
    page.drawText(value, { x: x + 130, y, size, font: valFont, color: colorText });
  };

  // 2. Main Two-Column Info Panel
  const col1X = 45;
  const col2X = 305;

  // Background for columns
  page.drawRectangle({
    x: 40,
    y: height - 330,
    width: width - 80,
    height: 215,
    color: colorLightBg,
  });

  // Divider
  page.drawLine({
    start: { x: width / 2, y: height - 135 },
    end: { x: width / 2, y: height - 315 },
    color: colorBorder,
    thickness: 1,
  });

  // Column 1 Header
  page.drawText('DATOS DEL FOLLETO Y PAQUETE', {
    x: col1X,
    y: height - 150,
    size: 11,
    font: helveticaBold,
    color: colorPrimary,
  });

  let rowY = height - 170;
  drawRow('Gramaje del papel:', `${brochureSpec.paperGsm} g/m²`, col1X, rowY); rowY -= 15;
  drawRow('Mano (Bulk) de papel:', `${brochureSpec.paperBulk} cm³/g`, col1X, rowY); rowY -= 15;
  drawRow('Tamaño folleto:', `${brochureSpec.widthMm} x ${brochureSpec.heightMm} mm`, col1X, rowY); rowY -= 15;
  drawRow('Páginas:', `${brochureSpec.pageCount} págs (${brochureSpec.pageCount / 2} hojas)`, col1X, rowY); rowY -= 15;
  drawRow('Tipo acabado:', brochureSpec.bindingType === 'stapled' ? 'Grapado' : 'Cortado', col1X, rowY); rowY -= 15;
  if (brochureSpec.bindingType === 'stapled') {
    drawRow('Factor grapa extra:', `+${brochureSpec.stapleExtraMm} mm`, col1X, rowY); rowY -= 15;
  } else {
    rowY -= 15; // keep aligned
  }
  drawRow('Grosor del folleto:', `${result.brochureThicknessMm.toFixed(2)} mm`, col1X, rowY); rowY -= 15;
  drawRow('Peso del folleto:', `${result.brochureWeightG.toFixed(1)} g`, col1X, rowY); rowY -= 15;
  drawRow('Folletos por paquete:', `${packageConfig.unitsPerPackage} ej.`, col1X, rowY); rowY -= 15;
  drawRow('Altura del paquete:', `${result.packageHeightMm.toFixed(1)} mm`, col1X, rowY); rowY -= 15;
  drawRow('Peso del paquete:', `${(result.packageWeightG / 1000).toFixed(2)} kg`, col1X, rowY);

  // Column 2 Header
  page.drawText('CONFIGURACIÓN Y RESULTADO', {
    x: col2X,
    y: height - 150,
    size: 11,
    font: helveticaBold,
    color: colorPrimary,
  });

  rowY = height - 170;
  drawRow('Tipo de palet:', palletConfig.type === 'european' ? 'Europeo (1200x800)' : 'Americano (1200x1000)', col2X, rowY); rowY -= 15;
  drawRow('Altura máxima carga:', `${palletConfig.maxHeightMm} mm`, col2X, rowY); rowY -= 15;
  drawRow('Peso máxima carga:', `${palletConfig.maxWeightKg} kg`, col2X, rowY); rowY -= 15;
  drawRow('Margen de seguridad:', `${palletConfig.safetyMarginMm} mm`, col2X, rowY); rowY -= 15;
  
  if (customQuantity && customQuantity > 0) {
    drawRow('Cantidad objetivo (usr):', `${formatQuantitySpain(customQuantity)} ej.`, col2X, rowY, helveticaBold, helveticaBold); rowY -= 15;
  } else {
    drawRow('Cantidad objetivo:', 'Máxima capacidad', col2X, rowY, helveticaFont, helveticaOblique); rowY -= 15;
  }
  
  // Results
  drawRow('Paquetes por capa:', `${result.brochuresPerLayer} paquetes`, col2X, rowY); rowY -= 15;
  drawRow('Capas (filas vertical):', `${result.layersCount} capas`, col2X, rowY); rowY -= 15;
  drawRow('Total folletos en palet:', `${formatQuantitySpain(result.totalBrochures)} ej.`, col2X, rowY, helveticaBold, helveticaBold); rowY -= 15;
  
  const loadHeight = result.layersCount * result.packageHeightMm;
  const totalPalletHeight = loadHeight + 145; // 145mm wood structure
  drawRow('Altura de la carga:', `${Math.round(loadHeight)} mm`, col2X, rowY); rowY -= 15;
  drawRow('Altura total (con palet):', `${Math.round(totalPalletHeight)} mm`, col2X, rowY, helveticaBold, helveticaBold); rowY -= 15;
  
  drawRow('Peso total del palet:', `${result.totalWeightKg.toFixed(1)} kg`, col2X, rowY, helveticaBold, helveticaBold); rowY -= 15;
  drawRow('Eficiencia de la base:', `${result.efficiencyPercent.toFixed(1)} %`, col2X, rowY);

  // Status Alerts Box
  const statusY = height - 380;
  const hasAlerts = result.exceedsWeight || result.exceedsHeight || result.cogImbalance || result.isPicoStabilityActive;
  const isRedAlert = result.exceedsWeight || result.exceedsHeight;

  page.drawRectangle({
    x: 40,
    y: statusY,
    width: width - 80,
    height: 40,
    color: isRedAlert ? rgb(0.99, 0.95, 0.95) : hasAlerts ? rgb(0.99, 0.98, 0.93) : rgb(0.95, 0.99, 0.96),
    borderColor: isRedAlert ? colorRed : hasAlerts ? colorAmber : colorGreen,
    borderWidth: 1,
  });

  const warningMsgs = [];
  if (result.exceedsWeight) warningMsgs.push(`Excede peso (${result.totalWeightKg.toFixed(1)} kg / máx ${palletConfig.maxWeightKg} kg).`);
  if (result.exceedsHeight) warningMsgs.push(`Excede altura (${Math.round(totalPalletHeight)} mm / máx ${palletConfig.maxHeightMm + 145} mm).`);
  if (result.cogImbalance) warningMsgs.push(`Desv. COG > 10% (${result.cogLeftPct}% Izq - ${result.cogRightPct}% Der).`);
  if (result.isPicoStabilityActive) warningMsgs.push(`Estiba de pico activa (<60% altura, requiere apilamiento cruzado).`);

  if (isRedAlert) {
    page.drawText('ADVERTENCIA: EXCEDE LÍMITES PERMITIDOS', {
      x: 55,
      y: statusY + 24,
      size: 9,
      font: helveticaBold,
      color: colorRed,
    });
    page.drawText(warningMsgs.join(' | '), {
      x: 55,
      y: statusY + 10,
      size: 7.5,
      font: helveticaFont,
      color: colorRed,
    });
  } else if (hasAlerts) {
    page.drawText('CONFIGURACIÓN CON ADVERTENCIAS DE ESTABILIDAD', {
      x: 55,
      y: statusY + 24,
      size: 9,
      font: helveticaBold,
      color: colorAmber,
    });
    page.drawText(warningMsgs.join(' | '), {
      x: 55,
      y: statusY + 10,
      size: 7.5,
      font: helveticaFont,
      color: colorAmber,
    });
  } else {
    page.drawText('CONFIGURACIÓN VÁLIDA', {
      x: 55,
      y: statusY + 24,
      size: 9,
      font: helveticaBold,
      color: colorGreen,
    });
    page.drawText('La carga está equilibrada y dentro de los límites máximos de peso y altura.', {
      x: 55,
      y: statusY + 10,
      size: 8,
      font: helveticaFont,
      color: colorGreen,
    });
  }

  // 3. Draw Layout Diagram (Vista Cenital)
  const diagY = statusY - 300; // Y position of the diagram box
  page.drawText('VISTA CENITAL DEL PALET (DISTRIBUCIÓN DE PLANTA)', {
    x: 40,
    y: statusY - 20,
    size: 11,
    font: helveticaBold,
    color: colorDark,
  });

  // Diagram container
  page.drawRectangle({
    x: 40,
    y: diagY,
    width: width - 80,
    height: 260,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: colorBorder,
    borderWidth: 1,
  });

  // Draw the Pallet inside the diagram box
  const pw = palletConfig.widthMm;
  const pl = palletConfig.lengthMm;
  
  // We want to scale such that length (1200) fits in boxH (240) and width (800 or 1000) fits in boxW.
  const scale = 0.2;
  const drawPalletW = pw * scale; // 160 or 200 pt
  const drawPalletH = pl * scale; // 240 pt
  
  const palletLeft = 40 + (width - 80 - drawPalletW) / 2;
  const palletBottom = diagY + 10;
  const palletTop = palletBottom + drawPalletH;

  // Draw Pallet borders and wood planks
  const plankW = drawPalletW / 5;
  const colorWoodLight = rgb(0.82, 0.61, 0.45); // BurlyWood-like color
  const colorWoodDark = rgb(0.58, 0.41, 0.28);  // Slat borders
  
  // Outer pallet frame background
  page.drawRectangle({
    x: palletLeft,
    y: palletBottom,
    width: drawPalletW,
    height: drawPalletH,
    color: rgb(0.27, 0.24, 0.22),
    borderColor: rgb(0.47, 0.44, 0.41),
    borderWidth: 1.5,
  });

  // Draw 5 planks of wood
  for (let i = 0; i < 5; i++) {
    const px = palletLeft + i * plankW;
    page.drawRectangle({
      x: px + 0.5,
      y: palletBottom + 0.5,
      width: plankW - 1,
      height: drawPalletH - 1,
      color: colorWoodLight,
      borderColor: colorWoodDark,
      borderWidth: 0.5,
    });

    // Draw little circles representing metal nails on planks
    page.drawCircle({ x: px + plankW / 2 - 1.5, y: palletBottom + 4, size: 1.2, color: rgb(0.3, 0.3, 0.3) });
    page.drawCircle({ x: px + plankW / 2 + 1.5, y: palletBottom + 4, size: 1.2, color: rgb(0.3, 0.3, 0.3) });
    page.drawCircle({ x: px + plankW / 2 - 1.5, y: palletBottom + drawPalletH / 2, size: 1.2, color: rgb(0.3, 0.3, 0.3) });
    page.drawCircle({ x: px + plankW / 2 + 1.5, y: palletBottom + drawPalletH / 2, size: 1.2, color: rgb(0.3, 0.3, 0.3) });
    page.drawCircle({ x: px + plankW / 2 - 1.5, y: palletBottom + drawPalletH - 4, size: 1.2, color: rgb(0.3, 0.3, 0.3) });
    page.drawCircle({ x: px + plankW / 2 + 1.5, y: palletBottom + drawPalletH - 4, size: 1.2, color: rgb(0.3, 0.3, 0.3) });
  }

  // Draw safety margin exclusion zone (shaded orange border overlay)
  page.drawRectangle({
    x: palletLeft,
    y: palletBottom,
    width: drawPalletW,
    height: drawPalletH,
    color: rgb(0.96, 0.62, 0.04), // amber
    opacity: 0.15,
  });

  // Draw usable area background (semi-transparent dark overlay on wood to highlight packages)
  const sm = palletConfig.safetyMarginMm;
  page.drawRectangle({
    x: palletLeft + sm * scale,
    y: palletBottom + sm * scale,
    width: drawPalletW - 2 * sm * scale,
    height: drawPalletH - 2 * sm * scale,
    color: rgb(0.11, 0.1, 0.09), // slate-900 background tint
    opacity: 0.25,
  });

  // Draw safety margin border (orange dashed line)
  page.drawRectangle({
    x: palletLeft + sm * scale,
    y: palletBottom + sm * scale,
    width: drawPalletW - 2 * sm * scale,
    height: drawPalletH - 2 * sm * scale,
    borderColor: colorAmber,
    borderWidth: 1,
    borderDashArray: [4, 2],
  });

  // Draw placed packages
  result.baseLayout.forEach((b, idx) => {
    // Subtle gap padding (equivalent to UI)
    const pad = 1.2 * scale;
    const rx = palletLeft + b.x * scale + pad;
    const ry = palletTop - (b.y + b.height) * scale + pad;
    const rw = b.width * scale - pad * 2;
    const rh = b.height * scale - pad * 2;

    if (rw <= 0 || rh <= 0) return;

    const fillCol = b.rotated ? rgb(0.49, 0.23, 0.93) : rgb(0.14, 0.44, 0.94);
    const borderCol = b.rotated ? rgb(0.65, 0.45, 0.95) : rgb(0.35, 0.6, 0.95);

    // 1. Paper stack base (white paper edges look)
    page.drawRectangle({
      x: rx,
      y: ry,
      width: rw,
      height: rh,
      color: rgb(0.98, 0.98, 0.98), // white paper edges
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
    });

    // Simulated stacked page lines on sides for realism
    if (rw > 6 && rh > 6) {
      page.drawLine({
        start: { x: rx + 0.5, y: ry + 1.2 },
        end: { x: rx + rw - 0.5, y: ry + 1.2 },
        color: rgb(0.9, 0.9, 0.9),
        thickness: 0.3,
      });
      page.drawLine({
        start: { x: rx + 0.5, y: ry + 2.4 },
        end: { x: rx + rw - 0.5, y: ry + 2.4 },
        color: rgb(0.9, 0.9, 0.9),
        thickness: 0.3,
      });
      page.drawLine({
        start: { x: rx + 0.5, y: ry + rh - 1.2 },
        end: { x: rx + rw - 0.5, y: ry + rh - 1.2 },
        color: rgb(0.9, 0.9, 0.9),
        thickness: 0.3,
      });
    }

    // 2. Top Booklet Cover
    page.drawRectangle({
      x: rx + 0.8 * scale,
      y: ry + 0.8 * scale,
      width: rw - 1.6 * scale,
      height: rh - 1.6 * scale,
      color: fillCol,
      borderColor: borderCol,
      borderWidth: 0.5,
    });


    // 3. Strapping Band (Fleje)
    if (b.rotated) {
      // Rotated brochure: draw vertical strap
      page.drawLine({
        start: { x: rx + rw / 2, y: ry },
        end: { x: rx + rw / 2, y: ry + rh },
        color: rgb(0.1, 0.1, 0.1),
        thickness: 0.8,
      });
    } else {
      // Standard brochure: draw horizontal strap
      page.drawLine({
        start: { x: rx, y: ry + rh / 2 },
        end: { x: rx + rw, y: ry + rh / 2 },
        color: rgb(0.1, 0.1, 0.1),
        thickness: 0.8,
      });
    }

    // 4. Index Label Badge
    if (rw > 12 && rh > 8) {
      const idxText = (idx + 1).toString();
      const textWidth = helveticaBold.widthOfTextAtSize(idxText, 6);
      
      // Draw circular badge background (small rectangle)
      page.drawRectangle({
        x: rx + (rw - textWidth) / 2 - 1.2,
        y: ry + (rh - 6) / 2 - 0.5,
        width: textWidth + 2.4,
        height: 7,
        color: rgb(0.1, 0.1, 0.1),
      });
      
      page.drawText(idxText, {
        x: rx + (rw - textWidth) / 2,
        y: ry + (rh - 6) / 2 + 0.5,
        size: 5.5,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });
    }
  });

  // Legend inside diagram box
  page.drawRectangle({
    x: 48,
    y: diagY + 220,
    width: 8,
    height: 8,
    color: rgb(0.14, 0.44, 0.94),
  });
  page.drawText(`Estándar (${brochureSpec.widthMm}x${brochureSpec.heightMm} mm)`, {
    x: 60,
    y: diagY + 221,
    size: 7,
    font: helveticaFont,
    color: colorText,
  });

  page.drawRectangle({
    x: 170,
    y: diagY + 220,
    width: 8,
    height: 8,
    color: rgb(0.49, 0.23, 0.93),
  });
  page.drawText(`Rotado 90° (${brochureSpec.heightMm}x${brochureSpec.widthMm} mm)`, {
    x: 182,
    y: diagY + 221,
    size: 7,
    font: helveticaFont,
    color: colorText,
  });

  page.drawText(`* Margen seguridad: ${sm} mm (línea discontinua naranja)`, {
    x: 310,
    y: diagY + 221,
    size: 7,
    font: helveticaOblique,
    color: colorTextMuted,
  });

  // 4. Footer
  page.drawText('PALETIK · Sistema Inteligente de Cubicaje y Paletización de Imprenta', {
    x: 40,
    y: 35,
    size: 8,
    font: helveticaBold,
    color: colorTextMuted,
  });
  
  page.drawText('Página 1 de 1', {
    x: width - 90,
    y: 35,
    size: 8,
    font: helveticaFont,
    color: colorTextMuted,
  });

  return await pdfDoc.save();
}
