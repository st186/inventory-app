// Dev-only entry for events-preview.html: the event screens on mock data (no sign-in, no server).
// ?view=list|create|detail|staff|dayclose|home|leftover|returns  &lang=en|bn|hi  &tab=overview|sales|stock|money|assets|staff
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '../components/ui/sonner';
import { ConfirmProvider } from '../components/ui/confirm';
import { SegmentedControl } from '../components/ui/segmented-control';
import { LanguageOverride, type Lang } from '../utils/i18n';
import { EventsApiProvider, EventsTodayProvider } from '../components/events/eventsShared';
import { EventCostSettingsSheet, EventsPage } from '../components/events/EventsPage';
import { EventDetail, type EventTab } from '../components/events/EventDetail';
import { EventHomeCard } from '../components/events/EventHomeCard';
import { EventDayCloseSheet } from '../components/events/EventDayCloseSheet';
import { EventFormSheet } from '../components/events/EventFormSheet';
import { EventLeftoverSheet } from '../components/events/EventLeftoverSheet';
import { EventMomoReturnsCard } from '../components/events/EventMomoReturnsCard';
import { PREVIEW_TODAY, mockApi, setPreviewRole } from './mock';
import type { EventBundle } from '../utils/eventsApi';
import '../styles/fonts.css';
import '../index.css';

type View = 'list' | 'detail' | 'staff' | 'dayclose' | 'home' | 'create' | 'leftover' | 'returns' | 'costs';
const FAIR = 'EVENT-1764000000000-WFAIR1';

function params() {
  const p = new URLSearchParams(window.location.search);
  const lang = p.get('lang');
  return {
    view: (p.get('view') || 'list') as View,
    lang: (lang === 'bn' || lang === 'hi' ? lang : 'en') as Lang,
    tab: (p.get('tab') || undefined) as EventTab | undefined,
    bare: p.get('bare') === '1',
  };
}

function DayCloseDemo() {
  const [bundle, setBundle] = React.useState<EventBundle | null>(null);
  const [open, setOpen] = React.useState(true);
  React.useEffect(() => { void mockApi.get(FAIR).then(setBundle); }, []);
  if (!bundle) return null;
  const row = bundle.days.find((d) => d.date === PREVIEW_TODAY)!;
  return (
    <div className="p-4">
      <button type="button" className="text-label text-primary underline" onClick={() => setOpen(true)}>Open the day close</button>
      <EventDayCloseSheet open={open} onOpenChange={setOpen} bundle={bundle} row={row} onSaved={() => undefined} />
    </div>
  );
}

function LeftoverDemo() {
  const [bundle, setBundle] = React.useState<EventBundle | null>(null);
  const [open, setOpen] = React.useState(true);
  React.useEffect(() => { void mockApi.get(FAIR).then(setBundle); }, []);
  if (!bundle) return null;
  return (
    <div className="p-4">
      <button type="button" className="text-label text-primary underline" onClick={() => setOpen(true)}>Open leftover momos</button>
      <EventLeftoverSheet open={open} onOpenChange={setOpen} bundle={bundle} onDone={() => undefined} />
    </div>
  );
}

function Preview() {
  const initial = React.useMemo(params, []);
  const [view, setView] = React.useState<View>(initial.view);
  const [lang, setLang] = React.useState<Lang>(initial.lang);
  const [key, setKey] = React.useState(0);
  setPreviewRole(view === 'staff' || view === 'home' || view === 'dayclose' || view === 'leftover' ? 'incharge' : 'owner');

  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('view', view);
    p.set('lang', lang);
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
    setKey((k) => k + 1);
  }, [view, lang]);

  return (
    <EventsApiProvider value={mockApi}>
      <EventsTodayProvider value={PREVIEW_TODAY}>
        <LanguageOverride lang={lang}>
          <ConfirmProvider>
            <div className="min-h-dvh bg-bg text-text">
              {!initial.bare && (
                <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2">
                  <span className="text-label font-semibold text-text-2">Events preview (mock data)</span>
                  <SegmentedControl
                    size="sm"
                    aria-label="Screen"
                    value={view}
                    onValueChange={setView}
                    options={[
                      { value: 'list', label: 'Owner: list' }, { value: 'create', label: 'New event' }, { value: 'detail', label: 'Owner: event' },
                      { value: 'staff', label: 'Incharge: event' }, { value: 'dayclose', label: 'Day close' }, { value: 'home', label: 'Home card' },
                      { value: 'leftover', label: 'Leftovers' }, { value: 'returns', label: 'Production: returns' }, { value: 'costs', label: 'Event costs' },
                    ]}
                  />
                  <SegmentedControl size="sm" aria-label="Language" value={lang} onValueChange={setLang} options={[{ value: 'en', label: 'EN' }, { value: 'bn', label: 'বাংলা' }, { value: 'hi', label: 'हिन्दी' }]} />
                </header>
              )}
              <div key={key}>
                {view === 'list' && <EventsPage />}
                {view === 'create' && (
                  <>
                    <EventsPage />
                    <EventFormSheet open onOpenChange={() => setView('list')} onSaved={() => setView('list')} />
                  </>
                )}
                {view === 'detail' && <EventDetail eventId={FAIR} initialTab={initial.tab} onBack={() => setView('list')} />}
                {view === 'staff' && <EventDetail eventId={FAIR} initialTab={initial.tab} />}
                {view === 'dayclose' && <DayCloseDemo />}
                {view === 'leftover' && <LeftoverDemo />}
                {view === 'costs' && (
                  <>
                    <EventsPage />
                    <EventCostSettingsSheet open onOpenChange={() => setView('list')} />
                  </>
                )}
                {view === 'returns' && (
                  <main className="mx-auto flex max-w-xl flex-col gap-4 p-4">
                    <h1 className="text-title font-semibold">Production: stock requests</h1>
                    <EventMomoReturnsCard />
                  </main>
                )}
                {view === 'home' && (
                  <main className="mx-auto flex max-w-xl flex-col gap-4 p-4">
                    <h1 className="text-title font-semibold">Home</h1>
                    <EventHomeCard onOpen={() => setView('staff')} />
                  </main>
                )}
              </div>
            </div>
          </ConfirmProvider>
        </LanguageOverride>
      </EventsTodayProvider>
    </EventsApiProvider>
  );
}

// ?frame=375&h=812: the same page in an iframe of exactly that width (for headless screenshots,
// where a narrow browser window is laid out wider than asked).
const frame = new URLSearchParams(window.location.search).get('frame');
if (frame) {
  const p = new URLSearchParams(window.location.search);
  const height = p.get('h') || '812';
  p.delete('frame');
  p.delete('h');
  createRoot(document.getElementById('root')!).render(
    <iframe title="preview" src={`${window.location.pathname}?${p.toString()}`} style={{ border: 0, display: 'block', width: `${frame}px`, height: `${height}px` }} />,
  );
} else {
  createRoot(document.getElementById('root')!).render(
    <>
      <Preview />
      <Toaster />
    </>,
  );
}
