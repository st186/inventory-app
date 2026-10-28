// Production → Recipes: the recipe sheets R-01..R-21, each made 3 times the usual way and
// weighed in the app (owner, 27 Oct 2026). The production head, the kitchen crew he picks,
// operations managers and the owner fill batches; batches are kept on the phone until they are
// sent, so they work with no signal. Owner and operations managers also open the review from a
// sheet. Data: server recipes.ts through utils/recipesApi.ts.
import * as React from 'react';
import { CloudOff, Lock } from 'lucide-react';

import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { PageHeader } from '../ui/page-header';
import { SkeletonListRows } from '../ui/skeleton';
import { useT } from '../../utils/i18n';
import { INGREDIENT_BY_ID, SHEETS, SHEET_BY_ID, defaultScale } from '../../utils/recipeCatalog';
import { countingBatches, type BatchInput } from '../../utils/recipeRules';
import { isNetworkError } from '../../utils/http';
import {
  loadDrafts, newDraft, newIdempotencyKey, onDraftSent, readRecipesCache, saveDraft, startRecipeDraftSync, useDrafts, useRecipesApi, writeRecipesCache,
  type Draft, type Overview, type SheetDetail as Detail,
} from '../../utils/recipesApi';
import { BatchForm } from './BatchForm';
import { CrewSheet } from './CrewSheet';
import { ReviewDetail } from './ReviewDetail';
import { SheetDetail } from './SheetDetail';
import { CrewRow, DraftsGroup, PerMomoGroup, ProgressLine, SheetFilterChips, SheetGroups, type SheetFilter } from './SheetList';
import { istParts } from './recipeText';

type View = { kind: 'list' } | { kind: 'sheet'; sheetId: string } | { kind: 'form'; sheetId: string; draftId: string } | { kind: 'review'; sheetId: string };

// With no signal and nothing saved yet, the sheets still open from the catalog on the phone.
export const offlineOverview = (today: string): Overview => ({
  access: { canView: true, canEnter: true, canReview: false, canApprove: false, canManageCrew: false, canSeeCosts: false, canEditPrices: false, isCrew: false },
  today,
  sheets: SHEETS.map((s) => ({ sheetId: s.id, status: { code: 'todo', n: 0, version: null, newSince: 0 }, active: 0, lastAt: null, standard: null })),
  perMomo: [],
  team: [],
  crew: null,
});

export function blankBatch(sheetId: string, today: string, time: string, madeBy: { id: string; name: string } | null): BatchInput {
  const s = SHEET_BY_ID[sheetId];
  return {
    clientId: newIdempotencyKey(),
    sheetId,
    date: today,
    time,
    madeById: madeBy?.id ?? null,
    madeByName: madeBy?.name ?? '',
    lines: s.ingredients.map((key) => {
      const d = INGREDIENT_BY_ID[key];
      const scale = defaultScale(s, d);
      return { key, qty: null, unit: scale === 'B' ? 'kg' : 'g', scale };
    }),
    output: { qty: null, unit: 'kg' },
    count: null,
    ...(s.portion === 'samples' ? { portions: Array(10).fill(null) } : {}),
    pickup: s.portion === 'pickup' ? { before: null, after: null, n: 10 } : null,
    minutes: null,
    confirmed: [],
  };
}

export type RecipesPageProps = {
  /** Show a page title (when the page is not already under a Production header with tabs). */
  header?: boolean;
  /** Open this sheet straight away (a notification or deep link). */
  initialSheetId?: string | null;
  /** The signed-in person's employee id (pre-fills "Made by"). */
  employeeId?: string | null;
};

