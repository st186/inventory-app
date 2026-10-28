// Shopping lists on Home (owner, 28 Oct 2026; server supplies.ts).
//   The owner and operations: write tomorrow's list with the same item names as the expenses (the
//   usual buys and anything flagged as running low are one tap), send it to whoever shops, and
//   when they are done fix the quantities, set the prices and save - each line goes into the
//   expenses through the usual routes, so nothing is typed twice.
//   The shopper (the production incharge): the list reaches them when their quiet hours end; they
//   tick what they got (or not found), add the bill photos, and finish.
//   Vendors (Vendors.tsx): lines can come from a vendor; after sending the list, each vendor's part
//   goes out on WhatsApp from here, and the shopper sees the list grouped by vendor.
//   Quantities (quantityNorms.ts): each line is checked as it is written (packs need the size of
//   each, vegetables go by weight, leafy herbs by the bundle); pressing Send asks Bunny to check the
//   whole list first, with a corrected amount to use in one tap. Expenses are logged in the weight
//   or volume the packs come to (2 packets × 1 L = 2 L), so prices compare across lists.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ClipboardList, Plus, ShoppingBasket, Sparkles, Store, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { InventoryItem, OverheadItem } from '../../App';
import * as rootApi from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { useT } from '../../utils/i18n';
import { getTodayIST } from '../../utils/timezone';
import { compressPhoto } from '../assets/assetsApi';
import { billLink, uploadBill } from '../money/paperworkApi';
import { useShell } from '../shell/ShellContext';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SegmentedControl } from '../ui/segmented-control';
import { NativeSelect } from '../ui/select';
import { StatusChip, type StatusTone } from '../ui/status-chip';
import { Textarea } from '../ui/textarea';
import { cn } from '../ui/utils';
import { CATEGORY_OPTIONS, ItemPicker, UNITS, categoryLabel, itemKey, usualBuys, useSupplyCandidates, type ItemPick, type Usual } from './supplyItems';
import * as api from './suppliesApi';
import { VendorManager, VendorOrders, VendorsModal, useVendors, vendorFor, vendorProgress } from './Vendors';
import { PACK_UNITS, SIZE_UNITS, baseQty, normIssue, qtyLabel, unitWord } from './quantityNorms';

