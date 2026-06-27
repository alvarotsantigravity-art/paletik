/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cubicage Engine — Motor de cálculo puro para el Módulo 3
 * Calcula grosor, peso, layout 2D optimizado y cubicaje en palet.
 */

import {
  BrochureSpec,
  PalletConfig,
  PackageConfig,
  CubicageResult,
  PlacedBrochure,
  PaperPreset,
} from './types';

// ─── Paper Presets Database ───

export const PAPER_PRESETS: PaperPreset[] = [
  // Estucados (Coated)
  { name: 'Estucado Brillo 90g',   gsm: 90,  bulk: 0.85, category: 'Estucado' },
  { name: 'Estucado Brillo 115g',  gsm: 115, bulk: 0.84, category: 'Estucado' },
  { name: 'Estucado Brillo 135g',  gsm: 135, bulk: 0.83, category: 'Estucado' },
  { name: 'Estucado Brillo 150g',  gsm: 150, bulk: 0.82, category: 'Estucado' },
  { name: 'Estucado Brillo 170g',  gsm: 170, bulk: 0.82, category: 'Estucado' },
  { name: 'Estucado Brillo 200g',  gsm: 200, bulk: 0.81, category: 'Estucado' },
  { name: 'Estucado Brillo 250g',  gsm: 250, bulk: 0.80, category: 'Estucado' },
  { name: 'Estucado Brillo 300g',  gsm: 300, bulk: 0.80, category: 'Estucado' },
  { name: 'Estucado Mate 90g',     gsm: 90,  bulk: 0.90, category: 'Estucado' },
  { name: 'Estucado Mate 115g',    gsm: 115, bulk: 0.88, category: 'Estucado' },
  { name: 'Estucado Mate 135g',    gsm: 135, bulk: 0.87, category: 'Estucado' },
  { name: 'Estucado Mate 150g',    gsm: 150, bulk: 0.86, category: 'Estucado' },
  { name: 'Estucado Mate 170g',    gsm: 170, bulk: 0.85, category: 'Estucado' },
  { name: 'Estucado Mate 200g',    gsm: 200, bulk: 0.84, category: 'Estucado' },
  { name: 'Estucado Mate 250g',    gsm: 250, bulk: 0.83, category: 'Estucado' },
  { name: 'Estucado Mate 300g',    gsm: 300, bulk: 0.82, category: 'Estucado' },
  // Offset (Uncoated)
  { name: 'Offset Blanco 80g',     gsm: 80,  bulk: 1.30, category: 'Offset' },
  { name: 'Offset Blanco 90g',     gsm: 90,  bulk: 1.28, category: 'Offset' },
  { name: 'Offset Blanco 100g',    gsm: 100, bulk: 1.25, category: 'Offset' },
  { name: 'Offset Blanco 120g',    gsm: 120, bulk: 1.22, category: 'Offset' },
  { name: 'Offset Ahuesado 80g',   gsm: 80,  bulk: 1.50, category: 'Offset' },
  { name: 'Offset Ahuesado 90g',   gsm: 90,  bulk: 1.48, category: 'Offset' },
  // Voluminosos (Bulky)
  { name: 'Volumen 1.5 — 80g',     gsm: 80,  bulk: 1.50, category: 'Voluminoso' },
  { name: 'Volumen 1.5 — 90g',     gsm: 90,  bulk: 1.50, category: 'Voluminoso' },
  { name: 'Volumen 1.8 — 80g',     gsm: 80,  bulk: 1.80, category: 'Voluminoso' },
  { name: 'Volumen 1.8 — 90g',     gsm: 90,  bulk: 1.80, category: 'Voluminoso' },
  { name: 'Volumen 2.0 — 70g',     gsm: 70,  bulk: 2.00, category: 'Voluminoso' },
  { name: 'Volumen 2.0 — 80g',     gsm: 80,  bulk: 2.00, category: 'Voluminoso' },
  { name: 'Volumen 2.5 — 60g',     gsm: 60,  bulk: 2.50, category: 'Voluminoso' },
  // Cartulina (Cardboard)
  { name: 'Cartulina Gráfica 250g', gsm: 250, bulk: 0.90, category: 'Cartulina' },
  { name: 'Cartulina Gráfica 300g', gsm: 300, bulk: 0.88, category: 'Cartulina' },
  { name: 'Cartulina Gráfica 350g', gsm: 350, bulk: 0.86, category: 'Cartulina' },
];

