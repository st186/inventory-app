import { useState, useEffect } from 'react';
import { CheckCircle2, ClipboardCheck, History, TrendingDown, XCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { promptText } from './ui/confirm';
import { EmptyState } from './ui/empty-state';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { ListGroup, ListRow } from './ui/list-row';
import { ResponsiveModal } from './ui/responsive-modal';
import { SegmentedControl } from './ui/segmented-control';
import { SkeletonListRows } from './ui/skeleton';
import { StatGrid, StatTile } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { currentAuthUserId } from '../utils/accessToken';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { toast } from './ui/sonner';

type RecalibrationReportsProps = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  onOpenRecalibration?: () => void;
  locationType?: 'store' | 'production_house'; // CRITICAL: Separate store and production house data
};

export function RecalibrationReports({ context, selectedStoreId, onOpenRecalibration, locationType }: RecalibrationReportsProps) {
  // Determine effective location ID for queries
  const isClusterHead = context.user?.role === 'cluster_head';
  const isManager = context.user?.role === 'manager';
  const isProductionIncharge = context.user?.designation === 'production_incharge';
  const isStoreIncharge = context.user?.designation === 'store_incharge';
  
  // IMPORTANT: Only Operations Managers and Cluster Heads can approve recalibrations
  // Store Incharges and Production Incharges can only submit, not approve
  const canApproveRecalibrations = (isClusterHead || isManager) && !isProductionIncharge && !isStoreIncharge;
  
  // IMPORTANT: Store/Production Incharges should default to 'history' view since they can't see pending approvals
  const defaultView = canApproveRecalibrations ? 'pending' : 'history';
  const [view, setView] = useState<'pending' | 'history' | 'wastage'>(defaultView as 'pending' | 'history' | 'wastage');
  const [pendingRecalibrations, setPendingRecalibrations] = useState<any[]>([]);
  const [historyRecalibrations, setHistoryRecalibrations] = useState<any[]>([]);
  const [wastageReport, setWastageReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [selectedRecalibration, setSelectedRecalibration] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // CRITICAL FIX: For Production Analytics, Cluster Heads should ALWAYS see all production houses
  // regardless of which specific production house is selected from the dropdown
  // This is because production house selection in Production Analytics is just for filtering
  // production logs/requests, NOT for recalibration reports which should show cluster-wide data
  const effectiveStoreId = isClusterHead && !selectedStoreId 
    ? 'all-cluster-locations' 
    : isClusterHead && locationType === 'production_house'
    ? 'all-cluster-locations'  // Always show all production houses for cluster heads
    : (selectedStoreId || context.user?.storeId);
  
  // DEBUG: Log the IDs being used
  console.log('🔍 RecalibrationReports - ID Debug:');
  console.log('  - selectedStoreId (prop):', selectedStoreId);
  console.log('  - context.user?.storeId:', context.user?.storeId);
  console.log('  - effectiveStoreId (computed):', effectiveStoreId);
  console.log('  - locationType:', locationType);
  console.log('  - isClusterHead:', isClusterHead);
  console.log('  - Production Houses:', context.productionHouses?.map(ph => ({ id: ph.id, name: ph.name })));

  useEffect(() => {
    // CRITICAL FIX: Production Incharge should NOT see pending approvals
    // Only Cluster Heads and Operations Managers can approve
    if (view === 'pending' && canApproveRecalibrations) {
      fetchPendingRecalibrations();
    } else if (view === 'history') {
      fetchHistoryRecalibrations();
    } else if (view === 'wastage') {
      fetchWastageReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedMonth, effectiveStoreId, isClusterHead, isManager, isProductionIncharge, isStoreIncharge]);

  async function fetchPendingRecalibrations() {
    try {
      setLoading(true);
      const response = await api.getAllRecalibrationsForApproval(context.user?.accessToken || '');
      setPendingRecalibrations(response.recalibrations || []);
    } catch (error) {
      console.error('Error fetching pending recalibrations:', error);
      toast.error('Failed to fetch pending recalibrations');
    } finally {
      setLoading(false);
    }
  }

  async function fetchHistoryRecalibrations() {
    if (!effectiveStoreId) return;

    try {
      setLoading(true);
      
      console.log('📋 Fetching recalibration history:');
      console.log('  - effectiveStoreId:', effectiveStoreId);
      console.log('  - selectedStoreId:', selectedStoreId);
      console.log('  - locationType:', locationType);
      console.log('  - isClusterHead:', isClusterHead);
      console.log('  - user.storeId:', context.user?.storeId);
      
      const response = await api.getRecalibrationHistory(
        context.user?.accessToken || '',
        effectiveStoreId,
        locationType
      );
      
      console.log('📋 History response:', response);
      console.log('📋 History records found:', response?.history?.length || 0);
      if (response?.history?.length > 0) {
        console.log('📋 Sample record locationIds:', response.history.slice(0, 3).map((r: any) => r.locationId));
      }
      
      setHistoryRecalibrations(response.history || []);
    } catch (error) {
      console.error('Error fetching recalibration history:', error);
      toast.error('Failed to fetch recalibration history');
    } finally {
      setLoading(false);
    }
  }

  async function fetchWastageReport() {
    try {
      setLoading(true);
      
      console.log('📊 Fetching wastage report:');
      console.log('  - month:', selectedMonth);
      console.log('  - effectiveStoreId:', effectiveStoreId);
      console.log('  - selectedStoreId:', selectedStoreId);
      console.log('  - locationType:', locationType);
      console.log('  - isClusterHead:', isClusterHead);
      
      const response = await api.getMonthlyWastageReport(
        context.user?.accessToken || '',
        selectedMonth,
        effectiveStoreId || undefined,
        locationType
      );
      
      console.log('📊 Wastage response:', response);
      console.log('📊 Wastage items found:', response?.items?.length || 0);
      if (response?.items?.length > 0) {
        console.log('📊 Sample item locationIds:', response.items.slice(0, 3).map((i: any) => i.locationId));
      }
      
      setWastageReport(response);
    } catch (error) {
      console.error('Error fetching wastage report:', error);
      toast.error('Failed to fetch wastage report');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(recalibrationId: string) {
    try {
      await api.approveRecalibration(context.user?.accessToken || '', recalibrationId);
      toast.success('Stock count approved');
      setShowDetailModal(false);
      fetchPendingRecalibrations();
    } catch (error) {
      console.error('Error approving recalibration:', error);
      toast.error('Failed to approve recalibration');
    }
  }

  async function handleReject(recalibrationId: string) {
    const reason = await promptText({ title: 'Reject this stock count?', label: 'Reason', required: true, confirmLabel: 'Reject count', tone: 'danger' });
    if (!reason) return;

    try {
      await api.rejectRecalibration(context.user?.accessToken || '', recalibrationId, reason);
      toast.success('Stock count rejected');
      setShowDetailModal(false);
      fetchPendingRecalibrations();
    } catch (error) {
      console.error('Error rejecting recalibration:', error);
      toast.error('Failed to reject recalibration');
    }
  }

  function viewDetails(recalibration: any) {
    setSelectedRecalibration(recalibration);
    setShowDetailModal(true);
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const myId = currentAuthUserId();
  const typeLabel = (r: any) => (r.locationType === 'production_house' ? 'Production house' : 'Store');
  const statusChip = (status?: string) =>
    status === 'approved' ? <StatusChip status="approval.approved" /> : status === 'rejected' ? <StatusChip status="approval.rejected" /> : <StatusChip status="approval.pending" />;
  const counts = (r: any) => ({
    wastage: r.items?.filter((i: any) => i.adjustmentType === 'wastage').length || 0,
    errors: r.items?.filter((i: any) => i.adjustmentType === 'counting_error').length || 0,
    total: r.items?.length || 0,
  });
  const selected = selectedRecalibration;
  const ownCount = !!selected && !!myId && selected.performedBy === myId;
  const canActOnSelected = view === 'pending' && canApproveRecalibrations && !!selected && (!selected.status || selected.status === 'pending');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-title font-semibold text-text">Stock counts</h2>
          <p className="text-body-sm text-text-2">
            {view === 'pending' && 'Monthly stock counts waiting for approval'}
            {view === 'history' && 'Past stock counts'}
            {view === 'wastage' && 'Wastage and counting errors in a month'}
          </p>
        </div>
        {onOpenRecalibration && view === 'history' && locationType !== 'production_house' && (
          <Button variant="secondary" leadingIcon={<ClipboardCheck />} onClick={onOpenRecalibration}>New stock count</Button>
        )}
      </div>

      <SegmentedControl
        aria-label="Stock count reports"
        size="sm"
        value={view}
        onValueChange={(v) => setView(v as 'pending' | 'history' | 'wastage')}
        options={[
          ...(canApproveRecalibrations ? [{ value: 'pending' as const, label: 'To approve' }] : []),
          { value: 'history' as const, label: 'History' },
          { value: 'wastage' as const, label: 'Wastage' },
        ]}
      />

      {view === 'wastage' && (
        <Field label="Month">
          <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
        </Field>
      )}

      {loading ? (
        <SkeletonListRows count={4} />
      ) : (
        <>
          {view === 'pending' && (
            <ListGroup empty={<EmptyState compact icon={CheckCircle2} title="No stock counts waiting" />}>
              {pendingRecalibrations.map((recal) => {
                const c = counts(recal);
                return (
                  <ListRow
                    key={recal.id}
                    icon={ClipboardCheck}
                    title={recal.locationName}
                    subtitle={`${formatDate(recal.date)} · ${typeLabel(recal)} · ${c.total} items · ${c.wastage} wastage · ${c.errors} counting errors${recal.performedByName ? ` · by ${recal.performedByName}` : ''}`}
                    trailing={statusChip(recal.status)}
                    onClick={() => viewDetails(recal)}
                  />
                );
              })}
            </ListGroup>
          )}

          {view === 'history' && (
            <ListGroup empty={<EmptyState compact icon={History} title="No stock counts yet" />}>
              {historyRecalibrations.map((recal) => (
                <ListRow
                  key={recal.id}
                  icon={ClipboardCheck}
                  title={recal.locationName}
                  subtitle={`${formatDate(recal.date)} · ${typeLabel(recal)}`}
                  trailing={statusChip(recal.status)}
                  onClick={() => viewDetails(recal)}
                />
              ))}
            </ListGroup>
          )}

          {view === 'wastage' && (
            !wastageReport || wastageReport.items?.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface">
                <EmptyState compact icon={TrendingDown} title="No wastage in this month" />
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <StatGrid>
                  <StatTile label="Wastage" value={<span className="num">{wastageReport.summary?.totalWastage || 0}</span>} caption="items" />
                  <StatTile label="Counting errors" value={<span className="num">{wastageReport.summary?.totalCountingErrors || 0}</span>} caption="items" />
                  <StatTile label="Stock counts" value={<span className="num">{wastageReport.summary?.totalRecalibrations || 0}</span>} caption="this month" />
                  <StatTile label="Places" value={<span className="num">{wastageReport.summary?.uniqueLocations || 0}</span>} caption="stores and houses" />
                </StatGrid>
                <ListGroup title="Wastage and counting errors">
                  {wastageReport.items?.map((item: any, index: number) => (
                    <ListRow
                      key={index}
                      title={item.itemName}
                      subtitle={`${item.locationName} · expected ${item.systemQuantity} ${item.unit} · counted ${item.actualQuantity} ${item.unit}${item.notes ? ` · ${item.notes}` : ''}`}
                      chip={<StatusChip tone={item.adjustmentType === 'wastage' ? 'danger' : 'warning'} size="sm">{item.adjustmentType === 'wastage' ? 'Wastage' : 'Counting error'}</StatusChip>}
                      trailing={<span className={`num text-body-md font-semibold ${item.difference < 0 ? 'text-danger' : 'text-success'}`}>{item.difference > 0 ? '+' : ''}{item.difference}</span>}
                    />
                  ))}
                </ListGroup>
              </div>
            )
          )}
        </>
      )}

      <ResponsiveModal
        open={showDetailModal && !!selected}
        onOpenChange={(o) => { if (!o) setShowDetailModal(false); }}
        title={selected?.locationName || ''}
        description={selected ? `${formatDate(selected.date)} · ${typeLabel(selected)}${selected.performedByName ? ` · counted by ${selected.performedByName}` : ''}` : undefined}
        size="detail"
        footer={canActOnSelected && !ownCount ? (
          <>
            <Button variant="danger-ghost" size="lg" leadingIcon={<XCircle />} onClick={() => handleReject(selected.id)}>Reject</Button>
            <Button size="lg" className="flex-1" leadingIcon={<CheckCircle2 />} onClick={() => handleApprove(selected.id)}>Approve</Button>
          </>
        ) : undefined}
      >
        {selected && (
          <div className="flex flex-col gap-4">
            {canActOnSelected && ownCount && (
              <Callout tone="info" title="You did this count">Someone else approves it: the cluster head or an operations manager.</Callout>
            )}
            <ListGroup>
              {selected.items?.map((item: any, index: number) => (
                <ListRow
                  key={index}
                  title={item.itemName}
                  subtitle={`Expected ${item.systemQuantity} ${item.unit} · counted ${item.actualQuantity} ${item.unit}${item.notes ? ` · ${item.notes}` : ''}`}
                  chip={item.adjustmentType ? <StatusChip tone={item.adjustmentType === 'wastage' ? 'danger' : 'warning'} size="sm">{item.adjustmentType === 'wastage' ? 'Wastage' : 'Counting error'}</StatusChip> : undefined}
                  trailing={<span className={`num text-body-md font-semibold ${item.difference < 0 ? 'text-danger' : item.difference > 0 ? 'text-success' : 'text-text-2'}`}>{item.difference > 0 ? '+' : ''}{item.difference}</span>}
                />
              ))}
            </ListGroup>
          </div>
        )}
      </ResponsiveModal>
    </div>
  );
}
