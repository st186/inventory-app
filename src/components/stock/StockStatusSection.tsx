// "On hand at the store" (the last stock count + received - sold - wastage since, in pieces and
// plates, with the store's alert levels) and the stock jobs next to it: log wastage, count stock,
// alert levels, plate size, count reports.
import * as React from 'react';
import { AlertTriangle, ClipboardCheck, ListChecks, Package, RefreshCw, Settings2, SlidersHorizontal, Trash2, UtensilsCrossed } from 'lucide-react';
import { EmptyState } from '../ui/empty-state';
import { IconButton } from '../ui/icon-button';
import { ListGroup, ListRow } from '../ui/list-row';
import { SkeletonListRows } from '../ui/skeleton';
import { StatusChip } from '../ui/status-chip';
import { toast } from '../ui/sonner';
import { useT } from '../../utils/i18n';
import type { StockRequestsVM } from './useStockRequests';
import { CollapsibleCard, formatCount, momoName } from './stockShared';
import { DEFAULT_THRESHOLDS, computeStoreStock, isLowShare, stockLevel } from './stockMath';

export function StoreStockOnHand({ vm, defaultOpen = false }: { vm: StockRequestsVM; defaultOpen?: boolean }) {
  const { t, lang } = useT();
  const {
    context, salesData, finishedProducts, storeBases, matchesStoreScope, stockThresholds, momosPerPlate,
    handleSyncPosNow, isSyncingPos, storeDisplayName,
  } = vm;
  const result = React.useMemo(
    () => computeStoreStock({
      productionRequests: context.productionRequests || [],
      salesData,
      finishedProducts,
      storeBases,
      matchesStoreScope,
    }),
    // matchesStoreScope is rebuilt every render; the store scope itself is in the other inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [context.productionRequests, salesData, finishedProducts, storeBases, vm.storeScopeKey],
  );
  const lowCount = result ? result.lines.filter((l) => stockLevel(l.stock, stockThresholds[l.camelKey] || DEFAULT_THRESHOLDS) !== 'high').length : 0;

  return (
    <CollapsibleCard
      defaultOpen={defaultOpen}
      icon={<span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-2 [&_svg]:size-5" aria-hidden="true"><Package /></span>}
      title={t('stock.onHand.title')}
      subtitle={storeDisplayName ? `${storeDisplayName} · ${t('stock.onHand.caption')}` : t('stock.onHand.caption')}
      chip={lowCount > 0 ? <StatusChip tone="warning" icon={AlertTriangle}>{t('stock.onHand.lowCount', { n: lowCount })}</StatusChip> : undefined}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <span className="text-label text-text-3">{t('stock.onHand.formula')}</span>
        <IconButton
          label={isSyncingPos ? t('stock.onHand.syncing') : t('stock.onHand.syncPos')}
          icon={<RefreshCw className={isSyncingPos ? 'animate-spin' : undefined} />}
          disabled={isSyncingPos}
          onClick={handleSyncPosNow}
        />
      </div>
      {result === null ? (
        <SkeletonListRows count={4} leading="none" className="rounded-none border-0 border-t" />
      ) : result.totalStockSum === 0 ? (
        <div className="border-t border-border">
          <EmptyState compact icon={Package} title={t('stock.onHand.emptyTitle')} body={t('stock.onHand.emptyBody')} />
        </div>
      ) : (
        <div className="border-t border-border [&>*+*]:border-t [&>*+*]:border-border">
          {result.lines.map((line) => {
            const level = stockLevel(line.stock, stockThresholds[line.camelKey] || DEFAULT_THRESHOLDS);
            const lowShare = isLowShare(line);
            const plates = Math.round(line.stock / momosPerPlate);
            return (
              <ListRow
                key={line.camelKey}
                density="compact"
                title={momoName(lang, line.camelKey, line.label)}
                subtitle={t('stock.onHand.receivedSold', { received: formatCount(line.received), sold: formatCount(line.sold) })}
                chip={
                  line.stock < 0 ? <StatusChip tone="danger" icon={AlertTriangle} size="sm">{t('stock.level.oversold')}</StatusChip>
                    : level === 'critical' ? <StatusChip tone="danger" size="sm">{t('stock.level.critical')}</StatusChip>
                      : level === 'low' || lowShare ? <StatusChip tone="danger" size="sm">{t('stock.level.low')}</StatusChip>
                        : level === 'medium' ? <StatusChip tone="warning" size="sm">{t('stock.level.medium')}</StatusChip>
                          : undefined
                }
                trailing={
                  <span className="flex flex-col items-end">
                    <span className={`num text-body-md font-semibold ${line.stock < 0 || lowShare ? 'text-danger' : 'text-text'}`}>{t('stock.pcs', { n: formatCount(line.stock) })}</span>
                    <span className="num text-caption text-text-3">{t('stock.plates', { n: formatCount(plates) })}</span>
                  </span>
                }
              />
            );
          })}
        </div>
      )}
    </CollapsibleCard>
  );
}

/** Wastage, stock count and the cluster head's settings for the store stock. */
export function StockJobs({ vm }: { vm: StockRequestsVM }) {
  const { t } = useT();
  const {
    canViewWorkflowSummary, isStoreIncharge, isClusterHead, singleScopedStoreId, setShowStockWastageModal, setShowStoreRecalibration,
    setShowThresholdSettings, setShowPlateConfigModal, setShowRecalibrationReports, onNavigateToManageItems, momosPerPlate,
  } = vm;
  const needStore = (open: () => void, message: string) => () => {
    if (!singleScopedStoreId) {
      toast.info(message);
      return;
    }
    open();
  };
  const rows: React.ReactNode[] = [];
  if (canViewWorkflowSummary) {
    rows.push(<ListRow key="waste" icon={Trash2} title={t('stock.wastage.log')} subtitle={t('stock.wastage.caption')} onClick={needStore(() => setShowStockWastageModal(true), t('stock.pickOneStore'))} />);
  }
  if (isStoreIncharge) {
    rows.push(<ListRow key="count" icon={ClipboardCheck} title={t('stock.count.title')} subtitle={t('stock.count.caption')} onClick={() => setShowStoreRecalibration(true)} />);
  }
  if (isClusterHead) {
    rows.push(<ListRow key="alerts" icon={SlidersHorizontal} title="Stock alert levels" subtitle="When a momo shows Low or Critical" onClick={needStore(() => setShowThresholdSettings(true), 'Pick one store to edit its alert levels')} />);
    rows.push(<ListRow key="plate" icon={UtensilsCrossed} title="Plate size" subtitle={`${momosPerPlate} momos a plate`} onClick={() => setShowPlateConfigModal(true)} />);
    if (onNavigateToManageItems) rows.push(<ListRow key="items" icon={Settings2} title="Manage items" subtitle="Momo types and other items" onClick={onNavigateToManageItems} />);
    rows.push(<ListRow key="reports" icon={ListChecks} title="Stock counts" subtitle="Waiting for approval, history and wastage" onClick={() => setShowRecalibrationReports(true)} />);
  }
  if (rows.length === 0) return null;
  return <ListGroup overline={t('stock.jobs')}>{rows}</ListGroup>;
}
