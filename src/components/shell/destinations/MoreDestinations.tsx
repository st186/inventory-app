// The pages behind More / Me rows: Equipment and assets, Investments, Stores and production
// houses, Items and categories, Reports and export, Check the numbers, Backup (owner only), and the
// rider's profile. Assets, setup and data screens belong to WP6; RiderProfile to WP7.
import type { ScreenSpec } from '../navConfig';
import { useShell } from '../ShellContext';
import { AssetsManagement, BackupRestore, ExportData, InventoryItemsManagement, RiderProfile } from './screens';
import { useScreenCallbacks } from './useScreenCallbacks';

export function MoreDestinations({ spec }: { spec: ScreenSpec }) {
  const { context, user, stores, employees, selectedStoreId, refreshStores } = useShell();
  const callbacks = useScreenCallbacks();
  switch (spec.screen) {
    case 'AssetsManagement':
      return <AssetsManagement context={context} stores={stores} employees={employees} onRefreshStores={refreshStores} initialTab={spec.tab ?? 'equipment'} />;
    case 'InventoryItemsManagement':
      return <InventoryItemsManagement context={context} onBack={callbacks.back} />;
    case 'ExportData':
      return (
        <ExportData
          userRole={spec.userRole as 'manager' | 'cluster_head'}
          // Staff logins export their own store; the owner follows the store switcher.
          selectedStoreId={user.role === 'employee' ? user.storeId || null : selectedStoreId}
          currentUserId={user.email}
          context={context}
          initialView={spec.tab ?? 'export'}
        />
      );
    case 'BackupRestore':
      return <BackupRestore context={context} />;
    case 'RiderProfile':
      return <RiderProfile />;
    default:
      return null;
  }
}
