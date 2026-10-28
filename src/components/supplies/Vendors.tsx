// Vendors on shopping lists (owner, 28 Oct 2026; server supplies.ts).
//   Part of a list comes from vendors (vegetables, grocery, Kalimata, butter, chicken) who get their
//   part on WhatsApp. The app writes each vendor's message the way it was always written - the date,
//   then one item per line - and opens WhatsApp with it; the writer checks it and presses send. The
//   app keeps when each was sent and says so if the list changes after. The vendor an item comes
//   from is remembered, so the next list fills it in.
import { useCallback, useEffect, useState } from 'react';
import { Copy, MessageCircle, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { phoneLinks } from '../team/shared';
import { confirm } from '../ui/confirm';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { StatusChip } from '../ui/status-chip';
import { ItemPicker, itemKey, useSupplyCandidates } from './supplyItems';
import * as api from './suppliesApi';

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const ddmmyy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}`;
const qtyText = (n: number) => String(Math.round(n * 1000) / 1000);
const phoneText = (p?: string) => { const d = (p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : p || ''; };

export function useVendors() {
  const [vendors, setVendors] = useState<api.Vendor[] | null>(null);
  const reload = useCallback(() => { api.listVendors().then(setVendors).catch(() => setVendors((v) => v || [])); }, []);
  useEffect(() => { reload(); }, [reload]);
  return { vendors: vendors || [], reload };
}

export const vendorFor = (vendors: api.Vendor[], item: string) => {
  const k = itemKey(item);
  return vendors.find((v) => v.items.some((i) => itemKey(i) === k))?.id || null;
};

type OrderLine = Pick<api.ShoppingLine, 'item' | 'qty' | 'unit' | 'vendorId'>;
// One row per item: the same item for two places is added up.
function merged(lines: OrderLine[]) {
  const m = new Map<string, { item: string; qty: number; unit: string }>();
  for (const l of lines) {
    const k = `${itemKey(l.item)}|${l.unit}`;
    const cur = m.get(k);
    m.set(k, cur ? { ...cur, qty: cur.qty + (l.qty || 0) } : { item: l.item, qty: l.qty || 0, unit: l.unit });
  }
  return [...m.values()];
}
// "29.10.26", a blank line, then "Ginger 400 g" - line notes are for the shopper, not the vendor.
export const vendorMessage = (date: string, lines: OrderLine[]) =>
  [ddmmyy(date), '', ...merged(lines).map((l) => (l.qty ? `${l.item} ${qtyText(l.qty)} ${l.unit}` : l.item))].join('\n');
// What a message asked for, to tell whether the list changed after it was sent.
export const orderSig = (lines: OrderLine[]) => merged(lines).map((l) => `${itemKey(l.item)} ${l.qty} ${l.unit}`).sort().join(';');
// No number: WhatsApp opens with the text and asks which chat.
const whatsappLink = (phone: string | undefined, text: string) => `${phoneLinks(phone)?.whatsapp || 'https://wa.me/'}?text=${encodeURIComponent(text)}`;

/** Vendors on a list and how many still need their message. */
export function vendorProgress(list: { lines: { vendorId?: string | null }[]; vendorOrders?: api.ShoppingList['vendorOrders'] }) {
  const ids = [...new Set(list.lines.map((l) => l.vendorId).filter((id): id is string => !!id))];
  return { total: ids.length, sent: ids.filter((id) => list.vendorOrders?.[id]).length };
}

/** Each vendor's part of a list: the message, Copy, and WhatsApp (which records the send). */
export function VendorOrders({ date, lines, vendors, sent, onSent, compact }: {
  date: string; lines: OrderLine[]; vendors: api.Vendor[]; sent?: api.ShoppingList['vendorOrders'];
  onSent?: (vendorId: string, sig: string) => void; compact?: boolean;
}) {
  const groups = vendors.map((v) => ({ v, ls: lines.filter((l) => l.vendorId === v.id) })).filter((g) => g.ls.length);
  if (!groups.length) return null;
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('Copied - paste it in WhatsApp'); } catch { toast.error('Could not copy'); }
  };
  return (
    <div className="flex flex-col gap-2">
      {groups.map(({ v, ls }) => {
        const text = vendorMessage(date, ls);
        const sig = orderSig(ls);
        const rec = sent?.[v.id];
        const changed = !!rec && rec.sig !== sig;
        const rows = merged(ls).length;
        return (
          <div key={v.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-body-sm font-semibold text-text">{v.name}</span>
                <span className="text-label text-text-3">
                  {rows} item{rows === 1 ? '' : 's'} · {v.phone ? phoneText(v.phone) : 'no number yet: WhatsApp asks which chat'}
                </span>
              </div>
              {rec && <StatusChip tone={changed ? 'warning' : 'success'} size="sm">{changed ? 'Changed since sent' : `Sent ${timeOf(rec.at)}`}</StatusChip>}
            </div>
            {!compact && <pre className="num rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-label leading-relaxed whitespace-pre-wrap text-text">{text}</pre>}
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="ghost" leadingIcon={<Copy />} onClick={() => copy(text)}>Copy</Button>
              <Button asChild size="sm" variant="secondary">
                <a href={whatsappLink(v.phone, text)} target="_blank" rel="noopener noreferrer" onClick={() => onSent?.(v.id, sig)}>
                  <MessageCircle className="size-4" aria-hidden="true" />{rec && !changed ? 'Send again' : 'WhatsApp'}
                </a>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Managing vendors ----------------

/** The vendors: name, WhatsApp number and the items each supplies. Content only (the list editor shows it as a step). */
export function VendorManager({ vendors, onChanged }: { vendors: api.Vendor[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<api.Vendor | 'new' | null>(null);
  if (editing) return <VendorForm vendor={editing === 'new' ? null : editing} onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-text-2">Items from a vendor are filled in on the next list. Add the WhatsApp number so the message goes straight to their chat.</p>
      {vendors.length > 0 && (
        <ListGroup>
          {vendors.map((v) => (
            <ListRow key={v.id} title={v.name} onClick={() => setEditing(v)}
              subtitle={`${v.phone ? phoneText(v.phone) : 'No WhatsApp number'} · ${v.items.length ? v.items.slice(0, 4).join(', ') + (v.items.length > 4 ? ` +${v.items.length - 4}` : '') : 'no items yet'}`} />
          ))}
        </ListGroup>
      )}
      <Button variant="secondary" leadingIcon={<Plus />} onClick={() => setEditing('new')}>Add a vendor</Button>
    </div>
  );
}

function VendorForm({ vendor, onDone, onCancel }: { vendor: api.Vendor | null; onDone: () => void; onCancel: () => void }) {
  const candidates = useSupplyCandidates();
  const [name, setName] = useState(vendor?.name || '');
  const [phone, setPhone] = useState(vendor?.phone || '');
  const [items, setItems] = useState<string[]>(vendor?.items || []);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const add = (item: string) => item && setItems((is) => (is.some((i) => itemKey(i) === itemKey(item)) ? is : [...is, item]));
  const save = async () => {
    setBusy('save');
    try {
      const body = { name: name.trim(), phone: phone.trim(), items };
      if (vendor) await api.updateVendor(vendor.id, body); else await api.createVendor(body);
      toast.success('Saved');
      onDone();
    } catch (e) { toast.error((e as Error).message || 'Could not save'); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!vendor) return;
    const ok = await confirm({ title: `Remove ${vendor.name}?`, body: 'Lists already written keep the name. Its items go back to "bought at a shop".', confirmLabel: 'Remove', tone: 'danger' });
    if (!ok) return;
    setBusy('remove');
    try { await api.deleteVendor(vendor.id); toast.success(`${vendor.name} removed`); onDone(); } catch (e) { toast.error((e as Error).message || 'Could not remove'); } finally { setBusy(null); }
  };
  return (
    <div className="flex flex-col gap-4">
      <Field label="Name"><Input value={name} maxLength={40} placeholder="e.g. Vegetable vendor" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="WhatsApp number" optional>
        <Input type="tel" inputMode="numeric" className="num" value={phone} maxLength={16} placeholder="10 digits" onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <section className="flex flex-col gap-2">
        <p className="overline-label">Items from this vendor · {items.length}</p>
        {items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {items.map((i) => (
              <button key={i} type="button" onClick={() => setItems((is) => is.filter((x) => x !== i))} aria-label={`Take ${i} off`}
                className="hit-44 inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-label font-medium text-text hover:bg-surface-2">
                {i}<X className="size-3.5 text-text-3" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <ItemPicker candidates={candidates} clearOnPick placeholder="Add an item: ginger, mayonnaise…" onPick={(p) => add(p.item)} />
        <p className="text-label text-text-3">An item belongs to one vendor: adding it here takes it off any other.</p>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button className="flex-1" loading={busy === 'save'} onClick={save}>Save vendor</Button>
        <Button variant="secondary" onClick={onCancel}>Back</Button>
      </div>
      {vendor && (
        <Button variant="danger-ghost" leadingIcon={<Trash2 />} loading={busy === 'remove'} onClick={remove}>
          Remove this vendor
        </Button>
      )}
    </div>
  );
}

/** The vendors on their own (from the Shopping card). */
export function VendorsModal({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const { vendors, reload } = useVendors();
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} size="detail" title="Vendors"
      description="Who gets their part of the shopping list on WhatsApp.">
      <VendorManager vendors={vendors} onChanged={reload} />
    </ResponsiveModal>
  );
}