const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const istDateOf = (iso: string) => new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const STATUS: Record<api.ShoppingList['status'], { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' }, sent: { label: 'Sent', tone: 'info' }, shopping: { label: 'Shopping', tone: 'warning' },
  bought: { label: 'Set prices', tone: 'warning' }, logged: { label: 'In the expenses', tone: 'success' }, cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function ShoppingCard() {
  const [data, setData] = useState<api.Lists | null>(null);
  const [editing, setEditing] = useState<api.ShoppingList | 'new' | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [pricing, setPricing] = useState<string | null>(null);
  const [vendorsOpen, setVendorsOpen] = useState(false);
  const load = useCallback(() => { api.listShopping().then(setData).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const lists = data.lists;
  const byId = (id: string | null) => lists.find((l) => l.id === id) || null;
  const replace = (l: api.ShoppingList) => setData((d) => d && { ...d, lists: d.lists.map((x) => (x.id === l.id ? l : x)) });

  return (
    <>
      {data.canManage ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-body-md font-semibold text-text"><ShoppingBasket className="size-5 text-primary" aria-hidden="true" /> Shopping</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" leadingIcon={<Store />} onClick={() => setVendorsOpen(true)}>Vendors</Button>
              <Button size="sm" leadingIcon={<Plus />} onClick={() => setEditing('new')}>New list</Button>
            </div>
          </div>
          {lists.length > 0 && (
            <ListGroup>
              {lists.slice(0, 6).map((l) => (
                <ListRow key={l.id} title={`${dayLabel(l.date)} · ${l.assigneeName}`}
                  subtitle={leadSubtitle(l)}
                  trailing={<StatusChip tone={STATUS[l.status].tone} size="sm">{STATUS[l.status].label}</StatusChip>}
                  onClick={() => (l.status === 'draft' || l.status === 'sent' ? setEditing(l) : l.status === 'shopping' ? setRunning(l.id) : setPricing(l.id))} />
              ))}
            </ListGroup>
          )}
        </section>
      ) : (
        lists.filter((l) => l.status !== 'logged').map((l) => <ShopperCard key={l.id} list={l} onOpen={() => setRunning(l.id)} />)
      )}
      {editing && <ListEditor data={data} list={editing === 'new' ? null : editing} onClose={() => { setEditing(null); load(); }} onSaved={load} />}
      {vendorsOpen && <VendorsModal onClose={() => setVendorsOpen(false)} />}
      {running && byId(running) && <RunSheet list={byId(running)!} onChange={replace} onClose={() => { setRunning(null); load(); }} />}
      {pricing && byId(pricing) && <PricingSheet list={byId(pricing)!} onChange={replace} onClose={() => { setPricing(null); load(); }} />}
    </>
  );
}

function leadSubtitle(l: api.ShoppingList) {
  const p = l.progress;
  const v = vendorProgress(l);
  const vendors = v.total ? ` · vendors ${v.sent} of ${v.total} sent` : '';
  if (l.status === 'draft') return `${p.total} items · not sent yet${vendors}`;
  if (l.status === 'sent') return (l.notifyAt && !l.notifiedAt ? `${p.total} items · reaches ${l.assigneeName} at ${timeOf(l.notifyAt)}` : `${p.total} items · sent ${l.sentAt ? timeOf(l.sentAt) : ''}`) + vendors;
  if (l.status === 'shopping') return `${p.got + p.missing} of ${p.total} marked`;
  if (l.status === 'bought') return `Got ${p.got} of ${p.total}${p.missing ? ` · ${p.missing} not found` : ''} · ${p.toLog} to price`;
  return `${p.got} items in the expenses${p.missing ? ` · ${p.missing} not found` : ''}`;
}

// ---------------- The shopper ----------------

function ShopperCard({ list, onOpen }: { list: api.ShoppingList; onOpen: () => void }) {
  const { t } = useT();
  const p = list.progress;
  const waiting = list.status === 'bought';
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <ShoppingBasket className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex min-w-0 flex-col">
            <span className="text-body-md font-semibold text-text">{t('shop.title')}</span>
            <span className="text-label text-text-3">{t('shop.forDate', { date: dayLabel(list.date), name: list.createdByName })}</span>
          </div>
        </div>
        {waiting && <StatusChip tone="info" size="sm">{t('shop.waitingPrices')}</StatusChip>}
      </div>
      {!waiting && (
        <>
          <p className="num text-body-sm text-text-2">{t('shop.progress', { done: p.got + p.missing, total: p.total })}</p>
          <Button onClick={onOpen}>{t('shop.start')}</Button>
        </>
      )}
    </section>
  );
}

function RunSheet({ list, onChange, onClose }: { list: api.ShoppingList; onChange: (l: api.ShoppingList) => void; onClose: () => void }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // By place, then by vendor (each vendor's items together, then what is bought at the shops).
  const groups = useMemo(() => {
    const places = new Set(list.lines.map((l) => l.placeName || l.placeId));
    const anyVendor = list.lines.some((l) => l.vendorName);
    const m = new Map<string, { title: string | null; lines: api.ShoppingLine[] }>();
    const sorted = [...list.lines].sort((a, b) => Number(!a.vendorName) - Number(!b.vendorName) || (a.vendorName || '').localeCompare(b.vendorName || ''));
    for (const l of sorted) {
      const place = l.placeName || l.placeId;
      const key = `${place}|${l.vendorName || ''}`;
      const parts = [anyVendor ? (l.vendorName ? t('shop.fromVendor', { name: l.vendorName }) : t('shop.otherShops')) : null, places.size > 1 ? t('shop.placeFor', { place }) : null].filter(Boolean);
      const g = m.get(key) || { title: parts.length ? parts.join(' · ') : null, lines: [] };
      g.lines.push(l);
      m.set(key, g);
    }
    return [...m.entries()];
  }, [list.lines, t]);
  const act = async (key: string, fn: () => Promise<api.ShoppingList>) => {
    setBusy(key);
    try { onChange(await fn()); } catch (e) { toast.error((e as Error).message || t('shop.failed')); } finally { setBusy(null); }
  };
  const bill = async (file: File) => act('bill', async () => api.addBill(list.id, await uploadBill(await compressPhoto(file))));
  const finish = async () => {
    setBusy('done');
    try { onChange(await api.finishShopping(list.id)); toast.success(t('shop.finished', { name: list.createdByName })); setOpen(false); } catch (e) { toast.error((e as Error).message || t('shop.failed')); } finally { setBusy(null); }
  };
  const left = list.progress.left;
  const done = list.status === 'bought' || list.status === 'logged';
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} size="detail" title={t('shop.title')}
      description={t('shop.forDate', { date: dayLabel(list.date), name: list.createdByName })}
      footer={done ? undefined : (
        <Button size="lg" className="flex-1" disabled={left > 0} loading={busy === 'done'} onClick={finish}>{left > 0 ? t('shop.left', { n: left }) : t('shop.finish')}</Button>
      )}>
      <div className="flex flex-col gap-4">
        {list.note && <Callout tone="neutral" title={t('shop.note', { name: list.createdByName })}>{list.note}</Callout>}
        {groups.map(([key, { title, lines }]) => (
          <section key={key} className="flex flex-col gap-2">
            {title && <p className="overline-label mx-1">{title}</p>}
            {lines.map((l) => (
              <ShopLine key={l.id} line={l} lang={lang} disabled={done} busy={busy === l.id}
                onGot={(qty) => act(l.id, () => api.markGot(list.id, l.id, { qty }))}
                onMissing={() => act(l.id, () => api.markGot(list.id, l.id, { missing: true }))}
                onClear={() => act(l.id, () => api.markGot(list.id, l.id, { qty: null, missing: false }))} />
            ))}
          </section>
        ))}
        {!done && (
          <section className="flex flex-col gap-2">
            <p className="overline-label mx-1">{t('shop.bill')}</p>
            <div className="flex flex-wrap items-center gap-2">
              {(list.bills || []).map((b) => <BillThumb key={b.path} path={b.path} />)}
              {(list.bills || []).length < 6 && (
                <Button variant="secondary" size="sm" leadingIcon={<Camera />} loading={busy === 'bill'} onClick={() => photoInput.current?.click()}>{t('shop.bill')}</Button>
              )}
            </div>
            <input ref={photoInput} type="file" accept="image/*" capture="environment" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void bill(f); }} />
          </section>
        )}
      </div>
    </ResponsiveModal>
  );
}

