import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, History, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { ASSET_CATEGORIES, type AssetCondition } from '../../utils/assetRules';
import { getTodayIST } from '../../utils/timezone';
import { AssetSheet } from './AssetSheet';
import { AddAssetsSheet } from './AddAssetsSheet';
import { ConditionBadge } from './ConditionBadge';
import {
  dismissAsset, importPastPurchases, inr, listAssets, locationKey, shortDate, updateAsset,
  type AssetList, type AssetRow,
} from './assetsApi';

// Equipment & assets register (owner, 27 Oct 2026): everything each store and production house
// has, with what needs checking first. Items bought through expenses appear here by themselves
// as "needs review" (server assets.ts); the rest is listed by hand once.

type ConditionFilter = 'in_use' | AssetCondition;
const CONDITION_FILTERS: { key: ConditionFilter; label: string }[] = [
  { key: 'in_use', label: 'In use · চালু' },
  { key: 'needs_repair', label: 'Needs repair' },
  { key: 'broken', label: 'Broken' },
  { key: 'disposed', label: 'Disposed' },
];
const keyOf = (a: AssetRow) => (a.locationId ? locationKey(a.locationKind, a.locationId) : 'none');

export function EquipmentRegister() {
  const [data, setData] = useState<AssetList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loc, setLoc] = useState('');
  const [condition, setCondition] = useState<ConditionFilter>('in_use');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<{ asset: AssetRow; mode: 'review' | 'edit' | 'view' } | null>(null);
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFrom, setImportFrom] = useState('2026-01-01');
  const [importing, setImporting] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [quickBusy, setQuickBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listAssets(showRemoved);
      setData(next);
      setLoadError(null);
      // First load: your own place if you have one, otherwise everything.
      setLoc((cur) => cur || (next.locations.length === 1 ? locationKey(next.locations[0].kind, next.locations[0].id) : 'all'));
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load the equipment list');
    } finally {
      setLoading(false);
    }
  }, [showRemoved]);

  useEffect(() => { load(); }, [load]);

  const perms = data?.permissions;
  const locations = data?.locations || [];
  const canEditKey = (key: string) => !!perms && (perms.canEditAll || perms.editableLocations.includes(key));
  const locName = (a: AssetRow) => locations.find((l) => l.kind === a.locationKind && l.id === a.locationId)?.name || 'No location yet';

  const upsert = (row: AssetRow) => setData((d) => (d ? { ...d, assets: d.assets.some((a) => a.id === row.id) ? d.assets.map((a) => (a.id === row.id ? row : a)) : [row, ...d.assets] } : d));
  const drop = (id: string) => setData((d) => (d ? { ...d, assets: showRemoved ? d.assets.map((a) => (a.id === id ? { ...a, dismissed: true } : a)) : d.assets.filter((a) => a.id !== id) } : d));

  const view = useMemo(() => {
    const all = data?.assets || [];
    const here = all.filter((a) => loc === 'all' || keyOf(a) === loc);
    const live = here.filter((a) => !a.dismissed);
    const review = live.filter((a) => a.needsReview || a.expenseChanged);
    const q = search.trim().toLowerCase();
    const listed = live.filter((a) => !a.needsReview && !a.expenseChanged)
      .filter((a) => (condition === 'in_use' ? a.condition !== 'disposed' : a.condition === condition))
      .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.notes || '').toLowerCase().includes(q));
    const inUse = live.filter((a) => a.condition !== 'disposed');
    const counts = new Map<string, number>();
    for (const a of all) if (!a.dismissed && a.condition !== 'disposed') counts.set(keyOf(a), (counts.get(keyOf(a)) || 0) + 1);
    return {
      review,
      listed,
      removed: here.filter((a) => a.dismissed),
      groups: ASSET_CATEGORIES.map((c) => ({ ...c, items: listed.filter((a) => a.category === c.key) })).filter((g) => g.items.length),
      totals: {
        items: inUse.length,
        pieces: inUse.reduce((s, a) => s + (a.quantity || 0), 0),
        value: inUse.reduce((s, a) => s + (a.totalCost || 0), 0),
        unpriced: inUse.filter((a) => a.totalCost == null).length,
        repair: inUse.filter((a) => a.condition === 'needs_repair' || a.condition === 'broken').length,
      },
      counts,
      hasUnassigned: all.some((a) => !a.dismissed && !a.locationId),
    };
  }, [data, loc, condition, search]);

  const openAsset = (a: AssetRow) => setOpen({ asset: a, mode: canEditKey(keyOf(a)) && !a.dismissed ? (a.needsReview ? 'review' : 'edit') : canEditKey(keyOf(a)) ? 'edit' : 'view' });

  const quickConfirm = async (a: AssetRow) => {
    if (!a.locationId) return openAsset(a);
    setQuickBusy(a.id);
    try {
      upsert(await updateAsset(a.id, { confirm: true }));
      toast.success('Confirmed · নিশ্চিত হয়েছে');
    } catch (e: any) { toast.error(e?.message || 'Could not confirm'); } finally { setQuickBusy(null); }
  };

  const quickDismiss = async (a: AssetRow) => {
    setQuickBusy(a.id);
    try {
      await dismissAsset(a.id);
      drop(a.id);
      toast.success('Removed from the list');
    } catch (e: any) { toast.error(e?.message || 'Could not remove it'); } finally { setQuickBusy(null); }
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const r = await importPastPurchases(importFrom);
      toast.success(r.added ? `${r.added} past purchase${r.added === 1 ? '' : 's'} added for review` : 'No new equipment purchases found');
      setImportOpen(false);
      await load();
    } catch (e: any) { toast.error(e?.message || 'Could not import'); } finally { setImporting(false); }
  };

  if (loading && !data) {
    return <div className="flex items-center justify-center py-16 text-gray-500 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading equipment…</div>;
  }
  if (loadError && !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {loadError}
        <button type="button" onClick={load} className="ml-2 underline font-semibold">Try again</button>
      </div>
    );
  }

  const canAddHere = !!perms && perms.editableLocations.length > 0;
  const chip = (key: string, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setLoc(key)}
      className={`flex-shrink-0 px-3.5 py-2 rounded-full border text-sm font-medium whitespace-nowrap ${loc === key ? 'bg-orange-600 border-orange-600 text-white shadow' : 'bg-white border-gray-200 text-gray-700'}`}
    >
      {label}
      {key !== 'all' && <span className={`ml-1.5 text-xs ${loc === key ? 'text-white/80' : 'text-gray-400'}`}>{view.counts.get(key) || 0}</span>}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Title and actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Equipment & assets</h2>
          <p className="text-sm text-gray-500">যন্ত্রপাতি ও সম্পদ · what each store and production house has</p>
          {locations.length === 1 && <p className="text-sm font-semibold text-orange-700 mt-0.5">{locations[0].kind === 'production_house' ? '🏭' : '🏪'} {locations[0].name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} disabled={loading} className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 disabled:opacity-50" aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {perms?.canImport && (
            <button type="button" onClick={() => setImportOpen(true)} className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 inline-flex items-center gap-1.5">
              <History className="w-4 h-4" /> <span className="hidden sm:inline">Import past purchases</span><span className="sm:hidden">Import</span>
            </button>
          )}
          {canAddHere && (
            <button type="button" onClick={() => setAdding(true)} className="px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 shadow">
              <Plus className="w-4 h-4" /> Add items
            </button>
          )}
        </div>
      </div>

      {/* Location switcher */}
      {(locations.length > 1 || view.hasUnassigned) && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {locations.length > 1 && chip('all', 'All places')}
          {locations.map((l) => chip(locationKey(l.kind, l.id), `${l.kind === 'production_house' ? '🏭' : '🏪'} ${l.name}`))}
          {view.hasUnassigned && perms?.canEditAll && chip('none', 'No location yet')}
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white border border-gray-200 p-3">
          <p className="text-[11px] text-gray-500">Items · জিনিস</p>
          <p className="text-xl font-bold text-gray-900">{view.totals.items}</p>
          <p className="text-[11px] text-gray-500">{view.totals.pieces} pieces</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-200 p-3">
          <p className="text-[11px] text-gray-500">Value · মূল্য</p>
          <p className="text-xl font-bold text-gray-900">{inr(view.totals.value)}</p>
          <p className="text-[11px] text-gray-500">{view.totals.unpriced ? `${view.totals.unpriced} without cost` : 'at cost'}</p>
        </div>
        <div className={`rounded-2xl border p-3 ${view.review.length ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'}`}>
          <p className="text-[11px] text-gray-500">To check · যাচাই</p>
          <p className={`text-xl font-bold ${view.review.length ? 'text-amber-700' : 'text-gray-900'}`}>{view.review.length}</p>
          <p className="text-[11px] text-gray-500">{view.totals.repair ? `${view.totals.repair} need repair` : 'nothing broken'}</p>
        </div>
      </div>

      {/* Needs review first */}
      {view.review.length > 0 && (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-3 sm:p-4 space-y-3">
          <div>
            <p className="font-bold text-amber-900 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Needs review · যাচাই করুন</p>
            <p className="text-xs text-amber-800">Bought through expenses. Check the name, type, count and place, add a photo, and confirm.</p>
          </div>
          {view.review.map((a) => {
            const canEdit = canEditKey(keyOf(a));
            const cat = ASSET_CATEGORIES.find((c) => c.key === a.category);
            return (
              <div key={a.id} className="rounded-xl bg-white border border-amber-200 p-3">
                <button type="button" onClick={() => openAsset(a)} className="w-full text-left flex gap-3">
                  {a.photoUrl ? <img src={a.photoUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" /> : <div className="w-14 h-14 rounded-lg bg-amber-100 flex items-center justify-center text-2xl flex-shrink-0">{cat?.emoji || '📦'}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 truncate">{a.name}</p>
                    <p className="text-xs text-gray-600">{a.quantity} pcs · {inr(a.totalCost)}{a.purchaseDate ? ` · ${shortDate(a.purchaseDate)}` : ''}</p>
                    <p className="text-xs text-gray-500 truncate">{cat?.label} · {locName(a)}</p>
                    {a.expenseChanged && (
                      <p className="mt-1 text-xs font-semibold text-amber-800">
                        {a.expenseChanged.kind === 'changed' ? 'Expense changed - check it' : a.expenseChanged.kind === 'deleted' ? 'Expense was deleted - keep or remove?' : 'Expense is no longer equipment'}
                      </p>
                    )}
                  </div>
                </button>
                {canEdit && a.needsReview && !a.expenseChanged && (
                  <div className="mt-2.5 flex gap-2">
                    <button type="button" disabled={quickBusy === a.id} onClick={() => quickDismiss(a)} className="px-3 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 disabled:opacity-60">Not equipment</button>
                    <button type="button" onClick={() => openAsset(a)} className="px-3 py-2 rounded-lg border border-amber-300 text-xs font-semibold text-amber-800">Edit / photo</button>
                    <button type="button" disabled={quickBusy === a.id} onClick={() => quickConfirm(a)} className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-60">
                      {quickBusy === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Looks right
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Search and condition filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search · খুঁজুন" className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-base" />
          {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400" aria-label="Clear search"><X className="w-4 h-4" /></button>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {CONDITION_FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setCondition(f.key)} className={`flex-shrink-0 px-3 py-1.5 rounded-full border text-xs font-medium ${condition === f.key ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* The list, by type */}
      {view.groups.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          {search || condition !== 'in_use' ? 'Nothing matches.' : (
            <>
              Nothing listed here yet.
              {canAddHere && <> Tap <strong>Add items</strong> to list what this place already has - steamers, fridge, racks, bins, pans.</>}
              <span className="block mt-1 text-xs">New equipment bought through expenses will appear here by itself.</span>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {view.groups.map((g) => {
            const shut = !!collapsed[g.key];
            const value = g.items.reduce((s, a) => s + (a.totalCost || 0), 0);
            return (
              <section key={g.key} className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
                <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !shut }))} className="w-full flex items-center justify-between gap-2 px-3.5 py-3 bg-gray-50 border-b border-gray-100">
                  <span className="flex items-center gap-2 min-w-0">
                    {shut ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    <span className="font-semibold text-gray-900 truncate">{g.emoji} {g.label}</span>
                    <span className="text-xs text-gray-500 hidden sm:inline">{g.bn}</span>
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{g.items.length} · {inr(value)}</span>
                </button>
                {!shut && (
                  <ul className="divide-y divide-gray-100">
                    {g.items.map((a) => (
                      <li key={a.id}>
                        <button type="button" onClick={() => openAsset(a)} className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 active:bg-gray-50">
                          {a.photoUrl ? <img src={a.photoUrl} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" /> : <div className="w-11 h-11 rounded-lg bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">{g.emoji}</div>}
                          <div className="min-w-0 flex-1">
                            <p className={`font-medium truncate ${a.condition === 'disposed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{a.name}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {a.quantity} pcs{a.totalCost != null ? ` · ${inr(a.totalCost)}` : ''}{a.purchaseDate ? ` · ${shortDate(a.purchaseDate)}` : ''}{loc === 'all' ? ` · ${locName(a)}` : ''}
                              {(a.atEvents || []).map((x) => ` · ${x.quantity} at ${x.eventName}`).join('')}
                            </p>
                          </div>
                          <ConditionBadge condition={a.condition} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Items taken off as "not equipment", for the people who can bring them back */}
      {canAddHere && (
        <div className="pt-1">
          <button type="button" onClick={() => setShowRemoved((s) => !s)} className="text-xs text-gray-500 underline">
            {showRemoved ? 'Hide removed items' : 'Show items removed as "not equipment"'}
          </button>
          {showRemoved && (
            <ul className="mt-2 rounded-2xl bg-white border border-gray-200 divide-y divide-gray-100">
              {view.removed.length === 0 && <li className="px-3.5 py-3 text-sm text-gray-500">None.</li>}
              {view.removed.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => openAsset(a)} className="w-full text-left px-3.5 py-2.5 text-sm text-gray-600 flex justify-between gap-2">
                    <span className="truncate">{a.name}</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{inr(a.totalCost)} · {shortDate(a.purchaseDate)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {data?.lastReconcile && (
        <p className="text-[11px] text-gray-400">
          Expenses last checked {new Date(data.lastReconcile.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.
        </p>
      )}

      {open && perms && (
        <AssetSheet
          key={open.asset.id}
          asset={open.asset}
          mode={open.mode}
          locations={locations}
          editableLocations={perms.canEditAll ? locations.map((l) => locationKey(l.kind, l.id)) : perms.editableLocations}
          canDelete={perms.canDelete}
          onClose={() => setOpen(null)}
          onSaved={(row) => { upsert(row); setOpen((o) => (o && o.asset.id === row.id ? { ...o, asset: row } : o)); }}
          onRemoved={drop}
        />
      )}

      {adding && perms && (
        <AddAssetsSheet
          locations={locations}
          editableLocations={perms.canEditAll ? locations.map((l) => locationKey(l.kind, l.id)) : perms.editableLocations}
          defaultLocation={loc}
          onClose={() => setAdding(false)}
          onAdded={(rows) => rows.forEach(upsert)}
        />
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setImportOpen(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-gray-900">Import past equipment purchases</p>
            <p className="text-sm text-gray-600">
              Equipment bought through expenses from this date on is added to the list as "needs review", the same way new purchases are.
              Ones already in the list are skipped.
            </p>
            <label className="block text-xs font-medium text-gray-700">
              From · থেকে
              <input type="date" value={importFrom} max={getTodayIST()} onChange={(e) => setImportFrom(e.target.value)} className="w-full mt-1 px-3 py-2.5 border border-gray-300 rounded-xl text-base" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setImportOpen(false)} className="px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700">Cancel</button>
              <button type="button" onClick={runImport} disabled={importing || !importFrom} className="flex-1 py-3 rounded-xl bg-orange-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {importing && <Loader2 className="w-4 h-4 animate-spin" />} Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
