// Stock tab (operations manager, store incharge, store crew) and Production tab (production
// incharge): Requests · Production / Batches · On hand · Out of stock · Riders · Receive.
//   Requests      ProductionRequests - what used to be Analytics > Stock Requests (store incharge
//                 submits / receives, production incharge packs and ships, managers watch)
//   Production    ProductionManagement (used to hide behind Analytics > Production Analytics)
//   On hand       AdvancedInventoryManagement (unreachable from any menu before)
//   Out of stock  StockOutLog: crew and store incharge log; production, managers and owner view
//   Riders        RiderTrips in staff mode (Call a rider: owner, ops manager, production incharge)
//   Receive       IncomingDeliveries: store crew, from 1 Nov 2026
// WP4 (and WP7 for riders) own the screens inside.
import type { ScreenSpec } from '../navConfig';
import { useShell } from '../ShellContext';
import { AdvancedInventoryManagement, IncomingDeliveries, ProductionManagement, ProductionRequests, RiderTrips, StockOutLog } from './screens';
import { useScreenCallbacks } from './useScreenCallbacks';

/** The store Stock Requests opens on - the same choice Analytics made for its Stock Requests tab. */
export function stockRequestsStoreId(user: ReturnType<typeof useShell>['user'], stores: ReturnType<typeof useShell>['stores'], selectedStoreId: string | null): string | null {
  if (selectedStoreId) return selectedStoreId;
  const isProductionIncharge = user.designation === 'production_incharge';
  if (isProductionIncharge) {
    const assigned = user.assignedStoreIds?.find((id) => stores.length === 0 || stores.some((s) => s.id === id));
    if (assigned) return assigned;
    if (user.storeId && (stores.length === 0 ? String(user.storeId).startsWith('STORE-') : stores.some((s) => s.id === user.storeId))) return user.storeId;
    return null;
  }
  const seesAll = user.role === 'cluster_head' || user.role === 'manager' || user.role === 'audit';
  return seesAll ? null : user.storeId || null;
}

export function StockDestination({ spec, params }: { spec: ScreenSpec; params: Record<string, string> }) {
  const { context, user, stores, selectedStoreId, employees } = useShell();
  const callbacks = useScreenCallbacks();
  switch (spec.screen) {
    case 'ProductionRequests':
      return (
        <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 lg:px-8">
          <ProductionRequests
            context={context}
            highlightRequestId={params.highlight || null}
            openCount={params.tab === 'count'}
            selectedStoreId={stockRequestsStoreId(user, stores, selectedStoreId)}
            onNavigateToManageItems={callbacks.toManageItems}
          />
        </div>
      );
    case 'ProductionManagement':
      return <ProductionManagement context={context} selectedStoreId={selectedStoreId} initialTab={params.tab || null} onBack={callbacks.back} />;
    case 'AdvancedInventoryManagement':
      return <AdvancedInventoryManagement context={context} stores={stores} onNavigateToManageItems={callbacks.toManageItems} />;
    case 'StockOutLog': {
      // Loggers see their own store; viewers every store (App.tsx before the new shell).
      const ownStore = spec.scope === 'own-store' && user.storeId;
      const logStores = ownStore
        ? [{ id: user.storeId as string, name: stores.find((st) => st.id === user.storeId)?.name || 'My store' }]
        : (stores || []).map((st) => ({ id: st.id, name: st.name }));
      const defaultStore = user.storeId && String(user.storeId).startsWith('STORE-') ? user.storeId : stores[0]?.id || null;
      return <StockOutLog accessToken={user.accessToken || ''} stores={logStores} defaultStoreId={defaultStore} canDelete={spec.canDelete} />;
    }
    case 'RiderTrips':
      return (
        <RiderTrips
          mode={spec.mode}
          variant={spec.variant}
          initialTab={params.tab === 'payments' || params.tab === 'history' ? params.tab : undefined}
          stockRequests={context.productionRequests}
          canDispatch={spec.canDispatch}
          stores={(stores || []).map((st) => ({ id: st.id, name: st.name }))}
          defaultStoreId={user.storeId || null}
          // Phone numbers for the call buttons (the owner and managers see them).
          people={employees || []}
        />
      );
    case 'IncomingDeliveries':
      return <IncomingDeliveries accessToken={user.accessToken || ''} storeId={user.storeId || ''} />;
    default:
      return null;
  }
}