function ShopLine({ line, lang, disabled, busy, onGot, onMissing, onClear }: {
  line: api.ShoppingLine; lang: string; disabled: boolean; busy: boolean; onGot: (qty: number) => void; onMissing: () => void; onClear: () => void;
}) {
  const { t } = useT();
  const got = !!line.got && line.got.qty > 0;
  const [qty, setQty] = useState(String(line.got?.qty ?? line.qty ?? ''));
  useEffect(() => { setQty(String(line.got?.qty ?? line.qty ?? '')); }, [line.got?.qty, line.qty]);
  const name = lang === 'bn' && line.itemBn ? line.itemBn : line.item;
  const sub = lang === 'bn' && line.itemBn ? line.item : line.itemBn;
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border bg-surface p-3', got ? 'border-success-border' : line.missing ? 'border-border opacity-80' : 'border-border')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className={cn('text-body-md font-medium text-text', line.missing && 'line-through')}>{name}</span>
          {sub && <span className="text-label text-text-3">{sub}</span>}
          {line.note && <span className="text-label text-text-2">&ldquo;{line.note}&rdquo;</span>}
        </div>
        <span className="num shrink-0 text-right text-body-sm font-semibold text-text">{qtyLabel(line)}</span>
      </div>
      {got ? (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
          <Input type="number" inputMode="decimal" className="num w-24" value={qty} disabled={disabled} aria-label={t('shop.gotQty')}
            onChange={(e) => setQty(e.target.value)} onBlur={() => { const n = Number(qty); if (n > 0 && n !== line.got?.qty) onGot(n); }} />
          <span className="text-body-sm text-text-2">{unitWord(line.unit, Number(qty) || 0)}</span>
          {!disabled && <Button size="sm" variant="ghost" className="ml-auto" loading={busy} onClick={onClear}>{t('shop.undo')}</Button>}
        </div>
      ) : line.missing ? (
        <div className="flex items-center justify-between gap-2">
          <StatusChip tone="neutral" size="sm" icon={XCircle}>{t('shop.missing')}</StatusChip>
          {!disabled && <Button size="sm" variant="ghost" loading={busy} onClick={onClear}>{t('shop.undo')}</Button>}
        </div>
      ) : !disabled && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" leadingIcon={<CheckCircle2 />} loading={busy} onClick={() => onGot(line.qty || 1)}>{t('shop.got')}</Button>
          <Button size="sm" variant="secondary" leadingIcon={<XCircle />} disabled={busy} onClick={onMissing}>{t('shop.missing')}</Button>
        </div>
      )}
    </div>
  );
}

function BillThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { billLink(path).then(setUrl).catch(() => undefined); }, [path]);
  if (!url) return <span className="size-16 rounded-md border border-border bg-surface-2" aria-hidden="true" />;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Bill" className="size-16 rounded-md border border-border object-cover" /></a>;
}

// ---------------- The owner and operations: writing a list ----------------

type DraftLine = api.LineDraft & { key: string };
let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

