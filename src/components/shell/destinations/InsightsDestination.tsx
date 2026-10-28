// Insights: today's Analytics screen (the old landing page), with the same props as before. A
// notification can open a tab (trends; a highlighted stock request). WP2 owns Analytics and will
// split its tabs out; the language picker and Stock Requests tile inside it now also live in the
// Account sheet and under Stock / Production.
import { useShell } from '../ShellContext';
import { Analytics } from './screens';
import { useScreenCallbacks } from './useScreenCallbacks';

export function InsightsDestination({ params }: { params: Record<string, string> }) {
  const { context, selectedStoreId } = useShell();
  const callbacks = useScreenCallbacks();
  return (
    <Analytics
      context={context}
      selectedStoreId={selectedStoreId}
      highlightRequestId={params.highlight || null}
      initialTab={params.tab || null}
      onNavigateToManageItems={callbacks.toManageItems}
      onNavigateToProductionManagement={callbacks.toProductionManagement}
    />
  );
}
