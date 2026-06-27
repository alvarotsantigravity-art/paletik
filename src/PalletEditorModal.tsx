import React, { useState, useEffect } from 'react';
import { PalletResult, DistributionItem } from './types';
import { X, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { calculatePalletsForQuantity } from './pdfEngine';

interface PalletEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: DistributionItem | null;
  defaultFullSize: number;
  defaultMinPico: number;
  onSave: (customPallets: PalletResult[]) => void;
}

export const PalletEditorModal: React.FC<PalletEditorModalProps> = ({
  isOpen,
  onClose,
  item,
  defaultFullSize,
  defaultMinPico,
  onSave
}) => {
  const [pallets, setPallets] = useState<PalletResult[]>([]);

  useEffect(() => {
    if (isOpen && item) {
      if (item.customPallets && item.customPallets.length > 0) {
        setPallets(JSON.parse(JSON.stringify(item.customPallets)));
      } else {
        const calc = calculatePalletsForQuantity(item.quantity, defaultFullSize, defaultMinPico);
        setPallets(calc);
      }
    }
  }, [isOpen, item, defaultFullSize, defaultMinPico]);

  if (!isOpen || !item) return null;

  const handleAddPallet = () => {
    const newPallets = [...pallets, {
      palletIndex: pallets.length + 1,
      totalPallets: pallets.length + 1,
      quantity: 0,
      isAdjusted: false
    }];
    updateIndices(newPallets);
  };

  const handleRemovePallet = (index: number) => {
    const newPallets = [...pallets];
    newPallets.splice(index, 1);
    updateIndices(newPallets);
  };

  const updateIndices = (list: PalletResult[]) => {
    const total = list.length;
    const updated = list.map((p, i) => ({
      ...p,
      palletIndex: i + 1,
      totalPallets: total
    }));
    setPallets(updated);
  };

  const handleQuantityChange = (index: number, newQty: number) => {
    const newPallets = [...pallets];
    const oldQty = newPallets[index].quantity;
    const delta = oldQty - newQty;

    newPallets[index].quantity = newQty;
    newPallets[index].isAdjusted = true;

    // Balanceo semi-automático: compensar la diferencia en el palet anterior (o siguiente si es el primero)
    if (delta !== 0) {
      if (index > 0) {
        newPallets[index - 1].quantity += delta;
        newPallets[index - 1].isAdjusted = true;
      } else if (index < newPallets.length - 1) {
        newPallets[index + 1].quantity += delta;
        newPallets[index + 1].isAdjusted = true;
      }
    }

    setPallets(newPallets);
  };

  const currentTotal = pallets.reduce((sum, p) => sum + p.quantity, 0);
  const diff = currentTotal - item.quantity;
  const isMismatch = diff !== 0;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-950">
          <h2 className="text-lg font-bold text-white">Editar Paletizado</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-5 flex-1 overflow-y-auto">
          <div className="mb-4 bg-zinc-800/50 p-3 rounded-lg flex justify-between items-center text-sm">
            <div>
              <span className="text-zinc-400 block text-xs mb-1">Partida</span>
              <strong className="text-rose-400">{item.version}</strong>
            </div>
            <div className="text-right">
              <span className="text-zinc-400 block text-xs mb-1">Total a repartir</span>
              <strong className="text-white text-lg">{item.quantity.toLocaleString('es-ES')} ej</strong>
            </div>
          </div>

          <div className="space-y-2">
            {pallets.map((p, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-zinc-950 p-3 rounded border border-zinc-800">
                <div className="w-20 font-mono text-zinc-500 font-bold text-xs uppercase text-center bg-zinc-900 py-1 rounded">
                  Palet {p.palletIndex}/{p.totalPallets}
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="number"
                    value={p.quantity}
                    onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 0)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-white font-mono text-right"
                  />
                  <span className="text-zinc-500 text-xs font-bold">ej</span>
                </div>
                <button
                  onClick={() => handleRemovePallet(idx)}
                  className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                  title="Eliminar Palet"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddPallet}
            className="mt-3 w-full py-2 border border-dashed border-zinc-700 text-zinc-400 rounded hover:bg-zinc-800 hover:text-white transition-colors flex items-center justify-center gap-2 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Añadir Palet
          </button>

          {isMismatch && (
            <div className="mt-5 bg-red-950/40 border border-red-500/50 rounded-lg p-3 flex gap-3 text-red-200 text-sm">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <strong>Descuadre en el total:</strong> La suma de los palets ({currentTotal.toLocaleString('es-ES')}) no coincide con el total de la partida ({item.quantity.toLocaleString('es-ES')}).
                <div className="text-xs text-red-300/70 mt-1">
                  Diferencia: {diff > 0 ? '+' : ''}{diff.toLocaleString('es-ES')} ej.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-zinc-300 hover:text-white"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onSave(pallets);
              onClose();
            }}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded font-semibold text-sm transition-colors shadow-lg shadow-rose-900/20"
          >
            Guardar Balanceo
          </button>
        </div>
      </div>
    </div>
  );
};
