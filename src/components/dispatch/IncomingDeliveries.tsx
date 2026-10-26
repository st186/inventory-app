import { useEffect, useMemo, useState } from 'react';
import { PackageCheck, Truck, RefreshCw, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import * as api from '../../utils/api';
import type { ProductionRequest } from '../../utils/api';
import { MOMO_TYPES } from '../../constants/momoTypes';
import { bagsLabel } from '../../utils/batches';
import { ReceiveDeliveryDialog, ReceiptSummary } from './ReceiveDeliveryDialog';
import { DispatchSlipModal } from './DispatchSlip';

type Props = {
  accessToken: string;
  storeId: string;
};

const PRODUCTS = MOMO_TYPES.map((t) => ({ camelKey: t.inventoryKey, label: `${t.label} Momo` }));

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "Receive Stock" for store crew: deliveries on the way to their store, each counted with the
// same receive dialog the store incharge uses, and the last few counts underneath.
export function IncomingDeliveries({ accessToken, storeId }: Props) {
  const [requests, setRequests] = useState<ProductionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState<ProductionRequest | null>(null);
  const [slip, setSlip] = useState<ProductionRequest | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const all = await api.fetchProductionRequests(accessToken, daysAgo(7));
      setRequests(all.filter((r) => r.storeId === storeId));
    } catch {
      toast.error('Could not load deliveries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accessToken, storeId]);

  const onTheWay = useMemo(() => requests.filter((r) => r.status === 'shipped' || r.status === 'partially-shipped'), [requests]);
  const received = useMemo(
    () => requests.filter((r) => r.receipt).sort((a, b) => (b.receipt!.receivedAt || '').localeCompare(a.receipt!.receivedAt || '')).slice(0, 5),
    [requests]
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><PackageCheck className="w-6 h-6 text-green-600" /> Receive Stock</h1>
          <p className="text-sm text-gray-500">Count the bags against the slip before anything goes in the freezer.</p>
        </div>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-gray-200 bg-white" aria-label="Refresh">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">On the way</h2>
        {loading && requests.length === 0 ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
        ) : onTheWay.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl p-4">Nothing on the way right now.</p>
        ) : (
          <div className="space-y-3">
            {onTheWay.map((r) => (
              <div key={r.id} className="bg-white border-2 border-orange-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-semibold text-gray-900 flex items-center gap-2"><Truck className="w-4 h-4 text-orange-600" /> Request #{r.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-gray-500">
                      For {new Date(`${r.requestDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {r.shippedAt ? ` · left ${new Date(r.shippedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}
                      {r.dispatch?.boxes ? ` · ${r.dispatch.boxes} box${r.dispatch.boxes === 1 ? '' : 'es'}` : ''}
                    </p>
                  </div>
                  {r.dispatch && (
                    <button onClick={() => setSlip(r)} className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 flex-shrink-0"><FileText className="w-3.5 h-3.5" /> Slip</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {PRODUCTS.filter(({ camelKey }) => (r.shippedQuantities?.[camelKey] || 0) > 0).map(({ camelKey, label }) => (
                    <span key={camelKey} className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-800 border border-orange-100">
                      {label.replace(/ Momo$/, '')} · {bagsLabel(r.shippedQuantities![camelKey], camelKey)}
                    </span>
                  ))}
                </div>
                <button onClick={() => setReceiving(r)} className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-semibold inline-flex items-center justify-center gap-2">
                  <PackageCheck className="w-5 h-5" /> Receive &amp; count
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {received.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Recently counted</h2>
          <div className="space-y-3">
            {received.map((r) => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4 -mt-0">
                <p className="text-sm font-semibold text-gray-900">Request #{r.id.slice(0, 8).toUpperCase()}</p>
                <ReceiptSummary request={r} products={PRODUCTS} accessToken={accessToken} />
              </div>
            ))}
          </div>
        </section>
      )}

      {receiving && (
        <ReceiveDeliveryDialog
          request={receiving}
          products={PRODUCTS}
          accessToken={accessToken}
          onClose={() => setReceiving(null)}
          onReceived={async () => { setReceiving(null); await load(); }}
        />
      )}
      {slip && <DispatchSlipModal request={slip} products={PRODUCTS} onClose={() => setSlip(null)} />}
    </div>
  );
}
