import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Check, AlertTriangle } from 'lucide-react';
import * as api from '../utils/api';
import {
  INVENTORY_CATEGORIES,
  SELECTABLE_INVENTORY_CATEGORIES,
  STORE_SELECTABLE_INVENTORY_CATEGORIES,
  OVERHEAD_CATEGORIES,
  STORE_OVERHEAD_CATEGORY_KEYS,
  FIXED_COST_CATEGORIES,
} from '../utils/inventoryData';
import {
  ExpenseCandidate,
  ExpenseEntity,
  ExpenseEntryType,
  ExpenseSuggestion,
  buildExpenseCandidates,
  searchExpenseCandidates,
} from '../utils/expenseMatcher';

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
};

const ENTITY_LABEL: Record<'store' | 'production_house', string> = {
  store: 'Store',
  production_house: 'Production House',
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
}: Props) {
  const [amount, setAmount] = useState('');
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

  useEffect(() => {
    api.getCustomItems().then(setCustomItems).catch(() => {});
  }, []);

  const candidates: ExpenseCandidate[] = useMemo(() => buildExpenseCandidates(customItems), [customItems]);
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
      const entries = Object.entries(OVERHEAD_CATEGORIES);
      return entity === 'store' ? entries.filter(([key]) => STORE_OVERHEAD_CATEGORY_KEYS.includes(key)) : entries;
    }
    return Object.entries(FIXED_COST_CATEGORIES);
  }, [manualType, entity]);

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
    if (s.entryType === 'inventory') {
      setUnit('pcs');
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
      : { entityType: 'store' as const, storeId: effectiveStoreId || undefined };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      alert('Enter an amount');
      return;
    }
    if (!query.trim()) {
      alert("Enter what this was for");
      return;
    }

    const entryType = currentEntryType;
    const category = currentCategory;

    if (!category) {
      alert('Choose a category');
      return;
    }
    if (isBeverage && beverageTotalPieces <= 0) {
      alert('Enter how many pieces/cartons were bought');
      return;
    }
    if (isBundlePurchase && bundleTotalPieces <= 0) {
      alert('Enter how many bundles and pieces per bundle were bought');
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
          try {
            await api.addCustomItem(category, query.trim(), entryType, entity);
          } catch (err) {
            console.error('Failed to save custom item classification:', err);
          }
        } else {
          pendingNotice = `"${query.trim()}" isn't in the catalog yet. This purchase will still be saved, but ask your cluster head to add it as a proper item so it's recognized automatically next time.`;
        }
      }

      if (entryType === 'inventory') {
        const qty = isBeverage ? beverageTotalPieces : (isBundlePurchase ? bundleTotalPieces : (parseFloat(quantity) || 1));
        await onSubmitInventory({
          date: selectedDate,
          category,
          itemName: query.trim(),
          quantity: qty,
          unit: isBeverage || isBundlePurchase ? 'pcs' : (unit || 'pcs'),
          costPerUnit: Math.round((amt / qty) * 100) / 100,
          totalCost: amt,
          paymentMethod: 'cash',
          cashAmount: amt,
          onlineAmount: 0,
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
          date: selectedDate,
          category,
          description: query.trim(),
          amount: amt,
          paymentMethod: 'cash',
          cashAmount: amt,
          onlineAmount: 0,
          ...entityFieldsFor(entity),
        });
      } else {
        await onSubmitFixedCost({
          date: selectedDate,
          category,
          description: query.trim(),
          amount: amt,
          paymentMethod: 'cash',
          cashAmount: amt,
          onlineAmount: 0,
          ...entityFieldsFor(entity),
        });
      }
      if (pendingNotice) alert(pendingNotice);
      onClose();
    } catch (error: any) {
      alert(error?.message || 'Failed to save expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolvedForDisplay = resolved;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900 tracking-tight">Add expense</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable body - without this, the growing suggestion list under "What was
            this for?" pushed the whole modal taller than the visible viewport once the
            on-screen keyboard opened, scrolling the field you were actively typing into
            out of view with nothing to bring it back. */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {(['store', 'production_house'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setEntity(opt)}
                className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${
                  entity === opt ? 'bg-orange-600 text-white shadow-sm' : 'text-gray-600'
                }`}
              >
                {ENTITY_LABEL[opt]}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-2xl font-semibold text-center focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              placeholder="0"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">What was this for?</label>
            <input
              type="text"
              value={query}
              onChange={(e) => resetMatchIfTyping(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              placeholder="e.g. Coke, Toto, Chicken"
              required
            />

            {!matched && query.trim() && suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.entryType}-${s.category}-${s.label}-${i}`}
                    type="button"
                    onClick={() => selectSuggestion(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      i === 0 && s.score >= 0.85
                        ? 'bg-green-50 border-green-300 text-green-700 font-medium'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {s.label}{s.bengali ? ` (${s.bengali})` : ''} · {categoryLabel(s)}
                  </button>
                ))}
              </div>
            )}

            {resolvedForDisplay && (
              <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-green-800">
                  Matched: <strong>{resolvedForDisplay.label}{resolvedForDisplay.bengali ? ` (${resolvedForDisplay.bengali})` : ''}</strong> → {categoryLabel(resolvedForDisplay)}
                  {resolvedForDisplay.entity !== 'both' && (
                    <span className="block text-green-700/80 mt-0.5">
                      Filed under {ENTITY_LABEL[resolvedForDisplay.entity as 'store' | 'production_house']} - that's where this is usually bought.
                    </span>
                  )}
                </p>
              </div>
            )}

            {isNewItem && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2.5">
                <p className="text-xs text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> New item - classify it once, and it'll be remembered next time.
                </p>
                <div className="flex bg-white rounded-lg p-1 border border-amber-200">
                  {(['inventory', 'overhead', 'fixedcost'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setManualType(t); setManualCategory(''); }}
                      className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors ${
                        manualType === t ? 'bg-amber-500 text-white' : 'text-gray-600'
                      }`}
                    >
                      {t === 'inventory' ? 'Inventory' : t === 'overhead' ? 'Overhead' : 'Fixed cost'}
                    </button>
                  ))}
                </div>
                <select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-amber-200 bg-white rounded-lg text-xs"
                >
                  {manualCategoryOptions.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {currentEntryType === 'inventory' && (
            isBeverage ? (
              <div className="space-y-3 bg-sky-50 border-2 border-sky-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-sky-900">Packaging</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPackageType('pieces')}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                      packageType === 'pieces' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    Pieces
                  </button>
                  <button
                    type="button"
                    onClick={() => setPackageType('carton')}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                      packageType === 'carton' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    Carton
                  </button>
                </div>

                {packageType === 'carton' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-sky-900 mb-1">Number of Cartons</label>
                      <input
                        type="number"
                        step="1"
                        value={cartonCount}
                        onChange={(e) => setCartonCount(e.target.value)}
                        className="w-full px-3 py-2 border border-sky-300 rounded-lg text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-sky-900 mb-1">Pieces per Carton</label>
                      <input
                        type="number"
                        step="1"
                        value={piecesPerCarton}
                        onChange={(e) => setPiecesPerCarton(e.target.value)}
                        className="w-full px-3 py-2 border border-sky-300 rounded-lg text-sm"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-sky-900 mb-1">Number of Pieces</label>
                    <input
                      type="number"
                      step="1"
                      value={pieceCount}
                      onChange={(e) => setPieceCount(e.target.value)}
                      className="w-full px-3 py-2 border border-sky-300 rounded-lg text-sm"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-sky-900 mb-1">Volume per Piece</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="1"
                      value={volumeMl}
                      onChange={(e) => setVolumeMl(e.target.value)}
                      placeholder="e.g. 750"
                      className="flex-1 px-3 py-2 border border-sky-300 rounded-lg text-sm"
                    />
                    <select
                      value={volumeUnit}
                      onChange={(e) => setVolumeUnit(e.target.value as 'mL' | 'L')}
                      className="px-3 py-2 border border-sky-300 rounded-lg bg-white text-sm"
                    >
                      <option value="mL">mL</option>
                      <option value="L">L</option>
                    </select>
                  </div>
                </div>

                {beverageTotalPieces > 0 && (
                  <p className="text-xs text-sky-800 font-medium">
                    Total: {beverageTotalPieces} pcs{volumeMl ? ` × ${volumeMl}${volumeUnit}` : ''}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-gray-600">Quantity</label>
                    {(unit === 'pcs' || unit === 'units') && (
                      <button
                        type="button"
                        onClick={() => setIsBundleMode(!isBundleMode)}
                        className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                      >
                        {isBundleMode ? 'Enter as loose pieces instead' : 'Bought as a bundle/pack?'}
                      </button>
                    )}
                  </div>
                  {isBundlePurchase ? (
                    // e.g. 1 bundle of 50 tissues, a bag of 20 foil sheets - same
                    // "N containers x M pieces each" idea as the beverage carton UI.
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">Number of bundles</label>
                          <input
                            type="number"
                            step="1"
                            value={cartonCount}
                            onChange={(e) => setCartonCount(e.target.value)}
                            placeholder="e.g. 1"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">Pieces per bundle</label>
                          <input
                            type="number"
                            step="1"
                            value={piecesPerCarton}
                            onChange={(e) => setPiecesPerCarton(e.target.value)}
                            placeholder="e.g. 50"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            required
                          />
                        </div>
                      </div>
                      {bundleTotalPieces > 0 && (
                        <p className="text-xs text-gray-500 font-medium">Total: {bundleTotalPieces} pcs</p>
                      )}
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      required
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Unit</label>
                  {/* Pill buttons instead of a dropdown - a native <select>'s popup can render
                      past the bottom of the screen inside the Android WebView. */}
                  <div className="flex flex-wrap gap-2">
                    {['kg', 'g', 'L', 'mL', 'pcs', 'units'].map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => { setUnit(u); if (u !== 'pcs' && u !== 'units') setIsBundleMode(false); }}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          unit === u
                            ? 'bg-orange-600 text-white border-orange-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                {(unit === 'pcs' || unit === 'units') && (
                  <div>
                    {!showWeightField ? (
                      <button
                        type="button"
                        onClick={() => setShowWeightField(true)}
                        className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                      >
                        + Add weight per {unit === 'pcs' ? 'piece' : 'unit'} (optional)
                      </button>
                    ) : (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-medium text-gray-600">
                            Weight per {unit === 'pcs' ? 'piece' : 'unit'}
                          </label>
                          <button
                            type="button"
                            onClick={() => { setShowWeightField(false); setWeightPerUnit(''); }}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.1"
                            value={weightPerUnit}
                            onChange={(e) => setWeightPerUnit(e.target.value)}
                            placeholder="e.g. 200"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <select
                            value={weightUnit}
                            onChange={(e) => setWeightUnit(e.target.value as 'g' | 'kg')}
                            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                          >
                            <option value="g">g</option>
                            <option value="kg">kg</option>
                          </select>
                        </div>
                        {weightPerUnit && parseFloat(quantity) > 0 && (
                          <p className="text-xs text-gray-500 mt-1.5">
                            Total: {quantity} {unit} × {weightPerUnit}{weightUnit} ={' '}
                            {(((parseFloat(weightPerUnit) || 0) * (weightUnit === 'kg' ? 1000 : 1) * (parseFloat(quantity) || 0)) / 1000).toFixed(2)} kg
                          </p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-1.5">Skip this if the item doesn't really have a meaningful weight (e.g. tissues, cutlery).</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-4 py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 font-medium text-sm flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Save {amount ? `₹${amount}` : ''} {query.trim() ? `· ${query.trim()}` : ''}
          </button>
        </form>
      </div>
    </div>
  );
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function categoryLabel(c: { entryType: ExpenseEntryType; category: string }): string {
  if (c.entryType === 'fixedcost') return (FIXED_COST_CATEGORIES as Record<string, string>)[c.category] || c.category;
  if (c.entryType === 'overhead') return (OVERHEAD_CATEGORIES as Record<string, string>)[c.category] || c.category;
  return (INVENTORY_CATEGORIES as Record<string, string>)[c.category] || c.category;
}
