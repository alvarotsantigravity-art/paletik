import React, { useState } from 'react';
import { Transport, DistributionItem } from './types';
import { Truck, Plus, Trash2, Edit2, CheckSquare, Square, PackageOpen } from 'lucide-react';

interface TransportManagerProps {
  transports: Transport[];
  distributionList: DistributionItem[];
  onChange: (transports: Transport[]) => void;
}

export const TransportManager: React.FC<TransportManagerProps> = ({
  transports,
  distributionList,
  onChange
}) => {
  const [newTransportName, setNewTransportName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const addTransport = () => {
    if (!newTransportName.trim()) return;
    const newTransport: Transport = {
      id: Math.random().toString(36).substr(2, 9),
      name: newTransportName.trim(),
      items: distributionList.map(d => d.id)
    };
    onChange([...transports, newTransport]);
    setNewTransportName('');
  };

  const removeTransport = (id: string) => {
    onChange(transports.filter(t => t.id !== id));
  };

  const toggleItemInTransport = (transportId: string, itemId: string) => {
    onChange(transports.map(t => {
      if (t.id !== transportId) {
        // Option: Remove item from other transports if it can only be in one
        // For now, let's just toggle it in the current transport
        return t;
      }
      const hasItem = t.items.includes(itemId);
      return {
        ...t,
        items: hasItem ? t.items.filter(id => id !== itemId) : [...t.items, itemId]
      };
    }));
  };

  const updateTransportName = (id: string, newName: string) => {
    onChange(transports.map(t => t.id === id ? { ...t, name: newName } : t));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header / Add */}
      <div className="flex items-center gap-2 mb-2">
        <input 
          type="text" 
          value={newTransportName}
          onChange={e => setNewTransportName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTransport()}
          placeholder="Nombre del camión (ej. Camión 1 - Madrid)"
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-rose-500 focus:outline-none"
        />
        <button 
          onClick={addTransport}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition"
        >
          <Plus className="w-4 h-4" />
          Añadir Transporte
        </button>
      </div>

      {transports.length === 0 && (
        <div className="text-center p-6 bg-zinc-950/50 border border-zinc-800 border-dashed rounded-xl text-zinc-500 text-sm">
          No hay transportes creados. Crea uno para asignar partidas.
        </div>
      )}

      {/* Transports List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {transports.map(transport => {
          const transportItems = distributionList.filter(d => transport.items.includes(d.id));
          const totalQty = transportItems.reduce((acc, item) => acc + item.quantity, 0);

          return (
            <div key={transport.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
              {/* Card Header */}
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-amber-400" />
                  {editingId === transport.id ? (
                    <input 
                      type="text"
                      autoFocus
                      defaultValue={transport.name}
                      onBlur={e => {
                        updateTransportName(transport.id, e.target.value);
                        setEditingId(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          updateTransportName(transport.id, e.currentTarget.value);
                          setEditingId(null);
                        }
                      }}
                      className="bg-zinc-900 border border-zinc-700 text-white px-2 py-1 text-sm rounded"
                    />
                  ) : (
                    <span className="font-bold text-zinc-200">{transport.name}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(transport.id)} className="text-zinc-500 hover:text-amber-400">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => removeTransport(transport.id)} className="text-zinc-500 hover:text-rose-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 text-[10px] text-zinc-500 justify-end mb-1">
                <button 
                  onClick={() => {
                    onChange(transports.map(t => t.id === transport.id ? { ...t, items: distributionList.map(d => d.id) } : t));
                  }} 
                  className="hover:text-amber-400 transition cursor-pointer font-medium"
                >
                  Marcar todos
                </button>
                <span>|</span>
                <button 
                  onClick={() => {
                    onChange(transports.map(t => t.id === transport.id ? { ...t, items: [] } : t));
                  }} 
                  className="hover:text-rose-400 transition cursor-pointer font-medium"
                >
                  Desmarcar todos
                </button>
              </div>

              {/* Items Selection */}
              <div className="flex-1 overflow-y-auto max-h-[200px] pr-2 custom-scrollbar">
                {distributionList.length === 0 && (
                  <p className="text-xs text-zinc-500 italic">No hay partidas de distribución disponibles.</p>
                )}
                {distributionList.map(item => {
                  const isSelected = transport.items.includes(item.id);
                  return (
                    <div 
                      key={item.id} 
                      onClick={() => toggleItemInTransport(transport.id, item.id)}
                      className={`flex items-start gap-2 p-2 rounded cursor-pointer transition ${isSelected ? 'bg-amber-900/20' : 'hover:bg-zinc-900'}`}
                    >
                      <button className={`mt-0.5 shrink-0 ${isSelected ? 'text-amber-500' : 'text-zinc-600'}`}>
                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-zinc-300 truncate">{item.version}</div>
                        <div className="text-[10px] text-zinc-500 truncate">{item.address}</div>
                      </div>
                      <div className="text-xs font-mono text-zinc-400 shrink-0">
                        {item.quantity.toLocaleString('es-ES')} ej.
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Summary */}
              <div className="pt-3 border-t border-zinc-800 flex justify-between items-center text-xs">
                <span className="text-zinc-500">{transport.items.length} partidas asignadas</span>
                <span className="font-bold text-amber-400">{totalQty.toLocaleString('es-ES')} ej. totales</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
