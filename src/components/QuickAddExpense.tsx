// Add expense sheet (wireframe AddExpense): say it, Store / Production, what it was for (with
// suggestions from the item list), how much, the amount with a price check, who paid, the date;
// Save expense or Save + another. Matching, voice fill, price checks and the saved payloads are
// the same as before; saving goes through the outbox (App.tsx).
import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../utils/api';
import {
  SELECTABLE_INVENTORY_CATEGORIES,
  STORE_SELECTABLE_INVENTORY_CATEGORIES,
  OVERHEAD_CATEGORIES,
  STORE_OVERHEAD_CATEGORY_KEYS,
  RESTRICTED_OVERHEAD_CATEGORIES,
  SELECTABLE_OVERHEAD_CATEGORY_KEYS,
  SELECTABLE_FIXED_COST_CATEGORIES,
} from '../utils/inventoryData';
import {
  ExpenseCandidate,
  ExpenseEntryType,
  ExpenseSuggestion,
  buildExpenseCandidates,
  searchExpenseCandidates,
} from '../utils/expenseMatcher';
import { useCashCover, type LoadCashCover } from './useCashCover';
import { ProductionCashChoice } from './ProductionCashChoice';
import { PriceWarning } from './PriceCheck';
import { VoiceButton } from './VoiceButton';
import { AssetHint } from './assets/AssetHint';
import { idbGet, idbSet } from '../utils/idbStore';
import { useT } from '../utils/i18n';
import { formatDateIST, getTodayIST } from '../utils/timezone';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { ChoiceChips } from './ui/chip';
import { DateStrip } from './ui/date-strip';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { MoneyInput, formatINR } from './ui/money';
import { PickerField } from './ui/picker-sheet';
import { ResponsiveModal } from './ui/responsive-modal';
import { SegmentedControl } from './ui/segmented-control';
import { MoneyWaiting } from './money/DayCloseParts';
import { PaidFromField, SplitAmounts } from './money/PaidFromField';
import { categoryText, stripEmoji } from './money/categoryDisplay';
import { pricePerUnitLine } from './money/expenseHelpers';
import { checkPurchase, priceItemKey, type PriceFix, type PriceGuide } from '../utils/expenseChecks';

// The shared item catalog (same for everyone), kept on the phone for offline suggestions.
const CUSTOM_ITEMS_KEY = 'shared:custom-items';

type Props = {
  selectedDate: string;
  defaultEntity: 'store' | 'production_house';
  effectiveStoreId?: string | null;
  targetProductionHouseId?: string;
  onClose: () => void;
  onSubmitInventory: (item: any) => Promise<void>;
  onSubmitOverhead: (item: any) => Promise<void>;
  onSubmitFixedCost: (item: any) => Promise<void>;
  // Only cluster heads can add a name to the reusable catalog (see /custom-items on the
  // server). Everyone else can still log a purchase of something unrecognized, but it
  // won't be remembered - the item will show as "new" again next time until the cluster
  // head adds it properly. Surfaced explicitly (see `catalogNotice` below) so that isn't
  // a silent, confusing surprise.
  canCreateNewItems?: boolean;
  // Cluster head only - unlocks RESTRICTED_OVERHEAD_CATEGORIES (fuel), which is otherwise
  // hidden from search and the manual category list (the server rejects it too).
  canUseRestrictedCategories?: boolean;
  // Cluster head: choose where the money came from (own money, the entity's cash, or Paytm),
  // and which store when no single store is selected.
  ownerPaymentOption?: boolean;
  storeOptions?: { id: string; name: string }[];
  // Cluster head: the production house linked to a store, and both tills' cash for the day, so
  // a store bill the store's cash can't cover is paid from production's cash instead.
  productionHouseForStore?: (storeId: string) => string | null;
  loadCashCover?: LoadCashCover;
  // What each item usually costs and the unit it's usually bought in (utils/expenseChecks.ts).
  priceGuide?: PriceGuide;
  accessToken?: string; // for voice entry (server reads what was said)
};


