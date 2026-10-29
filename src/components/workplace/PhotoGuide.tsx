// More > Photo guide (owner, 29 Oct 2026): every place's photo checks with their sample photos, so
// someone new can see how each photo should look - the angle, what has to be in the frame, and for
// machines each named shot in order. Samples are set by the owner or an operations manager in
// Workplace setup (or "Use as sample" on a good photo in the review).
import { useEffect, useMemo, useState } from 'react';
import { Camera, Factory, Store } from 'lucide-react';
import { useT } from '../../utils/i18n';
import { FilterChips } from '../ui/chip';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { SkeletonListRows } from '../ui/skeleton';
import { StatusChip } from '../ui/status-chip';
import { checkName } from '../team/checks/checkParts';
import { SampleTile } from './SamplePhoto';
import { getGuide, shotLabel, type GuidePlace } from './workplaceApi';
import { fmt12 } from './workplaceUtils';

export function PhotoGuideScreen() {
  const { t, lang } = useT();
  const [data, setData] = useState<{ places: GuidePlace[] } | null>(null);
  const [error, setError] = useState(false);
  const [placeKey, setPlaceKey] = useState('');
  const load = () => { setError(false); getGuide().then(setData).catch(() => setError(true)); };
  useEffect(() => { load(); }, []);
  // The place with the person's own checks first.
  const places = useMemo(() => [...(data?.places || [])].sort((a, b) => Number(b.items.some((i) => i.mine)) - Number(a.items.some((i) => i.mine))), [data]);
  const key = (p: GuidePlace) => `${p.kind}:${p.id}`;
  const place = places.find((p) => key(p) === placeKey) || places[0];

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-4 lg:px-8">
      <p className="text-body-sm text-text-2">{t('guide.intro')}</p>
      {error ? <ErrorState onRetry={load} /> : !data ? <SkeletonListRows count={4} /> : !place ? (
        <EmptyState icon={Camera} title={t('guide.empty')} />
      ) : (
        <>
          {places.length > 1 && (
            <FilterChips aria-label={t('guide.place')} value={key(place)} onValueChange={setPlaceKey}
              options={places.map((p) => ({ value: key(p), label: <span className="inline-flex items-center gap-1.5">{p.kind === 'production' ? <Factory className="size-4" aria-hidden="true" /> : <Store className="size-4" aria-hidden="true" />}{p.name}</span> }))} />
          )}
          <ul className="flex flex-col gap-3">
            {[...place.items].sort((a, b) => Number(b.mine) - Number(a.mine)).map((it) => {
              const sp = { kind: place.kind, locId: place.id, itemId: it.id };
              const general = it.shots.length ? [] : it.samples;
              return (
                <li key={it.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-body-md font-semibold text-text">{checkName(it, lang)}</span>
                      <span className="num text-label text-text-3">{fmt12(it.start)}–{fmt12(it.end)}{it.need > 1 ? ` · ${t('guide.photos', { n: it.need })}` : ''}</span>
                    </div>
                    {it.mine && <StatusChip tone="info" size="sm">{t('guide.yours')}</StatusChip>}
                  </div>
                  {it.hint && <p className="text-label text-text-2">{it.hint}</p>}
                  {it.shots.length > 0 && (
                    <ol className="flex flex-col gap-2">
                      {it.shots.map((sh, i) => {
                        const sample = it.samples.find((x) => x.shot === i);
                        return (
                          <li key={i} className="flex items-center gap-3">
                            <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-caption font-semibold text-text-2">{i + 1}</span>
                            <span className="min-w-0 flex-1 text-body-sm text-text">{shotLabel(sh, lang)}</span>
                            {sample ? <SampleTile {...sp} sampleId={sample.id} label={`${checkName(it, lang)} · ${shotLabel(sh, lang)}`} />
                              : <span className="text-caption text-text-3">{t('guide.noSample')}</span>}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {!it.shots.length && (general.length ? (
                    <div className="flex flex-wrap gap-2">{general.map((x) => <SampleTile key={x.id} {...sp} sampleId={x.id} label={checkName(it, lang)} />)}</div>
                  ) : <span className="text-caption text-text-3">{t('guide.noSample')}</span>)}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
