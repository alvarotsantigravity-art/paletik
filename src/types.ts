/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DistributionItem {
  id: string;
  version: string;
  address: string;
  quantity: number;
  barcode?: string;
  customPallets?: PalletResult[];
}

export interface FieldStyle {
  color: string;
  sizeOffset: number;
}

export interface MaquetaStylesConfig {
  header: FieldStyle;
  sender: FieldStyle;
  address: FieldStyle;
  version: FieldStyle;
  palletQty: FieldStyle;
  palletNo: FieldStyle;
  totalQty: FieldStyle;
}

export interface Transport {
  id: string;
  name: string;
  driver?: string;
  licensePlate?: string;
  date?: string;
  items: string[]; // Array of DistributionItem ids
}

export interface PalletResult {
  palletIndex: number;
  totalPallets: number;
  quantity: number;
  isAdjusted: boolean;
}

export interface MapMapping {
  itemIndex: number; // Index in Excel row list
  pageIndex: number; // Index in PDF page list
}

export interface TextPosition {
  x: number; // X coordinate on PDF page
  y: number; // Y coordinate on PDF page
  fontSize: number;
  color: string; // e.g. '#000000' or hex/rgb
  showOnAll: boolean; // overlay on all duplicated pages
}

// ─── Module 3: Cubicaje de Folletos en Palet ───

export interface BrochureSpec {
  paperGsm: number;         // Gramaje (g/m²)
  paperBulk: number;        // Mano del papel (cm³/g)
  widthMm: number;          // Ancho del folleto terminado (mm)
  heightMm: number;         // Alto del folleto terminado (mm)
  pageCount: number;        // Número de páginas
  bindingType: 'cut' | 'stapled';  // Cortado o grapado
  stapleExtraMm: number;    // Factor extra por grapa (mm), editable
}

export interface PalletConfig {
  type: 'european' | 'american';
  widthMm: number;          // 800 o 1000
  lengthMm: number;         // 1200
  maxHeightMm: number;      // Altura máxima de carga (editable)
  maxWeightKg: number;      // Peso máximo (editable)
  palletWeightKg: number;   // Peso del palet vacío (25 o 30 kg)
  safetyMarginMm: number;   // Margen de seguridad alrededor (default 15mm)
}

export interface PackageConfig {
  unitsPerPackage: number;   // Cantidad de folletos por paquete
}

export interface CubicageResult {
  brochureThicknessMm: number;
  brochureWeightG: number;
  packageHeightMm: number;
  packageWeightG: number;
  baseLayout: PlacedBrochure[];
  brochuresPerLayer: number;
  layersCount: number;
  totalBrochures: number;
  totalWeightKg: number;
  usedWidthMm: number;
  usedLengthMm: number;
  efficiencyPercent: number;
  exceedsWeight: boolean;
  exceedsHeight: boolean;
  // COG and Pico Stability indicators
  cogImbalance: boolean;
  cogLeftPct: number;
  cogRightPct: number;
  cogTopPct: number;
  cogBottomPct: number;
  isPicoStabilityActive: boolean;
}

export interface PlacedBrochure {
  x: number;           // posición X en mm desde esquina superior-izquierda
  y: number;           // posición Y en mm
  width: number;       // ancho colocado (puede estar rotado)
  height: number;      // alto colocado
  rotated: boolean;    // si está girado 90°
}

export interface PaperPreset {
  name: string;
  gsm: number;
  bulk: number;
  category: string;
}