export function QuickAddExpense({
  selectedDate,
  defaultEntity,
  effectiveStoreId,
  targetProductionHouseId,
  onClose,
  onSubmitInventory,
  onSubmitOverhead,
  onSubmitFixedCost,
  canCreateNewItems = true,
  canUseRestrictedCategories = false,
  ownerPaymentOption = false,
  storeOptions,
  productionHouseForStore,
  loadCashCover,
  priceGuide,
  accessToken,
}: Props) {
  const [amount, setAmount] = useState('');
  // Default: the expense's own cash (store cash for a store bill, production cash for production).
  const [paidFrom, setPaidFrom] = useState<'owner' | 'cash' | 'online' | 'both'>('cash');
  const [splitCash, setSplitCash] = useState('');
  const [splitOnline, setSplitOnline] = useState('');
  // The day this expense is for: the page's day unless changed here.
  const [entryDate, setEntryDate] = useState(selectedDate);
  const [keepOpen, setKeepOpen] = useState(false);
  const { t, lang } = useT();
  const [pickedStoreId, setPickedStoreId] = useState(effectiveStoreId || storeOptions?.[0]?.id || '');
  const [query, setQuery] = useState('');
  const [customItems, setCustomItems] = useState<api.CustomItem[]>([]);
  const [matched, setMatched] = useState<ExpenseSuggestion | null>(null);
  const [entity, setEntity] = useState<'store' | 'production_house'>(defaultEntity);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Beverage packaging (Coke, Water Bottle, etc.) - same carton/pieces + volume model as
  // the full InventoryForm, since "quantity" alone doesn't capture what was actually
  // bought (e.g. 2 cartons of 24 x 750mL bottles vs. 5 loose 200mL bottles).
  const [packageType, setPackageType] = useState<'carton' | 'pieces'>('pieces');
  const [cartonCount, setCartonCount] = useState('');
  const [piecesPerCarton, setPiecesPerCarton] = useState('');
  const [pieceCount, setPieceCount] = useState('');
  const [volumeMl, setVolumeMl] = useState('');
  const [volumeUnit, setVolumeUnit] = useState<'mL' | 'L'>('mL');

  // Optional weight per piece (e.g. a 200g packet of Aromatic Powder) - only offered when
  // quantity is a piece count, and only shown once someone opts in, since plenty of
  // piece-counted items (tissues, cutlery) have no meaningful weight to record.
  const [showWeightField, setShowWeightField] = useState(false);
  const [weightPerUnit, setWeightPerUnit] = useState('');
  const [weightUnit, setWeightUnit] = useState<'g' | 'kg'>('g');

  // Non-beverage bundle purchase (e.g. 1 bundle of 50 tissues, a bag of 20 foil sheets) -
  // reuses the same cartonCount/piecesPerCarton fields the beverage packaging UI already
  // uses, since it's the same "N containers x M pieces each" shape either way.
  const [isBundleMode, setIsBundleMode] = useState(false);
  const bundleTotalPieces = (parseFloat(cartonCount) || 0) * (parseFloat(piecesPerCarton) || 0);

  // New-item classify-once state (shown when nothing matched well)
  const [manualType, setManualType] = useState<ExpenseEntryType>('inventory');
  const [manualCategory, setManualCategory] = useState('');

  // The item catalog, from the copy saved on the phone first so suggestions work without signal.
  useEffect(() => {
    let fresh = false;
    idbGet<api.CustomItem[]>('cache', CUSTOM_ITEMS_KEY).then((saved) => {
      if (!fresh && Array.isArray(saved)) setCustomItems(saved);
    });
    api.getCustomItems().then((items) => {
      fresh = true;
      setCustomItems(items);
      idbSet('cache', CUSTOM_ITEMS_KEY, items);
    }).catch(() => {});
  }, []);

  const candidates: ExpenseCandidate[] = useMemo(
    () => buildExpenseCandidates(customItems).filter(
      (c) => canUseRestrictedCategories || !(c.entryType === 'overhead' && RESTRICTED_OVERHEAD_CATEGORIES.includes(c.category))
    ),
    [customItems, canUseRestrictedCategories]
  );
  const suggestions = useMemo(() => searchExpenseCandidates(query, candidates, 6), [query, candidates]);
  const bestMatch = suggestions[0];
  const hasStrongMatch = !!bestMatch && bestMatch.score >= 0.85;
  const isNewItem = query.trim().length > 0 && !hasStrongMatch && !matched;

  const manualCategoryOptions = useMemo(() => {
    if (manualType === 'inventory') {
      const list = entity === 'store' ? STORE_SELECTABLE_INVENTORY_CATEGORIES : SELECTABLE_INVENTORY_CATEGORIES;
      return Object.entries(list);
    }
    if (manualType === 'overhead') {
      const entries = Object.entries(OVERHEAD_CATEGORIES)
        .filter(([key]) => SELECTABLE_OVERHEAD_CATEGORY_KEYS.includes(key))
        .filter(([key]) => canUseRestrictedCategories || !RESTRICTED_OVERHEAD_CATEGORIES.includes(key));
      return entity === 'store' ? entries.filter(([key]) => STORE_OVERHEAD_CATEGORY_KEYS.includes(key)) : entries;
    }
    return Object.entries(SELECTABLE_FIXED_COST_CATEGORIES);
  }, [manualType, entity, canUseRestrictedCategories]);

  useEffect(() => {
    if (!manualCategory && manualCategoryOptions.length > 0) {
      setManualCategory(manualCategoryOptions[0][0]);
    }
  }, [manualCategoryOptions, manualCategory]);

  const selectSuggestion = (s: ExpenseSuggestion) => {
    setMatched(s);
    setQuery(s.label);
    // Don't touch `entity` here - it's the user's own explicit Store/Production House
    // toggle above. Silently flipping it to the item's "usual" entity (e.g. Oil is
    // normally a store item) overrode a deliberate Production House selection without
    // the user noticing, so the item saved under the wrong entity. The informational
    // "Filed under X" hint below is enough - it shouldn't also force the choice.
    // Start from the unit this item is usually bought in - always starting at "pcs" is how
    // a carrot came to be saved as "1 pcs ₹60" and a Coke crate as "1 pcs ₹470".
    if (s.entryType === 'inventory') {
      const usual = priceGuide?.usualUnit.get(priceItemKey(s.label));
      setUnit(usual && UNIT_PILLS.includes(usual) ? usual : 'pcs');
      setQuantity('1');
    }
  };

  const resetMatchIfTyping = (value: string) => {
    setQuery(value);
    if (matched && normalize(value) !== normalize(matched.label)) {
      setMatched(null);
    }
  };

  const entityFieldsFor = (targetEntity: 'store' | 'production_house') =>
    targetEntity === 'production_house'
      ? { entityType: 'production_house' as const, productionHouseId: targetProductionHouseId }
      : { entityType: 'store' as const, storeId: (storeOptions?.length ? pickedStoreId : effectiveStoreId) || undefined };

  // A store bill comes off the store's own cash. The owner gets a tick box (unticked) to take it
  // from the linked production house's cash instead - whenever the store has one, not only when
  // the store's cash falls short (owner, 27 Oct 2026; staff never see it, as before).
  const storeIdForCash = (storeOptions?.length ? pickedStoreId : effectiveStoreId) || '';
  const productionCashHouseId = ownerPaymentOption && entity === 'store' && storeIdForCash
    ? productionHouseForStore?.(storeIdForCash) || null
    : null;
  const cashCover = useCashCover(productionCashHouseId ? loadCashCover : undefined, productionCashHouseId ? storeIdForCash : null, entryDate);
  const [fromProductionCash, setFromProductionCash] = useState(false);
  const enteredAmount = parseFloat(amount) || 0;
  const productionCanCover = paidFrom === 'cash' && !!productionCashHouseId;
  const useProductionCash = productionCanCover && fromProductionCash;

  // Split: the two parts as typed (the same shape the edit forms save).
  const paymentFieldsFor = (amt: number) =>
    paidFrom === 'both'
      ? { paymentMethod: 'both' as const, cashAmount: Math.round((parseFloat(splitCash) || 0) * 100) / 100, onlineAmount: Math.round((parseFloat(splitOnline) || 0) * 100) / 100 }
      : paidFrom === 'online'
      ? { paymentMethod: 'online' as const, cashAmount: 0, onlineAmount: amt }
      : paidFrom === 'owner'
      ? { paymentMethod: 'owner' as const, cashAmount: 0, onlineAmount: 0 }
      : useProductionCash
      ? { paymentMethod: 'cash' as const, cashAmount: amt, onlineAmount: 0, paidFromProductionHouseId: productionCashHouseId }
      : { paymentMethod: 'cash' as const, cashAmount: amt, onlineAmount: 0 };

  // Resolved outside handleSubmit too, so the render below can decide whether to show
  // the beverage packaging UI instead of a plain quantity/unit field.
  const resolved = matched || (hasStrongMatch ? bestMatch : null);
  const currentEntryType: ExpenseEntryType = resolved ? resolved.entryType : manualType;
  const currentCategory = resolved ? resolved.category : manualCategory;
  const isBeverage = currentEntryType === 'inventory' && currentCategory === 'beverages';
  const beverageTotalPieces = packageType === 'carton'
    ? (parseFloat(cartonCount) || 0) * (parseFloat(piecesPerCarton) || 0)
    : (parseFloat(pieceCount) || 0);
  // Must come after isBeverage - it used to be declared above this point and read
  // isBeverage before it existed, throwing "Cannot access 'isBeverage' before
  // initialization" on every render (a real TDZ crash, not conditional on role/user).
  const isBundlePurchase = !isBeverage && isBundleMode && (unit === 'pcs' || unit === 'units');

  // Price check on what's typed so far: a price several times off the item's usual one is
  // almost always a unit slip (grams for kg, a crate as 1 piece).
  const priceFlag = priceGuide && currentEntryType === 'inventory' && query.trim() && enteredAmount > 0
    ? checkPurchase({
        itemName: query,
        quantity: isBeverage ? beverageTotalPieces : (isBundlePurchase ? bundleTotalPieces : (parseFloat(quantity) || 0)),
        unit: isBeverage || isBundlePurchase ? 'pcs' : unit,
        totalCost: enteredAmount,
        packageType: isBundlePurchase || (isBeverage && packageType === 'carton') ? 'carton' : undefined,
      }, priceGuide)
    : null;
  const applyPriceFix = (fix: PriceFix) => {
    if (isBeverage) {
      setPackageType('pieces');
      setPieceCount(String(fix.quantity));
      return;
    }
    setIsBundleMode(false);
    setUnit(fix.unit);
    setQuantity(String(fix.quantity));
  };

  // Voice: "ajke 3kg chicken niyeche 600 taka" fills amount ₹600, Chicken, 3 kg - to check, then save.
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceHeard, setVoiceHeard] = useState<string | null>(null);
  const fillFromVoice = async (text: string) => {
    if (!accessToken) return;
    setVoiceBusy(true);
    try {
      const f = await api.voiceFill(accessToken, 'expense', text);
      const [first, ...rest] = f.items || [];
      setVoiceHeard(`"${text}"${rest.length ? ` - ${rest.length + 1} items heard; filled the first, add ${rest.map((r) => r.name).join(', ')} after saving` : ''}${f.unclear ? ` - not used: ${f.unclear}` : ''}`);
      if (!first) {
        toast.error('No item found in that. Try: "3 kg chicken 600 taka"');
        return;
      }
      // Packs ("5 burger packs of 4"): filled as a bundle - packs x pieces per pack.
      const packs = first.packs && first.packs > 0 ? first.packs : null;
      const perPack = first.perPack && first.perPack > 0 ? first.perPack : null;
      const total = first.amount ?? (first.pricePerPack != null ? first.pricePerPack * (packs || first.quantity || 1) : null);
      if (total !== null) setAmount(String(Math.round(total * 100) / 100));
      const top = searchExpenseCandidates(first.name, candidates, 1)[0];
      const best = top && top.score >= 0.85 ? top : null;
      if (best) selectSuggestion(best);
      else resetMatchIfTyping(first.name);
      const unitSaid = first.unit === 'packet' ? 'pcs' : first.unit;
      if (best?.category === 'beverages') {
        if (packs && perPack) {
          setPackageType('carton');
          setCartonCount(String(packs));
          setPiecesPerCarton(String(perPack));
        } else {
          setPackageType('pieces');
          if (first.quantity !== null) setPieceCount(String(first.quantity));
        }
      } else if (packs && perPack) {
        setUnit('pcs');
        setIsBundleMode(true);
        setCartonCount(String(packs));
        setPiecesPerCarton(String(perPack));
      } else {
        if (unitSaid && UNIT_PILLS.includes(unitSaid)) { setUnit(unitSaid); setIsBundleMode(false); }
        if (first.quantity !== null) setQuantity(String(first.quantity));
      }
      if (f.paidWith === 'online' && ownerPaymentOption) setPaidFrom('online');
      const what = packs && perPack ? `${packs} packs × ${perPack} ${first.name}` : `${first.quantity ?? ''} ${unitSaid ?? ''} ${first.name}`;
      toast.success(`Filled ${what}${total !== null ? ` · ₹${total.toLocaleString('en-IN')}` : ''} - check, then save`.replace(/\s+/g, ' '));
    } catch (e: any) {
      toast.error(e?.message || 'Could not read that');
    } finally {
      setVoiceBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error(t('exp.enterAmount'));
      return;
    }
    if (!query.trim()) {
      toast.error(t('exp.enterWhat'));
      return;
    }
    if (paidFrom === 'both' && Math.abs((parseFloat(splitCash) || 0) + (parseFloat(splitOnline) || 0) - amt) > 0.01) {
      toast.error(t('exp.splitMustMatch', { amount: formatINR(amt) }));
      return;
    }

    const entryType = currentEntryType;
    const category = currentCategory;

    if (!category) {
      toast.error(t('exp.chooseCategory'));
      return;
    }
    if (isBeverage && beverageTotalPieces <= 0) {
      toast.error(t('exp.enterPieces'));
      return;
    }
    if (isBundlePurchase && bundleTotalPieces <= 0) {
      toast.error(t('exp.enterPacks'));
      return;
    }

    let pendingNotice: string | null = null;
    setIsSubmitting(true);
    try {
      // Remember a brand-new classification so the next person who types this exact
      // name gets it auto-detected instead of having to classify it again. Only the
      // cluster head is allowed to do this (server-enforced too) - for anyone else,
      // skip the call entirely rather than firing it and silently eating the 403,
      // which used to leave the purchase logged but the item permanently
      // unrecognized on every future attempt with no explanation why.
      if (!resolved) {
        if (canCreateNewItems) {
          // Not awaited: on a weak signal it held up saving the expense itself (which can wait on
          // the phone if need be - this can't, and is only a convenience for next time).
          api.addCustomItem(category, query.trim(), entryType, entity).catch((err) => {
            console.error('Failed to save custom item classification:', err);
          });
        } else {
          pendingNotice = t('exp.notInList', { name: query.trim() });
        }
      }

      if (entryType === 'inventory') {
        const qty = isBeverage ? beverageTotalPieces : (isBundlePurchase ? bundleTotalPieces : (parseFloat(quantity) || 1));
        await onSubmitInventory({
          date: entryDate,
          category,
          itemName: query.trim(),
          quantity: qty,
          unit: isBeverage || isBundlePurchase ? 'pcs' : (unit || 'pcs'),
          costPerUnit: Math.round((amt / qty) * 100) / 100,
          totalCost: amt,
          ...paymentFieldsFor(amt),
          ...(isBeverage ? {
            packageType,
            ...(packageType === 'carton' ? {
              cartonCount: parseFloat(cartonCount) || 0,
              piecesPerCarton: parseFloat(piecesPerCarton) || 0,
            } : {}),
            ...(volumeMl ? { volumeMl: volumeUnit === 'L' ? (parseFloat(volumeMl) || 0) * 1000 : (parseFloat(volumeMl) || 0) } : {}),
          } : {}),
          ...(isBundlePurchase ? {
            packageType: 'carton' as const,
            cartonCount: parseFloat(cartonCount) || 0,
            piecesPerCarton: parseFloat(piecesPerCarton) || 0,
          } : {}),
          ...(!isBeverage && (unit === 'pcs' || unit === 'units') && weightPerUnit
            ? { weightPerUnitGrams: weightUnit === 'kg' ? (parseFloat(weightPerUnit) || 0) * 1000 : (parseFloat(weightPerUnit) || 0) }
            : {}),
          ...entityFieldsFor(entity),
        });
      } else if (entryType === 'overhead') {
        await onSubmitOverhead({
          date: entryDate,
          category,
          description: query.trim(),
          amount: amt,
          ...paymentFieldsFor(amt),
          ...entityFieldsFor(entity),
        });
      } else {
        await onSubmitFixedCost({
          date: entryDate,
          category,
          description: query.trim(),
          amount: amt,
          ...paymentFieldsFor(amt),
          ...entityFieldsFor(entity),
        });
      }
      if (pendingNotice) toast.info(pendingNotice, { duration: 8000 });
      if (keepOpen) resetForAnother();
      else onClose();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolvedForDisplay = resolved;

  // Save + another: a clean form for the next bill (same place, day and way of paying).
  const resetForAnother = () => {
    setAmount('');
    setQuery('');
    setMatched(null);
    setQuantity('1');
    setUnit('pcs');
    setIsBundleMode(false);
    setCartonCount('');
    setPiecesPerCarton('');
    setPieceCount('');
    setVolumeMl('');
    setShowWeightField(false);
    setWeightPerUnit('');
    setSplitCash('');
    setSplitOnline('');
    setVoiceHeard(null);
    setKeepOpen(false);
  };

  // Unit pills: piece = loose pieces, pack = pieces bought in packs (same saved shape as before).
  const activePill: UnitPill = unit === 'pcs' ? (isBundleMode ? 'pack' : 'piece') : (unit as UnitPill);
  const pillOptions: { value: UnitPill; label: string }[] = [
    { value: 'kg', label: 'kg' },
    { value: 'g', label: 'g' },
    { value: 'piece', label: t('unit.piece') },
    { value: 'pack', label: t('unit.pack') },
    { value: 'bundle', label: t('unit.bundle') },
    { value: 'L', label: 'L' },
    { value: 'mL', label: 'mL' },
    ...(unit === 'units' ? [{ value: 'units' as const, label: t('unit.units') }] : []),
  ];
  const pickPill = (pill: UnitPill) => {
    if (pill === 'piece') { setUnit('pcs'); setIsBundleMode(false); return; }
    if (pill === 'pack') { setUnit('pcs'); setIsBundleMode(true); return; }
    setUnit(pill);
    if (pill !== 'units') setIsBundleMode(false);
  };
  const typeLabel = (type: ExpenseEntryType) => (type === 'inventory' ? t('exp.type.inventory') : type === 'overhead' ? t('exp.type.overhead') : t('exp.type.fixedcost'));
  const qtyForLine = isBeverage ? beverageTotalPieces : isBundlePurchase ? bundleTotalPieces : (parseFloat(quantity) || 0);
  const priceLine = currentEntryType === 'inventory' && query.trim() && !priceFlag
    ? pricePerUnitLine(priceGuide, query, qtyForLine, isBeverage || isBundlePurchase ? 'pcs' : unit, enteredAmount)
    : null;
  const usualRef = resolvedForDisplay && currentEntryType === 'inventory' ? pricePerUnitLine(priceGuide, resolvedForDisplay.label, 1, unit, 1) : null;
  const today = getTodayIST();
  const dirty = !!(amount || query.trim());

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={t('expense.add')}
      dirty={dirty && !isSubmitting}
      footer={
        <>
          <Button type="submit" form="add-expense-form" variant="secondary" size="lg" disabled={isSubmitting} onClick={() => setKeepOpen(true)}>{t('expense.saveAnother')}</Button>
          <Button type="submit" form="add-expense-form" size="lg" className="flex-1" loading={isSubmitting} onClick={() => setKeepOpen(false)}>{t('expense.save')}</Button>
        </>
      }
    >
      <form id="add-expense-form" onSubmit={handleSubmit} className="flex flex-col gap-4" lang={lang}>
        {/* Expenses for this day saved on the phone without signal - so they aren't entered twice. */}
        <MoneyWaiting kinds={['inventory', 'overhead', 'fixed-cost']} date={entryDate} />
        {accessToken && (
          <VoiceButton variant="row" onText={fillFromVoice} busy={voiceBusy} label={t('voice.sayItInstead')} prompt={t('exp.sayExample')} />
        )}
        {voiceHeard && <p className="-mt-2 text-label text-text-2">{t('dc.heard', { text: voiceHeard })}</p>}

        <SegmentedControl
          aria-label={t('exp.where')}
          value={entity}
          onValueChange={setEntity}
          options={[{ value: 'store', label: t('exp.store') }, { value: 'production_house', label: t('exp.production') }]}
        />

        {entity === 'store' && storeOptions && storeOptions.length > 1 && (
          <Field label={t('exp.whichStore')}>
            <PickerField title={t('exp.whichStore')} items={storeOptions.map((st) => ({ value: st.id, label: st.name }))} value={pickedStoreId} onValueChange={setPickedStoreId} />
          </Field>
        )}

        <Field
          label={t('exp.whatFor')}
          required
          helper={resolvedForDisplay
            ? `${typeLabel(resolvedForDisplay.entryType)} · ${categoryText(resolvedForDisplay.category)}${usualRef?.usualText ? ` · ${t('exp.usually', { price: usualRef.usualText })}` : ''}${resolvedForDisplay.entity !== 'both' ? ` · ${t('exp.usuallyFiled', { place: resolvedForDisplay.entity === 'store' ? t('exp.store') : t('exp.productionHouse') })}` : ''}`
            : undefined}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-text-3" aria-hidden="true" />
            <Input value={query} onChange={(e) => resetMatchIfTyping(e.target.value)} placeholder={t('exp.whatForPh')} className="pl-10" autoComplete="off" required />
          </div>
        </Field>
        {!matched && query.trim() && suggestions.length > 0 && (
          <div className="-mt-2 overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border" role="listbox" aria-label={t('exp.whatFor')}>
            {suggestions.map((s, i) => (
              <button
                key={`${s.entryType}-${s.category}-${s.label}-${i}`}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => selectSuggestion(s)}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left outline-none hover:bg-surface-2/60 focus-visible:bg-surface-2"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-md font-medium text-text">{s.label}{s.bengali ? <span className="font-normal text-text-3"> · {s.bengali}</span> : null}</span>
                  <span className="text-label text-text-3">{typeLabel(s.entryType)} · {categoryText(s.category)}</span>
                </span>
                {i === 0 && s.score >= 0.85 && <Check className="size-5 text-success" aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
        <AssetHint name={query} category={currentCategory} source={currentEntryType} date={entryDate} />

        {isNewItem && (
          <div className="flex flex-col gap-3 rounded-lg border border-warning-border bg-warning-soft p-3">
            <p className="text-body-sm font-medium text-text">{t('exp.newItem')}</p>
            <SegmentedControl
              aria-label={t('dc.type')}
              value={manualType}
              onValueChange={(v) => { setManualType(v); setManualCategory(''); }}
              options={(['inventory', 'overhead', 'fixedcost'] as const).map((v) => ({ value: v, label: typeLabel(v) }))}
            />
            <Field label={t('exp.category')}>
              <PickerField
                title={t('exp.category')}
                items={manualCategoryOptions.map(([key, label]) => ({ value: key, label: stripEmoji(label) }))}
                value={manualCategory}
                onValueChange={setManualCategory}
              />
            </Field>
          </div>
        )}

        {currentEntryType === 'inventory' && (
          isBeverage ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
              <span className="text-body-sm font-medium text-text">{t('exp.packaging')}</span>
              <SegmentedControl
                aria-label={t('exp.packaging')}
                value={packageType}
                onValueChange={setPackageType}
                options={[{ value: 'pieces', label: t('exp.pieces') }, { value: 'carton', label: t('exp.carton') }]}
              />
              {packageType === 'carton' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('exp.cartons')} required>
                    <Input type="number" inputMode="numeric" step="1" value={cartonCount} onChange={(e) => setCartonCount(e.target.value)} required className="num" />
                  </Field>
                  <Field label={t('exp.perCarton')} required>
                    <Input type="number" inputMode="numeric" step="1" value={piecesPerCarton} onChange={(e) => setPiecesPerCarton(e.target.value)} required className="num" />
                  </Field>
                </div>
              ) : (
                <Field label={t('exp.pieces')} required>
                  <Input type="number" inputMode="numeric" step="1" value={pieceCount} onChange={(e) => setPieceCount(e.target.value)} required className="num" />
                </Field>
              )}
              <Field label={t('exp.volume')} optional helper={beverageTotalPieces > 0 ? `${beverageTotalPieces} pcs${volumeMl ? ` × ${volumeMl}${volumeUnit}` : ''}` : undefined}>
                <div className="flex gap-2">
                  <Input type="number" inputMode="numeric" step="1" value={volumeMl} onChange={(e) => setVolumeMl(e.target.value)} placeholder="e.g. 750" className="num" />
                  <SegmentedControl aria-label="Volume unit" className="w-32 shrink-0" value={volumeUnit} onValueChange={setVolumeUnit} options={[{ value: 'mL', label: 'mL' }, { value: 'L', label: 'L' }]} />
                </div>
              </Field>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-body-sm font-medium text-text">{t('exp.howMuch')}</span>
              {isBundlePurchase ? (
                // e.g. 5 packs of 4 buns, a bag of 20 foil sheets: packs x pieces in each.
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('exp.packs')} required>
                    <Input type="number" inputMode="numeric" step="1" value={cartonCount} onChange={(e) => setCartonCount(e.target.value)} placeholder="e.g. 1" required className="num" />
                  </Field>
                  <Field label={t('exp.perPack')} required helper={bundleTotalPieces > 0 ? t('exp.piecesInAll', { n: bundleTotalPieces }) : undefined}>
                    <Input type="number" inputMode="numeric" step="1" value={piecesPerCarton} onChange={(e) => setPiecesPerCarton(e.target.value)} placeholder="e.g. 50" required className="num" />
                  </Field>
                </div>
              ) : (
                <Field label={t('exp.quantity')} hideLabel required>
                  <Input type="number" inputMode="decimal" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} required className="num" />
                </Field>
              )}
              <ChoiceChips aria-label={t('exp.howMuch')} value={activePill} onValueChange={pickPill} options={pillOptions} />
              {(unit === 'pcs' || unit === 'units') && !isBundleMode && (
                !showWeightField ? (
                  <Button variant="link" size="sm" className="self-start" leadingIcon={<Plus />} onClick={() => setShowWeightField(true)}>{t('exp.addWeight')}</Button>
                ) : (
                  <Field
                    label={t('exp.weight')}
                    optional
                    helper={weightPerUnit && parseFloat(quantity) > 0
                      ? `${quantity} ${unit} × ${weightPerUnit}${weightUnit} = ${(((parseFloat(weightPerUnit) || 0) * (weightUnit === 'kg' ? 1000 : 1) * (parseFloat(quantity) || 0)) / 1000).toFixed(2)} kg`
                      : "Skip it when the item has no real weight (tissues, cutlery)."}
                  >
                    <div className="flex gap-2">
                      <Input type="number" inputMode="decimal" step="0.1" value={weightPerUnit} onChange={(e) => setWeightPerUnit(e.target.value)} placeholder="e.g. 200" className="num" />
                      <SegmentedControl aria-label="Weight unit" className="w-28 shrink-0" value={weightUnit} onValueChange={setWeightUnit} options={[{ value: 'g', label: 'g' }, { value: 'kg', label: 'kg' }]} />
                      <Button variant="ghost" onClick={() => { setShowWeightField(false); setWeightPerUnit(''); }}>{t('exp.remove')}</Button>
                    </div>
                  </Field>
                )
              )}
            </div>
          )
        )}

        <Field label={t('exp.amountPaid')} required>
          <MoneyInput value={amount} onValueChange={(_, raw) => setAmount(raw)} required autoFocus={!accessToken} />
        </Field>
        {priceLine && (
          <p className={priceLine.usual ? '-mt-2 flex items-center gap-1.5 text-label text-success' : '-mt-2 text-label text-text-3'}>
            {priceLine.usual && <Check className="size-4" aria-hidden="true" />}
            <span className="num">{priceLine.text}</span>
            {priceLine.usual ? ` · ${t('exp.usualPrice')}` : priceLine.usualText ? ` · ${t('exp.usually', { price: priceLine.usualText })}` : ''}
          </p>
        )}
        {currentEntryType === 'inventory' && (
          <PriceWarning flag={priceFlag} onFix={isBeverage ? (packageType === 'carton' ? undefined : applyPriceFix) : (isBundlePurchase ? undefined : applyPriceFix)} />
        )}

        {/* Quick Add: staff pay cash only; the owner chooses owner / cash / Paytm, as before the
            redesign (owner, 27 Oct 2026). Split stays in the full expense form. */}
        <PaidFromField value={paidFrom} onChange={setPaidFrom} showOwner={ownerPaymentOption} allowed={ownerPaymentOption ? ['owner', 'cash', 'online'] : ['cash']} entity={entity === 'store' ? 'store' : 'production'}>
          {productionCanCover && (
            <ProductionCashChoice checked={fromProductionCash} onChange={setFromProductionCash} amount={enteredAmount} cover={cashCover} always />
          )}
          {paidFrom === 'both' && (
            <SplitAmounts cash={splitCash} online={splitOnline} total={enteredAmount} onChange={(next) => { setSplitCash(next.cash); setSplitOnline(next.online); }} />
          )}
        </PaidFromField>

        {/* The day this is for: the last week inline (no sheet on top of this sheet). */}
        <Field label={t('exp.date')} helper={entryDate === today ? `${t('date.today')}, ${formatDateIST(entryDate)}` : formatDateIST(entryDate)}>
          <div className="rounded-md border border-border-strong bg-surface px-1 pb-1">
            <DateStrip value={entryDate} onChange={setEntryDate} max={today} today={today} hideCalendarButton />
          </div>
        </Field>
      </form>
    </ResponsiveModal>
  );
}

// Leafy greens (coriander, pudina, onion leaves) are bought by the bundle, not weighed.
const UNIT_PILLS = ['kg', 'g', 'L', 'mL', 'pcs', 'units', 'bundle'];
// What the pills show: 'pack' is pieces bought in packs (N packs x M pieces).
type UnitPill = 'kg' | 'g' | 'L' | 'mL' | 'piece' | 'pack' | 'bundle' | 'units';

function normalize(s: string) {
  return s.trim().toLowerCase();
}
