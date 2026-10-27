// What the shell hands to the destination wrappers and the Home screens: the signed-in person,
// their navigation and router, the shared data (App.tsx's context), and the shell's own actions.
import { createContext, useContext, type ReactNode } from 'react';
import type { InventoryContextType } from '../../App';
import type * as api from '../../utils/api';
import type { NavModel } from './navConfig';
import type { ShellRouter } from './useShellRouter';

export type ShellUser = NonNullable<InventoryContextType['user']>;

export type ShellContextValue = {
  nav: NavModel;
  router: ShellRouter;
  user: ShellUser;
  /** App.tsx's shared data and actions (the same object every screen got before). */
  context: InventoryContextType;
  stores: api.Store[];
  employees: api.Employee[];
  /** The owner's store choice (null = all stores); everyone else null. */
  selectedStoreId: string | null;
  setSelectedStoreId: (storeId: string | null) => void;
  refreshStores: () => Promise<void>;
  openAccount: () => void;
  openBunny: () => void;
  /** Role preview (shell-preview.html): screens show a labelled placeholder instead of loading. */
  preview?: boolean;
  /** The audit dashboard, rendered by App.tsx (it takes the raw lists as props). */
  renderAudit?: (view: 'analytics' | 'inventory' | 'sales' | 'production' | 'payroll') => ReactNode;
};

const ShellCtx = createContext<ShellContextValue | null>(null);

export function ShellProvider({ value, children }: { value: ShellContextValue; children?: ReactNode }) {
  return <ShellCtx.Provider value={value}>{children}</ShellCtx.Provider>;
}

export function useShell(): ShellContextValue {
  const value = useContext(ShellCtx);
  if (!value) throw new Error('useShell() outside the app shell');
  return value;
}
