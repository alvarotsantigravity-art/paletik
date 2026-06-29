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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300">
      <div className="bg-white dark:bg-apple-dark-surface border border-zinc-200 dark:border-apple-dark-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-apple-dark-surface">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Editar Paletizado</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-5 flex-1 overflow-y-auto">
          <div className="mb-4 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl flex justify-between items-center text-sm border border-zinc-200 dark:border-zinc-700/50 shadow-sm">
            <div>
              <span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-1 font-medium">Partida</span>
              <strong className="text-apple-blue dark:text-apple-dark-blue font-bold">{item.version}</strong>
            </div>
            <div className="text-right">
              <span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-1 font-medium">Total a repartir</span>
              <strong className="text-zinc-900 dark:text-white text-lg">{item.quantity.toLocaleString('es-ES')} ej</strong>
            </div>
          </div>

          <div className="space-y-2">
            {pallets.map((p, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div className="w-20 font-mono text-zinc-600 dark:text-zinc-400 font-bold text-xs uppercase text-center bg-zinc-100 dark:bg-zinc-800 py-1.5 rounded-lg">
                  Palet {p.palletIndex}/{p.totalPallets}
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="number"
                    value={p.quantity}
                    onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 0)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white font-mono text-right focus:outline-none focus:border-apple-blue transition-colors"
                  />
                  <span className="text-zinc-500 text-xs font-bold">ej</span>
                </div>
                <button
                  onClick={() => handleRemovePallet(idx)}
                  className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Eliminar Palet"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddPallet}
            className="mt-3 w-full py-2.5 border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-apple-blue dark:hover:border-apple-dark-blue hover:text-apple-blue dark:hover:text-apple-dark-blue transition-colors flex items-center justify-center gap-2 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Añadir Palet
          </button>

          {isMismatch && (
            <div className="mt-5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/50 rounded-xl p-4 flex gap-3 text-red-800 dark:text-red-200 text-sm shadow-sm">
              <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" />
              <div>
                <strong>Descuadre en el total:</strong> La suma de los palets ({currentTotal.toLocaleString('es-ES')}) no coincide con el total de la partida ({item.quantity.toLocaleString('es-ES')}).
                <div className="text-xs text-red-600 dark:text-red-300/70 mt-1 font-medium">
                  Diferencia: {diff > 0 ? '+' : ''}{diff.toLocaleString('es-ES')} ej.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-apple-dark-surface flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onSave(pallets);
              onClose();
            }}
            className="px-6 py-2.5 bg-apple-blue dark:bg-apple-dark-blue hover:bg-blue-600 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm"
          >
            Guardar Balanceo
          </button>
        </div>
      </div>
    </div>
  );
};