// ─── Default Pallet Configurations ───

export const DEFAULT_PALLETS: Record<'european' | 'american', Omit<PalletConfig, 'maxHeightMm' | 'maxWeightKg' | 'safetyMarginMm'>> = {
  european: {
    type: 'european',
    widthMm: 800,
    lengthMm: 1200,
    palletWeightKg: 25,
  },
  american: {
    type: 'american',
    widthMm: 1000,
    lengthMm: 1200,
    palletWeightKg: 30,
  },
};

// ─── Core Calculation Functions ───

/**
 * Calculates the thickness of a single brochure in mm.
 * Formula: Grosor_hoja = (Gramaje × Mano) / 1000, then × (páginas / 2) + factor grapa
 */
export function calculateBrochureThickness(spec: BrochureSpec): number {
  const sheetThicknessMm = (spec.paperGsm * spec.paperBulk) / 1000;
  const sheetCount = spec.pageCount / 2;
  let totalThickness = sheetThicknessMm * sheetCount;

  if (spec.bindingType === 'stapled') {
    totalThickness += spec.stapleExtraMm;
  }

  return totalThickness;
}

/**
 * Calculates the weight of a single brochure in grams.
 * Formula: Peso_hoja = (Ancho_cm × Alto_cm × Gramaje) / 10000
 * Then × (páginas / 2)
 */
export function calculateBrochureWeight(spec: BrochureSpec): number {
  const widthCm = spec.widthMm / 10;
  const heightCm = spec.heightMm / 10;
  const sheetWeightG = (widthCm * heightCm * spec.paperGsm) / 10000;
  const sheetCount = spec.pageCount / 2;
  return sheetWeightG * sheetCount;
}

/**
 * Calculates the height of a single package in mm.
 */
export function calculatePackageHeight(spec: BrochureSpec, unitsPerPackage: number): number {
  const brochureThickness = calculateBrochureThickness(spec);
  return brochureThickness * unitsPerPackage;
}

/**
 * Calculates the weight of a single package in grams.
 */
export function calculatePackageWeight(spec: BrochureSpec, unitsPerPackage: number): number {
  const brochureWeight = calculateBrochureWeight(spec);
  return brochureWeight * unitsPerPackage;
}

// ─── 2D Bin Packing — Heuristic Optimizer ───

interface LayoutCandidate {
  layout: PlacedBrochure[];
  count: number;
  usedWidth: number;
  usedHeight: number;
}

/**
 * Generates a grid layout with a given brochure size inside the available area.
 * Returns the placed brochures and count.
 */
function generateGridLayout(
  brochureW: number,
  brochureH: number,
  availableW: number,
  availableH: number,
  rotated: boolean,
  offsetX: number,
  offsetY: number
): LayoutCandidate {
  const cols = Math.floor(availableW / brochureW);
  const rows = Math.floor(availableH / brochureH);

  if (cols <= 0 || rows <= 0) {
    return { layout: [], count: 0, usedWidth: 0, usedHeight: 0 };
  }

  const layout: PlacedBrochure[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      layout.push({
        x: offsetX + c * brochureW,
        y: offsetY + r * brochureH,
        width: brochureW,
        height: brochureH,
        rotated,
      });
    }
  }

  return {
    layout,
    count: cols * rows,
    usedWidth: cols * brochureW,
    usedHeight: rows * brochureH,
  };
}

