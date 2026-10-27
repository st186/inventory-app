// Money tab: Sales / Day close · Expenses · Cash & Paytm · Payouts · Loans (owner, operations
// manager), Day close · Expenses (store incharge), Expenses · Sales or Cash (production incharge).
// Each sub-tab shows today's screen for this login: the store incharge's day close is
// SalesManagement, everyone else's sales overview is SalesView; expenses are InventoryManagement
// for every login that has them (incharges on employee logins add too, owner 27 Oct 2026).
// WP3 owns the screens inside; this wrapper only picks them.
import type { ScreenSpec } from '../navConfig';
import { useShell } from '../ShellContext';
import { Analytics, InventoryManagement, SalesManagement, SalesView } from './screens';
import { useScreenCallbacks } from './useScreenCallbacks';

export function MoneyDestination({ spec, params }: { spec: ScreenSpec; params: Record<string, string> }) {
  const { context, selectedStoreId, employees } = useShell();
  const callbacks = useScreenCallbacks();
  switch (spec.screen) {
    case 'SalesManagement':
      return <SalesManagement context={context} selectedStoreId={selectedStoreId} initialTab={spec.tab ?? 'entry'} />;
    case 'SalesView':
      return <SalesView context={context} selectedStoreId={selectedStoreId} initialTab={spec.tab ?? 'entry'} />;
    case 'InventoryManagement':
      return <InventoryManagement context={context} selectedStoreId={selectedStoreId} employees={employees} />;
    case 'Analytics':
      // Cash & Paytm: Analytics opened on its Cash & Reconciliation tab until WP3 gives it a screen.
      return (
        <Analytics
          context={context}
          selectedStoreId={selectedStoreId}
          initialTab={spec.tab ?? params.tab ?? null}
          onNavigateToManageItems={callbacks.toManageItems}
          onNavigateToProductionManagement={callbacks.toProductionManagement}
        />
      );
    default:
      return null;
  }
}
