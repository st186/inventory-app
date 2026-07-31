import { useState, useEffect, useMemo } from 'react';
import { InventoryContextType } from '../App';
import { DateSelector } from './DateSelector';
import { OnlineSalesTab } from './OnlineSalesTab';
import { Eye, Lock, Banknote, Smartphone, Wallet, CheckCircle, Clock } from 'lucide-react';
import * as api from '../utils/api';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
};

function StatChip({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <div className="bg-secondary rounded-2xl p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xl mt-1 ${tone === 'danger' ? 'text-red-600' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

export function SalesView({ context, selectedStoreId }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [onlineSalesData, setOnlineSalesData] = useState<api.OnlineSalesEntry[]>([]);

  const effectiveStoreId = selectedStoreId || context.user?.storeId;

  // Can this user manage aggregator payout reconciliation? (operations manager / cluster head only)
  const canManagePayouts =
    (context.user?.role === 'manager' && context.user?.designation !== 'store_incharge' && context.user?.designation !== 'production_incharge') ||
    context.user?.role === 'cluster_head';

  useEffect(() => {
    if (!context.user?.accessToken) return;
    api.getOnlineSalesData(context.user.accessToken).then(setOnlineSalesData).catch(() => {});
  }, [context.user?.accessToken]);

  const entry = context.salesData.find((sale) => {
    const dateMatch = sale.date === selectedDate;
    const storeMatch = effectiveStoreId ? sale.storeId === effectiveStoreId : true;
    return dateMatch && storeMatch;
  });

  const onlineSalesTotal = useMemo(() => {
    const filtered = effectiveStoreId
      ? onlineSalesData.filter((s) => s.storeId === effectiveStoreId)
      : onlineSalesData;
    const forDate = filtered.find((s) => s.date === selectedDate);
    return forDate ? (forDate.swiggySales || 0) + (forDate.zomatoSales || 0) : 0;
  }, [onlineSalesData, selectedDate, effectiveStoreId]);

  const totalRevenue = entry ? entry.offlineSales + onlineSalesTotal : onlineSalesTotal;
  const discrepancy = entry?.salesDiscrepancy !== undefined ? entry.salesDiscrepancy : (entry?.cashOffset || 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with Read-Only Badge */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5 text-primary" />
          <h1 className="text-xl text-foreground">Sales overview</h1>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-full">
          <Lock className="w-3.5 h-3.5 text-amber-700" />
          <span className="text-xs text-amber-800">View only</span>
        </div>
      </div>

      <DateSelector
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {!entry && !onlineSalesTotal ? (
        <div className="bg-card rounded-2xl border border-border p-10 mt-6 text-center">
          <Wallet className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No sales entry logged for this date</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 mt-6 mb-4">
            <StatChip label="Total revenue" value={`₹${totalRevenue.toLocaleString()}`} />
            <StatChip label="Offline sales" value={`₹${(entry?.offlineSales || 0).toLocaleString()}`} />
            <StatChip label="Online sales" value={`₹${onlineSalesTotal.toLocaleString()}`} />
            <StatChip
              label="Cash discrepancy"
              value={`₹${Math.abs(discrepancy).toLocaleString()}`}
              tone={Math.abs(discrepancy) > 0 ? 'danger' : 'default'}
            />
          </div>

          {entry && (
            <>
              {/* Payment breakdown */}
              <div className="bg-card rounded-2xl border border-border p-5 mb-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <h2 className="text-foreground">Payment breakdown</h2>
                </div>
                <div className="space-y-2">
                  <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-sm text-foreground">
                      <Banknote className="w-4 h-4 text-green-600" /> Cash received
                    </span>
                    <span className="text-sm text-primary">₹{entry.cashAmount.toLocaleString()}</span>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-sm text-foreground">
                      <Smartphone className="w-4 h-4 text-primary" /> Paytm received
                    </span>
                    <span className="text-sm text-primary">₹{entry.paytmAmount.toLocaleString()}</span>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                    <span className="text-sm text-foreground">Actual cash in hand</span>
                    <span className="text-sm text-primary">₹{entry.actualCashInHand.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="bg-card rounded-2xl border border-border p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Logged by</p>
                    <p className="text-sm text-foreground mt-0.5">{entry.createdByName || entry.createdByEmail || entry.createdBy}</p>
                  </div>
                  {entry.approvalStatus === 'approved' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                      <CheckCircle className="w-4 h-4" /> Approved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
                      <Clock className="w-4 h-4" /> Pending approval
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Info Message */}
      <div className="mt-4 bg-secondary rounded-2xl p-4">
        <div className="flex gap-3">
          <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            You're viewing sales data in read-only mode. Only the store incharge can log or edit sales entries.
          </p>
        </div>
      </div>

      {/* Aggregator payout reconciliation - operations manager / cluster head only */}
      {canManagePayouts && (
        <div className="mt-6">
          <OnlineSalesTab
            context={context}
            selectedStoreId={selectedStoreId}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
        </div>
      )}
    </div>
  );
}
