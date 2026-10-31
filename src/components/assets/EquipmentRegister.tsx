import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Factory, History, PackageSearch, Plus, RefreshCw, Search, Store, X } from 'lucide-react';
import { toast } from 'sonner';
import { ASSET_CATEGORIES, type AssetCondition } from '../../utils/assetRules';
import { getTodayIST } from '../../utils/timezone';
import { useT } from '../../utils/i18n';
import { Button } from '../ui/button';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { Field } from '../ui/field';
import { FilterChips } from '../ui/chip';
import { ListGroup, ListRow, IconWell } from '../ui/list-row';
import { StatTile, StatSplit } from '../ui/stat-tile';
import { StatusChip } from '../ui/status-chip';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { ResponsiveModal } from '../ui/responsive-modal';
import { LoadingList } from '../setup/SetupPage';
import { assetCategoryIcon } from '../setup/setupIcons';
import { AssetSheet } from './AssetSheet';
import { EquipmentCheckSheet } from './EquipmentCheckSheet';
import { AddAssetsSheet } from './AddAssetsSheet';
import { ConditionBadge } from './ConditionBadge';
import { assetCategoryKey, conditionKey } from './assetLabels';
import {
  dismissAsset, getEquipmentCheck, importPastPurchases, inr, listAssets, locationKey, shortDate, updateAsset,
  type AssetList, type AssetRow, type EquipmentCheck,
} from './assetsApi';

// Equipment & assets register (owner, 27 Oct 2026): everything each store and production house
// has, with what needs checking first. Items bought through expenses appear here by themselves
// as "needs review" (server assets.ts); the rest is listed by hand once. One screen for the owner
// and the incharges - the server's permissions decide which actions show.

type ConditionFilter = 'in_use' | AssetCondition;
const CONDITION_FILTERS: ConditionFilter[] = ['in_use', 'missing', 'needs_repair', 'broken', 'disposed'];
const keyOf = (a: AssetRow) => (a.locationId ? locationKey(a.locationKind, a.locationId) : 'none');

function AssetThumb({ asset }: { asset: AssetRow }) {
  if (asset.photoUrl) return <img src={asset.photoUrl} alt="" className="size-10 shrink-0 rounded-md bg-surface-2 object-cover" />;
  return <IconWell icon={assetCategoryIcon(asset.category)} size={40} />;
}

