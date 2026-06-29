/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CubicajeModule — Módulo 3: Calculadora visual de cubicaje de folletos en palet
 */

import React, { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Package,
  Layers,
  Ruler,
  Weight,
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  Download,
  ArrowLeftRight,
  ChevronDown,
  Info,
  Maximize2,
  BoxSelect,
  Plus,
  Trash2,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  BrochureSpec,
  PalletConfig,
  PackageConfig,
  PaperPreset,
  DistributionItem,
  PlacedBrochure,
} from './types';
import {
  PAPER_PRESETS,
  DEFAULT_PALLETS,
  calculateBrochureThickness,
  calculateBrochureWeight,
  calculatePackageHeight,
  calculatePackageWeight,
  calculateFullPallet,
  optimizeBaseLayout,
} from './cubicageEngine';
import { formatQuantitySpain, generateCubicajePdf } from './pdfEngine';

// ─── Helper: format mm values ───
function fmtMm(val: number): string {
  if (val >= 10) return val.toFixed(1);
  return val.toFixed(2);
}

function fmtG(val: number): string {
  return val.toFixed(1);
}

// ─── SVG Pallet View ───

interface PalletSVGProps {
  palletConfig: PalletConfig;
  layout: ReturnType<typeof optimizeBaseLayout>;
  brochureW: number;
  brochureH: number;
  compareLayout?: ReturnType<typeof optimizeBaseLayout> | null;
  comparePallet?: PalletConfig | null;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  onToggleRotation?: (index: number) => void;
  onDelete?: (index: number) => void;
  onDragStart?: (e: React.MouseEvent | React.TouchEvent, index: number) => void;
  isManualMode?: boolean;
}

