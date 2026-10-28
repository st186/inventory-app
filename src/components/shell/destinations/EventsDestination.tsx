// Event stalls (components/events): the list for the owner and managers, or one event when a
// Home card or a notification opens it (#/events?id=…&tab=…; old deep links carry the id as
// `highlight`). The events code decides who may see which event via the server.
import { lazy } from 'react';
import type { EventTab } from '../../events';
import { useShell } from '../ShellContext';
import { useScreenCallbacks } from './useScreenCallbacks';

const EventsPage = lazy(() => import('../../events/EventsPage').then((m) => ({ default: m.EventsPage })));
const EventDetail = lazy(() => import('../../events/EventDetail').then((m) => ({ default: m.EventDetail })));

const EVENT_TABS: readonly EventTab[] = ['overview', 'sales', 'stock', 'money', 'assets', 'staff'];

export function EventsDestination({ params }: { params: Record<string, string> }) {
  const { router } = useShell();
  const callbacks = useScreenCallbacks();
  const eventId = params.id || params.highlight;
  const tab = EVENT_TABS.find((t) => t === params.tab);
  if (eventId) return <EventDetail eventId={eventId} initialTab={tab} onBack={callbacks.back} />;
  return <EventsPage onBack={callbacks.back} onOpenEvent={(id) => router.push('events', { id })} />;
}