export function EquipmentRegister() {
  const { t, lang } = useT();
  const [data, setData] = useState<AssetList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loc, setLoc] = useState('');
  const [condition, setCondition] = useState<ConditionFilter>('in_use');
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<{ asset: AssetRow; mode: 'review' | 'edit' | 'view' } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFrom, setImportFrom] = useState('2026-01-01');
  const [importing, setImporting] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  // The 3-monthly equipment check of the place in view (owner, 30 Oct 2026).
  const [check, setCheck] = useState<EquipmentCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listAssets(showRemoved);
      setData(next);
      setLoadError(null);
      // First load: your own place if you have one, otherwise everything.
      setLoc((cur) => cur || (next.locations.length === 1 ? locationKey(next.locations[0].kind, next.locations[0].id) : 'all'));
    } catch (e: any) {
      setLoadError(e?.message || t('assets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [showRemoved, t]);

  useEffect(() => { load(); }, [load]);

  const perms = data?.permissions;
  const locations = data?.locations || [];
  const canEditKey = (key: string) => !!perms && (perms.canEditAll || perms.editableLocations.includes(key));
  const locName = (a: AssetRow) => locations.find((l) => l.kind === a.locationKind && l.id === a.locationId)?.name || t('assets.noLocation');

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
    const missingNow = live.filter((a) => a.missing && a.condition !== 'disposed');
    const counts = new Map<string, number>();
    for (const a of all) if (!a.dismissed && a.condition !== 'disposed') counts.set(keyOf(a), (counts.get(keyOf(a)) || 0) + 1);
    return {
      review,
      listed,
      removed: here.filter((a) => a.dismissed),
      missing: missingNow,
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

  const openAsset = (a: AssetRow) => {
    setSheet({ asset: a, mode: canEditKey(keyOf(a)) && !a.dismissed ? (a.needsReview ? 'review' : 'edit') : canEditKey(keyOf(a)) ? 'edit' : 'view' });
    setSheetOpen(true);
  };

  const quickConfirm = async (a: AssetRow) => {
    if (!a.locationId) return openAsset(a);
    setQuickBusy(a.id);
    try {
      upsert(await updateAsset(a.id, { confirm: true }));
      toast.success(t('assets.confirmed'));
    } catch (e: any) { toast.error(e?.message || t('assets.err.generic')); } finally { setQuickBusy(null); }
  };

  const quickDismiss = async (a: AssetRow) => {
    setQuickBusy(a.id);
    try {
      await dismissAsset(a.id);
      drop(a.id);
      toast.success(t('assets.removed'));
    } catch (e: any) { toast.error(e?.message || t('assets.err.generic')); } finally { setQuickBusy(null); }
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const r = await importPastPurchases(importFrom);
      toast.success(r.added ? t('assets.import.added', { n: r.added }) : t('assets.import.none'));
      setImportOpen(false);
      await load();
    } catch (e: any) { toast.error(e?.message || t('assets.import.failed')); } finally { setImporting(false); }
  };

  // One place in view: its equipment check (open now, done, or when next).
  const checkPlace = (locations.length === 1 ? locations[0] : locations.find((l) => locationKey(l.kind, l.id) === loc)) || null;
  useEffect(() => {
    setCheck(null);
    if (!checkPlace) return;
    getEquipmentCheck(checkPlace.kind, checkPlace.id).then(setCheck).catch(() => undefined);
  }, [checkPlace?.kind, checkPlace?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const periodName = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  if (loading && !data) return <LoadingList withTile rows={6} />;
  if (loadError && !data) return <ErrorState body={loadError} onRetry={load} retrying={loading} />;

  const canAddHere = !!perms && perms.editableLocations.length > 0;
  const placeIcon = (kind: string) => (kind === 'production_house' ? <Factory className="size-4" aria-hidden="true" /> : <Store className="size-4" aria-hidden="true" />);
  const chips = [
    ...(locations.length > 1 ? [{ value: 'all', label: t('assets.allPlaces') }] : []),
    ...locations.map((l) => {
      const key = locationKey(l.kind, l.id);
      return { value: key, label: <span className="inline-flex items-center gap-1.5">{placeIcon(l.kind)}{l.name}</span>, count: view.counts.get(key) || 0 };
    }),
    ...(view.hasUnassigned && perms?.canEditAll ? [{ value: 'none', label: t('assets.noLocation'), count: view.counts.get('none') || 0 }] : []),
  ];
  const editable = perms ? (perms.canEditAll ? locations.map((l) => locationKey(l.kind, l.id)) : perms.editableLocations) : [];
  const filtering = !!search.trim() || condition !== 'in_use';

  return (
    <div className="flex flex-col gap-5" lang={lang}>
      {/* Place, actions */}
      <div className="flex flex-wrap items-center gap-2">
        {locations.length === 1 && (
          <span className="mr-auto inline-flex min-w-0 items-center gap-1.5 text-body-md font-medium text-text">
            {placeIcon(locations[0].kind)}
            <span className="truncate">{locations[0].name}</span>
          </span>
        )}
        <div className={locations.length === 1 ? 'flex items-center gap-2' : 'flex w-full items-center gap-2'}>
          <IconButton label={t('shell.refresh')} icon={<RefreshCw />} loading={loading} onClick={load} variant="secondary" />
          {perms?.canImport && (
            <Button variant="secondary" leadingIcon={<History />} onClick={() => setImportOpen(true)} className="hidden sm:inline-flex">
              {t('assets.importPast')}
            </Button>
          )}
          {canAddHere && (
            <Button leadingIcon={<Plus />} onClick={() => setAdding(true)} className={locations.length === 1 ? '' : 'flex-1 sm:ml-auto sm:flex-none'}>
              {t('assets.addItems')}
            </Button>
          )}
        </div>
      </div>

      {(locations.length > 1 || view.hasUnassigned) && (
        <FilterChips aria-label={t('assets.places')} value={loc} onValueChange={setLoc} options={chips} />
      )}

      {/* Totals */}
      <StatTile
        label={t('assets.valueAtCost')}
        value={inr(view.totals.value)}
        caption={view.totals.unpriced ? t('assets.withoutCost', { n: view.totals.unpriced }) : t('assets.allPriced')}
        headerChip={view.totals.repair ? <StatusChip tone="warning">{t('assets.needRepair', { n: view.totals.repair })}</StatusChip> : undefined}
      >
        <StatSplit
          items={[
            { label: t('assets.items'), value: view.totals.items },
            { label: t('assets.pieces'), value: view.totals.pieces },
            { label: t('assets.toCheck'), value: <span className={view.review.length ? 'text-warning' : undefined}>{view.review.length}</span> },
          ]}
        />
      </StatTile>

      {/* Missing first, then the equipment check */}
      {view.missing.length > 0 && (
        <Callout tone="danger" title={t('assets.missing.listTitle', { n: view.missing.length })}
          action={<Button variant="secondary" size="sm" onClick={() => setCondition('missing')}>{t('assets.missing.show')}</Button>}>
          {view.missing.map((a) => a.name).slice(0, 6).join(', ')}
        </Callout>
      )}
      {checkPlace && check && (
        <Callout
          tone={check.done ? 'success' : check.open ? 'warning' : 'neutral'}
          title={check.done ? t('assets.check.doneTitle', { when: periodName(check.period) }) : check.open ? t('assets.check.dueTitle') : t('assets.check.nextTitle', { when: periodName(check.period) })}
          action={check.canCheck && !check.done && (check.open || perms?.canEditAll) ? <Button size="sm" onClick={() => setChecking(true)}>{t('assets.check.start')}</Button> : undefined}
        >
          {check.done && check.record
            ? t('assets.check.doneBody', { name: check.record.by, n: check.record.items, missing: check.record.notFound.length + check.record.short.length })
            : check.open ? t('assets.check.dueBody') : undefined}
        </Callout>
      )}
      {checkPlace && (
        <EquipmentCheckSheet open={checking} locationKind={checkPlace.kind} locationId={checkPlace.id} placeName={checkPlace.name}
          onClose={() => setChecking(false)} onDone={() => { load(); getEquipmentCheck(checkPlace.kind, checkPlace.id).then(setCheck).catch(() => undefined); }} />
      )}

      {/* Needs review first */}
      {view.review.length > 0 && (
        <section className="flex flex-col gap-2.5" aria-labelledby="asset-review">
          <Callout tone="warning" title={<span id="asset-review">{t('assets.reviewTitle')}</span>}>{t('assets.reviewBody')}</Callout>
          {view.review.map((a) => {
            const canEdit = canEditKey(keyOf(a));
            const subtitle = [t('assets.pcs', { n: a.quantity }), inr(a.totalCost), a.purchaseDate ? shortDate(a.purchaseDate) : '', locName(a)].filter(Boolean).join(' · ');
            return (
              <div key={a.id} className="overflow-hidden rounded-lg border border-border bg-surface">
                <ListRow
                  leading={<AssetThumb asset={a} />}
                  title={a.name}
                  subtitle={
                    <>
                      <span className="num">{subtitle}</span>
                      {a.needsReview && a.source.aiWhy && <span className="mt-0.5 block text-text-3">{t('assets.bunnyShort', { why: a.source.aiWhy })}</span>}
                      {a.expenseChanged && (
                        <span className="mt-0.5 block font-medium text-warning">
                          {a.expenseChanged.kind === 'changed' ? t('assets.expenseChanged') : a.expenseChanged.kind === 'deleted' ? t('assets.expenseDeleted') : t('assets.expenseNotEquipment')}
                        </span>
                      )}
                    </>
                  }
                  onClick={() => openAsset(a)}
                />
                {canEdit && a.needsReview && !a.expenseChanged && (
                  <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                    <Button variant="ghost" size="sm" disabled={quickBusy === a.id} onClick={() => quickDismiss(a)}>{t('assets.notEquipment')}</Button>
                    <Button variant="secondary" size="sm" onClick={() => openAsset(a)}>{t('assets.editPhoto')}</Button>
                    <Button variant="secondary" size="sm" className="ml-auto" loading={quickBusy === a.id} leadingIcon={<Check className="text-success" />} onClick={() => quickConfirm(a)}>
                      {t('assets.looksRight')}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Search and condition filter */}
      <div className="flex flex-col gap-3">
        <Field label={t('assets.search')} hideLabel>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('assets.search')}
            leading={<Search className="size-5" />}
            trailing={search ? <IconButton size="sm" label={t('assets.clearSearch')} icon={<X />} onClick={() => setSearch('')} /> : undefined}
          />
        </Field>
        <FilterChips
          aria-label={t('assets.conditionFilter')}
          value={condition}
          onValueChange={setCondition}
          options={CONDITION_FILTERS.map((f) => ({ value: f, label: f === 'in_use' ? t('assets.filter.inUse') : t(conditionKey(f)) }))}
        />
      </div>

      {/* The list, by type */}
      {view.groups.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          {filtering ? (
            <EmptyState compact icon={PackageSearch} title={t('assets.nothingMatches')} body={t('assets.nothingMatchesBody')} />
          ) : (
            <EmptyState
              icon={PackageSearch}
              title={t('assets.emptyTitle')}
              body={canAddHere ? t('assets.emptyBody') : t('assets.emptyBodyView')}
              action={canAddHere ? <Button variant="secondary" leadingIcon={<Plus />} onClick={() => setAdding(true)}>{t('assets.addItems')}</Button> : undefined}
            />
          )}
        </div>
      ) : (
        view.groups.map((g) => {
          const shut = !!collapsed[g.key];
          const value = g.items.reduce((s, a) => s + (a.totalCost || 0), 0);
          const Icon = assetCategoryIcon(g.key);
          return (
            <ListGroup
              key={g.key}
              title={<span className="inline-flex items-center gap-2"><Icon className="size-5 text-text-2" aria-hidden="true" />{t(assetCategoryKey(g.key))}</span>}
              meta={<span className="num">{g.items.length} · {inr(value)}</span>}
              action={
                <IconButton
                  size="sm"
                  label={t(assetCategoryKey(g.key))}
                  aria-expanded={!shut}
                  icon={shut ? <ChevronRight /> : <ChevronDown />}
                  onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !shut }))}
                />
              }
              cardClassName={shut ? 'hidden' : undefined}
            >
              {!shut && g.items.map((a) => {
                const parts = [
                  t('assets.pcs', { n: a.quantity }),
                  a.totalCost != null ? inr(a.totalCost) : '',
                  a.purchaseDate ? shortDate(a.purchaseDate) : '',
                  loc === 'all' ? locName(a) : '',
                  ...(a.atEvents || []).map((x) => t('assets.atEvent', { n: x.quantity, event: x.eventName })),
                ].filter(Boolean);
                return (
                  <ListRow
                    key={a.id}
                    leading={<AssetThumb asset={a} />}
                    title={<span className={a.condition === 'disposed' ? 'text-text-3 line-through' : undefined}>{a.name}</span>}
                    subtitle={<span className="num">{parts.join(' · ')}</span>}
                    trailing={a.missing && a.condition !== 'missing' ? <StatusChip tone="danger">{t('assets.missing.nMissing', { n: a.missing.count })}</StatusChip> : <ConditionBadge condition={a.condition} />}
                    onClick={() => openAsset(a)}
                  />
                );
              })}
            </ListGroup>
          );
        })
      )}

      {/* Items taken off as "not equipment", for the people who can bring them back */}
      {perms?.canImport && (
        <ListGroup className="sm:hidden">
          <ListRow icon={History} title={t('assets.importPast')} onClick={() => setImportOpen(true)} />
        </ListGroup>
      )}

      {canAddHere && (
        <ListGroup>
          <ListRow
            title={showRemoved ? t('assets.hideRemoved') : t('assets.showRemoved')}
            subtitle={t('assets.removedList')}
            muted
            chevron="down"
            aria-expanded={showRemoved}
            onClick={() => setShowRemoved((s) => !s)}
          />
          {showRemoved && view.removed.length === 0 && <ListRow density="compact" title={<span className="text-text-2">{t('assets.noneRemoved')}</span>} />}
          {showRemoved && view.removed.map((a) => (
            <ListRow key={a.id} density="compact" title={a.name} subtitle={<span className="num">{inr(a.totalCost)} · {shortDate(a.purchaseDate)}</span>} onClick={() => openAsset(a)} />
          ))}
        </ListGroup>
      )}

      {data?.lastReconcile && (
        <p className="text-caption text-text-3">
          {t('assets.lastChecked', { when: new Date(data.lastReconcile.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) })}
        </p>
      )}

      {sheet && perms && (
        <AssetSheet
          key={sheet.asset.id}
          open={sheetOpen}
          asset={sheet.asset}
          mode={sheet.mode}
          locations={locations}
          editableLocations={editable}
          canWriteOff={!!perms?.canEditAll}
          canDelete={perms.canDelete}
          onClose={() => setSheetOpen(false)}
          onClosed={() => setSheet(null)}
          onSaved={(row) => { upsert(row); setSheet((o) => (o && o.asset.id === row.id ? { ...o, asset: row } : o)); }}
          onRemoved={drop}
        />
      )}

      {perms && (
        <AddAssetsSheet
          open={adding}
          locations={locations}
          editableLocations={editable}
          defaultLocation={loc}
          onClose={() => setAdding(false)}
          onAdded={(rows) => rows.forEach(upsert)}
        />
      )}

      <ResponsiveModal
        open={importOpen}
        onOpenChange={setImportOpen}
        title={t('assets.import.title')}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setImportOpen(false)}>{t('common.cancel')}</Button>
            <Button size="lg" className="flex-1" loading={importing} disabled={!importFrom} onClick={runImport}>{t('assets.import.go')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-text-2">{t('assets.import.body')}</p>
          <Field label={t('assets.import.from')}>
            <Input type="date" value={importFrom} max={getTodayIST()} onChange={(e) => setImportFrom(e.target.value)} />
          </Field>
        </div>
      </ResponsiveModal>
    </div>
  );
}