/**
 * Optimizes the base layout of brochures on a pallet using multiple heuristic strategies:
 * 1. All brochures at 0° rotation
 * 2. All brochures at 90° rotation
 * 3. Mixed: alternating rows 0° and 90°
 * 4. Mixed: main block 0° + remaining strip 90° (and vice versa)
 *
 * Selects the configuration that maximizes brochures per layer.
 */
export function optimizeBaseLayout(
  brochureW: number,
  brochureH: number,
  palletConfig: PalletConfig
): PlacedBrochure[] {
  const margin = palletConfig.safetyMarginMm;
  const availableW = palletConfig.widthMm - 2 * margin;
  const availableH = palletConfig.lengthMm - 2 * margin;

  if (availableW <= 0 || availableH <= 0 || brochureW <= 0 || brochureH <= 0) {
    return [];
  }

  // Guard: minimum realistic brochure dimensions to prevent layout explosion
  // during input (e.g., user typing "2" as the first digit of "297").
  // No real brochure is smaller than 20mm on any side.
  const MIN_BROCHURE_DIM = 20;
  if (brochureW < MIN_BROCHURE_DIM || brochureH < MIN_BROCHURE_DIM) {
    return [];
  }

  // Safety cap: maximum items per layout to prevent browser rendering crash
  const MAX_LAYOUT_ITEMS = 300;

  const candidates: LayoutCandidate[] = [];

  // Helper to generate a spaced grid
  const generateSpacedGrid = (
    cols: number,
    rows: number,
    w: number,
    h: number,
    rotated: boolean,
    gridW: number,
    gridH: number,
    offsetX: number,
    offsetY: number
  ): PlacedBrochure[] => {
    if (cols <= 0 || rows <= 0) return [];
    const gapX = cols > 1 ? (gridW - cols * w) / (cols - 1) : 0;
    const gapY = rows > 1 ? (gridH - rows * h) / (rows - 1) : 0;
    const startX = cols === 1 ? offsetX + (gridW - w) / 2 : offsetX;
    const startY = rows === 1 ? offsetY + (gridH - h) / 2 : offsetY;

    const layout: PlacedBrochure[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        layout.push({
          x: startX + c * (w + gapX),
          y: startY + r * (h + gapY),
          width: w,
          height: h,
          rotated,
        });
      }
    }
    return layout;
  };

  // Strategy 1: All at 0° (normal orientation)
  {
    const cols = Math.floor(availableW / brochureW);
    const rows = Math.floor(availableH / brochureH);
    const layout = generateSpacedGrid(cols, rows, brochureW, brochureH, false, availableW, availableH, margin, margin);
    candidates.push({ layout, count: cols * rows, usedWidth: availableW, usedHeight: availableH });
  }

  // (removed vertical fiber restriction)

  // Strategy 2: All at 90° (rotated)
  {
    const cols = Math.floor(availableW / brochureH);
    const rows = Math.floor(availableH / brochureW);
    const layout = generateSpacedGrid(cols, rows, brochureH, brochureW, true, availableW, availableH, margin, margin);
    candidates.push({ layout, count: cols * rows, usedWidth: availableW, usedHeight: availableH });
  }

  // Strategy 3: Main block normal + remaining strip rotated
  {
    const mainCols = Math.floor(availableW / brochureW);
    const mainRows = Math.floor(availableH / brochureH);
    const usedW = mainCols * brochureW;
    const usedH = mainRows * brochureH;
    const remainW = availableW - usedW;
    const remainH = availableH - usedH;

    // Fill right strip with rotated brochures
    if (remainW >= brochureH) {
      const stripCols = Math.floor(remainW / brochureH);
      const stripRows = Math.floor(availableH / brochureW);
      
      // Unified gap X distribution
      const C = mainCols + stripCols;
      const gapX = C > 1 ? (availableW - (mainCols * brochureW + stripCols * brochureH)) / (C - 1) : 0;
      const startX = margin;
      
      const layout: PlacedBrochure[] = [];
      
      // Draw main block normal
      const gapY_main = mainRows > 1 ? (availableH - mainRows * brochureH) / (mainRows - 1) : 0;
      const startY_main = mainRows === 1 ? margin + (availableH - brochureH) / 2 : margin;
      for (let r = 0; r < mainRows; r++) {
        for (let c = 0; c < mainCols; c++) {
          layout.push({
            x: startX + c * (brochureW + gapX),
            y: startY_main + r * (brochureH + gapY_main),
            width: brochureW,
            height: brochureH,
            rotated: false,
          });
        }
      }
      
      // Draw right strip rotated
      const gapY_strip = stripRows > 1 ? (availableH - stripRows * brochureW) / (stripRows - 1) : 0;
      const startY_strip = stripRows === 1 ? margin + (availableH - brochureW) / 2 : margin;
      const stripStartX = startX + mainCols * (brochureW + gapX);
      for (let r = 0; r < stripRows; r++) {
        for (let c = 0; c < stripCols; c++) {
          layout.push({
            x: stripStartX + c * (brochureH + gapX),
            y: startY_strip + r * (brochureW + gapY_strip),
            width: brochureH,
            height: brochureW,
            rotated: true,
          });
        }
      }
      
      candidates.push({
        layout,
        count: mainCols * mainRows + stripCols * stripRows,
        usedWidth: availableW,
        usedHeight: availableH,
      });
    }

    // Fill bottom strip with rotated brochures
    if (remainH >= brochureW) {
      const stripCols = Math.floor(availableW / brochureH);
      const stripRows = Math.floor(remainH / brochureW);
      
      // Unified gap Y distribution
      const R = mainRows + stripRows;
      const gapY = R > 1 ? (availableH - (mainRows * brochureH + stripRows * brochureW)) / (R - 1) : 0;
      const startY = margin;
      
      const layout: PlacedBrochure[] = [];
      
      // Draw main block normal
      const gapX_main = mainCols > 1 ? (availableW - mainCols * brochureW) / (mainCols - 1) : 0;
      const startX_main = mainCols === 1 ? margin + (availableW - brochureW) / 2 : margin;
      for (let r = 0; r < mainRows; r++) {
        for (let c = 0; c < mainCols; c++) {
          layout.push({
            x: startX_main + c * (brochureW + gapX_main),
            y: startY + r * (brochureH + gapY),
            width: brochureW,
            height: brochureH,
            rotated: false,
          });
        }
      }
      
      // Draw bottom strip rotated
      const gapX_strip = stripCols > 1 ? (availableW - stripCols * brochureH) / (stripCols - 1) : 0;
      const startX_strip = stripCols === 1 ? margin + (availableW - brochureH) / 2 : margin;
      const stripStartY = startY + mainRows * (brochureH + gapY);
      for (let r = 0; r < stripRows; r++) {
        for (let c = 0; c < stripCols; c++) {
          layout.push({
            x: startX_strip + c * (brochureH + gapX_strip),
            y: stripStartY + r * (brochureW + gapY),
            width: brochureH,
            height: brochureW,
            rotated: true,
          });
        }
      }
      
      candidates.push({
        layout,
        count: mainCols * mainRows + stripCols * stripRows,
        usedWidth: availableW,
        usedHeight: availableH,
      });
    }
  }

  // Strategy 4: Main block rotated + remaining strip normal
  {
    const mainCols = Math.floor(availableW / brochureH);
    const mainRows = Math.floor(availableH / brochureW);
    const usedW = mainCols * brochureH;
    const usedH = mainRows * brochureW;
    const remainW = availableW - usedW;
    const remainH = availableH - usedH;

    // Fill right strip with normal brochures
    if (remainW >= brochureW) {
      const stripCols = Math.floor(remainW / brochureW);
      const stripRows = Math.floor(availableH / brochureH);
      
      // Unified gap X distribution
      const C = mainCols + stripCols;
      const gapX = C > 1 ? (availableW - (mainCols * brochureH + stripCols * brochureW)) / (C - 1) : 0;
      const startX = margin;
      
      const layout: PlacedBrochure[] = [];
      
      // Draw main block rotated
      const gapY_main = mainRows > 1 ? (availableH - mainRows * brochureW) / (mainRows - 1) : 0;
      const startY_main = mainRows === 1 ? margin + (availableH - brochureW) / 2 : margin;
      for (let r = 0; r < mainRows; r++) {
        for (let c = 0; c < mainCols; c++) {
          layout.push({
            x: startX + c * (brochureH + gapX),
            y: startY_main + r * (brochureW + gapY_main),
            width: brochureH,
            height: brochureW,
            rotated: true,
          });
        }
      }
      
      // Draw right strip normal
      const gapY_strip = stripRows > 1 ? (availableH - stripRows * brochureH) / (stripRows - 1) : 0;
      const startY_strip = stripRows === 1 ? margin + (availableH - brochureH) / 2 : margin;
      const stripStartX = startX + mainCols * (brochureH + gapX);
      for (let r = 0; r < stripRows; r++) {
        for (let c = 0; c < stripCols; c++) {
          layout.push({
            x: stripStartX + c * (brochureW + gapX),
            y: startY_strip + r * (brochureH + gapY_strip),
            width: brochureW,
            height: brochureH,
            rotated: false,
          });
        }
      }
      
      candidates.push({
        layout,
        count: mainCols * mainRows + stripCols * stripRows,
        usedWidth: availableW,
        usedHeight: availableH,
      });
    }

    // Fill bottom strip with normal brochures
    if (remainH >= brochureH) {
      const stripCols = Math.floor(availableW / brochureH);
      const stripRows = Math.floor(remainH / brochureH);
      
      // Unified gap Y distribution
      const R = mainRows + stripRows;
      const gapY = R > 1 ? (availableH - (mainRows * brochureW + stripRows * brochureH)) / (R - 1) : 0;
      const startY = margin;
      
      const layout: PlacedBrochure[] = [];
      
      // Draw main block rotated
      const gapX_main = mainCols > 1 ? (availableW - mainCols * brochureH) / (mainCols - 1) : 0;
      const startX_main = mainCols === 1 ? margin + (availableW - brochureH) / 2 : margin;
      for (let r = 0; r < mainRows; r++) {
        for (let c = 0; c < mainCols; c++) {
          layout.push({
            x: startX_main + c * (brochureH + gapX_main),
            y: startY + r * (brochureW + gapY),
            width: brochureH,
            height: brochureW,
            rotated: true,
          });
        }
      }
      
      // Draw bottom strip normal
      const gapX_strip = stripCols > 1 ? (availableW - stripCols * brochureW) / (stripCols - 1) : 0;
      const startX_strip = stripCols === 1 ? margin + (availableW - brochureW) / 2 : margin;
      const stripStartY = startY + mainRows * (brochureW + gapY);
      for (let r = 0; r < stripRows; r++) {
        for (let c = 0; c < stripCols; c++) {
          layout.push({
            x: startX_strip + c * (brochureW + gapX_strip),
            y: stripStartY + r * (brochureH + gapY),
            width: brochureW,
            height: brochureH,
            rotated: false,
          });
        }
      }
      
      candidates.push({
        layout,
        count: mainCols * mainRows + stripCols * stripRows,
        usedWidth: availableW,
        usedHeight: availableH,
      });
    }
  }

  // Helper for alternating rows space distribution
  const generateAlternatingSpacedRows = (startWithRotated: boolean): PlacedBrochure[] => {
    // Phase 1: Determine rows
    const rowSpecs: { rowW: number; rowH: number; rotated: boolean }[] = [];
    let currentY = margin;
    let rowIndex = 0;
    while (currentY + Math.min(brochureH, brochureW) <= margin + availableH) {
      const isRotatedRow = startWithRotated ? (rowIndex % 2 === 0) : (rowIndex % 2 === 1);
      const rowW = isRotatedRow ? brochureH : brochureW;
      const rowH = isRotatedRow ? brochureW : brochureH;
      if (currentY + rowH > margin + availableH) break;
      
      const cols = Math.floor(availableW / rowW);
      if (cols <= 0) break;

      rowSpecs.push({ rowW, rowH, rotated: isRotatedRow });
      currentY += rowH;
      rowIndex++;
    }

    const R = rowSpecs.length;
    if (R === 0) return [];

    // Distribute remaining height vertically between rows
    const totalRowH = rowSpecs.reduce((sum, spec) => sum + spec.rowH, 0);
    const gapY = R > 1 ? (availableH - totalRowH) / (R - 1) : 0;
    const startY = R === 1 ? margin + (availableH - totalRowH) / 2 : margin;

    const layout: PlacedBrochure[] = [];
    let rowY = startY;
    for (let r = 0; r < R; r++) {
      const spec = rowSpecs[r];
      const cols = Math.floor(availableW / spec.rowW);
      
      // Distribute columns inside this row
      const gapX = cols > 1 ? (availableW - cols * spec.rowW) / (cols - 1) : 0;
      const startX = cols === 1 ? margin + (availableW - spec.rowW) / 2 : margin;

      for (let c = 0; c < cols; c++) {
        layout.push({
          x: startX + c * (spec.rowW + gapX),
          y: rowY,
          width: spec.rowW,
          height: spec.rowH,
          rotated: spec.rotated,
        });
      }
      rowY += spec.rowH + gapY;
    }
    return layout;
  };

  // Strategy 5: Alternating rows (row N normal, row N+1 rotated)
  {
    const layout = generateAlternatingSpacedRows(false);
    candidates.push({
      layout,
      count: layout.length,
      usedWidth: availableW,
      usedHeight: availableH,
    });
  }

  // Strategy 6: Alternating rows (row N rotated, row N+1 normal)
  {
    const layout = generateAlternatingSpacedRows(true);
    candidates.push({
      layout,
      count: layout.length,
      usedWidth: availableW,
      usedHeight: availableH,
    });
  }

  // Select the best candidate (maximum count), enforcing the safety cap
  const safeCandidates = candidates.filter(c => c.layout.length <= MAX_LAYOUT_ITEMS);
  if (safeCandidates.length === 0) {
    // All candidates exceed the cap — take the first and truncate
    const fallback = candidates[0];
    return fallback ? fallback.layout.slice(0, MAX_LAYOUT_ITEMS) : [];
  }
  let best = safeCandidates[0];
  for (const c of safeCandidates) {
    if (c.count > best.count) {
      best = c;
    }
  }

  return best?.layout ?? [];
}

