// The in-screen jumps today's screens make (Manage Items, Production Management, Back), routed
// through the shell's router so Back returns to where the person came from.
import { useMemo } from 'react';
import { useShell } from '../ShellContext';

export function useScreenCallbacks() {
  const { nav, router } = useShell();
  return useMemo(() => {
    const productionPath = nav.destinations['production/batches'] ? 'production/batches' : nav.destinations['stock/production'] ? 'stock/production' : null;
    return {
      toManageItems: nav.destinations.items ? () => router.push('items') : undefined,
      toProductionManagement: productionPath ? () => router.push(productionPath) : undefined,
      back: () => {
        router.back();
      },
    };
  }, [nav, router]);
}
