import * as React from 'react';
import { FileText, Send } from 'lucide-react';
import { toast } from '../ui/sonner';
import { Button } from '../ui/button';
import { ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { useT } from '../../utils/i18n';
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

/** Copy and WhatsApp for a slip. */
export function useSlipActions(request: ProductionRequest | null, products: Labels) {
  const { t } = useT();
  const text = request ? buildSlipText(request, products) : '';
  return {
    text,
    whatsappHref: `https://wa.me/?text=${encodeURIComponent(text)}`,
    copy: async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(t('stock.slip.copied'));
      } catch {
        toast.error(t('stock.slip.copyFailed'));
      }
    },
  };
}

/** The slip as text, the note about the paper copy, and a WhatsApp link. */
export function DispatchSlipBody({ request, products }: { request: ProductionRequest; products: Labels }) {
  const { t } = useT();
  const { text, whatsappHref } = useSlipActions(request, products);
  return (
    <div className="flex flex-col gap-3">
      <pre className="num overflow-auto rounded-lg border border-border bg-surface p-4 font-mono text-label leading-relaxed whitespace-pre-wrap text-text">{text}</pre>
      <p className="text-label text-text-3">{t('stock.slip.paperNote', { n: request.dispatch?.boxes || 'N' })}</p>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <ListRow icon={Send} title={t('stock.slip.whatsapp')} subtitle={t('stock.slip.whatsappHint')} href={whatsappHref} />
      </div>
    </div>
  );
}

type ModalProps = {
  request: ProductionRequest;
  products: Labels;
  onClose: () => void;
};

export function DispatchSlipModal({ request, products, onClose }: ModalProps) {
  const { t } = useT();
  const { copy, whatsappHref } = useSlipActions(request, products);
  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t('stock.slip.title')}
      size="detail"
      footer={
        <>
          <Button variant="secondary" size="lg" className="flex-1" onClick={copy}>{t('stock.slip.copy')}</Button>
          <Button asChild size="lg" className="flex-1">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">{t('stock.slip.whatsapp')}</a>
          </Button>
        </>
      }
    >
      <DispatchSlipBody request={request} products={products} />
    </ResponsiveModal>
  );
}

type DetailsProps = {
  request: ProductionRequest;
  products: Labels;
  onOpenSlip: () => void;
};

// Compact dispatch summary for the request sheet: boxes, batch codes, who packed it.
export function DispatchDetails({ request, products, onOpenSlip }: DetailsProps) {
  const { t } = useT();
  const d = request.dispatch;
  if (!d) return null;
  const lines = products.filter(({ camelKey }) => (request.shippedQuantities?.[camelKey] || 0) > 0);
  return (
    <section className="flex flex-col">
      <div className="mx-1 mb-2 flex items-center justify-between gap-2">
        <h3 className="overline-label">{t('stock.slip.dispatch')}{d.boxes ? ` · ${t('stock.slip.boxes', { n: d.boxes })}` : ''}</h3>
        <Button variant="link" size="sm" leadingIcon={<FileText />} onClick={onOpenSlip}>{t('stock.slip.title')}</Button>
      </div>
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3">
        {d.containerNumbers && <p className="text-label text-text-2">{d.containerNumbers}</p>}
        {lines.map(({ camelKey, label }) => {
          const batches = d.batches?.[camelKey] || [];
          return (
            <p key={camelKey} className="text-body-sm text-text">
              <span className="font-medium">{shortLabel(label)}</span> <span className="num">{bagsLabel(request.shippedQuantities![camelKey], camelKey)}</span>
              {batches.length > 0 && <span className="num font-mono text-label text-text-3"> · {batches.map((b) => `${b.code} (${b.pieces})`).join(', ')}</span>}
            </p>
          );
        })}
        {(d.packedBy || d.checkedBy) && (
          <p className="text-label text-text-3">{t('stock.slip.packedChecked', { packed: d.packedBy || '-', checked: d.checkedBy || '-' })}</p>
        )}
      </div>
    </section>
  );
}
