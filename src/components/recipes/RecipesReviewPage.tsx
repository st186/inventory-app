// More → Recipes & costs (owner and operations managers): what each momo costs to make from
// the approved standards and today's purchase prices, and the recipe sheets waiting for review.
// The owner sets standards from here; nothing shows a cost until its standards are approved.
import * as React from 'react';
import { Lock } from 'lucide-react';

import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { PageHeader } from '../ui/page-header';
import { SkeletonListRows, SkeletonStatTiles } from '../ui/skeleton';
import { StatGrid, StatTile } from '../ui/stat-tile';
import { useT } from '../../utils/i18n';
import { MOMO_TYPES, SHEET_BY_ID } from '../../utils/recipeCatalog';
import { useRecipesApi, type Overview } from '../../utils/recipesApi';
import { ReviewDetail } from './ReviewDetail';
import { PerMomoGroup, SheetFilterChips, SheetGroups, type SheetFilter } from './SheetList';
import { latestPriceDate } from './RecipesPage';

export type RecipesReviewPageProps = {
  header?: boolean;
  /** Open this sheet's review straight away (a notification or deep link). */
  initialSheetId?: string | null;
};

export function RecipesReviewPage({ header = true, initialSheetId = null }: RecipesReviewPageProps) {
  const { t, lang } = useT();
  const api = useRecipesApi();
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<SheetFilter | null>(null);
  const [open, setOpen] = React.useState<string | null>(initialSheetId && SHEET_BY_ID[initialSheetId] ? initialSheetId : null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const load = React.useCallback(() => {
    setError(null);
    api.overview().then(setOverview, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [api]);
  React.useEffect(load, [load, refreshKey]);
  React.useEffect(() => { window.scrollTo?.(0, 0); }, [open]);

  if (open) return <ReviewDetail sheetId={open} onBack={() => setOpen(null)} onChanged={() => setRefreshKey((k) => k + 1)} />;

  const access = overview?.access;
  const ready = overview?.sheets.filter((s) => s.status.code === 'ready').length || 0;
  const set = overview?.sheets.filter((s) => s.standard).length || 0;
  const costed = overview?.perMomo.filter((m) => m.cost?.ok).length || 0;
  const shownFilter: SheetFilter = filter ?? (ready ? 'ready' : 'all');

  return (
    <div className="flex min-h-full flex-col bg-bg text-text" lang={lang}>
      {header && <PageHeader title={t('recipes.costsTitle')} caption={t('recipes.costsSubtitle')} />}
      <main className="mx-auto flex w-full max-w-[960px] flex-col gap-5 p-4 pb-8 lg:px-8">
        {error && <ErrorState body={error} onRetry={load} />}
        {!overview && !error && <><SkeletonStatTiles count={3} /><SkeletonListRows count={7} /></>}
        {overview && access && !access.canReview && <EmptyState icon={Lock} title={t('recipes.review.ownerOps')} body={t('recipes.review.ownerOpsBody')} />}
        {overview && access?.canReview && (
          <>
            <StatGrid>
              <StatTile label={t('recipes.stat.costed')} value={<span className="num">{costed} / {MOMO_TYPES.length}</span>} caption={t('recipes.stat.costedCaption')} />
              <StatTile label={t('recipes.stat.ready')} value={<span className="num">{ready}</span>} caption={t('recipes.stat.readyCaption')} onClick={ready ? () => setFilter('ready') : undefined} />
              <StatTile label={t('recipes.stat.set')} value={<span className="num">{set} / {overview.sheets.length}</span>} caption={t('recipes.stat.setCaption')} />
            </StatGrid>
            <PerMomoGroup items={overview.perMomo} showCosts={access.canSeeCosts} pricesAsOf={latestPriceDate(overview)} />
            <section className="flex flex-col gap-3">
              <h2 className="text-subtitle font-semibold">{t('recipes.sheetsTitle')}</h2>
              <SheetFilterChips overview={overview} value={shownFilter} onChange={setFilter} />
            </section>
            <SheetGroups overview={overview} filter={shownFilter} onOpen={setOpen} />
            {shownFilter !== 'all' && !overview.sheets.some((s) => s.status.code === shownFilter) && (
              <EmptyState compact title={t('empty.allCaughtUp')} body={t('recipes.nothingHere')} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