export function RecipesPage({ header = false, employeeId, initialSheetId = null }: RecipesPageProps) {
  const { t, lang } = useT();
  const api = useRecipesApi();
  const drafts = useDrafts();
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [stale, setStale] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<SheetFilter>('all');
  const [view, setView] = React.useState<View>(initialSheetId && SHEET_BY_ID[initialSheetId] ? { kind: 'sheet', sheetId: initialSheetId } : { kind: 'list' });
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [crewOpen, setCrewOpen] = React.useState(false);
  const details = React.useRef(new Map<string, Detail>());
  const today = istParts(new Date().toISOString()).date;

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const o = await api.overview();
      setOverview(o);
      setStale(false);
      writeRecipesCache('overview', o);
    } catch (e) {
      const cached = await readRecipesCache<Overview>('overview');
      if (cached || isNetworkError(e)) {
        setOverview(cached || offlineOverview(today));
        setStale(true);
      } else setError(e instanceof Error ? e.message : String(e));
    }
  }, [api, today]);

  React.useEffect(() => { void load(); }, [load, refreshKey]);
  React.useEffect(() => { void loadDrafts(); }, []);
  React.useEffect(() => startRecipeDraftSync(api), [api]);
  React.useEffect(() => onDraftSent(() => setRefreshKey((k) => k + 1)), []);
  React.useEffect(() => { window.scrollTo?.(0, 0); }, [view]);

  const go = (v: View) => setView(v);

  async function startBatch(sheetId: string, detail?: Detail) {
    if (detail) { details.current.set(sheetId, detail); writeRecipesCache(`sheet:${sheetId}`, detail); }
    const now = istParts(new Date().toISOString());
    const me = overview?.team.find((m) => m.id === employeeId) || null;
    const d = newDraft(sheetId, blankBatch(sheetId, now.date, now.time, me));
    await saveDraft(d);
    go({ kind: 'form', sheetId, draftId: d.id });
  }

  if (view.kind === 'sheet') {
    return (
      <SheetDetail
        sheetId={view.sheetId}
        refreshKey={refreshKey}
        onBack={() => go({ kind: 'list' })}
        onStart={(detail) => void startBatch(view.sheetId, detail)}
        onOpenDraft={(d) => go({ kind: 'form', sheetId: d.sheetId, draftId: d.id })}
        onReview={overview?.access.canReview ? () => go({ kind: 'review', sheetId: view.sheetId }) : undefined}
      />
    );
  }
  if (view.kind === 'review') {
    return <ReviewDetail sheetId={view.sheetId} onBack={() => go({ kind: 'sheet', sheetId: view.sheetId })} onChanged={() => setRefreshKey((k) => k + 1)} />;
  }
  if (view.kind === 'form') {
    return (
      <FormLoader
        key={view.draftId}
        sheetId={view.sheetId}
        draftId={view.draftId}
        overview={overview}
        cached={details.current.get(view.sheetId) || null}
        drafts={drafts}
        today={today}
        onBack={() => go({ kind: 'sheet', sheetId: view.sheetId })}
        onDone={() => { setRefreshKey((k) => k + 1); go({ kind: 'sheet', sheetId: view.sheetId }); }}
      />
    );
  }

  const access = overview?.access;
  return (
    <div className="flex min-h-full flex-col bg-bg text-text" lang={lang}>
      {header && <PageHeader title={t('recipes.title')} caption={t('recipes.subtitle')} />}
      <main className="mx-auto flex w-full max-w-[960px] flex-col gap-5 p-4 pb-8 lg:px-8">
        {error && <ErrorState body={error} onRetry={() => void load()} />}
        {!overview && !error && <SkeletonListRows count={6} />}
        {overview && access && !access.canView && (
          <EmptyState icon={Lock} title={t('recipes.notCrewTitle')} body={t('recipes.notCrewBody')} />
        )}
        {overview && access?.canView && (
          <>
            {stale && <Callout tone="warning" icon={CloudOff} title={t('recipes.offlineTitle')}>{t('recipes.offlineBody')}</Callout>}
            <Callout tone="neutral" title={t('recipes.introTitle')}>{t('recipes.introBody')}</Callout>
            <ProgressLine overview={overview} />
            <DraftsGroup drafts={drafts} onOpen={(d: Draft) => go({ kind: 'form', sheetId: d.sheetId, draftId: d.id })} />
            <CrewRow overview={overview} onOpen={() => setCrewOpen(true)} />
            <SheetFilterChips overview={overview} value={filter} onChange={setFilter} />
            <SheetGroups overview={overview} filter={filter} drafts={drafts} onOpen={(sheetId) => go({ kind: 'sheet', sheetId })} />
            {overview.perMomo.length > 0 && <PerMomoGroup items={overview.perMomo} showCosts={access.canSeeCosts} pricesAsOf={latestPriceDate(overview)} />}
          </>
        )}
      </main>
      {overview?.crew && <CrewSheet open={crewOpen} crew={overview.crew} onOpenChange={setCrewOpen} onSaved={() => setRefreshKey((k) => k + 1)} />}
    </div>
  );
}

export function latestPriceDate(o: Overview): string | null {
  const dates = o.perMomo.map((m) => (m.cost?.ok ? m.cost.pricesAsOf : null)).filter((d): d is string => !!d).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

// The form needs the sheet's earlier batches (for the "usual share" check) and which batch this
// is; with no signal it uses the last saved answer.
function FormLoader({ sheetId, draftId, overview, cached, drafts, today, onBack, onDone }: {
  sheetId: string; draftId: string; overview: Overview | null; cached: Detail | null; drafts: readonly Draft[]; today: string; onBack: () => void; onDone: () => void;
}) {
  const api = useRecipesApi();
  const [detail, setDetail] = React.useState<Detail | null>(cached);
  const [ready, setReady] = React.useState(!!cached);
  React.useEffect(() => {
    let live = true;
    api.sheet(sheetId).then(
      (d) => { if (live) { setDetail(d); setReady(true); writeRecipesCache(`sheet:${sheetId}`, d); } },
      async () => {
        const c = await readRecipesCache<Detail>(`sheet:${sheetId}`);
        if (live) { setDetail((cur) => cur || c); setReady(true); }
      },
    );
    return () => { live = false; };
  }, [api, sheetId]);
  if (!ready) return <div className="p-4"><SkeletonListRows count={5} /></div>;
  const history = (detail?.batches || []).filter((b) => b.status !== 'excluded');
  const counting = detail ? countingBatches(detail.batches, detail.standard).length : 0;
  const me = drafts.find((d) => d.id === draftId);
  const earlierDrafts = drafts.filter((d) => d.sheetId === sheetId && d.id !== draftId && me && d.createdAt < me.createdAt && d.state !== 'editing').length;
  return (
    <BatchForm
      draftId={draftId}
      team={overview?.team || []}
      history={history}
      trialNo={counting + earlierDrafts + 1}
      today={today}
      onBack={onBack}
      onDone={onDone}
    />
  );
}