function PalletSVG({
  palletConfig,
  layout,
  brochureW,
  brochureH,
  compareLayout,
  comparePallet,
  svgRef,
  onToggleRotation,
  onDelete,
  onDragStart,
  isManualMode,
}: PalletSVGProps) {
  const pw = palletConfig.widthMm;
  const ph = palletConfig.lengthMm;
  const margin = palletConfig.safetyMarginMm;

  const padding = 40;
  const labelSpace = 30;
  const viewW = pw + padding * 2 + labelSpace;
  const viewH = ph + padding * 2 + labelSpace;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${viewW} ${viewH}`}
      className="w-full h-auto max-h-[520px]"
      style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
    >
      <defs>
        {/* Arrowhead markers */}
        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#a8a29e" />
        </marker>
        <marker id="arrowhead-start" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 Z" fill="#a8a29e" />
        </marker>

        {/* Drop shadow filter for packages */}
        <filter id="package-shadow" x="-10%" y="-10%" width="125%" height="125%">
          <feDropShadow dx="1.5" dy="2.5" stdDeviation="2" floodColor="#000000" floodOpacity="0.55" />
        </filter>

        {/* Wood planks gradient */}
        <linearGradient id="wood-plank" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7c2d12" />
          <stop offset="30%" stopColor="#9a3412" />
          <stop offset="70%" stopColor="#9a3412" />
          <stop offset="100%" stopColor="#7c2d12" />
        </linearGradient>

        {/* Brochure cover gradients */}
        <linearGradient id="brochure-blue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="brochure-purple" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#5b21b6" />
        </linearGradient>

        {/* Safety margin stripes pattern */}
        <pattern id="safety-stripes" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="16" height="16" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="16" stroke="#f59e0b" strokeWidth="3.5" opacity="0.22" />
        </pattern>
      </defs>

      {/* Background */}
      <rect x={0} y={0} width={viewW} height={viewH} fill="#09090b" rx={8} />

      {/* Pallet border */}
      <rect
        x={padding}
        y={padding}
        width={pw}
        height={ph}
        fill="#1c1917"
        stroke="#78716c"
        strokeWidth={2}
        rx={4}
      />

      {/* Pallet wood planks background */}
      {Array.from({ length: 5 }).map((_, i) => {
        const plankW = pw / 5;
        const x = padding + i * plankW;
        return (
          <g key={`plank-${i}`}>
            <rect
              x={x + 1}
              y={padding + 1}
              width={plankW - 2}
              height={ph - 2}
              fill="url(#wood-plank)"
              stroke="#451a03"
              strokeWidth={0.5}
            />
            {/* Nails: top, middle, bottom */}
            <circle cx={x + plankW / 2 - 3} cy={padding + 12} r={1.5} fill="#475569" opacity={0.8} />
            <circle cx={x + plankW / 2 + 3} cy={padding + 12} r={1.5} fill="#475569" opacity={0.8} />
            
            <circle cx={x + plankW / 2 - 3} cy={padding + ph / 2} r={1.5} fill="#475569" opacity={0.8} />
            <circle cx={x + plankW / 2 + 3} cy={padding + ph / 2} r={1.5} fill="#475569" opacity={0.8} />
            
            <circle cx={x + plankW / 2 - 3} cy={padding + ph - 12} r={1.5} fill="#475569" opacity={0.8} />
            <circle cx={x + plankW / 2 + 3} cy={padding + ph - 12} r={1.5} fill="#475569" opacity={0.8} />
          </g>
        );
      })}

      {/* Usable area background overlay */}
      <rect
        x={padding + margin}
        y={padding + margin}
        width={pw - 2 * margin}
        height={ph - 2 * margin}
        fill="#1c1917"
        fillOpacity={0.3}
      />

      {/* Safety margin exclusion zone (shaded border with stripes) */}
      {margin > 0 && (
        <>
          {/* Top margin */}
          <rect
            x={padding}
            y={padding}
            width={pw}
            height={margin}
            fill="url(#safety-stripes)"
          />
          {/* Bottom margin */}
          <rect
            x={padding}
            y={padding + ph - margin}
            width={pw}
            height={margin}
            fill="url(#safety-stripes)"
          />
          {/* Left margin */}
          <rect
            x={padding}
            y={padding + margin}
            width={margin}
            height={ph - 2 * margin}
            fill="url(#safety-stripes)"
          />
          {/* Right margin */}
          <rect
            x={padding + pw - margin}
            y={padding + margin}
            width={margin}
            height={ph - 2 * margin}
            fill="url(#safety-stripes)"
          />
        </>
      )}

      {/* Safety margin zone dashed border */}
      <rect
        x={padding + margin}
        y={padding + margin}
        width={pw - 2 * margin}
        height={ph - 2 * margin}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={1.5}
        strokeDasharray="6 3"
        rx={2}
        opacity={0.8}
      />

      {/* Grid lines inside usable area */}
      {Array.from({ length: Math.floor((pw - 2 * margin) / 100) + 1 }).map((_, i) => {
        const x = padding + margin + i * 100;
        if (x > padding + pw - margin) return null;
        return (
          <line
            key={`gv-${i}`}
            x1={x}
            y1={padding + margin}
            x2={x}
            y2={padding + ph - margin}
            stroke="#292524"
            strokeWidth={0.5}
            strokeDasharray="2 2"
            opacity={0.4}
          />
        );
      })}
      {Array.from({ length: Math.floor((ph - 2 * margin) / 100) + 1 }).map((_, i) => {
        const y = padding + margin + i * 100;
        if (y > padding + ph - margin) return null;
        return (
          <line
            key={`gh-${i}`}
            x1={padding + margin}
            y1={y}
            x2={padding + pw - margin}
            y2={y}
            stroke="#292524"
            strokeWidth={0.5}
            strokeDasharray="2 2"
            opacity={0.4}
          />
        );
      })}

      {/* Placed brochures / packages */}
      {layout.map((b, i) => {
        const padX = 1.2;
        const padY = 1.2;
        const drawX = padding + b.x + padX;
        const drawY = padding + b.y + padY;
        const drawW = b.width - padX * 2;
        const drawH = b.height - padY * 2;

        if (drawW <= 0 || drawH <= 0) return null;

        return (
          <g 
            key={i} 
            filter="url(#package-shadow)"
            className={onToggleRotation ? "group cursor-pointer select-none" : "select-none"}
            onClick={!isManualMode ? () => onToggleRotation?.(i) : undefined}
            onMouseDown={isManualMode ? (e) => onDragStart?.(e, i) : undefined}
            onTouchStart={isManualMode ? (e) => onDragStart?.(e, i) : undefined}
          >
            {/* 1. Paper stack base (white paper edges look) */}
            <rect
              x={drawX}
              y={drawY}
              width={drawW}
              height={drawH}
              fill="#fafafa"
              stroke="#cbd5e1"
              strokeWidth={0.8}
              rx={1.5}
              className="transition-colors duration-150 group-hover:stroke-amber-400 group-hover:stroke-[1.2px]"
            />
            {/* Simulated stacked page lines on sides for realism */}
            {drawW > 25 && drawH > 25 && (
              <>
                <line x1={drawX + 1} y1={drawY + 3} x2={drawX + drawW - 1} y2={drawY + 3} stroke="#e4e4e7" strokeWidth={0.5} />
                <line x1={drawX + 1} y1={drawY + 6} x2={drawX + drawW - 1} y2={drawY + 6} stroke="#e4e4e7" strokeWidth={0.5} />
                <line x1={drawX + 1} y1={drawY + drawH - 3} x2={drawX + drawW - 1} y2={drawY + drawH - 3} stroke="#e4e4e7" strokeWidth={0.5} />
              </>
            )}

            {/* 2. Top Booklet Cover */}
            <rect
              x={drawX + 2}
              y={drawY + 2}
              width={drawW - 4}
              height={drawH - 4}
              fill={b.rotated ? 'url(#brochure-purple)' : 'url(#brochure-blue)'}
              stroke={b.rotated ? '#c084fc' : '#60a5fa'}
              strokeWidth={0.8}
              rx={1}
              className="transition-all duration-150 group-hover:brightness-110"
            />

            {/* Subtle inner brochure page margin styling */}
            <rect
              x={drawX + 4}
              y={drawY + 4}
              width={drawW - 8}
              height={drawH - 8}
              fill="none"
              stroke={b.rotated ? '#a78bfa' : '#93c5fd'}
              strokeWidth={0.4}
              opacity={0.4}
            />

            {/* 3. Strapping Band (Fleje) */}
            {b.rotated ? (
              // Rotated brochure: draw vertical strap
              <line
                x1={drawX + drawW / 2}
                y1={drawY}
                x2={drawX + drawW / 2}
                y2={drawY + drawH}
                stroke="#18181b"
                strokeWidth={1.8}
                opacity={0.75}
              />
            ) : (
              // Standard brochure: draw horizontal strap
              <line
                x1={drawX}
                y1={drawY + drawH / 2}
                x2={drawX + drawW}
                y2={drawY + drawH / 2}
                stroke="#18181b"
                strokeWidth={1.8}
                opacity={0.75}
              />
            )}

            {/* 4. Index Label Badge */}
            {drawW > 24 && drawH > 18 && (
              <g>
                <circle
                  cx={drawX + drawW / 2}
                  cy={drawY + drawH / 2}
                  r={8}
                  fill="#18181b"
                  stroke="#fafafa"
                  strokeWidth={0.8}
                />
                <text
                  x={drawX + drawW / 2}
                  y={drawY + drawH / 2 + 3}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={8}
                  fontWeight="700"
                >
                  {i + 1}
                </text>
              </g>
            )}

            {/* Delete button (only in manual mode) */}
            {isManualMode && onDelete && (
              <g 
                className="cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(i);
                }}
              >
                <circle 
                  cx={drawX + drawW - 6} 
                  cy={drawY + 6} 
                  r={6} 
                  fill="#ef4444" 
                  stroke="#ffffff"
                  strokeWidth={0.5}
                  className="hover:fill-red-600 transition-colors" 
                />
                <line x1={drawX + drawW - 8} y1={drawY + 4} x2={drawX + drawW - 4} y2={drawY + 8} stroke="#ffffff" strokeWidth={0.8} />
                <line x1={drawX + drawW - 4} y1={drawY + 4} x2={drawX + drawW - 8} y2={drawY + 8} stroke="#ffffff" strokeWidth={0.8} />
              </g>
            )}
          </g>
        );
      })}

      {/* Dimension labels */}
      {/* Width */}
      <line x1={padding} y1={padding + ph + 12} x2={padding + pw} y2={padding + ph + 12} stroke="#a8a29e" strokeWidth={0.8} markerEnd="url(#arrowhead)" markerStart="url(#arrowhead-start)" />
      <text x={padding + pw / 2} y={padding + ph + 26} textAnchor="middle" fill="#d6d3d1" fontSize={11} fontWeight="600">
        {pw} mm
      </text>

      {/* Length */}
      <line x1={padding + pw + 12} y1={padding} x2={padding + pw + 12} y2={padding + ph} stroke="#a8a29e" strokeWidth={0.8} markerEnd="url(#arrowhead)" markerStart="url(#arrowhead-start)" />
      <text x={padding + pw + 18} y={padding + ph / 2} textAnchor="start" fill="#d6d3d1" fontSize={11} fontWeight="600" transform={`rotate(90, ${padding + pw + 18}, ${padding + ph / 2})`}>
        {ph} mm
      </text>

      {/* Margin label */}
      <text x={padding + margin + 4} y={padding + margin - 4} fill="#f59e0b" fontSize={8} fontWeight="600" opacity={0.9}>
        Margen de seguridad: {margin} mm
      </text>

      {/* Legend */}
      <rect x={padding + 4} y={padding + 6} width={12} height={8} fill="#2563eb" fillOpacity={0.85} stroke="#60a5fa" strokeWidth={0.8} rx={1} />
      <text x={padding + 20} y={padding + 13} fill="#d6d3d1" fontSize={8} fontWeight="600">Normal ({brochureW}×{brochureH})</text>

      {layout.some(b => b.rotated) && (
        <>
          <rect x={padding + 4} y={padding + 18} width={12} height={8} fill="#7c3aed" fillOpacity={0.85} stroke="#a78bfa" strokeWidth={0.8} rx={1} />
          <text x={padding + 20} y={padding + 25} fill="#d6d3d1" fontSize={8} fontWeight="600">Rotado 90° ({brochureH}×{brochureW})</text>
        </>
      )}
    </svg>
  );
}

// ─── Side View (Lateral) SVG ───

interface SideViewSVGProps {
  packageHeight: number;
  layersCount: number;
  maxHeight: number;
  palletHeightMm: number;
}

function SideViewSVG({ packageHeight, layersCount, maxHeight, palletHeightMm }: SideViewSVGProps) {
  const stackHeight = layersCount * packageHeight;
  const totalHeight = stackHeight + palletHeightMm;

  // Scale: fit in 240px tall view
  const maxDraw = 220;
  const scale = maxHeight > 0 ? Math.min(maxDraw / (maxHeight + palletHeightMm), 1) : 1;

  const drawPalletH = palletHeightMm * scale;
  const drawStackH = stackHeight * scale;
  const drawMaxH = maxHeight * scale;
  const drawWidth = 160;
  const baseX = 60;
  const baseY = maxDraw + 20;

  return (
    <svg viewBox={`0 0 280 ${maxDraw + 40}`} className="w-full h-auto max-h-[280px]" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      <rect x={0} y={0} width={280} height={maxDraw + 40} fill="#09090b" rx={6} />

      {/* Pallet base */}
      <rect
        x={baseX}
        y={baseY - drawPalletH}
        width={drawWidth}
        height={drawPalletH}
        fill="#78716c"
        stroke="#a8a29e"
        strokeWidth={1}
        rx={2}
      />
      {/* Pallet slats */}
      {[0.2, 0.4, 0.6, 0.8].map((frac, i) => (
        <line
          key={i}
          x1={baseX + drawWidth * frac}
          y1={baseY - drawPalletH}
          x2={baseX + drawWidth * frac}
          y2={baseY}
          stroke="#a8a29e"
          strokeWidth={0.5}
          opacity={0.5}
        />
      ))}
      <text x={baseX + drawWidth / 2} y={baseY - drawPalletH / 2 + 3} textAnchor="middle" fill="#fafaf9" fontSize={7} fontWeight="600">
        PALET ({palletHeightMm}mm)
      </text>

      {/* Stack of layers */}
      {Array.from({ length: Math.min(layersCount, 60) }).map((_, i) => {
        const layerH = Math.max(packageHeight * scale, 1.5);
        const y = baseY - drawPalletH - (i + 1) * layerH;
        const hue = (i * 30) % 360;
        return (
          <rect
            key={i}
            x={baseX + 2}
            y={y}
            width={drawWidth - 4}
            height={layerH - 0.5}
            fill={`hsl(${hue}, 60%, 45%)`}
            fillOpacity={0.7}
            stroke={`hsl(${hue}, 60%, 65%)`}
            strokeWidth={0.5}
            rx={1}
          />
        );
      })}

      {/* Max height line */}
      <line
        x1={baseX - 10}
        y1={baseY - drawPalletH - drawMaxH}
        x2={baseX + drawWidth + 10}
        y2={baseY - drawPalletH - drawMaxH}
        stroke="#ef4444"
        strokeWidth={1}
        strokeDasharray="4 2"
      />
      <text x={baseX + drawWidth + 14} y={baseY - drawPalletH - drawMaxH + 3} fill="#ef4444" fontSize={7} fontWeight="600">
        MÁX {maxHeight}mm
      </text>

      {/* Stack height label */}
      <line x1={baseX - 20} y1={baseY - drawPalletH} x2={baseX - 20} y2={baseY - drawPalletH - drawStackH} stroke="#22c55e" strokeWidth={0.8} />
      <line x1={baseX - 25} y1={baseY - drawPalletH} x2={baseX - 15} y2={baseY - drawPalletH} stroke="#22c55e" strokeWidth={0.8} />
      <line x1={baseX - 25} y1={baseY - drawPalletH - drawStackH} x2={baseX - 15} y2={baseY - drawPalletH - drawStackH} stroke="#22c55e" strokeWidth={0.8} />
      {drawStackH > 20 && (
        <text x={baseX - 24} y={baseY - drawPalletH - drawStackH / 2 + 3} textAnchor="end" fill="#22c55e" fontSize={7} fontWeight="600" transform={`rotate(-90, ${baseX - 24}, ${baseY - drawPalletH - drawStackH / 2 + 3})`}>
          {Math.round(stackHeight)}mm ({layersCount} capas)
        </text>
      )}

      {/* Total height label */}
      <text x={baseX + drawWidth / 2} y={12} textAnchor="middle" fill="#d6d3d1" fontSize={9} fontWeight="700">
        VISTA LATERAL · ALZADO
      </text>
    </svg>
  );
}

// Helper functions for layout collision and placement
function doesOverlap(b1: PlacedBrochure, b2: PlacedBrochure): boolean {
  const margin = 0.5; // Small tolerance to allow edge contact
  return (
    b1.x + margin < b2.x + b2.width &&
    b1.x + b1.width - margin > b2.x &&
    b1.y + margin < b2.y + b2.height &&
    b1.y + b1.height - margin > b2.y
  );
}

function findFreePosition(
  w: number,
  h: number,
  layout: PlacedBrochure[],
  palletConfig: PalletConfig
): { x: number; y: number } {
  const margin = palletConfig.safetyMarginMm;
  const maxW = palletConfig.widthMm - margin - w;
  const maxH = palletConfig.lengthMm - margin - h;

  // Try grid search starting from top-left, moving by 20mm steps
  for (let y = margin; y <= maxH; y += 20) {
    for (let x = margin; x <= maxW; x += 20) {
      const temp = { x, y, width: w, height: h, rotated: false };
      const overlaps = layout.some(other => doesOverlap(temp, other));
      if (!overlaps) {
        return { x, y };
      }
    }
  }

  // Fallback to top-left if no completely free position is found
  return { x: margin, y: margin };
}

// ─── Main Module Component ───

interface CubicajeModuleProps {
  distributionList?: DistributionItem[];
}

export default function CubicajeModule({ distributionList = [] }: CubicajeModuleProps) {
  // ── Brochure spec state ──
  const [paperGsm, setPaperGsm] = useState<number>(135);
  const [paperBulk, setPaperBulk] = useState<number>(0.87);
  const [widthMm, setWidthMm] = useState<number>(210);
  const [heightMm, setHeightMm] = useState<number>(297);
  const [pageCount, setPageCount] = useState<number>(8);
  const [bindingType, setBindingType] = useState<'cut' | 'stapled'>('stapled');
  const [stapleExtraMm, setStapleExtraMm] = useState<number>(0.5);
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  // ── Capa state ──
  const [selectedLayer, setSelectedLayer] = useState<'A' | 'B'>('A');

  // ── Package config state ──
  const [unitsPerPackage, setUnitsPerPackage] = useState<number>(250);
  const [customQuantity, setCustomQuantity] = useState<number | ''>('');
  const [customLayers, setCustomLayers] = useState<number | ''>('');
  const [customBaseQty, setCustomBaseQty] = useState<number | ''>('');
  const [customLayout, setCustomLayout] = useState<PlacedBrochure[] | null>(null);
  const [layoutMode, setLayoutMode] = useState<'automatic' | 'manual'>('automatic');
  const [isLayoutLocked, setIsLayoutLocked] = useState<boolean>(false);

  // ── Drag-and-drop state ──
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStartOffset, setDragStartOffset] = useState<{ x: number; y: number } | null>(null);
  const [isMoved, setIsMoved] = useState<boolean>(false);

  // ── Pallet config state ──
  const [palletType, setPalletType] = useState<'european' | 'american'>('european');
  const [maxHeightMm, setMaxHeightMm] = useState<number>(1500);
  const [maxWeightKg, setMaxWeightKg] = useState<number>(1000);
  const [safetyMarginMm, setSafetyMarginMm] = useState<number>(15);

  // ── Comparator state ──
  const [showComparator, setShowComparator] = useState<boolean>(false);

  // ── SVG export ref ──
  const svgRef = React.useRef<SVGSVGElement>(null);

  // ── Preset selector handler ──
  const handlePresetSelect = useCallback((preset: PaperPreset) => {
    setPaperGsm(preset.gsm);
    setPaperBulk(preset.bulk);
    setSelectedPreset(preset.name);
  }, []);

  // ── Build spec objects ──
  const brochureSpec: BrochureSpec = useMemo(() => ({
    paperGsm,
    paperBulk,
    widthMm,
    heightMm,
    pageCount,
    bindingType,
    stapleExtraMm,
  }), [paperGsm, paperBulk, widthMm, heightMm, pageCount, bindingType, stapleExtraMm]);

  const packageConfig: PackageConfig = useMemo(() => ({
    unitsPerPackage,
  }), [unitsPerPackage]);

  const palletConfig: PalletConfig = useMemo(() => {
    const base = DEFAULT_PALLETS[palletType];
    return {
      ...base,
      maxHeightMm,
      maxWeightKg,
      safetyMarginMm,
    };
  }, [palletType, maxHeightMm, maxWeightKg, safetyMarginMm]);

  // ── Compute results ──
  const result = useMemo(() => {
    const rawResult = calculateFullPallet(
      brochureSpec,
      packageConfig,
      palletConfig,
      customQuantity === '' ? undefined : customQuantity,
      customLayers === '' ? undefined : customLayers,
      customBaseQty === '' ? undefined : customBaseQty
    );
    if (customLayout) {
      // Slice customLayout to match customBaseQty if customBaseQty is defined and smaller
      let layoutToUse = customLayout;
      if (customBaseQty && customBaseQty > 0 && customBaseQty < customLayout.length) {
        layoutToUse = customLayout.slice(0, customBaseQty);
      }
      rawResult.baseLayout = layoutToUse;
      // Recalculate used dimensions
      const margin = palletConfig.safetyMarginMm;
      rawResult.usedWidthMm = layoutToUse.length > 0
        ? Math.round((Math.max(...layoutToUse.map(b => b.x + b.width)) - margin) * 10) / 10
        : 0;
      rawResult.usedLengthMm = layoutToUse.length > 0
        ? Math.round((Math.max(...layoutToUse.map(b => b.y + b.height)) - margin) * 10) / 10
        : 0;
    }
    return rawResult;
  }, [brochureSpec, packageConfig, palletConfig, customQuantity, customLayers, customBaseQty, customLayout]);

  // ── Reset custom layout when the default layout changes ──
  const defaultLayout = useMemo(() => {
    return optimizeBaseLayout(
      brochureSpec.widthMm,
      brochureSpec.heightMm,
      palletConfig
    );
  }, [brochureSpec.widthMm, brochureSpec.heightMm, palletConfig.widthMm, palletConfig.lengthMm, palletConfig.safetyMarginMm]);

  React.useEffect(() => {
    if (isLayoutLocked) return;
    setCustomLayout(null);
    setCustomBaseQty('');
    setLayoutMode('automatic');
  }, [defaultLayout, isLayoutLocked]);

  // ── Toggle rotation of individual brochure packages ──
  const handleToggleRotation = useCallback((index: number) => {
    if (isLayoutLocked) return;
    const layoutToEdit = customLayout || result.baseLayout;
    if (index < 0 || index >= layoutToEdit.length) return;

    let hasOverlapOrOutOfBounds = false;
    const newLayout = layoutToEdit.map((b, i) => {
      if (i === index) {
        const newWidth = b.height;
        const newHeight = b.width;
        // Rotate around center
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        
        // Clamp to pallet boundaries
        const margin = palletConfig.safetyMarginMm;
        const maxW = palletConfig.widthMm - margin - newWidth;
        const maxH = palletConfig.lengthMm - margin - newHeight;
        const newX = Math.max(margin, Math.min(maxW, cx - newWidth / 2));
        const newY = Math.max(margin, Math.min(maxH, cy - newHeight / 2));

        const rotatedBrochure = {
          ...b,
          rotated: !b.rotated,
          width: newWidth,
          height: newHeight,
          x: newX,
          y: newY
        };

        // Check if this rotated brochure overlaps with any OTHER brochure in the layout
        const overlaps = layoutToEdit.some((other, idx) => {
          if (idx === index) return false;
          return doesOverlap(rotatedBrochure, other);
        });

        if (overlaps) {
          hasOverlapOrOutOfBounds = true;
        }

        return rotatedBrochure;
      }
      return b;
    });

    if (!hasOverlapOrOutOfBounds) {
      setCustomLayout(newLayout);
    }
  }, [customLayout, result.baseLayout, isLayoutLocked, palletConfig]);

  // ── Active Layout (handles mirroring for cross-stacking Layer B) ──
  const activeLayout = useMemo(() => {
    const currentBaseLayout = result.baseLayout; // Use sliced/updated baseLayout directly
    if (selectedLayer === 'B' && result.isPicoStabilityActive) {
      const margin = safetyMarginMm;
      const availableW = palletConfig.widthMm - 2 * margin;
      const availableH = palletConfig.lengthMm - 2 * margin;
      return currentBaseLayout.map(b => ({
        ...b,
        x: availableW - b.x - b.width + 2 * margin,
        y: availableH - b.y - b.height + 2 * margin
      }));
    }
    return currentBaseLayout;
  }, [selectedLayer, result.baseLayout, result.isPicoStabilityActive, palletConfig.widthMm, palletConfig.lengthMm, safetyMarginMm]);

  // ── Layout Mode Handlers ──
  const handleSetLayoutMode = useCallback((mode: 'automatic' | 'manual') => {
    setLayoutMode(mode);
    if (mode === 'automatic') {
      setCustomLayout(null);
    } else {
      if (!customLayout) {
        setCustomLayout(result.baseLayout);
      }
    }
  }, [customLayout, result.baseLayout]);

  const handleAddBrochure = useCallback(() => {
    if (isLayoutLocked) return;
    const currentBaseLayout = customLayout || result.baseLayout;
    const { x, y } = findFreePosition(widthMm, heightMm, currentBaseLayout, palletConfig);
    const newBrochure: PlacedBrochure = {
      x,
      y,
      width: widthMm,
      height: heightMm,
      rotated: false,
    };
    setCustomLayout([...currentBaseLayout, newBrochure]);
    setLayoutMode('manual');
  }, [customLayout, result.baseLayout, isLayoutLocked, palletConfig, widthMm, heightMm]);

  const handleClearBase = useCallback(() => {
    if (isLayoutLocked) return;
    setCustomLayout([]);
    setLayoutMode('manual');
  }, [isLayoutLocked]);

  const handleResetToAutomatic = useCallback(() => {
    if (isLayoutLocked) return;
    setCustomBaseQty('');
    const autoLayout = optimizeBaseLayout(
      brochureSpec.widthMm,
      brochureSpec.heightMm,
      palletConfig
    );
    setCustomLayout(autoLayout);
    setLayoutMode('manual');
  }, [brochureSpec, palletConfig, isLayoutLocked]);

  const handleDeleteBrochure = useCallback((index: number) => {
    if (isLayoutLocked) return;
    const currentBaseLayout = customLayout || result.baseLayout;
    const newLayout = currentBaseLayout.filter((_, idx) => idx !== index);
    setCustomLayout(newLayout);
    setLayoutMode('manual');
  }, [customLayout, result.baseLayout, isLayoutLocked]);

  // ── Drag and Drop Handlers ──
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent, index: number) => {
    if (layoutMode !== 'manual' || isLayoutLocked) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const currentBaseLayout = customLayout || result.baseLayout;
    const brochure = currentBaseLayout[index];
    if (!brochure) return;

    setDraggedIndex(index);
    setDragStartPos({ x: clientX, y: clientY });
    setDragStartOffset({ x: brochure.x, y: brochure.y });
    setIsMoved(false);
  }, [layoutMode, isLayoutLocked, customLayout, result.baseLayout]);

  React.useEffect(() => {
    if (draggedIndex === null || !dragStartPos || !dragStartOffset) return;

    const handleMouseMoveGlobal = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const pw = palletConfig.widthMm;
      const padding = 40;
      const labelSpace = 30;
      const viewW = pw + padding * 2 + labelSpace;
      const scale = viewW / rect.width;

      const dx = (clientX - dragStartPos.x) * scale;
      const dy = (clientY - dragStartPos.y) * scale;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setIsMoved(true);
      }

      const currentBaseLayout = customLayout || result.baseLayout;
      const targetBrochure = currentBaseLayout[draggedIndex];
      if (!targetBrochure) return;

      const newX = Math.round(dragStartOffset.x + dx);
      const newY = Math.round(dragStartOffset.y + dy);

      const margin = palletConfig.safetyMarginMm;
      const maxW = palletConfig.widthMm - margin - targetBrochure.width;
      const maxH = palletConfig.lengthMm - margin - targetBrochure.height;

      const constrainedX = Math.max(margin, Math.min(maxW, newX));
      const constrainedY = Math.max(margin, Math.min(maxH, newY));

      // Overlap checks
      const overlapsWithAny = (x: number, y: number) => {
        const checkBrochure = { ...targetBrochure, x, y };
        return currentBaseLayout.some((other, idx) => {
          if (idx === draggedIndex) return false;
          return doesOverlap(checkBrochure, other);
        });
      };

      let finalX = targetBrochure.x;
      let finalY = targetBrochure.y;

      if (!overlapsWithAny(constrainedX, constrainedY)) {
        finalX = constrainedX;
        finalY = constrainedY;
      } else {
        // Try sliding horizontally
        const canMoveX = !overlapsWithAny(constrainedX, targetBrochure.y);
        // Try sliding vertically
        const canMoveY = !overlapsWithAny(targetBrochure.x, constrainedY);

        if (canMoveX) {
          finalX = constrainedX;
        } else if (canMoveY) {
          finalY = constrainedY;
        }
      }

      const newLayout = currentBaseLayout.map((b, idx) => {
        if (idx === draggedIndex) {
          return {
            ...b,
            x: finalX,
            y: finalY,
          };
        }
        return b;
      });
      setCustomLayout(newLayout);
    };

    const handleMouseUpGlobal = () => {
      if (!isMoved && draggedIndex !== null) {
        handleToggleRotation(draggedIndex);
      }
      setDraggedIndex(null);
      setDragStartPos(null);
      setDragStartOffset(null);
    };

    window.addEventListener('mousemove', handleMouseMoveGlobal);
    window.addEventListener('mouseup', handleMouseUpGlobal);
    window.addEventListener('touchmove', handleMouseMoveGlobal, { passive: false });
    window.addEventListener('touchend', handleMouseUpGlobal);

    return () => {
      window.removeEventListener('mousemove', handleMouseMoveGlobal);
      window.removeEventListener('mouseup', handleMouseUpGlobal);
      window.removeEventListener('touchmove', handleMouseMoveGlobal);
      window.removeEventListener('touchend', handleMouseUpGlobal);
    };
  }, [draggedIndex, dragStartPos, dragStartOffset, isMoved, customLayout, result.baseLayout, palletConfig, handleToggleRotation]);

  // ── Comparator: opposite pallet ──
  const comparePalletType = palletType === 'european' ? 'american' : 'european';
  const comparePalletConfig: PalletConfig = useMemo(() => {
    const base = DEFAULT_PALLETS[comparePalletType];
    return {
      ...base,
      maxHeightMm,
      maxWeightKg,
      safetyMarginMm,
    };
  }, [comparePalletType, maxHeightMm, maxWeightKg, safetyMarginMm]);

  const compareResult = useMemo(() =>
    showComparator ? calculateFullPallet(brochureSpec, packageConfig, comparePalletConfig, customQuantity === '' ? undefined : customQuantity, customLayers === '' ? undefined : customLayers, customBaseQty === '' ? undefined : customBaseQty) : null,
    [brochureSpec, packageConfig, comparePalletConfig, showComparator, customQuantity, customLayers, customBaseQty]
  );

  // ── Export SVG as PNG ──
  const handleExportPNG = useCallback(() => {
    if (!svgRef.current) return;
    const svgElement = svgRef.current;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width * 3;
      canvas.height = img.height * 3;
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.style.display = 'none';
      link.download = `cubicaje_palet_${palletType}_${Date.now()}.png`;
      link.href = pngUrl;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 15000);
    };

    img.src = url;
  }, [palletType]);

  // ── Export CSV/Excel data ──
  const handleExportExcel = useCallback(async () => {
    const data = [
      ['CUBICAJE DE FOLLETOS EN PALET — Informe'],
      [],
      ['── DATOS DEL FOLLETO ──'],
      ['Gramaje (g/m²)', paperGsm],
      ['Mano / Bulk (cm³/g)', paperBulk],
      ['Ancho (mm)', widthMm],
      ['Alto (mm)', heightMm],
      ['Nº de páginas', pageCount],
      ['Tipo acabado', bindingType === 'stapled' ? 'Grapado' : 'Cortado'],
      ['Factor grapa (mm)', bindingType === 'stapled' ? stapleExtraMm : 'N/A'],
      [],
      ['── RESULTADOS POR FOLLETO ──'],
      ['Grosor folleto (mm)', result.brochureThicknessMm],
      ['Peso folleto (g)', result.brochureWeightG],
      [],
      ['── CONFIGURACIÓN DEL PAQUETE ──'],
      ['Unidades por paquete', unitsPerPackage],
      ['Folletos objetivo', customQuantity === '' ? 'Máximo' : customQuantity],
      ['Altura paquete (mm)', result.packageHeightMm],
      ['Peso paquete (g)', result.packageWeightG],
      [],
      ['── CONFIGURACIÓN DEL PALET ──'],
      ['Tipo de palet', palletType === 'european' ? 'Europeo (1200×800)' : 'Americano (1200×1000)'],
      ['Altura máxima carga (mm)', maxHeightMm],
      ['Peso máximo (kg)', maxWeightKg],
      ['Margen de seguridad (mm)', safetyMarginMm],
      [],
      ['── RESULTADO DEL CUBICAJE ──'],
      ['Paquetes por capa', result.brochuresPerLayer],
      ['Nº de capas', result.layersCount],
      ['Total folletos en palet', result.totalBrochures],
      ['Altura total (mm)', Math.round(result.layersCount * result.packageHeightMm + PALLET_STRUCTURE_HEIGHT)],
      ['Peso total palet (kg)', result.totalWeightKg],
      ['Eficiencia de base (%)', result.efficiencyPercent],
      ['Excede peso máximo', result.exceedsWeight ? 'SÍ ⚠️' : 'NO ✓'],
      ['Excede altura máxima', result.exceedsHeight ? 'SÍ ⚠️' : 'NO ✓'],
    ];

    if (compareResult) {
      data.push(
        [],
        ['── COMPARADOR: ' + (comparePalletType === 'european' ? 'EUROPEO (1200×800)' : 'AMERICANO (1200×1000)') + ' ──'],
        ['Folletos por capa', compareResult.brochuresPerLayer],
        ['Nº de capas', compareResult.layersCount],
        ['Total folletos en palet', compareResult.totalBrochures],
        ['Peso total palet (kg)', compareResult.totalWeightKg],
        ['Eficiencia de base (%)', compareResult.efficiencyPercent],
      );
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    // Set column widths
    ws['!cols'] = [{ wch: 35 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cubicaje');
    XLSX.writeFile(wb, `Cubicaje_Folletos_${palletType}_${Date.now()}.xlsx`);
  }, [paperGsm, paperBulk, widthMm, heightMm, pageCount, bindingType, stapleExtraMm, unitsPerPackage, palletType, maxHeightMm, maxWeightKg, safetyMarginMm, result, compareResult, comparePalletType]);

  // ── Export PDF report ──
  const handleExportPDF = useCallback(async () => {
    try {
      const pdfBytes = await generateCubicajePdf(
        brochureSpec,
        packageConfig,
        palletConfig,
        result,
        customQuantity === '' ? undefined : customQuantity
      );

      const blob = new Blob([pdfBytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = `informe_cubicaje_${palletType}_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 15000);
    } catch (err) {
      console.error('Error generating PDF', err);
    }
  }, [brochureSpec, packageConfig, palletConfig, result, customQuantity, palletType]);

  // ── Grouped presets for rendering ──
  const groupedPresets = useMemo(() => {
    const groups: Record<string, PaperPreset[]> = {};
    PAPER_PRESETS.forEach(p => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, []);

  // ── PALLET HEIGHT (in mm, structure is ~145mm) ──
  const PALLET_STRUCTURE_HEIGHT = 145;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* ═══ LEFT PANEL: INPUTS ═══ */}
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-5">

        {/* ─── Datos del Folleto ─── */}
        <section className="bg-white dark:bg-apple-dark-surface shadow-sm rounded-2xl border border-zinc-200 dark:border-apple-dark-border p-5">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Ruler className="w-4 h-4 text-apple-blue dark:text-apple-dark-blue" />
            Datos del Folleto
          </h3>

          {/* Paper Preset Selector */}
          <div className="mb-4">
            <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider block mb-1.5">
              Preset de papel (opcional)
            </label>
            <div className="relative">
              <select
                value={selectedPreset}
                onChange={(e) => {
                  const preset = PAPER_PRESETS.find(p => p.name === e.target.value);
                  if (preset) handlePresetSelect(preset);
                }}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white appearance-none cursor-pointer focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40"
              >
                <option value="">— Seleccionar papel predefinido —</option>
                {(Object.entries(groupedPresets) as [string, PaperPreset[]][]).map(([cat, presets]) => (
                  <optgroup key={cat} label={`── ${cat} ──`}>
                    {presets.map((p: PaperPreset) => (
                      <option key={p.name} value={p.name}>
                        {p.name} (Bulk: {p.bulk})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Gramaje */}
            <div>
              <label className="text-[10px] text-zinc-400 font-semibold block mb-1">
                Gramaje (g/m²)
              </label>
              <input
                type="number"
                value={paperGsm}
                onChange={e => setPaperGsm(Math.max(0, Number(e.target.value)))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40"
                placeholder="135"
                min={1}
              />
            </div>

            {/* Mano / Bulk */}
            <div>
              <label className="text-[10px] text-zinc-400 font-semibold block mb-1 flex items-center gap-1">
                Mano (cm³/g)
                <span className="group relative cursor-help">
                  <Info className="w-3 h-3 text-zinc-500" />
                  <span className="hidden group-hover:block absolute left-0 top-4 w-52 bg-zinc-800 border border-zinc-700 text-[9px] text-zinc-300 p-2 rounded-lg shadow-xl z-10 leading-relaxed">
                    El volumen específico (bulk) del papel. Indica cuán "esponjoso" es.
                    Típico: Estucado ≈ 0.80–0.90, Offset ≈ 1.20–1.50, Voluminoso ≈ 1.50–2.50.
                    Consulta la ficha técnica del fabricante.
                  </span>
                </span>
              </label>
              <input
                type="number"
                value={paperBulk}
                onChange={e => setPaperBulk(Math.max(0, Number(e.target.value)))}
                step={0.01}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40"
                placeholder="0.87"
                min={0.01}
              />
            </div>

            {/* Ancho */}
            <div>
              <label className="text-[10px] text-zinc-400 font-semibold block mb-1">
                Ancho folleto (mm)
              </label>
              <input
                type="number"
                value={widthMm}
                onChange={e => setWidthMm(Math.max(0, Number(e.target.value)))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40"
                placeholder="210"
                min={1}
              />
            </div>

            {/* Alto */}
            <div>
              <label className="text-[10px] text-zinc-400 font-semibold block mb-1">
                Alto folleto (mm)
              </label>
              <input
                type="number"
                value={heightMm}
                onChange={e => setHeightMm(Math.max(0, Number(e.target.value)))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40"
                placeholder="297"
                min={1}
              />
            </div>

            {/* Páginas */}
            <div>
              <label className="text-[10px] text-zinc-400 font-semibold block mb-1">
                Nº de páginas
              </label>
              <input
                type="number"
                value={pageCount}
                onChange={e => setPageCount(Math.max(2, Math.round(Number(e.target.value) / 2) * 2))}
                step={2}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40"
                placeholder="8"
                min={2}
              />
              <span className="text-[9px] text-zinc-500 mt-0.5 block">{pageCount / 2} hojas</span>
            </div>

            {/* Tipo acabado */}
            <div>
              <label className="text-[10px] text-zinc-400 font-semibold block mb-1">
                Tipo de acabado
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => setBindingType('cut')}
                  className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all border ${
                    bindingType === 'cut'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-950/30'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  ✂️ Cortado
                </button>
                <button
                  onClick={() => setBindingType('stapled')}
                  className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all border ${
                    bindingType === 'stapled'
                      ? 'bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-950/30'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  📎 Grapado
                </button>
              </div>
            </div>
          </div>

          {/* Staple Extra — only if stapled */}
          {bindingType === 'stapled' && (
            <div className="mt-3 p-3 bg-violet-950/30 border border-violet-700/30 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-violet-300 font-semibold flex items-center gap-1">
                  📎 Factor extra por grapa (mm)
                </label>
                <span className="text-xs text-violet-400 font-mono font-bold">{stapleExtraMm} mm</span>
              </div>
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                value={stapleExtraMm}
                onChange={e => setStapleExtraMm(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              <span className="text-[9px] text-violet-400/70 block mt-0.5">
                Grosor adicional por la curvatura del lomo grapado
              </span>
            </div>
          )}


          {/* Inline KPIs */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-center shadow-sm">
              <span className="text-[9px] text-zinc-500 font-semibold uppercase block">Grosor Folleto</span>
              <span className="text-base font-bold text-blue-500 dark:text-blue-400 font-mono">{fmtMm(result.brochureThicknessMm)} mm</span>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-center shadow-sm">
              <span className="text-[9px] text-zinc-500 font-semibold uppercase block">Peso Folleto</span>
              <span className="text-base font-bold text-emerald-500 dark:text-emerald-400 font-mono">{fmtG(result.brochureWeightG)} g</span>
            </div>
          </div>
        </section>

        {/* ─── Configuración del Paquete ─── */}
        <section className="bg-white dark:bg-apple-dark-surface shadow-sm rounded-2xl border border-zinc-200 dark:border-apple-dark-border p-5">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <BoxSelect className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            Configuración del Paquete
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-zinc-400 font-semibold block mb-1">
                Cantidad por paquete
              </label>
              <input
                type="number"
                value={unitsPerPackage}
                onChange={e => setUnitsPerPackage(Math.max(1, Number(e.target.value)))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40"
                placeholder="250"
                min={1}
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 font-semibold block mb-1">
                Folletos objetivo
              </label>
              <input
                type="number"
                value={customQuantity || ''}
                onChange={e => setCustomQuantity(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40"
                placeholder="Ej: 10000"
                min={0}
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 font-semibold block mb-1">
                Nº de capas
              </label>
              <input
                type="number"
                value={customLayers || ''}
                onChange={e => setCustomLayers(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40"
                placeholder="Ej: 8"
                min={1}
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 font-semibold block mb-1">
                Folletos en base
              </label>
              <input
                type="number"
                value={customBaseQty || ''}
                onChange={e => setCustomBaseQty(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40"
                placeholder={`Máx: ${defaultLayout.length}`}
                min={1}
              />
            </div>
          </div>
          <span className="text-[9px] text-zinc-500 mt-1.5 block leading-relaxed">
            * Parámetros opcionales: Si se definen folletos objetivo, número de capas o cantidad en base, se recalculará la altura, peso y total necesarios. La cantidad en base tiene prioridad sobre la disposición automática óptima.
          </span>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-center shadow-sm">
              <span className="text-[9px] text-zinc-500 font-semibold uppercase block">Altura Paquete</span>
              <span className="text-base font-bold text-amber-500 dark:text-amber-400 font-mono">{fmtMm(result.packageHeightMm)} mm</span>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-center shadow-sm">
              <span className="text-[9px] text-zinc-500 font-semibold uppercase block">Peso Paquete</span>
              <span className="text-base font-bold text-amber-500 dark:text-amber-400 font-mono">{(result.packageWeightG / 1000).toFixed(2)} kg</span>
            </div>
          </div>
        </section>

        {/* ─── Configuración del Palet ─── */}
        <section className="bg-white dark:bg-apple-dark-surface shadow-sm rounded-2xl border border-zinc-200 dark:border-apple-dark-border p-5">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-rose-500 dark:text-rose-400" />
            Configuración del Palet
          </h3>

          {/* Pallet type selector */}
          <div className="mb-4">
            <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider block mb-1.5">
              Tipo de palet
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setPalletType('european')}
                className={`flex-1 py-2 px-3 rounded-lg transition-all border text-xs font-bold flex items-center justify-between gap-1.5 ${
                  palletType === 'european'
                    ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950/30'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-700 hover:border-zinc-650 hover:bg-zinc-900'
                }`}
              >
                <span className="text-[11px] font-extrabold">🇪🇺 Europeo</span>
                <span className="text-[10px] font-mono opacity-80">1200×800 mm</span>
              </button>
              <button
                onClick={() => setPalletType('american')}
                className={`flex-1 py-2 px-3 rounded-lg transition-all border text-xs font-bold flex items-center justify-between gap-1.5 ${
                  palletType === 'american'
                    ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950/30'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-700 hover:border-zinc-650 hover:bg-zinc-900'
                }`}
              >
                <span className="text-[11px] font-extrabold">🇺🇸 Americano</span>
                <span className="text-[10px] font-mono opacity-80">1200×1000 mm</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* Max Height */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-zinc-400 font-semibold">Altura máxima de carga (mm)</label>
                <span className="text-xs text-rose-400 font-mono font-bold">{maxHeightMm} mm</span>
              </div>
              <input
                type="range"
                min={200}
                max={2600}
                step={10}
                value={maxHeightMm}
                onChange={e => setMaxHeightMm(Number(e.target.value))}
                className="w-full accent-rose-500"
              />
              <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5">
                <span>200mm</span>
                <span className="text-zinc-400 font-semibold">Recomendado: 1200–1500mm</span>
                <span>2600mm</span>
              </div>
            </div>

            {/* Max Weight */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-zinc-400 font-semibold">Peso máximo del palet (kg)</label>
                <span className="text-xs text-rose-400 font-mono font-bold">{maxWeightKg} kg</span>
              </div>
              <input
                type="number"
                value={maxWeightKg}
                onChange={e => setMaxWeightKg(Math.max(1, Number(e.target.value)))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/40"
                placeholder="1000"
                min={1}
              />
            </div>

            {/* Safety Margin */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-zinc-400 font-semibold flex items-center gap-1">
                  Margen de seguridad (mm)
                  <span className="group relative cursor-help">
                    <Info className="w-3 h-3 text-zinc-500" />
                    <span className="hidden group-hover:block absolute left-0 top-4 w-48 bg-zinc-800 border border-zinc-700 text-[9px] text-zinc-300 p-2 rounded-lg shadow-xl z-10 leading-relaxed">
                      Espacio libre alrededor de los folletos para evitar que se doblen o se rompan al rozarse entre sí.
                    </span>
                  </span>
                </label>
                <span className="text-xs text-amber-400 font-mono font-bold">{safetyMarginMm} mm</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={safetyMarginMm}
                onChange={e => setSafetyMarginMm(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5">
                <span>0mm</span>
                <span className="text-zinc-400 font-semibold">Por defecto: 15mm (1.5cm)</span>
                <span>50mm</span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Action Buttons ─── */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowComparator(!showComparator)}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
              showComparator
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-950/30'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-indigo-500 hover:bg-zinc-800'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {showComparator ? 'Ocultar Comparador' : 'Comparar Europeo vs Americano'}
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleExportPNG}
              className="py-2.5 px-2 rounded-xl text-[11px] font-bold bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-emerald-500 hover:bg-zinc-800 transition-all flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              Exportar PNG
            </button>
            <button
              onClick={handleExportExcel}
              className="py-2.5 px-2 rounded-xl text-[11px] font-bold bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-emerald-500 hover:bg-zinc-800 transition-all flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              Exportar Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="py-2.5 px-2 rounded-xl text-[11px] font-bold bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-emerald-500 hover:bg-zinc-800 transition-all flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              Exportar PDF
            </button>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL: VISUAL RESULTS ═══ */}
      <div className="col-span-12 lg:col-span-7 flex flex-col gap-5">

        {/* ─── Summary KPIs ─── */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Resultado del Cubicaje
            <span className="text-[10px] font-normal text-zinc-500 ml-auto">
              {palletType === 'european' ? '🇪🇺 Europeo 1200×800' : '🇺🇸 Americano 1200×1000'}
            </span>
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-center">
              <span className="text-[9px] text-zinc-500 font-semibold uppercase block mb-0.5">Por Capa</span>
              <span className="text-2xl font-extrabold text-blue-400 font-mono block">{result.brochuresPerLayer}</span>
              <span className="text-[9px] text-zinc-500">paquetes</span>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-center">
              <span className="text-[9px] text-zinc-500 font-semibold uppercase block mb-0.5">Capas</span>
              <span className="text-2xl font-extrabold text-amber-400 font-mono block">{result.layersCount}</span>
              <span className="text-[9px] text-zinc-500">capas</span>
            </div>
            <div className={`bg-zinc-950 border rounded-xl p-3 text-center ${result.exceedsHeight ? 'border-red-500/60' : 'border-zinc-800'}`}>
              <span className="text-[9px] text-zinc-500 font-semibold uppercase block mb-0.5">Altura Total</span>
              <span className={`text-2xl font-extrabold font-mono block ${result.exceedsHeight ? 'text-red-400' : 'text-amber-400'}`}>
                {Math.round(result.layersCount * result.packageHeightMm + PALLET_STRUCTURE_HEIGHT)}
              </span>
              <span className="text-[9px] text-zinc-500">
                mm {result.exceedsHeight && '⚠️'}
              </span>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-center">
              <span className="text-[9px] text-zinc-500 font-semibold uppercase block mb-0.5">Total Palet</span>
              <span className="text-2xl font-extrabold text-emerald-400 font-mono block">{formatQuantitySpain(result.totalBrochures)}</span>
              <span className="text-[9px] text-zinc-500">folletos</span>
            </div>
            <div className={`bg-zinc-950 border rounded-xl p-3 text-center ${result.exceedsWeight ? 'border-red-500/60' : 'border-zinc-800'}`}>
              <span className="text-[9px] text-zinc-500 font-semibold uppercase block mb-0.5">Peso Total</span>
              <span className={`text-2xl font-extrabold font-mono block ${result.exceedsWeight ? 'text-red-400' : 'text-rose-400'}`}>
                {result.totalWeightKg.toFixed(1)}
              </span>
              <span className={`text-[9px] ${result.exceedsWeight ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                kg {result.exceedsWeight && '⚠️'}
              </span>
            </div>
          </div>

          {/* Efficiency bar */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-400 font-semibold shrink-0">Eficiencia base:</span>
            <div className="flex-1 bg-zinc-950 rounded-full h-3 overflow-hidden border border-zinc-800">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  result.efficiencyPercent >= 85 ? 'bg-gradient-to-r from-emerald-500 to-green-400' :
                  result.efficiencyPercent >= 60 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
                  'bg-gradient-to-r from-red-500 to-orange-400'
                }`}
                style={{ width: `${Math.min(100, result.efficiencyPercent)}%` }}
              />
            </div>
            <span className={`text-xs font-bold font-mono ${
              result.efficiencyPercent >= 85 ? 'text-emerald-400' :
              result.efficiencyPercent >= 60 ? 'text-amber-400' :
              'text-red-400'
            }`}>
              {result.efficiencyPercent.toFixed(1)}%
            </span>
          </div>

          {/* COG Status card */}
          <div className="mt-4 p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg flex flex-col gap-2">
            <span className="text-[9px] text-zinc-500 font-semibold uppercase block tracking-wider">Centro de Gravedad (COG)</span>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-zinc-900/60 p-1.5 rounded border border-zinc-800/40 text-center">
                <span className="text-zinc-500 block text-[8px] uppercase">Izq / Der</span>
                <span className={`font-bold ${result.cogImbalance ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {result.cogLeftPct}% / {result.cogRightPct}%
                </span>
              </div>
              <div className="bg-zinc-900/60 p-1.5 rounded border border-zinc-800/40 text-center">
                <span className="text-zinc-500 block text-[8px] uppercase">Sup / Inf</span>
                <span className={`font-bold ${result.cogImbalance ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {result.cogTopPct}% / {result.cogBottomPct}%
                </span>
              </div>
            </div>
            {result.cogImbalance ? (
              <div className="flex items-center gap-1.5 text-[9px] text-amber-300 bg-amber-950/30 px-2 py-1.5 rounded border border-amber-900/40 mt-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Desv. COG &gt; 10%. Refuerza el flejado del palet.</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[9px] text-emerald-300 bg-emerald-950/30 px-2 py-1.5 rounded border border-emerald-900/40 mt-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Distribución de carga equilibrada.</span>
              </div>
            )}
          </div>

          {/* Warnings */}
          {(result.exceedsWeight || result.exceedsHeight) && (
            <div className="mt-3 flex flex-col gap-1.5">
              {result.exceedsWeight && (
                <div className="flex items-center gap-2 bg-red-950/40 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>
                    <strong>El peso total ({result.totalWeightKg.toFixed(1)} kg)</strong> excede el máximo configurado ({maxWeightKg} kg).
                    Reduce la altura o las unidades por paquete.
                  </span>
                </div>
              )}
              {result.exceedsHeight && (
                <div className="flex items-center gap-2 bg-red-950/40 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>
                    <strong>La altura de la carga</strong> excede el máximo configurado ({maxHeightMm} mm).
                  </span>
                </div>
              )}
            </div>
          )}

          {!result.exceedsWeight && !result.exceedsHeight && result.brochuresPerLayer > 0 && (
            <div className="mt-3 flex items-center gap-2 bg-emerald-950/30 border border-emerald-700/30 rounded-lg px-3 py-2 text-xs text-emerald-300">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Configuración válida. El palet está dentro de los límites de peso y altura.</span>
            </div>
          )}
        </section>

        {/* ─── Visual: Top View (Origami) ─── */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-blue-400" />
              Vista Cenital del Palet (Planta)
            </h3>
            <div className="flex items-center gap-1.5 text-[9px] text-zinc-500">
              <RotateCcw className="w-3 h-3" />
              <span>{result.baseLayout.filter(b => b.rotated).length} rotados de {result.baseLayout.length}</span>
            </div>
          </div>

          {/* Mode Selector and Toolbar */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 mb-4 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2 self-start w-full sm:w-auto">
              <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                <button
                  onClick={() => handleSetLayoutMode('automatic')}
                  disabled={isLayoutLocked}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    layoutMode === 'automatic'
                      ? 'bg-rose-600 text-stone-50 shadow-md shadow-rose-950/40 font-extrabold'
                      : 'text-zinc-400 hover:text-white disabled:opacity-40 disabled:hover:text-zinc-400'
                  }`}
                  title={isLayoutLocked ? "Desbloquea el diseño para cambiar a modo automático" : "Cambiar a modo automático"}
                >
                  Auto
                </button>
                <button
                  onClick={() => handleSetLayoutMode('manual')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    layoutMode === 'manual'
                      ? 'bg-rose-600 text-stone-50 shadow-md shadow-rose-950/40 font-extrabold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Manual
                </button>
              </div>

              {layoutMode === 'manual' && (
                <button
                  onClick={() => setIsLayoutLocked(!isLayoutLocked)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                    isLayoutLocked
                      ? 'bg-amber-950/30 text-amber-400 border-amber-500/30 shadow-md'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-white'
                  }`}
                  title={isLayoutLocked ? "Diseño bloqueado. Haz clic para desbloquear." : "Bloquear diseño para evitar cambios accidentales."}
                >
                  {isLayoutLocked ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Bloqueado</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Bloquear</span>
                    </>
                  )}
                </button>
              )}
            </div>
            
            {layoutMode === 'manual' && (
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  onClick={handleAddBrochure}
                  disabled={isLayoutLocked}
                  className="px-2 py-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 rounded-lg text-[10px] text-zinc-300 hover:text-white font-bold flex items-center gap-1 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900 disabled:hover:border-zinc-800 disabled:hover:text-zinc-300"
                  title="Añade un nuevo folleto en el primer espacio libre disponible"
                >
                  <Plus className="w-3 h-3 text-rose-400" />
                  Añadir
                </button>
                <button
                  onClick={handleResetToAutomatic}
                  disabled={isLayoutLocked}
                  className="px-2 py-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 rounded-lg text-[10px] text-zinc-300 hover:text-white font-bold flex items-center gap-1 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900 disabled:hover:border-zinc-800 disabled:hover:text-zinc-300"
                  title="Carga la disposición automática actual como punto de partida manual"
                >
                  <RotateCcw className="w-3 h-3 text-amber-400" />
                  Cargar Auto
                </button>
                <button
                  onClick={handleClearBase}
                  disabled={isLayoutLocked}
                  className="px-2 py-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 rounded-lg text-[10px] text-red-400 hover:text-red-300 font-bold flex items-center gap-1 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900 disabled:hover:border-zinc-800 disabled:hover:text-red-400"
                  title="Elimina todos los folletos de la base"
                >
                  <Trash2 className="w-3 h-3" />
                  Vaciar
                </button>
              </div>
            )}
          </div>

          {/* Pico Stability Cross-Stacking warning & Toggles */}
          {result.isPicoStabilityActive && (
            <div className="mb-4 bg-amber-950/20 border border-amber-500/30 rounded-xl p-3.5 flex flex-col gap-2.5">
              <div className="flex items-start gap-2 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Estabilidad de Pico Activada (Base de Apoyo):</strong> La altura de la estiba es baja ({Math.round(result.layersCount * result.packageHeightMm + PALLET_STRUCTURE_HEIGHT)} mm, &lt;60%). Se recomienda aplicar <strong>estiba cruzada</strong> alternando la orientación en cada capa para evitar que el palet colapse.
                </span>
              </div>
              <div className="flex items-center gap-2 justify-center bg-zinc-950 p-1 rounded-lg border border-zinc-800 max-w-[240px] mx-auto w-full">
                <button
                  onClick={() => setSelectedLayer('A')}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                    selectedLayer === 'A'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Capa A (Impar)
                </button>
                <button
                  onClick={() => setSelectedLayer('B')}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                    selectedLayer === 'B'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Capa B (Par)
                </button>
              </div>
            </div>
          )}

          {result.brochuresPerLayer > 0 ? (
            <PalletSVG
              palletConfig={palletConfig}
              layout={activeLayout}
              brochureW={widthMm}
              brochureH={heightMm}
              svgRef={svgRef}
              onToggleRotation={handleToggleRotation}
              onDelete={handleDeleteBrochure}
              onDragStart={handleDragStart}
              isManualMode={layoutMode === 'manual' && !isLayoutLocked}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <Package className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-semibold">No caben folletos en el palet</p>
              <p className="text-xs mt-1 text-zinc-600">Verifica las dimensiones del folleto y el margen de seguridad.</p>
            </div>
          )}
        </section>

        {/* ─── Visual: Side View ─── */}
        <section className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            Vista Lateral del Palet (Alzado)
          </h3>
          {result.layersCount > 0 ? (
            <SideViewSVG
              packageHeight={result.packageHeightMm}
              layersCount={result.layersCount}
              maxHeight={maxHeightMm}
              palletHeightMm={PALLET_STRUCTURE_HEIGHT}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
              <Layers className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-xs font-semibold">No hay capas para mostrar</p>
            </div>
          )}
        </section>

        {/* ─── Comparator (if active) ─── */}
        {showComparator && compareResult && (
          <section className="bg-zinc-900 rounded-xl border border-indigo-500/30 p-5">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-indigo-400" />
              Comparador: {palletType === 'european' ? '🇪🇺 Europeo' : '🇺🇸 Americano'} vs {comparePalletType === 'european' ? '🇪🇺 Europeo' : '🇺🇸 Americano'}
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                    <th className="py-2 px-3">Métrica</th>
                    <th className="py-2 px-3 text-center">
                      {palletType === 'european' ? '🇪🇺 Europeo' : '🇺🇸 Americano'}
                    </th>
                    <th className="py-2 px-3 text-center">
                      {comparePalletType === 'european' ? '🇪🇺 Europeo' : '🇺🇸 Americano'}
                    </th>
                    <th className="py-2 px-3 text-center">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                  {[
                    { label: 'Folletos por capa', a: result.brochuresPerLayer, b: compareResult.brochuresPerLayer },
                    { label: 'Nº de capas', a: result.layersCount, b: compareResult.layersCount },
                    { label: 'Total folletos', a: result.totalBrochures, b: compareResult.totalBrochures },
                    { label: 'Altura total (mm)', a: Math.round(result.layersCount * result.packageHeightMm + PALLET_STRUCTURE_HEIGHT), b: Math.round(compareResult.layersCount * compareResult.packageHeightMm + PALLET_STRUCTURE_HEIGHT), isFloat: false },
                    { label: 'Peso total (kg)', a: result.totalWeightKg, b: compareResult.totalWeightKg, isFloat: true },
                    { label: 'Eficiencia base (%)', a: result.efficiencyPercent, b: compareResult.efficiencyPercent, isFloat: true },
                  ].map((row, i) => {
                    const diff = row.b - row.a;
                    const diffStr = row.isFloat ? (diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : (diff > 0 ? `+${diff}` : `${diff}`);
                    return (
                      <tr key={i} className="hover:bg-zinc-800/40">
                        <td className="py-2 px-3 font-semibold text-zinc-200">{row.label}</td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-rose-400">
                          {row.isFloat ? row.a.toFixed(1) : formatQuantitySpain(row.a)}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-indigo-400">
                          {row.isFloat ? row.b.toFixed(1) : formatQuantitySpain(row.b)}
                        </td>
                        <td className={`py-2 px-3 text-center font-mono font-bold ${
                          diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-zinc-500'
                        }`}>
                          {diff === 0 ? '—' : diffStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Compare visual */}
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-zinc-400 mb-2">
                Vista cenital — {comparePalletType === 'european' ? '🇪🇺 Europeo 1200×800' : '🇺🇸 Americano 1200×1000'}
              </h4>
              <PalletSVG
                palletConfig={comparePalletConfig}
                layout={compareResult.baseLayout}
                brochureW={widthMm}
                brochureH={heightMm}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
