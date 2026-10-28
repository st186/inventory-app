import * as React from 'react';
import { ConfirmProvider } from '../components/ui/confirm';
import { SegmentedControl } from '../components/ui/segmented-control';
import { LanguageOverride, type Lang } from '../utils/i18n';
import { SECTIONS } from './sections';
import { DayCloseSample, OwnerHomeSample } from './samples';

// Gallery shell: language switch (EN / বাংলা / हिन्दी) and a width switch. 375 and 1280 render
// the gallery itself in an iframe of that width, so media queries (sheet vs dialog, desktop
// header) behave as they would on that screen.

type Width = 'full' | '375' | '1280';

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const lang = p.get('lang');
  return {
    embed: p.get('embed') === '1',
    lang: (lang === 'bn' || lang === 'hi' || lang === 'en' ? lang : 'en') as Lang,
    only: p.get('only') ?? '',
  };
}

export function Gallery() {
  const initial = React.useMemo(readParams, []);
  const [lang, setLang] = React.useState<Lang>(initial.lang);
  const [width, setWidth] = React.useState<Width>('full');
  const [only, setOnly] = React.useState(initial.only);

  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('lang', lang);
    if (only) p.set('only', only);
    else p.delete('only');
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}${window.location.hash}`);
  }, [lang, only]);

  const content = (
    <LanguageOverride lang={lang}>
      <ConfirmProvider>
        <GalleryContent only={only} lang={lang} />
      </ConfirmProvider>
    </LanguageOverride>
  );

  if (initial.embed) return <div className="min-h-dvh bg-bg">{content}</div>;

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="z-(--z-nav) border-b border-border bg-surface sm:sticky sm:top-0">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <img src="/bunny-logo.png" alt="" className="size-8 object-contain" />
            <div className="flex min-w-0 flex-col">
              <span className="text-subtitle font-semibold">Warm ledger</span>
              <span className="text-caption text-text-3">UI gallery · dev only</span>
            </div>
          </div>
          <SegmentedControl<Lang>
            aria-label="Language"
            size="sm"
            selectedTone="primary"
            value={lang}
            onValueChange={setLang}
            className="w-full sm:w-64"
            options={[
              { value: 'en', label: 'English' },
              { value: 'bn', label: 'বাংলা', lang: 'bn' },
              { value: 'hi', label: 'हिन्दी', lang: 'hi' },
            ]}
          />
          <SegmentedControl<Width>
            aria-label="Preview width"
            size="sm"
            value={width}
            onValueChange={setWidth}
            className="w-full sm:w-56"
            options={[
              { value: 'full', label: 'Full' },
              { value: '375', label: '375' },
              { value: '1280', label: '1280' },
            ]}
          />
        </div>
        <nav aria-label="Sections" className="no-scrollbar mx-auto flex max-w-[1280px] gap-1 overflow-x-auto px-3 pb-2">
          {[{ id: '', title: 'All' }, ...SECTIONS.map((s) => ({ id: s.id, title: s.title })), { id: 'samples', title: 'Sample screens' }].map((s) => (
            <button
              key={s.id || 'all'}
              type="button"
              aria-pressed={only === s.id}
              onClick={() => setOnly(s.id)}
              className={`hit-44 h-9 min-h-9 shrink-0 rounded-full px-3 text-label font-medium whitespace-nowrap ${only === s.id ? 'bg-text text-surface' : 'text-text-2 hover:bg-surface-2'}`}
            >
              {s.title}
            </button>
          ))}
        </nav>
      </header>

      {width === 'full' ? (
        content
      ) : (
        <div className="flex justify-center overflow-x-auto bg-surface-3 p-4">
          <iframe
            key={`${width}-${lang}-${only}`}
            title={`Gallery at ${width} px`}
            src={`/ui-gallery.html?embed=1&lang=${lang}${only ? `&only=${only}` : ''}`}
            className="shrink-0 rounded-lg border border-border-strong bg-bg"
            style={{ width: Number(width), height: 'calc(100dvh - 140px)' }}
          />
        </div>
      )}
    </div>
  );
}

function GalleryContent({ only, lang }: { only: string; lang: Lang }) {
  const sections = SECTIONS.filter((s) => !only || s.id === only);
  return (
    <main lang={lang} className="mx-auto flex max-w-[1280px] flex-col gap-10 px-4 py-6 lg:px-8">
      {sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 border-b border-border pb-2">
            <h2 id={`${s.id}-title`} className="text-title-lg font-semibold">
              {s.title}
            </h2>
            {s.note && <p className="text-body-sm text-text-2">{s.note}</p>}
          </div>
          <s.Component />
        </section>
      ))}
      {(!only || only === 'samples') && (
        <section id="samples" aria-labelledby="samples-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 border-b border-border pb-2">
            <h2 id="samples-title" className="text-title-lg font-semibold">
              Sample screens
            </h2>
            <p className="text-body-sm text-text-2">
              Owner Home and Day close, built only from ui/* components (the bottom nav is a gallery stand-in for the WP0b shell).
            </p>
          </div>
          <div className="flex flex-wrap items-start justify-center gap-8">
            <PhoneFrame label="Owner Home">
              <OwnerHomeSample />
            </PhoneFrame>
            <PhoneFrame label="Day close">
              <DayCloseSample />
            </PhoneFrame>
          </div>
        </section>
      )}
    </main>
  );
}

function PhoneFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="flex w-full max-w-[390px] flex-col gap-2">
      <figcaption className="overline-label px-1">{label}</figcaption>
      <div className="relative overflow-hidden rounded-xl border border-border-strong bg-bg [transform:translateZ(0)]">{children}</div>
    </figure>
  );
}
