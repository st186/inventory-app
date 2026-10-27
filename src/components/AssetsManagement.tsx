import { useState } from 'react';
import { EquipmentRegister } from './assets/EquipmentRegister';
import { InvestmentsManagement } from './InvestmentsManagement';
import { StoresSetup } from './setup/StoresSetup';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { SetupPage } from './setup/SetupPage';
import { useT } from '../utils/i18n';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
  employees: api.Employee[];
  onRefreshStores: () => void;
  /** The owner's tab to open on (the shell's More > Investments / Stores and production houses). */
  initialTab?: 'equipment' | 'assets' | 'investments';
};

// Equipment and assets: one screen for the owner and the incharges (design review d12). The owner
// also gets an Investments tab. Store and production-house setup ("assets", from More > Stores and
// production houses) is its own Setup screen now.
export function AssetsManagement({ context, stores, employees, onRefreshStores, initialTab = 'equipment' }: Props) {
  const { t } = useT();
  const isClusterHead = context.user?.role === 'cluster_head';
  const [tab, setTab] = useState<'equipment' | 'investments'>(initialTab === 'investments' ? 'investments' : 'equipment');

  // Managers and incharges reach this page only for the equipment register (their "Equipment"
  // menu entry); stores, production houses and investments stay with the owner.
  if (!isClusterHead) {
    return (
      <SetupPage wide>
        <EquipmentRegister />
      </SetupPage>
    );
  }

  if (initialTab === 'assets') {
    return <StoresSetup context={context} stores={stores} employees={employees} onRefreshStores={onRefreshStores} />;
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as 'equipment' | 'investments')}>
      <TabsList aria-label={t('assets.title')} className="lg:px-8">
        <TabsTrigger value="equipment">{t('assets.tab.equipment')}</TabsTrigger>
        <TabsTrigger value="investments">{t('assets.tab.investments')}</TabsTrigger>
      </TabsList>
      <TabsContent value="equipment">
        <SetupPage wide>
          <EquipmentRegister />
        </SetupPage>
      </TabsContent>
      <TabsContent value="investments">
        <SetupPage wide>
          <InvestmentsManagement context={context} />
        </SetupPage>
      </TabsContent>
    </Tabs>
  );
}
