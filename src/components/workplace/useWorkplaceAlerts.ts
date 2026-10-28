// Garbage / dirt alerts (owner, 28 Oct 2026): photos where the AI saw a garbage dump, overflowing
// waste, pests or filth, still not re-shot clean or marked OK (server GET /workplace/alerts). Shown
// at the top of the incharge's and the owner's Home.
import * as React from 'react';
import { getAlerts, type WorkplaceAlert } from './workplaceApi';

export function useWorkplaceAlerts(enabled: boolean) {
  const [alerts, setAlerts] = React.useState<WorkplaceAlert[]>([]);
  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getAlerts().then((r) => { if (!cancelled) setAlerts(r.alerts || []); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [enabled]);
  return alerts;
}

export const alertTitle = (alerts: WorkplaceAlert[]) =>
  alerts.length === 1 ? `Garbage / dirt: ${alerts[0].name}${alerts[0].locationName ? ` at ${alerts[0].locationName}` : ''}` : `${alerts.length} garbage / dirt alerts`;
export const alertMeta = (alerts: WorkplaceAlert[]) =>
  alerts.length === 1
    ? [alerts[0].aiScore !== null ? `AI ${alerts[0].aiScore}/10` : '', alerts[0].issues.slice(0, 2).join(', '), alerts[0].personName].filter(Boolean).join(' · ')
    : alerts.slice(0, 3).map((a) => a.name).join(' · ');
