// What makes up one cost line on the Unit Economics ladder (food, packaging, rent &
// electricity, other running costs, equipment...): its categories, largest first, and the
// entries behind each one. Spread costs (equipment, bulk packaging, the POS fee) show this
// period's share next to the full purchase. A sheet on phones, a dialog on desktop.

import { useState } from 'react';
import { ChevronDown, ChevronRight, Receipt } from 'lucide-react';
import { ResponsiveModal } from './ui/responsive-modal';
import { EmptyState } from './ui/empty-state';

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
    <ResponsiveModal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={title}
      description={`${periodLabel} · ${inr(total)}${revenue > 0 ? ` · ${((total / revenue) * 100).toFixed(1)}% of sales` : ''}`}
      size="detail"
    >
      {sorted.length === 0 ? (
        <EmptyState compact icon={Receipt} title="Nothing under this line" body="No entries for the period." />
      ) : (
        <ul className="-mx-1 overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
          {sorted.map((g) => {
            const isOpen = open === g.label;
            const share = total > 0 ? (g.amount / total) * 100 : 0;
            return (
              <li key={g.label}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : g.label)}
                  aria-expanded={isOpen}
                  className="flex min-h-15 w-full flex-col gap-2 px-4 py-3 text-left outline-none hover:bg-surface-2/60 active:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      {isOpen ? <ChevronDown className="size-4 shrink-0 text-text-3" aria-hidden="true" /> : <ChevronRight className="size-4 shrink-0 text-text-3" aria-hidden="true" />}
                      <span className="break-words text-body-md font-medium text-text">{g.label}</span>
                      <span className="shrink-0 text-caption text-text-3">{g.entries.length} {g.entries.length === 1 ? 'entry' : 'entries'}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-body-md font-semibold text-text">{inr(g.amount)}</span>
                      <span className="num block text-caption text-text-3">{share.toFixed(0)}%</span>
                    </span>
                  </span>
                  <span className="ml-6 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <span className="block h-full rounded-full bg-chart-1" style={{ width: `${Math.max(1, share)}%` }} />
                  </span>
                </button>
                {isOpen && (
                  <ul className="border-t border-border bg-surface-2 [&>*+*]:border-t [&>*+*]:border-border">
                    {[...g.entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amount - a.amount)).map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-3 py-2 pr-4 pl-10">
                        <div className="min-w-0">
                          <p className="break-words text-body-sm text-text">{e.name}</p>
                          <p className="text-caption text-text-3" data-ai-private={e.detail ? '' : undefined}>{[shortDate(e.date), e.detail].filter(Boolean).join(' · ')}</p>
                        </div>
                        <p className="num shrink-0 text-body-sm text-text">{inr(e.amount)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {note && <p className="mt-3 text-caption text-text-3">{note}</p>}
    </ResponsiveModal>
  );
}
