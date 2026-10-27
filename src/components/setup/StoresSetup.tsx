// Setup > Stores and production houses (owner): stores, production houses, map pins with the
// check-in distance, and which places the owner's reports cover - one scrolling page of lists,
// each record opening its own sheet.
import { InventoryContextType } from '../../App';
import * as api from '../../utils/api';
import { StoreManagement } from '../StoreManagement';
import { ProductionHouseManagement } from '../ProductionHouseManagement';
import { ClusterManagement } from '../ClusterManagement';
import { PlacePins } from './PlacePins';
import { SetupPage } from './SetupPage';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
  employees: api.Employee[];
  onRefreshStores: () => void;
};

export function StoresSetup({ context, stores, employees, onRefreshStores }: Props) {
  return (
    <SetupPage>
      <StoreManagement onStoreCreated={onRefreshStores} userRole={context.user?.role} />
      <ProductionHouseManagement context={context} stores={stores} employees={employees} onRefreshStores={onRefreshStores} />
      <PlacePins />
      <ClusterManagement context={context} />
    </SetupPage>
  );
}