// Steps: the list itself; after sending, each vendor's part on WhatsApp; the vendors themselves.
function ListEditor({ data, list, onClose, onSaved }: { data: api.Lists; list: api.ShoppingList | null; onClose: () => void; onSaved: () => void }) {
  const { context } = useShell();
  const candidates = useSupplyCandidates();
  const { vendors, specs, reload: reloadVendors } = useVendors();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState<'list' | 'orders' | 'vendors'>('list');
  const [saved, setSaved] = useState<api.ShoppingList | null>(list);
  const today = data.today || getTodayIST();
  const places = data.places || [];
  const people = data.people || [];
  const lastAssignee = data.lists.find((l) => l.assigneeId)?.assigneeId;
  const [date, setDate] = useState(list?.date || addDays(today, 1));
  const [assigneeId, setAssigneeId] = useState(list?.assigneeId || lastAssignee || people[0]?.id || '');
  const [note, setNote] = useState(list?.note || '');
  const [lines, setLines] = useState<DraftLine[]>(() => (list?.lines || []).map((l) => ({ ...l, key: nextKey() })));
  const [alerts, setAlerts] = useState<api.SupplyAlert[]>([]);
  const [saving, setSaving] = useState<'draft' | 'send' | 'cancel' | null>(null);
  const [check, setCheck] = useState<CheckState | null>(null);
  const [checking, setChecking] = useState(false);
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set());
  const [review, setReview] = useState(false);
  useEffect(() => { api.listAlerts().then((r) => setAlerts(r.alerts.filter((a) => a.status === 'open'))).catch(() => undefined); }, []);
  // Lines added before the vendors arrived (and lists from before vendors) get their usual vendor.
  useEffect(() => {
    if (vendors.length) setLines((ls) => (ls.some((l) => l.vendorId === undefined) ? ls.map((l) => (l.vendorId === undefined ? { ...l, vendorId: vendorFor(vendors, l.item) } : l)) : ls));
  }, [vendors]);

  const usual = useMemo(() => usualBuys(context.inventory || [], context.overheads || [], addDays(today, -30)), [context.inventory, context.overheads, today]);
  const onList = new Set(lines.map((l) => `${l.placeKind}:${l.placeId}:${itemKey(l.item)}`));
  const flagged = alerts.filter((a) => !onList.has(`${a.placeKind}:${a.placeId}:${itemKey(a.item)}`));
  const usualLeft = usual.filter((u) => !onList.has(`${u.placeKind}:${u.placeId}:${itemKey(u.item)}`)).slice(0, 16);
  const firstPlace = (kind: api.PlaceKind) => places.find((p) => p.kind === kind) || places[0];
  // How the item was last written on a list wins over the last expense (which may be in pieces).
  const specFor = (item: string) => Object.values(specs).find((s) => itemKey(s.item) === itemKey(item));
  const amountFor = (item: string, u?: Usual) => {
    const s = specFor(item);
    if (s) return { qty: s.qty, unit: s.unit, packSize: s.packSize ?? null, packUnit: s.packUnit ?? null };
    return { qty: u?.qty || 1, unit: u?.unit && UNITS.includes(u.unit) ? u.unit : 'pcs', packSize: null, packUnit: null };
  };
  const defaultsFor = (p: ItemPick): DraftLine => {
    const u = usual.find((x) => itemKey(x.item) === itemKey(p.item));
    const place = u ? { kind: u.placeKind, id: u.placeId } : firstPlace(p.entity === 'store' ? 'store' : 'production');
    return {
      key: nextKey(), item: p.item, itemBn: p.itemBn, entryType: p.entryType || u?.entryType || 'inventory', category: p.category || u?.category || '',
      ...amountFor(p.item, u), placeKind: place?.kind || 'production', placeId: place?.id || '',
      vendorId: vendors.length ? vendorFor(vendors, p.item) : undefined,
    };
  };
  const addUsual = (u: Usual) => setLines((ls) => [...ls, {
    key: nextKey(), item: u.item, entryType: u.entryType, category: u.category, ...amountFor(u.item, u), placeKind: u.placeKind, placeId: u.placeId,
    itemBn: candidates.find((c) => itemKey(c.label) === itemKey(u.item))?.bengali, vendorId: vendors.length ? vendorFor(vendors, u.item) : undefined,
  }]);
  const addAlert = (a: api.SupplyAlert) => {
    const base = defaultsFor({ item: a.item, itemBn: a.itemBn, entryType: a.entryType, category: a.category });
    const fromFlag = a.qty && a.unit && UNITS.includes(a.unit) ? { qty: a.qty, unit: a.unit, packSize: null, packUnit: null } : {};
    setLines((ls) => [...ls, { ...base, ...fromFlag, placeKind: a.placeKind, placeId: a.placeId, alertIds: [a.id], note: a.note }]);
  };
  const patch = (key: string, p: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const assignee = people.find((p) => p.id === assigneeId);
  const kindOf = (l: DraftLine) => vendors.find((v) => v.id === l.vendorId)?.kind ?? null;
  // A line's problem: Bunny's (with a fix) while the line is as Bunny saw it, else the rules'. "Keep as is" hides it until the line changes.
  const issueOf = (l: DraftLine, c: CheckState | null): Issue | null => {
    const sig = lineSig(l);
    if (accepted.has(`${l.key}|${sig}`)) return null;
    const fromAi = c?.issues[l.key];
    if (fromAi && fromAi.sig === sig) return { problem: fromAi.problem, fix: fromAi.fix, byBunny: true };
    const rule = normIssue(l, kindOf(l));
    return rule ? { problem: rule, fix: null, byBunny: false } : null;
  };
  const listSig = lines.map((l) => `${l.key}|${lineSig(l)}`).join(';');
  const openIssues = lines.filter((l) => issueOf(l, check));
  // Bunny reads the list (item, amount, vendor type, how it was bought last time). If it can't
  // (no key, monthly cap), the rules alone decide.
  const runCheck = async (): Promise<CheckState> => {
    setChecking(true);
    try {
      const sent = lines.map((l) => {
        const u = usual.find((x) => itemKey(x.item) === itemKey(l.item));
        return {
          key: l.key, item: l.item, amount: qtyLabel(l) || 'not given', vendorKind: kindOf(l),
          before: u ? `${u.qty} ${u.unit}${u.costPerUnit ? ` at Rs ${u.costPerUnit}/${u.unit}` : ''} on ${u.lastDate}` : undefined,
        };
      });
      const issues = await api.checkList(sent);
      const byKey: CheckState['issues'] = {};
      for (const i of issues) { const l = lines.find((x) => x.key === i.key); if (l) byKey[i.key] = { problem: i.problem, fix: i.fix, sig: lineSig(l) }; }
      const next = { sig: listSig, issues: byKey };
      setCheck(next);
      return next;
    } catch (e) {
      toast.message(`Bunny could not check the list: ${(e as Error).message || 'try again'}`);
      const next = { sig: listSig, issues: {} };
      setCheck(next);
      return next;
    } finally {
      setChecking(false);
    }
  };
  const applyFix = (l: DraftLine, f: api.QtyFix) => patch(l.key, { qty: f.qty, unit: f.unit, packSize: f.packSize ?? null, packUnit: f.packUnit ?? null });
  const keepAsIs = (l: DraftLine) => setAccepted((s) => new Set(s).add(`${l.key}|${lineSig(l)}`));

  const save = async (mode: 'draft' | 'send', anyway = false) => {
    if (!lines.length) { toast.error('Add at least one item'); return; }
    const noCat = lines.find((l) => !l.category);
    if (noCat) { toast.error(`Pick what kind of expense ${noCat.item} is`); return; }
    // Before it goes out: every amount clear (or sent anyway).
    if (mode === 'send' && !anyway) {
      const c = check && check.sig === listSig ? check : await runCheck();
      const n = lines.filter((l) => issueOf(l, c)).length;
      if (n) { setReview(true); toast.error(`${n} line${n === 1 ? '' : 's'} to make clearer first`); return; }
    }
    setSaving(mode);
    try {
      const body = { date, assigneeId, note: note.trim(), lines: lines.map(({ key: _k, ...l }) => ({ ...l, vendorId: l.vendorId ?? null })), send: mode === 'send' };
      const next = saved ? await api.updateList(saved.id, body) : await api.createList(body);
      setSaved(next);
      toast.success(mode === 'send' ? `Sent to ${assignee?.name || 'them'}` : 'Saved');
      onSaved();
      // Sent: now each vendor's part. A draft just closes.
      if (mode === 'send' && vendorProgress(next).total > 0) setStep('orders');
      else setOpen(false);
    } catch (e) {
      toast.error((e as Error).message || 'Could not save the list');
    } finally {
      setSaving(null);
    }
  };
  const cancel = async () => {
    if (!saved) return;
    setSaving('cancel');
    try { await api.cancelList(saved.id); toast.success('List cancelled'); setOpen(false); onSaved(); } catch (e) { toast.error((e as Error).message || 'Could not cancel'); } finally { setSaving(null); }
  };
  // WhatsApp opened for a vendor: kept on the list (the message itself goes from the phone).
  const vendorSent = (vendorId: string, sig: string) => {
    if (!saved) return;
    api.vendorSent(saved.id, vendorId, sig).then((l) => { setSaved(l); onSaved(); }).catch(() => undefined);
  };
  const sent = saved?.status === 'sent';
  const rest = lines.filter((l) => !l.vendorId);

  if (step === 'orders' && saved) {
    return (
      <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} size="detail"
        title="Order from vendors" description="Each button opens WhatsApp with that vendor's part. Check it and press send."
        footer={<Button size="lg" className="flex-1" onClick={() => setOpen(false)}>Done</Button>}>
        <div className="flex flex-col gap-4">
          <VendorOrders date={saved.date} lines={saved.lines} vendors={vendors} sent={saved.vendorOrders} onSent={vendorSent} from={saved.createdByName} collectedBy={saved.assigneeName} />
          {rest.length > 0 && (
            <Callout tone="neutral" icon={ShoppingBasket} title={`${saved.assigneeName} buys the rest at the shops`}>{rest.map((l) => l.item).join(', ')}</Callout>
          )}
        </div>
      </ResponsiveModal>
    );
  }
  if (step === 'vendors') {
    return (
      <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} size="detail" dirty={lines.length > 0}
        title="Vendors" description="Who gets their part of the shopping list on WhatsApp."
        footer={<Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep('list')}>Back to the list</Button>}>
        <VendorManager vendors={vendors} onChanged={reloadVendors} />
      </ResponsiveModal>
    );
  }

  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} size="detail" dirty={lines.length > 0}
      title={saved ? `Shopping list · ${dayLabel(saved.date)}` : 'New shopping list'}
      description="The same names as the expenses, so the prices go straight in afterwards."
      footer={(
        <>
          {!sent && <Button variant="secondary" size="lg" loading={saving === 'draft'} onClick={() => save('draft')}>Save draft</Button>}
          <Button size="lg" className="flex-1" loading={saving === 'send' || checking} onClick={() => save('send')}>
            {checking ? 'Bunny is checking…' : sent && saved?.assigneeId === assigneeId ? 'Save changes' : `Send to ${assignee?.name.split(' ')[0] || 'them'}`}
          </Button>
        </>
      )}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="For"><Input type="date" className="num" value={date} min={today} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Who shops">
            <NativeSelect value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </Field>
        </div>
        {sent && saved?.notifyAt && !saved.notifiedAt && <Callout tone="info" title={`Reaches ${saved.assigneeName} at ${timeOf(saved.notifyAt)}`}>Held until their quiet hours end.</Callout>}

        {flagged.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="overline-label">Flagged as running low</p>
            <div className="flex flex-wrap gap-2">
              {flagged.map((a) => (
                <AddChip key={a.id} tone={a.level === 'out' ? 'danger' : 'warning'} onClick={() => addAlert(a)}
                  label={`${a.item}${a.qty ? ` ${a.qty} ${a.unit || ''}` : ''}`} hint={`${a.placeName} · ${a.raisedBy[0]?.name || ''}`} />
              ))}
            </div>
          </section>
        )}
        {usualLeft.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="overline-label">Usual buys (last 30 days)</p>
            <div className="flex flex-wrap gap-2">
              {usualLeft.map((u) => (
                <AddChip key={`${u.placeKind}:${u.placeId}:${u.item}`} onClick={() => addUsual(u)} label={u.item}
                  hint={u.placeKind === 'store' ? places.find((p) => p.id === u.placeId)?.name : undefined} />
              ))}
            </div>
          </section>
        )}
        <Field label="Add an item">
          <ItemPicker candidates={candidates} clearOnPick placeholder="Type an item: onion, KOT rolls…" onPick={(p) => p.item && setLines((ls) => [...ls, defaultsFor(p)])} />
        </Field>

        {lines.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="overline-label">On the list · {lines.length}</p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" leadingIcon={<Sparkles />} loading={checking} onClick={() => { setReview(true); void runCheck(); }}>Check</Button>
                <Button size="sm" variant="ghost" leadingIcon={<Store />} onClick={() => setStep('vendors')}>Vendors</Button>
              </div>
            </div>
            {review && !checking && (openIssues.length > 0 ? (
              <Callout tone="warning" icon={AlertTriangle} title={`${openIssues.length} line${openIssues.length === 1 ? '' : 's'} to make clearer`}
                action={<Button size="sm" variant="secondary" loading={saving === 'send'} onClick={() => save('send', true)}>Send as it is</Button>}>
                Packs need how many and the size of each; vegetables go by weight; coriander and pudina by the bundle.
              </Callout>
            ) : check && check.sig === listSig ? (
              <Callout tone="success" icon={CheckCircle2} title="Every amount is clear">Bunny checked the list.</Callout>
            ) : null)}
            {lines.map((l) => (
              <div key={l.key} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-body-sm font-medium text-text">{l.item}{l.itemBn ? <span className="font-normal text-text-3"> · {l.itemBn}</span> : null}</span>
                    {l.alertIds?.length ? <span className="text-label text-warning">Flagged as running low{l.note ? `: “${l.note}”` : ''}</span> : null}
                  </div>
                  <IconButton variant="ghost" size="sm" icon={<Trash2 />} label={`Remove ${l.item}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
                </div>
                <div className="grid grid-cols-[4.5rem_6.5rem_1fr] gap-2">
                  <Input type="number" inputMode="decimal" className="num" value={String(l.qty || '')} aria-label={`How much ${l.item}`} onChange={(e) => patch(l.key, { qty: Number(e.target.value) || 0 })} />
                  <NativeSelect value={l.unit} aria-label="Unit" onChange={(e) => patch(l.key, PACK_UNITS.has(e.target.value) ? { unit: e.target.value } : { unit: e.target.value, packSize: null, packUnit: null })}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </NativeSelect>
                  <NativeSelect value={`${l.placeKind}:${l.placeId}`} aria-label="For" onChange={(e) => { const [k, id] = e.target.value.split(':'); patch(l.key, { placeKind: k as api.PlaceKind, placeId: id }); }}>
                    {places.map((p) => <option key={`${p.kind}:${p.id}`} value={`${p.kind}:${p.id}`}>{p.name}</option>)}
                  </NativeSelect>
                </div>
                {PACK_UNITS.has(l.unit) && (
                  <div className="grid grid-cols-[auto_4.5rem_5.5rem] items-center gap-2">
                    <span className="text-body-sm text-text-2">each {l.unit} is</span>
                    <Input type="number" inputMode="decimal" className="num" value={String(l.packSize || '')} placeholder="1" aria-label={`Size of each ${l.unit} of ${l.item}`}
                      onChange={(e) => patch(l.key, { packSize: Number(e.target.value) || null, packUnit: l.packUnit || (/oil|sauce|vinegar/i.test(l.item) ? 'L' : 'g') })} />
                    <NativeSelect value={l.packUnit || ''} aria-label="Size unit" onChange={(e) => patch(l.key, { packUnit: e.target.value || null })}>
                      <option value="" disabled>unit</option>
                      {SIZE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </NativeSelect>
                  </div>
                )}
                <LineIssue issue={issueOf(l, check)} onFix={(f) => applyFix(l, f)} onKeep={() => keepAsIs(l)} />
                {vendors.length > 0 && (
                  <NativeSelect value={l.vendorId || ''} aria-label={`Who ${l.item} comes from`} onChange={(e) => patch(l.key, { vendorId: e.target.value || null })}>
                    <option value="">Bought at a shop (no vendor)</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>From {v.name}</option>)}
                  </NativeSelect>
                )}
                {!l.category ? (
                  <NativeSelect value="" aria-label={`What kind of expense ${l.item} is`} onChange={(e) => { const o = CATEGORY_OPTIONS.find((x) => x.value === e.target.value); if (o) patch(l.key, { entryType: o.entryType, category: o.value.split(':')[1] }); }}>
                    <option value="" disabled>New item: pick what kind of expense</option>
                    {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </NativeSelect>
                ) : (
                  <span className="text-label text-text-3">{categoryLabel(l.entryType, l.category)}</span>
                )}
              </div>
            ))}
          </section>
        )}
        <Field label="Note" optional>
          <Textarea rows={2} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Get the chicken from the usual shop" />
        </Field>
        {saved && vendorProgress({ lines, vendorOrders: saved.vendorOrders }).total > 0 && (
          <section className="flex flex-col gap-2">
            <p className="overline-label">Order from vendors</p>
            <VendorOrders compact date={date} lines={lines} vendors={vendors} sent={saved.vendorOrders} onSent={vendorSent} from={saved.createdByName} collectedBy={assignee?.name} />
          </section>
        )}
        {saved && <Button variant="danger-ghost" leadingIcon={<XCircle />} loading={saving === 'cancel'} onClick={cancel}>Cancel this list</Button>}
      </div>
    </ResponsiveModal>
  );
}

type Issue = { problem: string; fix: api.QtyFix | null; byBunny: boolean };
type CheckState = { sig: string; issues: Record<string, { problem: string; fix: api.QtyFix | null; sig: string }> };
// What a line asks for, to tell whether it changed after Bunny looked.
const lineSig = (l: DraftLine) => `${itemKey(l.item)}|${qtyLabel(l)}|${l.vendorId || ''}`;

function LineIssue({ issue, onFix, onKeep }: { issue: Issue | null; onFix: (f: api.QtyFix) => void; onKeep: () => void }) {
  if (!issue) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-warning-soft px-2.5 py-2">
      <p className="flex items-start gap-1.5 text-label text-text">
        {issue.byBunny ? <Sparkles className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />}
        <span>{issue.problem}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {issue.fix && <Button size="sm" variant="secondary" onClick={() => onFix(issue.fix!)}>Use {qtyLabel({ item: '', ...issue.fix })}</Button>}
        <Button size="sm" variant="ghost" onClick={onKeep}>Keep as is</Button>
      </div>
    </div>
  );
}

function AddChip({ label, hint, tone, onClick }: { label: string; hint?: string; tone?: 'warning' | 'danger'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('hit-44 inline-flex h-9 items-center gap-1.5 rounded-full border bg-surface px-3 text-label font-medium text-text hover:bg-surface-2',
        tone === 'danger' ? 'border-danger-border' : tone === 'warning' ? 'border-warning-border' : 'border-border')}>
      <Plus className="size-3.5 text-text-3" aria-hidden="true" />
      {label}
      {hint && <span className="font-normal text-text-3">· {hint}</span>}
    </button>
  );
}

// ---------------- The owner and operations: prices ----------------

type PriceRow = { qty: string; price: string; skip: boolean };

function PricingSheet({ list, onChange, onClose }: { list: api.ShoppingList; onChange: (l: api.ShoppingList) => void; onClose: () => void }) {
  const { context } = useShell();
  const [open, setOpen] = useState(true);
  const [date, setDate] = useState(list.boughtAt ? istDateOf(list.boughtAt) : list.date);
  const [paid, setPaid] = useState<'cash' | 'online'>('cash');
  const [saving, setSaving] = useState(false);
  const toLog = list.lines.filter((l) => l.got && l.got.qty > 0 && !l.logged && !l.skipped);
  const logged = list.lines.filter((l) => l.logged);
  const missing = list.lines.filter((l) => l.missing);
  const [rows, setRows] = useState<Record<string, PriceRow>>(() => Object.fromEntries(toLog.map((l) => [l.id, { qty: String(l.got?.qty ?? l.qty), price: '', skip: false }])));
  const usual = useMemo(() => usualBuys(context.inventory || [], context.overheads || [], addDays(getTodayIST(), -90)), [context.inventory, context.overheads]);
  const lastFor = (l: api.ShoppingLine) => usual.find((u) => itemKey(u.item) === itemKey(l.item) && u.placeKind === l.placeKind && u.placeId === l.placeId) || usual.find((u) => itemKey(u.item) === itemKey(l.item));
  const set = (id: string, p: Partial<PriceRow>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...p } }));
  const total = toLog.reduce((s, l) => s + (rows[l.id]?.skip ? 0 : Number(rows[l.id]?.price) || 0), 0);
  const done = list.status === 'logged';

  const save = async () => {
    for (const l of toLog) {
      const r = rows[l.id];
      if (r.skip) continue;
      if (!(Number(r.qty) > 0)) { toast.error(`Write how much ${l.item} was bought`); return; }
      if (!(Number(r.price) > 0)) { toast.error(`Write the price for ${l.item}`); return; }
    }
    setSaving(true);
    let current = list;
    try {
      const token = await currentAccessToken();
      const bill = list.bills?.[0]?.path;
      for (const l of toLog) {
        const r = rows[l.id];
        if (r.skip) { current = await api.markLogged(list.id, l.id, { skip: true }); continue; }
        const qty = Number(r.qty); const amount = Math.round(Number(r.price) * 100) / 100;
        const base = baseQty(l, qty); // packs as the weight or volume they come to
        const place = l.placeKind === 'production' ? { entityType: 'production_house' as const, productionHouseId: l.placeId } : { entityType: 'store' as const, storeId: l.placeId };
        const pay = paid === 'online' ? { paymentMethod: 'online' as const, cashAmount: 0, onlineAmount: amount } : { paymentMethod: 'cash' as const, cashAmount: amount, onlineAmount: 0 };
        // Which list it came from and who bought it stay on the expense.
        const from = { shoppingListId: list.id, boughtByName: list.assigneeName, ...(bill ? { billPhotoPath: bill } : {}) };
        let saved: { id: string };
        if (l.entryType === 'overhead') {
          const overhead: Omit<OverheadItem, 'id'> = { date, category: l.category as OverheadItem['category'], description: `${l.item} (${qtyLabel({ ...l, qty })})`, amount, ...pay, ...place };
          saved = await rootApi.addOverhead(token, { ...overhead, ...from });
        } else {
          const purchase: Omit<InventoryItem, 'id'> = { date, category: l.category as InventoryItem['category'], itemName: l.item, quantity: base.qty, unit: base.unit, costPerUnit: Math.round((amount / base.qty) * 100) / 100, totalCost: amount, ...pay, ...place };
          saved = await rootApi.addInventory(token, { ...purchase, ...from });
        }
        current = await api.markLogged(list.id, l.id, { kind: l.entryType, recordId: saved.id, qty });
      }
      onChange(current);
      toast.success('Saved to the expenses');
      void context.refreshData();
      setOpen(false);
    } catch (e) {
      // What was saved stays saved and marked; opening the list again shows only what is left.
      onChange(current);
      toast.error((e as Error).message || 'Could not save - try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} size="detail" dirty={!done && Object.values(rows).some((r) => r.price)}
      title={`Set prices · ${dayLabel(list.date)}`}
      description={`Bought by ${list.assigneeName}${list.boughtAt ? ` · ${timeOf(list.boughtAt)}` : ''}. Fix the quantities if needed and write what each cost.`}
      footer={done || !toLog.length ? undefined : (
        <Button size="lg" className="flex-1" loading={saving} onClick={save}>{`Save to expenses${total ? ` · ${inr(total)}` : ''}`}</Button>
      )}>
      <div className="flex flex-col gap-4" data-ai-private>
        {(list.bills || []).length > 0 && (
          <div className="flex flex-wrap gap-2">{(list.bills || []).map((b) => <BillThumb key={b.path} path={b.path} />)}</div>
        )}
        {!done && toLog.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bought on"><Input type="date" className="num" value={date} max={getTodayIST()} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Paid">
              <SegmentedControl aria-label="Paid" value={paid} onValueChange={(v) => setPaid(v as 'cash' | 'online')} options={[{ value: 'cash', label: 'Cash' }, { value: 'online', label: 'Online' }]} />
            </Field>
          </div>
        )}
        {toLog.map((l) => {
          const r = rows[l.id];
          const last = lastFor(l);
          const base = baseQty(l, Number(r.qty) || 0);
          const est = last?.costPerUnit && last.unit === base.unit ? Math.round(last.costPerUnit * base.qty) : null;
          return (
            <div key={l.id} className={cn('flex flex-col gap-2 rounded-lg border border-border bg-surface p-3', r.skip && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="text-body-sm font-medium text-text">{l.item}</span>
                  <span className="text-label text-text-3">{[l.placeName, categoryLabel(l.entryType, l.category), l.got && l.got.qty !== l.qty ? `asked ${qtyLabel(l)}` : null].filter(Boolean).join(' · ')}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => set(l.id, { skip: !r.skip })}>{r.skip ? 'Put back' : 'Leave out'}</Button>
              </div>
              {!r.skip && (
                <>
                  <div className="grid grid-cols-[1fr_1fr] gap-2">
                    <div className="flex items-center gap-2">
                      <Input type="number" inputMode="decimal" className="num" value={r.qty} aria-label={`How much ${l.item}`} onChange={(e) => set(l.id, { qty: e.target.value })} />
                      <span className="text-body-sm text-text-2">{unitWord(l.unit, Number(r.qty) || 0)}{l.packSize && l.packUnit ? ` × ${l.packSize} ${l.packUnit}` : ''}</span>
                    </div>
                    <Input type="number" inputMode="decimal" className="num" value={r.price} placeholder="₹ total" aria-label={`Price for ${l.item}`} onChange={(e) => set(l.id, { price: e.target.value })} />
                  </div>
                  {last && (
                    <button type="button" className="self-start text-label text-text-3 underline-offset-2 hover:underline" disabled={!est} onClick={() => est && set(l.id, { price: String(est) })}>
                      {last.costPerUnit ? `Last ₹${last.costPerUnit}/${last.unit} on ${dayLabel(last.lastDate)}` : `Last ${inr(last.lastAmount)} on ${dayLabel(last.lastDate)}`}
                      {est ? ` · use ${inr(est)}` : ''}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
        {logged.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <p className="overline-label">In the expenses</p>
            {logged.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1.5 text-body-sm text-text-2"><CheckCircle2 className="size-4 text-success" aria-hidden="true" />{l.item} · {qtyLabel({ ...l, qty: l.got?.qty || 0 })}</span>
            ))}
          </section>
        )}
        {missing.length > 0 && <Callout tone="neutral" icon={ClipboardList} title="Not found">{missing.map((l) => l.item).join(', ')}. Any running-low flags for these are open again.</Callout>}
      </div>
    </ResponsiveModal>
  );
}
