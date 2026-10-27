import { useState } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { SegmentedControl } from './ui/segmented-control';
import { InventoryDashboard } from './InventoryDashboard';
import { InventoryAlerts } from './InventoryAlerts';
import { ProductionHouseStockStatus } from './ProductionHouseStockStatus';
import { UtilitiesStockStatus } from './UtilitiesStockStatus';
import { StockPage } from './stock/stockShared';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
  onNavigateToManageItems?: () => void;
};

type View = 'stock-status' | 'utilities' | 'dashboard' | 'alerts';

// Stock -> On hand (owner and managers): the production houses' stock, boxes/trays/drinks, an
// overview and alerts. The shell's Stock tabs are the one tab level, so these four views are a
// segmented control rather than tabs inside tabs.
export function AdvancedInventoryManagement({ context, stores, onNavigateToManageItems }: Props) {
  // The old "Reports" and "Rankings" tabs were removed: they computed sales and profit their own
  // way and disagreed with Analytics. Analytics and the Export page's reports cover both. The
  // "Forecast" tab went too (made-up numbers; the real forecast is in Trends & Growth), and so did
  // "Requests" (the old stock-request list production never saw; requests live in Stock > Requests
  // - owner, 27 Oct 2026).
  const [view, setView] = useState<View>('stock-status');

  return (
    <StockPage wide>
      <SegmentedControl
        aria-label="On hand"
        size="sm"
        value={view}
        onValueChange={(v) => setView(v as View)}
        options={[
          { value: 'stock-status', label: 'Production' },
          { value: 'utilities', label: 'Boxes' },
          { value: 'dashboard', label: 'Overview' },
          { value: 'alerts', label: 'Alerts' },
        ]}
      />
      {view === 'stock-status' && <ProductionHouseStockStatus context={context} productionHouses={context.productionHouses} onNavigateToManageItems={onNavigateToManageItems} />}
      {view === 'utilities' && <UtilitiesStockStatus context={context} stores={stores} />}
      {view === 'dashboard' && <InventoryDashboard context={context} stores={stores} />}
      {view === 'alerts' && <InventoryAlerts context={context} stores={stores} />}
    </StockPage>
  );
}
