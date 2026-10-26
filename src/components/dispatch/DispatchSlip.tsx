import { X, Copy, Send, FileText } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import type { ProductionRequest } from '../../utils/api';
import { bagSize, bagsLabel } from '../../utils/batches';

type Labels = { camelKey: string; label: string }[];

const shortId = (id: string) => id.slice(0, 8).toUpperCase();
const shortLabel = (label: string) => label.replace(/ Momos?$/, '');

function fmtDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtTime(iso?: string) {
  return iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
}

// Plain text so it pastes cleanly into WhatsApp - the copy that travels with the boxes is
// the paper slip on the lid; this is the same information for the store's phone.
export function buildSlipText(request: ProductionRequest, products: Labels): string {
  const d = request.dispatch;
  const lines: string[] = [];
  lines.push('BUNNY MOMOS - DISPATCH SLIP');
  lines.push(`Request #${shortId(request.id)} - ${request.storeName || 'Store'}`);
  lines.push(`For ${fmtDate(request.requestDate)} - packed ${fmtTime(d?.packedAt || request.shippedAt)}`);
  lines.push('');
  products.forEach(({ camelKey, label }) => {
    const shipped = request.shippedQuantities?.[camelKey] || 0;
    if (shipped <= 0) return;
    const size = bagSize(camelKey);
    const bags = Math.floor(shipped / size);
    const loose = shipped - bags * size;
    lines.push(`${shortLabel(label)}: ${bags} bag${bags === 1 ? '' : 's'} x ${size}${loose ? ` + ${loose} loose` : ''} = ${shipped} pcs`);
    const batches = d?.batches?.[camelKey];
    if (batches?.length) lines.push(`   Batches: ${batches.map((b) => `${b.code} (${b.pieces})`).join(', ')}`);
  });
  const sauces = Object.keys(request.sauces || {}).filter((s) => request.sauces?.[s]);
  const sent = sauces.filter((s) => (request.shippedSauces ? request.shippedSauces[s] : true));
  const notSent = sauces.filter((s) => !sent.includes(s));
  if (sent.length) lines.push(`Sauces: ${sent.join(', ')}`);
  if (notSent.length) lines.push(`Not sent: ${notSent.map((s) => `${s}${request.shippingNotes?.[`sauce_${s}`] ? ` (${request.shippingNotes[`sauce_${s}`]})` : ''}`).join(', ')}`);
  const kitchen = Object.entries(request.kitchenUtilities || {})
    .map(([name, v]) => ({ name, unit: v.unit, qty: request.shippedQuantities?.[`kitchenUtility_${name}`] ?? v.quantity }))
    .filter((k) => k.qty > 0);
  if (kitchen.length) lines.push(`Kitchen: ${kitchen.map((k) => `${k.name} ${k.qty} ${k.unit}`).join(', ')}`);
  const utilities = Object.entries(request.utilities || {})
    .map(([name, qty]) => ({ name, qty: request.shippedQuantities?.[`utility_${name}`] ?? qty }))
    .filter((u) => u.qty > 0);
  if (utilities.length) lines.push(`Utilities: ${utilities.map((u) => `${u.name} ${u.qty}`).join(', ')}`);
  lines.push('');
  if (d?.boxes) lines.push(`Boxes: ${d.boxes}${d.containerNumbers ? ` (${d.containerNumbers})` : ''}`);
  if (d?.packedBy || d?.checkedBy) lines.push(`Packed by ${d?.packedBy || '-'} - checked by ${d?.checkedBy || '-'}`);
  lines.push('Store: count the BAGS against this slip, check the momos are hard, then press Receive in the app.');
  return lines.join('\n');
}

type ModalProps = {
  request: ProductionRequest;
  products: Labels;
  onClose: () => void;
};

export function DispatchSlipModal({ request, products, onClose }: ModalProps) {
  const text = buildSlipText(request, products);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Slip copied');
    } catch {
      toast.error('Could not copy - select the text and copy it');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between gap-3 p-4 border-b">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><FileText className="w-5 h-5 text-orange-600" /> Dispatch slip</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <pre className="p-4 overflow-auto text-[13px] leading-relaxed font-mono text-gray-900 whitespace-pre-wrap bg-amber-50/40 flex-1">{text}</pre>
        <p className="px-4 pt-3 text-xs text-gray-500">Write the same on the paper slip taped to each box lid: Box 1 of {request.dispatch?.boxes || 'N'}, the bags inside, batch codes.</p>
        <div className="p-4 flex gap-2">
          <button onClick={copy} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-800 hover:bg-gray-50">
            <Copy className="w-4 h-4" /> Copy
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
          >
            <Send className="w-4 h-4" /> WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

type DetailsProps = {
  request: ProductionRequest;
  products: Labels;
  onOpenSlip: () => void;
};

// Compact dispatch summary for the request card: boxes, batch codes, who packed it.
export function DispatchDetails({ request, products, onOpenSlip }: DetailsProps) {
  const d = request.dispatch;
  if (!d) return null;
  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-gray-600">
          Dispatch{d.boxes ? ` · ${d.boxes} box${d.boxes === 1 ? '' : 'es'}` : ''}{d.containerNumbers ? ` · ${d.containerNumbers}` : ''}
        </p>
        <button type="button" onClick={onOpenSlip} className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700">
          <FileText className="w-3.5 h-3.5" /> Slip
        </button>
      </div>
      <div className="space-y-1">
        {products.map(({ camelKey, label }) => {
          const shipped = request.shippedQuantities?.[camelKey] || 0;
          if (shipped <= 0) return null;
          const batches = d.batches?.[camelKey] || [];
          return (
            <p key={camelKey} className="text-xs text-gray-700">
              <span className="font-medium">{shortLabel(label)}</span> {bagsLabel(shipped, camelKey)}
              {batches.length > 0 && <span className="font-mono text-gray-500"> · {batches.map((b) => `${b.code} (${b.pieces})`).join(', ')}</span>}
            </p>
          );
        })}
      </div>
      {(d.packedBy || d.checkedBy) && (
        <p className="text-[11px] text-gray-500 mt-1">Packed by {d.packedBy || '-'} · checked by {d.checkedBy || '-'}</p>
      )}
    </div>
  );
}
