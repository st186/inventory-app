// Events (event stalls). The shell registers these - see the hand-over notes in the events PR:
//   More → Events (cluster head, managers, audit):   <EventsPage onBack={...} />
//   Home (assigned staff, on event days):            <EventHomeCard onOpen={(id, tab) => ...} />
//   Event destination / notification deep link:     <EventDetail eventId={id} initialTab={tab} onBack={...} />
//   Whether to show the Event destination:          useActiveEventsForUser().hasEvents
export { EventsPage } from './EventsPage';
export { EventDetail, type EventTab } from './EventDetail';
export { EventHomeCard } from './EventHomeCard';
export { useActiveEventsForUser, invalidateActiveEvents } from './useActiveEventsForUser';
export { EventsApiProvider, EventsTodayProvider } from './eventsShared';