// ─── Full Pallet Calculation ───

/**
 * Performs the complete cubicage calculation for a pallet.
 */
export function calculateFullPallet(
  brochureSpec: BrochureSpec,
  packageConfig: PackageConfig,
  palletConfig: PalletConfig,
  customQuantity?: number,
  customLayers?: number,
  customBaseQty?: number
): CubicageResult {
  const brochureThickness = calculateBrochureThickness(brochureSpec);
  const brochureWeight = calculateBrochureWeight(brochureSpec);
  const packageHeight = calculatePackageHeight(brochureSpec, packageConfig.unitsPerPackage);
  const packageWeight = calculatePackageWeight(brochureSpec, packageConfig.unitsPerPackage);

  let baseLayout = optimizeBaseLayout(
    brochureSpec.widthMm,
    brochureSpec.heightMm,
    palletConfig
  );

  let brochuresPerLayer = baseLayout.length;
  if (customBaseQty && customBaseQty > 0) {
    brochuresPerLayer = customBaseQty;
    if (customBaseQty < baseLayout.length) {
      baseLayout = baseLayout.slice(0, customBaseQty);
    }
  }

  let layersCount = 0;
  let totalBrochures = 0;

  if (customLayers && customLayers > 0) {
    layersCount = customLayers;
    totalBrochures = brochuresPerLayer * layersCount * packageConfig.unitsPerPackage;
  } else if (customQuantity && customQuantity > 0) {
    const totalPackages = Math.ceil(customQuantity / packageConfig.unitsPerPackage);
    layersCount = brochuresPerLayer > 0 ? Math.ceil(totalPackages / brochuresPerLayer) : 0;
    totalBrochures = customQuantity;
  } else {
    layersCount = packageHeight > 0 ? Math.floor(palletConfig.maxHeightMm / packageHeight) : 0;
    totalBrochures = brochuresPerLayer * layersCount * packageConfig.unitsPerPackage;
  }

  // Total weight = (total brochures * weight per brochure) / 1000 + pallet weight
  const totalWeightKg = (totalBrochures * brochureWeight) / 1000 + palletConfig.palletWeightKg;

  // Efficiency: used surface vs available surface
  const margin = palletConfig.safetyMarginMm;
  const availableArea = (palletConfig.widthMm - 2 * margin) * (palletConfig.lengthMm - 2 * margin);
  const usedArea = baseLayout.reduce((sum, b) => sum + b.width * b.height, 0);
  const efficiencyPercent = availableArea > 0 ? (usedArea / availableArea) * 100 : 0;

  // Used dimensions
  const usedWidthMm = baseLayout.length > 0
    ? Math.max(...baseLayout.map(b => b.x + b.width)) - margin
    : 0;
  const usedLengthMm = baseLayout.length > 0
    ? Math.max(...baseLayout.map(b => b.y + b.height)) - margin
    : 0;

  const actualStackHeight = layersCount * packageHeight;

  // COG (Center of Gravity) verification
  const centerX = palletConfig.widthMm / 2;
  const centerY = palletConfig.lengthMm / 2;
  let leftCount = 0;
  let rightCount = 0;
  let topCount = 0;
  let bottomCount = 0;

  baseLayout.forEach(b => {
    const bx = b.x + b.width / 2;
    const by = b.y + b.height / 2;
    if (bx < centerX) leftCount++;
    else if (bx > centerX) rightCount++;

    if (by < centerY) topCount++;
    else if (by > centerY) bottomCount++;
  });

  const totalPlaced = baseLayout.length;
  const cogLeftPct = totalPlaced > 0 ? Math.round((leftCount / totalPlaced) * 100) : 50;
  const cogRightPct = totalPlaced > 0 ? Math.round((rightCount / totalPlaced) * 100) : 50;
  const cogTopPct = totalPlaced > 0 ? Math.round((topCount / totalPlaced) * 100) : 50;
  const cogBottomPct = totalPlaced > 0 ? Math.round((bottomCount / totalPlaced) * 100) : 50;

  const cogImbalance = Math.abs(cogLeftPct - cogRightPct) > 10 || Math.abs(cogTopPct - cogBottomPct) > 10;

  // Pico stability is active if height is less than 60% of max height (to avoid collapse)
  const isPicoStabilityActive = actualStackHeight > 0 && actualStackHeight < 0.60 * palletConfig.maxHeightMm;

  return {
    brochureThicknessMm: Math.round(brochureThickness * 1000) / 1000,
    brochureWeightG: Math.round(brochureWeight * 100) / 100,
    packageHeightMm: Math.round(packageHeight * 100) / 100,
    packageWeightG: Math.round(packageWeight * 100) / 100,
    baseLayout,
    brochuresPerLayer,
    layersCount,
    totalBrochures,
    totalWeightKg: Math.round(totalWeightKg * 100) / 100,
    usedWidthMm: Math.round(usedWidthMm * 10) / 10,
    usedLengthMm: Math.round(usedLengthMm * 10) / 10,
    efficiencyPercent: Math.round(efficiencyPercent * 10) / 10,
    exceedsWeight: totalWeightKg > palletConfig.maxWeightKg,
    exceedsHeight: actualStackHeight > palletConfig.maxHeightMm,
    cogImbalance,
    cogLeftPct,
    cogRightPct,
    cogTopPct,
    cogBottomPct,
    isPicoStabilityActive,
  };
}
