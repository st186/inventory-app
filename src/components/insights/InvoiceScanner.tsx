import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SegmentedControl } from '../ui/segmented-control';
import { Camera, ImageUp, Loader2, X, AlertTriangle, ScanText } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../utils/api';
import type { InventoryContextType } from '../../App';
import { buildExpenseCandidates, searchExpenseCandidates, type ExpenseEntryType } from '../../utils/expenseMatcher';
import { SELECTABLE_INVENTORY_CATEGORIES, OVERHEAD_CATEGORIES, SELECTABLE_OVERHEAD_CATEGORY_KEYS, SELECTABLE_FIXED_COST_CATEGORIES } from '../../utils/inventoryData';
import { getTodayIST } from '../../utils/timezone';
import { productionShouldCover } from '../../utils/cashSource';
import { useCashCover, type LoadCashCover } from '../useCashCover';
import { ProductionCashChoice } from '../ProductionCashChoice';

type Props = {
  context: InventoryContextType;
  selectedDate: string;
  defaultEntity: 'store' | 'production_house';
  storeId?: string;
  productionHouseId?: string;
  storeOptions?: { id: string; name: string }[];
  allowOwnerPayment: boolean;
  // Cluster head: a store bill the store's cash can't cover is paid from the linked production
  // house's cash instead.
  productionHouseForStore?: (storeId: string) => string | null;
  loadCashCover?: LoadCashCover;
  onClose: () => void;
};

type Line = { include: boolean; name: string; asWritten: string; kind: string; quantity: string; unit: string; amount: string; unsure: boolean };

// Phone photos are shrunk to 1600 px and re-encoded as JPEG before upload.
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open that image')); };
    img.src = url;
  });
}

const KIND_GROUPS: { type: ExpenseEntryType; label: string; options: [string, string][] }[] = [
  { type: 'inventory', label: 'Stock purchase', options: Object.entries(SELECTABLE_INVENTORY_CATEGORIES) },
  { type: 'overhead', label: 'Overhead', options: Object.entries(OVERHEAD_CATEGORIES).filter(([k]) => SELECTABLE_OVERHEAD_CATEGORY_KEYS.includes(k)) },
  { type: 'fixedcost', label: 'Fixed cost', options: Object.entries(SELECTABLE_FIXED_COST_CATEGORIES) },
];

