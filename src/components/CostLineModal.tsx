// What makes up one cost line on the Unit Economics ladder (food, packaging, rent &
// electricity, other running costs, equipment...): its categories, largest first, and the
// entries behind each one. Spread costs (equipment, bulk packaging, the POS fee) show this
// period's share next to the full purchase.

import { useState } from 'react';
import { X, ChevronDown, ChevronRight, Receipt } from 'lucide-react';

export type CostLineEntry = { id: string; date: string; name: string; detail?: string; amount: number };
export type CostLineGroup = { label: string; amount: number; entries: CostLineEntry[] };

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const shortDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

export function CostLineModal({
  title, periodLabel, groups, note, revenue, onClose,
}: {
  title: string;
  periodLabel: string;
  groups: CostLineGroup[];
  note?: string;
  revenue: number;
  onClose: () => void;
}) {
  const sorted = [...groups].filter((g) => Math.abs(g.amount) >= 0.5).sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((t, g) => t + g.amount, 0);
  const [open, setOpen] = useState<string | null>(sorted.length === 1 ? sorted[0].label : null);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-5 py-4 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight">{title}</h2>
              <p className="text-xs text-indigo-100 mt-0.5">
                {periodLabel} · {inr(total)}{revenue > 0 ? ` · ${((total / revenue) * 100).toFixed(1)}% of revenue` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/20 transition-colors flex-shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {sorted.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">Nothing recorded under this line for the period.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sorted.map((g) => {
                const isOpen = open === g.label;
                const share = total > 0 ? (g.amount / total) * 100 : 0;
                return (
                  <li key={g.label}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : g.label)}
                      aria-expanded={isOpen}
                      className="w-full text-left px-5 py-3 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                          <span className="text-sm font-medium text-gray-900 break-words">{g.label}</span>
                          <span className="text-[11px] text-gray-500 flex-shrink-0">{g.entries.length} {g.entries.length === 1 ? 'entry' : 'entries'}</span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold tabular-nums text-gray-900">{inr(g.amount)}</p>
                          <p className="text-[11px] tabular-nums text-gray-500">{share.toFixed(0)}%</p>
                        </div>
                      </div>
                      <div className="mt-2 ml-6 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
                        <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.max(1, share)}%` }} />
                      </div>
                    </button>
                    {isOpen && (
                      <ul className="bg-gray-50/70 border-t border-gray-100 divide-y divide-gray-100">
                        {[...g.entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amount - a.amount)).map((e) => (
                          <li key={e.id} className="pl-11 pr-5 py-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 break-words">{e.name}</p>
                              <p className="text-[11px] text-gray-500">{[shortDate(e.date), e.detail].filter(Boolean).join(' · ')}</p>
                            </div>
                            <p className="text-sm tabular-nums text-gray-900 flex-shrink-0">{inr(e.amount)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {note && <p className="px-5 py-3 text-[11px] text-gray-500 border-t border-gray-100">{note}</p>}
        </div>
      </div>
    </div>
  );
}
