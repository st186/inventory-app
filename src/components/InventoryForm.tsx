// Edit (or add) an ingredient purchase in the same sheet as every other expense: category and
// item pickers, quantity and unit, packs, the price check and Paid from. Payload unchanged.
import { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { InventoryItem } from '../App';
import { SELECTABLE_INVENTORY_CATEGORIES, CATEGORY_ITEMS, STORE_SELECTABLE_INVENTORY_CATEGORIES, STORE_CATEGORY_ITEMS, BUILT_IN_ITEM_BENGALI, LEGACY_CATEGORY_CANONICAL } from '../utils/inventoryData';
import * as api from '../utils/api';
import { findSimilarItem } from '../utils/stringSimilarity';
import { ProductionCashChoice, productionCashChoiceAvailable } from './ProductionCashChoice';
import type { CashCover } from '../utils/cashSource';
import { PriceWarning } from './PriceCheck';
import { checkPurchase, type PriceGuide } from '../utils/expenseChecks';
import { useT } from '../utils/i18n';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { ChoiceChips } from './ui/chip';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { MoneyInput, formatINR } from './ui/money';
import { PickerField } from './ui/picker-sheet';
import { ResponsiveModal } from './ui/responsive-modal';
import { SegmentedControl } from './ui/segmented-control';
import { MoneyWaiting } from './money/DayCloseParts';
import { DeleteAction, PaidFromField, SplitAmounts } from './money/PaidFromField';
import { categoryText, stripEmoji } from './money/categoryDisplay';

type Props = {
  selectedDate: string;
  editingItem?: InventoryItem | null;
  entityType?: 'store' | 'production_house';
  onSubmit: (item: Omit<InventoryItem, 'id'>) => void | Promise<void>;
  onClose: () => void;
  onSuccess?: () => void; // NEW: Optional callback after successful submission
  // Only cluster heads can expand the item catalog - a store/operations incharge picks
  // from what's already there. Defaults to true for callers that haven't been updated to
  // pass this explicitly, so existing behavior doesn't silently change elsewhere.
  canCreateNewItems?: boolean;
  // Cluster head only: "My own money" - a cost that takes nothing from store/production cash or Paytm.
  allowOwnerPayment?: boolean;
  // Cluster head, store expense: the linked production house, and both tills' cash for the
  // day - production's cash is offered only when the store's can't cover the bill.
  productionCashHouseId?: string | null;
  productionCashCover?: CashCover | null;
  // What each item usually costs - warns when the price looks like a unit slip (utils/expenseChecks.ts).
  priceGuide?: PriceGuide;
  /** Editing: delete this entry (confirm + Undo are the caller's). */
  onDelete?: () => void;
};

export function InventoryForm({ selectedDate, editingItem, entityType, onSubmit, onClose, onSuccess, canCreateNewItems = true, allowOwnerPayment = false, productionCashHouseId = null, productionCashCover = null, priceGuide, onDelete }: Props) {
  const [fromProductionCash, setFromProductionCash] = useState(!!editingItem?.paidFromProductionHouseId);
  // Store purchases are a small curated subset (see STORE_CATEGORY_ITEMS) - the
  // production house still needs the full fresh-produce/spices/meat lists.
  const isStoreEntry = entityType === 'store';
  const baseSelectableCategories = isStoreEntry ? STORE_SELECTABLE_INVENTORY_CATEGORIES : SELECTABLE_INVENTORY_CATEGORIES;
  const baseCategoryItems: Record<string, string[]> = isStoreEntry ? (STORE_CATEGORY_ITEMS as Record<string, string[]>) : (CATEGORY_ITEMS as Record<string, readonly string[]>) as Record<string, string[]>;
  const defaultCategory = (Object.keys(baseSelectableCategories)[0] || 'fresh_produce') as InventoryItem['category'];
  // Get last used payment method from localStorage, default to 'cash' if not found
  const getLastPaymentMethod = (): 'cash' | 'online' | 'both' | 'owner' => {
    if (editingItem?.paymentMethod) return editingItem.paymentMethod;
    const stored = localStorage.getItem('lastInventoryPaymentMethod');
    return (stored as 'cash' | 'online' | 'both') || 'cash';
  };

  const [formData, setFormData] = useState({
    category: (editingItem?.category || defaultCategory) as InventoryItem['category'],
    itemName: editingItem?.itemName || '',
    customItem: editingItem ? !(baseCategoryItems[editingItem.category] || []).includes(editingItem.itemName) : false,
    quantity: editingItem?.quantity.toString() || '',
    unit: editingItem?.unit || 'kg',
    totalCost: editingItem?.totalCost.toString() || '',
    paymentMethod: getLastPaymentMethod(),
    cashAmount: editingItem?.cashAmount?.toString() || '',
    onlineAmount: editingItem?.onlineAmount?.toString() || '',
    // Beverage packaging fields
    packageType: (editingItem?.packageType || 'pieces') as 'carton' | 'pieces',
    cartonCount: editingItem?.cartonCount?.toString() || '',
    piecesPerCarton: editingItem?.piecesPerCarton?.toString() || '',
    pieceCount: editingItem?.packageType === 'pieces' ? editingItem?.quantity.toString() || '' : '',
    volumeMl: editingItem?.volumeMl?.toString() || '',
    volumeUnit: 'mL' as 'mL' | 'L'
  });

  const isBeverage = formData.category === 'beverages';
  const beverageTotalPieces = formData.packageType === 'carton'
    ? (parseFloat(formData.cartonCount) || 0) * (parseFloat(formData.piecesPerCarton) || 0)
    : (parseFloat(formData.pieceCount) || 0);

  // Optional weight per piece (e.g. a 200g packet of Aromatic Powder) - only offered when
  // quantity is a piece count, and only shown once someone opts in, since plenty of
  // piece-counted items (tissues, cutlery) have no meaningful weight to record.
  const [showWeightField, setShowWeightField] = useState(!!editingItem?.weightPerUnitGrams);
  const [weightPerUnit, setWeightPerUnit] = useState(editingItem?.weightPerUnitGrams?.toString() || '');
  const [weightUnit, setWeightUnit] = useState<'g' | 'kg'>('g');

  // Non-beverage bundle purchase (e.g. 1 bundle of 50 tissues, a bag of 20 foil sheets) -
  // reuses the same formData.cartonCount/piecesPerCarton fields the beverage packaging UI
  // already uses, since it's the same "N containers x M pieces each" shape either way.
  const [isBundleMode, setIsBundleMode] = useState(!isBeverage && editingItem?.packageType === 'carton');
  const bundleTotalPieces = (parseFloat(formData.cartonCount) || 0) * (parseFloat(formData.piecesPerCarton) || 0);
  const isBundlePurchase = !isBeverage && isBundleMode && (formData.unit === 'pcs' || formData.unit === 'units');
  const priceFlag = priceGuide && formData.itemName.trim() && parseFloat(formData.totalCost) > 0
    ? checkPurchase({
        itemName: formData.itemName,
        quantity: isBeverage ? beverageTotalPieces : (isBundlePurchase ? bundleTotalPieces : (parseFloat(formData.quantity) || 0)),
        unit: isBeverage || isBundlePurchase ? 'pcs' : formData.unit,
        totalCost: parseFloat(formData.totalCost),
        packageType: isBundlePurchase || (isBeverage && formData.packageType === 'carton') ? 'carton' : undefined,
      }, priceGuide)
    : null;

  const [customItems, setCustomItems] = useState<Record<string, string[]>>({});
  const [allCustomItems, setAllCustomItems] = useState<api.CustomItem[]>([]);
  const [customCategories, setCustomCategories] = useState<api.CustomCategory[]>([]);
  const [loadingCustomItems, setLoadingCustomItems] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // NEW: Search state
  const [duplicateWarning, setDuplicateWarning] = useState<{ match: api.CustomItem; similarity: number; exact: boolean } | null>(null);

  // Load custom items on mount
  useEffect(() => {
    loadCustomItems();
  }, []);


  const loadCustomItems = async () => {
    try {
      const [items, categories] = await Promise.all([api.getCustomItems(), api.getCustomCategories()]);
      setAllCustomItems(items);
      // Custom categories that duplicated a built-in non-food one (Experiment, License &
      // Paperwork, ...) are retired - those costs are logged as overheads now.
      setCustomCategories(categories.filter((cat) => cat.scope === (isStoreEntry ? 'store' : 'production') && !(cat.key in LEGACY_CATEGORY_CANONICAL)));
      // Transform array to Record<category, itemName[]>
      const itemsByCategory: Record<string, string[]> = {};
      items.forEach((item) => {
        if (!itemsByCategory[item.category]) {
          itemsByCategory[item.category] = [];
        }
        itemsByCategory[item.category].push(item.itemName);
      });
      setCustomItems(itemsByCategory);
    } catch (error) {
      // Silently handle error - custom items are optional
    } finally {
      setLoadingCustomItems(false);
    }
  };

  // Cluster-head-created categories (see CategoryManagerModal) layered on top of the
  // fixed built-in list, so a new category is actually selectable here right after it's
  // created - not just visible in the management modal.
  const selectableCategories: Record<string, string> = {
    ...baseSelectableCategories,
    ...Object.fromEntries(customCategories.map((cat) => [cat.key, cat.label])),
  };
  const categoryItems: Record<string, string[]> = { ...baseCategoryItems };
  for (const cat of customCategories) {
    if (!categoryItems[cat.key]) categoryItems[cat.key] = [];
  }

  // Reset form to initial state (for adding multiple items)
  const resetForm = () => {
    const lastPaymentMethod = localStorage.getItem('lastInventoryPaymentMethod') as 'cash' | 'online' | 'both' || 'cash';
    setFormData({
      category: formData.category, // Persist the category selection
      itemName: '',
      customItem: false,
      quantity: '',
      unit: 'kg',
      totalCost: '',
      paymentMethod: lastPaymentMethod, // Persist the last used payment method
      cashAmount: '',
      onlineAmount: '',
      packageType: 'pieces',
      cartonCount: '',
      piecesPerCarton: '',
      pieceCount: '',
      volumeMl: '',
      volumeUnit: 'mL'
    });
    setSearchQuery(''); // Clear search query
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    
    // Prevent duplicate submissions
    if (isSubmitting) {
      return;
    }
    
    // CRITICAL: Validate itemName is not empty
    if (!formData.itemName || formData.itemName.trim() === '') {
      toast.error('Pick the item first');
      console.error('❌ [INVENTORY FORM] Attempted to submit inventory item without itemName:', formData);
      return;
    }
    
    // Validate split payment amounts
    if (formData.paymentMethod === 'both') {
      const cashAmt = parseFloat(formData.cashAmount) || 0;
      const onlineAmt = parseFloat(formData.onlineAmount) || 0;
      const total = parseFloat(formData.totalCost) || 0;

      if (Math.abs((cashAmt + onlineAmt) - total) > 0.01) {
        toast.error(`Cash ${formatINR(cashAmt)} + Paytm ${formatINR(onlineAmt)} = ${formatINR(cashAmt + onlineAmt)} must equal the total ${formatINR(total)}`);
        return;
      }
    }

    // If adding a brand-new item name, check for a likely duplicate before proceeding —
    // against both existing custom items and every category's built-in item list (an item
    // already under another category used to be addable again here: one item, one category).
    if (formData.customItem && formData.itemName) {
      const builtInsAsItems: api.CustomItem[] = Object.entries(categoryItems).flatMap(([category, names]) => names.map((name) => ({
        id: '', category, itemName: name,
      })));
      const match = findSimilarItem(formData.itemName, [...builtInsAsItems, ...allCustomItems], (item) => item.itemName);
      if (match) {
        setDuplicateWarning(match);
        return;
      }
    }

    await proceedWithSubmit();
  };

  const proceedWithSubmit = async () => {
    setIsSubmitting(true);

    const quantity = isBeverage ? beverageTotalPieces : (isBundlePurchase ? bundleTotalPieces : parseFloat(formData.quantity));
    const totalCost = parseFloat(formData.totalCost);
    const costPerUnit = quantity > 0 ? totalCost / quantity : 0;
    
    // CRITICAL: Round numbers to prevent floating point precision issues
    const roundedQuantity = Math.round(quantity * 100) / 100; // Round to 2 decimal places
    const roundedTotalCost = Math.round(totalCost * 100) / 100; // Round to 2 decimal places
    const roundedCostPerUnit = Math.round(costPerUnit * 100) / 100; // Round to 2 decimal places
    
    
    // If this is a new custom item, save it and reload the list
    if (formData.customItem && formData.itemName) {
      try {
        await api.addCustomItem(formData.category, formData.itemName);
        // Reload custom items to update the dropdown
        await loadCustomItems();
      } catch (error) {
        console.error('Error saving custom item:', error);
      }
    }
    
    // Calculate payment method amounts
    let paymentData: any = {
      paymentMethod: formData.paymentMethod
    };
    
    if (formData.paymentMethod === 'both') {
      const cashAmt = parseFloat(formData.cashAmount) || 0;
      const onlineAmt = parseFloat(formData.onlineAmount) || 0;
      paymentData.cashAmount = Math.round(cashAmt * 100) / 100;
      paymentData.onlineAmount = Math.round(onlineAmt * 100) / 100;
    } else if (formData.paymentMethod === 'online') {
      // For online payment, set onlineAmount to totalCost
      paymentData.onlineAmount = roundedTotalCost;
      paymentData.cashAmount = 0;
    } else if (formData.paymentMethod === 'cash') {
      // For cash payment, set cashAmount to totalCost
      paymentData.cashAmount = roundedTotalCost;
      paymentData.onlineAmount = 0;
    } else if (formData.paymentMethod === 'owner') {
      paymentData.cashAmount = 0;
      paymentData.onlineAmount = 0;
    }
    if (productionCashHouseId) {
      paymentData.paidFromProductionHouseId = formData.paymentMethod === 'cash' && fromProductionCash
        && productionCashChoiceAvailable(roundedTotalCost, productionCashCover, editingItem) ? productionCashHouseId : null;
    }

    
    try {
      await onSubmit({
        date: selectedDate,
        category: formData.category,
        itemName: formData.itemName,
        quantity: roundedQuantity,
        unit: isBeverage || isBundlePurchase ? 'pcs' : formData.unit,
        costPerUnit: roundedCostPerUnit,
        totalCost: roundedTotalCost,
        ...(isBeverage ? {
          packageType: formData.packageType,
          ...(formData.packageType === 'carton' ? {
            cartonCount: parseFloat(formData.cartonCount) || 0,
            piecesPerCarton: parseFloat(formData.piecesPerCarton) || 0,
          } : {}),
          ...(formData.volumeMl ? { volumeMl: formData.volumeUnit === 'L' ? (parseFloat(formData.volumeMl) || 0) * 1000 : (parseFloat(formData.volumeMl) || 0) } : {}),
        } : {}),
        ...(isBundlePurchase ? {
          packageType: 'carton' as const,
          cartonCount: parseFloat(formData.cartonCount) || 0,
          piecesPerCarton: parseFloat(formData.piecesPerCarton) || 0,
        } : {}),
        ...(!isBeverage && (formData.unit === 'pcs' || formData.unit === 'units') && weightPerUnit
          ? { weightPerUnitGrams: weightUnit === 'kg' ? (parseFloat(weightPerUnit) || 0) * 1000 : (parseFloat(weightPerUnit) || 0) }
          : {}),
        ...paymentData
      });
    } catch (error) {
      console.error('❌ [INVENTORY FORM] onSubmit failed:', error);
      setIsSubmitting(false);
      return; // Don't continue if submission failed
    }
    
    setIsSubmitting(false);
    
    // Only reset form if this is a new item (not editing)
    if (!editingItem) {
      resetForm();
    }
    
    if (onSuccess) {

      onSuccess();
    }
  };

  // Merge base items with custom items for the selected category.
  // Dedupe by normalized (trim+lowercase) name so whitespace/casing variants of the
  // same item (e.g. built-in "Onion" vs a custom "Onion ") don't both show up —
  // built-ins take priority since their spelling/casing is canonical.
  const dedupedItemsMap = new Map<string, string>();
  for (const name of categoryItems[formData.category] || []) {
    dedupedItemsMap.set(name.trim().toLowerCase(), name);
  }
  for (const name of customItems[formData.category] || []) {
    const key = name.trim().toLowerCase();
    if (!dedupedItemsMap.has(key)) {
      dedupedItemsMap.set(key, name.trim());
    }
  }
  const allCategoryItems = [...dedupedItemsMap.values()].sort((a, b) => a.localeCompare(b));

  // Filter items based on search query
  const filteredCategoryItems = searchQuery.trim()
    ? allCategoryItems.filter(item => 
        item.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allCategoryItems;

  const { t } = useT();
  const categoryPickerItems = [
    ...Object.entries(selectableCategories).map(([key, label]) => ({ value: key, label: stripEmoji(label) })),
    // If editing an item whose category is legacy/no longer offered, keep it visible
    ...(editingItem && !(editingItem.category in selectableCategories) ? [{ value: editingItem.category, label: categoryText(editingItem.category) }] : []),
  ];
  const itemPickerItems = allCategoryItems.map((item) => {
    const meta = allCustomItems.find((ci) => ci.category === formData.category && ci.itemName.trim().toLowerCase() === item.trim().toLowerCase());
    const bengali = meta?.itemNameBengali || BUILT_IN_ITEM_BENGALI[item];
    return { value: item, label: item, description: bengali || undefined, keywords: bengali || undefined };
  });
  const unitOptions = ['kg', 'g', 'L', 'mL', 'pcs', 'units', 'bundle'].map((u) => ({ value: u, label: u === 'pcs' ? t('unit.piece') : u === 'bundle' ? t('unit.bundle') : u === 'units' ? t('unit.units') : u }));
  const quantityForRate = isBeverage ? beverageTotalPieces : parseFloat(formData.quantity);
  const dirty = editingItem
    ? formData.totalCost !== editingItem.totalCost.toString() || formData.quantity !== editingItem.quantity.toString() || formData.itemName !== editingItem.itemName || formData.paymentMethod !== (editingItem.paymentMethod || 'cash')
    : !!(formData.itemName || formData.totalCost || formData.quantity);

  // A likely duplicate of an existing item: the same sheet asks first (no sheet on a sheet).
  if (duplicateWarning) {
    return (
      <ResponsiveModal
        open
        onOpenChange={(open) => { if (!open) setDuplicateWarning(null); }}
        onBack={() => setDuplicateWarning(null)}
        title="Possible duplicate item"
        footer={
          <>
            {!duplicateWarning.exact && (
              <Button
                variant="secondary"
                size="lg"
                onClick={async () => {
                  setDuplicateWarning(null);
                  await proceedWithSubmit();
                }}
              >
                Add anyway
              </Button>
            )}
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                const match = duplicateWarning.match;
                setFormData({ ...formData, itemName: match.itemName, category: match.category as InventoryItem['category'], customItem: false });
                setDuplicateWarning(null);
              }}
            >
              Use existing item
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Callout tone="warning" title={`"${formData.itemName}" looks ${duplicateWarning.exact ? 'identical to' : 'very similar to'} "${duplicateWarning.match.itemName}"`}>
            Under {categoryText(duplicateWarning.match.category)}.
          </Callout>
          <p className="text-body-sm text-text-2">{duplicateWarning.exact
            ? 'It is already on the list. One item goes under one category, so use the existing item.'
            : 'Use the existing item to keep its cost history in one place, or add this as a genuinely new item.'}</p>
        </div>
      </ResponsiveModal>
    );
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={editingItem ? t('exp.edit') : t('exp.type.inventory')}
      dirty={dirty && !isSubmitting}
      headerActions={<DeleteAction onDelete={onDelete} />}
      footer={<Button type="submit" form="inventory-form" size="lg" fullWidth loading={isSubmitting}>{t('expense.save')}</Button>}
    >
      <form id="inventory-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Purchases for this day saved on the phone without signal - so they aren't entered twice. */}
        {!editingItem && <MoneyWaiting kinds={['inventory']} date={selectedDate} />}
        <Field label={t('exp.category')} required>
          <PickerField
            title={t('exp.category')}
            items={categoryPickerItems}
            value={formData.category}
            onValueChange={(v) => {
              setFormData({ ...formData, category: v as InventoryItem['category'], itemName: '', customItem: false });
              setSearchQuery('');
            }}
          />
        </Field>

        {!formData.customItem ? (
          <Field label="Item" required helper={loadingCustomItems ? t('common.loading') : undefined}>
            <PickerField
              title="Item"
              items={itemPickerItems}
              value={formData.itemName || null}
              onValueChange={(v) => setFormData({ ...formData, itemName: v })}
              placeholder="Search items"
              leadingIcon={<Search />}
              onCreate={canCreateNewItems ? (q) => setFormData({ ...formData, customItem: true, itemName: q }) : undefined}
            />
          </Field>
        ) : (
          <Field label="New item name" required>
            <Input value={formData.itemName} onChange={(e) => setFormData({ ...formData, itemName: e.target.value })} placeholder="Enter the item name" required />
            <Button variant="link" size="sm" className="self-start" onClick={() => setFormData({ ...formData, customItem: false, itemName: '' })}>Back to the list</Button>
          </Field>
        )}

        {isBeverage ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
            <span className="text-body-sm font-medium text-text">{t('exp.packaging')}</span>
            <SegmentedControl
              aria-label={t('exp.packaging')}
              value={formData.packageType}
              onValueChange={(v) => setFormData({ ...formData, packageType: v })}
              options={[{ value: 'pieces', label: t('exp.pieces') }, { value: 'carton', label: t('exp.carton') }]}
            />
            {formData.packageType === 'carton' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('exp.cartons')} required>
                  <Input type="number" inputMode="numeric" step="1" value={formData.cartonCount} onChange={(e) => setFormData({ ...formData, cartonCount: e.target.value })} required className="num" />
                </Field>
                <Field label={t('exp.perCarton')} required>
                  <Input type="number" inputMode="numeric" step="1" value={formData.piecesPerCarton} onChange={(e) => setFormData({ ...formData, piecesPerCarton: e.target.value })} required className="num" />
                </Field>
              </div>
            ) : (
              <Field label={t('exp.pieces')} required>
                <Input type="number" inputMode="numeric" step="1" value={formData.pieceCount} onChange={(e) => setFormData({ ...formData, pieceCount: e.target.value })} required className="num" />
              </Field>
            )}
            <Field label={t('exp.volume')} optional helper={beverageTotalPieces > 0 ? `${beverageTotalPieces} pcs${formData.volumeMl ? ` × ${formData.volumeMl}${formData.volumeUnit}` : ''}` : undefined}>
              <div className="flex gap-2">
                <Input type="number" inputMode="numeric" step="1" value={formData.volumeMl} onChange={(e) => setFormData({ ...formData, volumeMl: e.target.value })} placeholder="e.g. 750" className="num" />
                <SegmentedControl aria-label="Volume unit" className="w-32 shrink-0" value={formData.volumeUnit} onValueChange={(v) => setFormData({ ...formData, volumeUnit: v })} options={[{ value: 'mL', label: 'mL' }, { value: 'L', label: 'L' }]} />
              </div>
            </Field>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {isBundlePurchase ? (
              // e.g. 1 bundle of 50 tissues, a bag of 20 foil sheets - the same
              // "N containers x M pieces each" idea as the beverage carton block.
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('exp.packs')} required>
                  <Input type="number" inputMode="numeric" step="1" value={formData.cartonCount} onChange={(e) => setFormData({ ...formData, cartonCount: e.target.value })} placeholder="e.g. 1" required className="num" />
                </Field>
                <Field label={t('exp.perPack')} required helper={bundleTotalPieces > 0 ? t('exp.piecesInAll', { n: bundleTotalPieces }) : undefined}>
                  <Input type="number" inputMode="numeric" step="1" value={formData.piecesPerCarton} onChange={(e) => setFormData({ ...formData, piecesPerCarton: e.target.value })} placeholder="e.g. 50" required className="num" />
                </Field>
              </div>
            ) : (
              <Field label={t('exp.quantity')} required>
                <Input type="number" inputMode="decimal" step="0.01" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} required className="num" />
              </Field>
            )}
            <ChoiceChips
              aria-label="Unit"
              value={formData.unit}
              onValueChange={(u) => {
                if (u !== 'pcs' && u !== 'units') setIsBundleMode(false);
                setFormData({ ...formData, unit: u });
              }}
              options={unitOptions}
            />
            {(formData.unit === 'pcs' || formData.unit === 'units') && (
              <Button variant="link" size="sm" className="self-start" onClick={() => setIsBundleMode(!isBundleMode)}>
                {isBundleMode ? 'Loose pieces instead' : `${t('exp.packs')}?`}
              </Button>
            )}
          </div>
        )}

        {!isBeverage && (formData.unit === 'pcs' || formData.unit === 'units') && (
          !showWeightField ? (
            <Button variant="link" size="sm" className="self-start" leadingIcon={<Plus />} onClick={() => setShowWeightField(true)}>{t('exp.addWeight')}</Button>
          ) : (
            <Field
              label={t('exp.weight')}
              optional
              helper={weightPerUnit && parseFloat(formData.quantity) > 0
                ? `${formData.quantity} ${formData.unit} × ${weightPerUnit}${weightUnit} = ${(((parseFloat(weightPerUnit) || 0) * (weightUnit === 'kg' ? 1000 : 1) * (parseFloat(formData.quantity) || 0)) / 1000).toFixed(2)} kg`
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

        <Field
          label={t('exp.amountPaid')}
          required
          helper={quantityForRate > 0 && formData.totalCost ? `${formatINR(parseFloat(formData.totalCost) / quantityForRate)} per ${isBeverage ? 'piece' : formData.unit}` : undefined}
        >
          <MoneyInput value={formData.totalCost} onValueChange={(_, raw) => setFormData({ ...formData, totalCost: raw })} required />
        </Field>

        <PriceWarning
          flag={priceFlag}
          onFix={isBeverage || isBundlePurchase ? undefined : (fix) => {
            const u = ['kg', 'g', 'L', 'mL', 'pcs', 'units', 'bundle'].includes(fix.unit) ? fix.unit : 'pcs';
            setFormData({ ...formData, quantity: String(fix.quantity), unit: u });
          }}
        />

        <PaidFromField
          value={formData.paymentMethod}
          onChange={(method) => {
            // Remembered for the next entry
            localStorage.setItem('lastInventoryPaymentMethod', method);
            setFormData({
              ...formData,
              paymentMethod: method,
              // Reset split amounts when changing payment method
              cashAmount: method === 'both' ? formData.cashAmount : '',
              onlineAmount: method === 'both' ? formData.onlineAmount : '',
            });
          }}
          showOwner={allowOwnerPayment || editingItem?.paymentMethod === 'owner'}
          entity={entityType === 'production_house' ? 'production' : 'store'}
        >
          {productionCashHouseId && formData.paymentMethod === 'cash' && (
            <ProductionCashChoice checked={fromProductionCash} onChange={setFromProductionCash} amount={parseFloat(formData.totalCost) || 0} cover={productionCashCover} editingItem={editingItem} />
          )}
          {formData.paymentMethod === 'both' && (
            <SplitAmounts
              cash={formData.cashAmount}
              online={formData.onlineAmount}
              total={parseFloat(formData.totalCost) || 0}
              onChange={(next) => setFormData({ ...formData, cashAmount: next.cash, onlineAmount: next.online })}
            />
          )}
        </PaidFromField>
      </form>
    </ResponsiveModal>
  );
}