// Photograph a purchase bill (printed or handwritten, English or Bengali): AI reads the lines,
// the person checks and corrects them, and only then are they saved as expenses.
export function InvoiceScanner({ context, selectedDate, defaultEntity, storeId, productionHouseId, storeOptions, allowOwnerPayment, productionHouseForStore, loadCashCover, onClose }: Props) {
  const [step, setStep] = useState<'pick' | 'reading' | 'review'>('pick');
  const [preview, setPreview] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<api.ScannedInvoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState(selectedDate);
  const [entity, setEntity] = useState(defaultEntity);
  const [pickedStore, setPickedStore] = useState(storeId || storeOptions?.[0]?.id || '');
  // Default: the bill's own cash (store cash for a store bill, production cash for production).
  const [paidFrom, setPaidFrom] = useState<'cash' | 'online' | 'owner'>('cash');
  const storeIdForBill = (storeOptions?.length ? pickedStore : storeId) || '';
  const productionCashHouseId = allowOwnerPayment && entity === 'store' && storeIdForBill ? productionHouseForStore?.(storeIdForBill) || null : null;
  const cashCover = useCashCover(productionCashHouseId ? loadCashCover : undefined, productionCashHouseId ? storeIdForBill : null, date);
  const [fromProductionCash, setFromProductionCash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customItems, setCustomItems] = useState<api.CustomItem[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.getCustomItems().then(setCustomItems).catch(() => {}); }, []);
  const candidates = useMemo(() => buildExpenseCandidates(customItems), [customItems]);

  const guessKind = (name: string) => {
    const best = searchExpenseCandidates(name, candidates, 1)[0];
    return best && best.score >= 0.6 ? `${best.entryType}:${best.category}` : '';
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !context.user?.accessToken) return;
    try {
      const dataUrl = await compressImage(file);
      setPreview(dataUrl);
      setStep('reading');
      const result = await api.readInvoice(context.user.accessToken, dataUrl);
      if (!result.readable || !result.items.length) {
        toast.error(result.note || 'Could not find any purchase lines in that photo');
        setStep('pick');
        return;
      }
      setInvoice(result);
      setVendor(result.vendor || '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(result.invoiceDate) && result.invoiceDate <= getTodayIST()) setDate(result.invoiceDate);
      setLines(result.items.map((it) => ({
        include: it.amount > 0,
        name: it.englishName || it.asWritten,
        asWritten: it.asWritten,
        kind: guessKind(it.englishName || it.asWritten),
        quantity: it.quantity ? String(it.quantity) : '',
        unit: it.unit || '',
        amount: it.amount ? String(it.amount) : '',
        unsure: it.unsure,
      })));
      setStep('review');
    } catch (e: any) {
      toast.error(e?.message || 'Could not read the invoice');
      setStep('pick');
    }
  };

  // Re-guess categories once the catalogue has loaded, for lines nobody has touched.
  useEffect(() => {
    if (step !== 'review' || !candidates.length) return;
    setLines((prev) => prev.map((l) => (l.kind ? l : { ...l, kind: guessKind(l.name) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, step]);

  const update = (i: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const included = lines.filter((l) => l.include);
  // Production's cash is offered (unticked) only when the store's cash can't cover the whole bill and production's can.
  const billTotal = included.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  const productionCanCover = paidFrom === 'cash' && !!productionCashHouseId && productionShouldCover(cashCover, billTotal);
  const useProductionCash = productionCanCover && fromProductionCash;
  const total = included.reduce((t, l) => t + (parseFloat(l.amount) || 0), 0);
  const mismatch = invoice?.billTotal ? Math.abs(total - invoice.billTotal) > 1 : false;

  const save = async () => {
    if (!included.length) return toast.error('Tick at least one line to save');
    const bad = included.find((l) => !l.name.trim() || !(parseFloat(l.amount) > 0) || !l.kind);
    if (bad) return toast.error(`Check "${bad.name || bad.asWritten}": it needs a name, an amount and a category`);
    if (entity === 'store' && !(storeOptions?.length ? pickedStore : storeId)) return toast.error('Pick the store this bill is for');
    setSaving(true);
    const entityFields = entity === 'production_house'
      ? { entityType: 'production_house' as const, productionHouseId }
      : { entityType: 'store' as const, storeId: (storeOptions?.length ? pickedStore : storeId) || undefined };
    const ref = { vendor: vendor.trim() || undefined, invoiceRef: invoice?.invoiceNumber || undefined };
    let saved = 0;
    try {
      for (const l of included) {
        const amount = Math.round((parseFloat(l.amount) || 0) * 100) / 100;
        const pay = paidFrom === 'online' ? { paymentMethod: 'online' as const, cashAmount: 0, onlineAmount: amount }
          : paidFrom === 'owner' ? { paymentMethod: 'owner' as const, cashAmount: 0, onlineAmount: 0 }
          : useProductionCash ? { paymentMethod: 'cash' as const, cashAmount: amount, onlineAmount: 0, paidFromProductionHouseId: productionCashHouseId }
          : { paymentMethod: 'cash' as const, cashAmount: amount, onlineAmount: 0 };
        const [type, category] = l.kind.split(':');
        if (type === 'inventory') {
          const qty = parseFloat(l.quantity) || 1;
          await context.addInventoryItem({ date, category: category as any, itemName: l.name.trim(), quantity: qty, unit: l.unit || 'pcs', costPerUnit: Math.round((amount / qty) * 100) / 100, totalCost: amount, ...pay, ...entityFields, ...ref } as any);
        } else if (type === 'overhead') {
          await context.addOverheadItem({ date, category: category as any, description: l.name.trim(), amount, ...pay, ...entityFields, ...ref } as any);
        } else {
          await context.addFixedCostItem({ date, category: category as any, description: l.name.trim(), amount, ...pay, ...entityFields } as any);
        }
        saved++;
      }
      toast.success(`${saved} expense${saved === 1 ? '' : 's'} saved from the invoice`);
      onClose();
    } catch (e: any) {
      toast.error(`${saved} saved, then one failed: ${e?.message || 'unknown error'}. Check the list before trying the rest again.`);
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full h-11 px-2.5 py-2 border border-border-strong rounded-md text-body bg-surface text-text';

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Scan an invoice"
      size="detail"
      dirty={step === 'review' && !saving}
      footer={step === 'review' ? (
        <>
          <Button variant="secondary" size="lg" onClick={() => { setStep('pick'); setInvoice(null); setLines([]); }}>Rescan</Button>
          <Button size="lg" className="flex-1" loading={saving} onClick={save}>
            {`Save ${included.length} expense${included.length === 1 ? '' : 's'}`}
          </Button>
        </>
      ) : undefined}
    >
        <div className="space-y-4">
          {step === 'pick' && (
            <>
              <p className="text-sm text-text-2">Take a clear photo of the whole bill - printed or handwritten, English or Bengali. AI reads the lines; you check every one before anything is saved.</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => cameraRef.current?.click()} className="px-4 py-6 rounded-xl border-2 border-dashed border-info-border bg-info-soft text-info font-semibold flex flex-col items-center gap-2"><Camera className="w-7 h-7" /> Take a photo</button>
                <button onClick={() => galleryRef.current?.click()} className="px-4 py-6 rounded-xl border-2 border-dashed border-border-strong text-text-2 font-semibold flex flex-col items-center gap-2"><ImageUp className="w-7 h-7" /> Choose a photo</button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </>
          )}

          {step === 'reading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              {preview && <img src={preview} alt="The invoice being read" className="max-h-48 rounded-lg border border-border" />}
              <p className="text-sm text-info inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Reading the bill...</p>
            </div>
          )}

          {step === 'review' && invoice && (
            <>
              <div className="flex gap-3 items-start">
                {preview && <img src={preview} alt="Scanned invoice" className="w-20 h-24 object-cover rounded-lg border border-border flex-shrink-0" />}
                <div className="grid grid-cols-2 gap-2 flex-1">
                  <label className="text-xs text-text-2 col-span-2 sm:col-span-1">Shop / supplier<input value={vendor} onChange={(e) => setVendor(e.target.value)} className={`${field} mt-1`} /></label>
                  <label className="text-xs text-text-2 col-span-2 sm:col-span-1">Bill date<input type="date" value={date} max={getTodayIST()} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} /></label>
                </div>
              </div>
              {invoice.note && <p className="text-xs text-warning bg-warning-soft rounded-lg px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" />{invoice.note}</p>}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <SegmentedControl
                  aria-label="Store or production"
                  className="sm:col-span-1"
                  value={entity}
                  onValueChange={setEntity}
                  options={[{ value: 'store', label: 'Store' }, { value: 'production_house', label: 'Production' }]}
                />
                {entity === 'store' && storeOptions && storeOptions.length > 1 ? (
                  <select value={pickedStore} onChange={(e) => setPickedStore(e.target.value)} className={field} aria-label="Which store">
                    {storeOptions.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                ) : <div className="hidden sm:block" />}
                <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as typeof paidFrom)} className={field} aria-label="Paid from">
                  <option value="cash">Paid from cash in hand</option>
                  <option value="online">Paid by Paytm / online</option>
                  {allowOwnerPayment && <option value="owner">Paid with my own money</option>}
                </select>
              </div>
              {productionCanCover && (
                <ProductionCashChoice checked={fromProductionCash} onChange={setFromProductionCash} amount={billTotal} cover={cashCover} />
              )}

              <ul className="space-y-2">
                {lines.map((l, i) => (
                  <li key={i} className={`rounded-xl border p-3 ${!l.include ? 'border-border bg-surface-2 opacity-70' : l.unsure ? 'border-warning-border bg-warning-soft' : 'border-border'}`}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={l.include} onChange={(e) => update(i, { include: e.target.checked })} className="w-5 h-5 mt-2" aria-label={`Save ${l.name}`} />
                      <div className="flex-1 grid grid-cols-6 gap-2">
                        <div className="col-span-6 sm:col-span-3">
                          <input value={l.name} onChange={(e) => update(i, { name: e.target.value })} className={field} aria-label="Item name" />
                          <p className="text-caption text-text-3 mt-0.5">On the bill: {l.asWritten}{l.unsure ? ' · hard to read - check it' : ''}</p>
                        </div>
                        <select value={l.kind} onChange={(e) => update(i, { kind: e.target.value })} className={`${field} col-span-6 sm:col-span-3 ${!l.kind ? 'border-warning' : ''}`} aria-label="Category">
                          <option value="">Pick a category...</option>
                          {KIND_GROUPS.map((g) => (
                            <optgroup key={g.type} label={g.label}>
                              {g.options.map(([k, label]) => <option key={k} value={`${g.type}:${k}`}>{label}</option>)}
                            </optgroup>
                          ))}
                        </select>
                        <input value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} inputMode="decimal" placeholder="Qty" className={`${field} col-span-2`} aria-label="Quantity" />
                        <input value={l.unit} onChange={(e) => update(i, { unit: e.target.value })} placeholder="Unit" className={`${field} col-span-2`} aria-label="Unit" />
                        <input value={l.amount} onChange={(e) => update(i, { amount: e.target.value })} inputMode="decimal" placeholder="₹" className={`${field} col-span-2 text-right font-semibold`} aria-label="Amount" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className={`rounded-lg px-3 py-2 text-sm flex justify-between ${mismatch ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-text'}`}>
                <span>{included.length} line{included.length === 1 ? '' : 's'} ticked{invoice.billTotal ? ` · bill total ₹${invoice.billTotal.toLocaleString('en-IN')}` : ''}</span>
                <span className="font-semibold tabular-nums">₹{total.toLocaleString('en-IN')}</span>
              </div>
              {mismatch && <p className="text-xs text-warning">The ticked lines don't add up to the bill total - check for a missed or misread line.</p>}
            </>
          )}
        </div>
    </ResponsiveModal>
  );
}
