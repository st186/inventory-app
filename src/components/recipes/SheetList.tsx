import * as React from 'react';
import { CloudOff, FileText, Users } from 'lucide-react';

import { FilterChips } from '../ui/chip';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { useT, type I18nKey } from '../../utils/i18n';
import { GROUPS, MOMO_TYPES, SHEETS, SHEET_BY_ID } from '../../utils/recipeCatalog';
import { TRIALS } from '../../utils/recipeRules';
import type { Draft, Overview, PerMomo } from '../../utils/recipesApi';
import { fmtG, fmtRs, ingName, momoName, pick, sheetCode, sheetName, statusView, fmtDay, istParts } from './recipeText';

export type SheetFilter = 'all' | 'todo' | 'ready' | 'set';

export function CodeBadge({ code }: { code: string }) {
  return <span className="num flex h-9 w-12 shrink-0 items-center justify-center rounded-md bg-surface-2 text-label font-semibold text-text-2">{code}</span>;
}

// "Chicken, onion, butter + 9 more · 10 scoops"
export function useWhatToWeigh() {
  const { t, lang } = useT();
  return (sheetId: string) => {
    const s = SHEET_BY_ID[sheetId];
    if (!s) return '';
    const names = s.ingredients.map((k) => ingName(lang, k));
    const head = names.slice(0, 3).join(', ') + (names.length > 3 ? ` ${t('recipes.list.more', { n: names.length - 3 })}` : '');
    const portion = s.portion === 'samples' ? t(s.kind === 'dough' ? 'recipes.list.tenBalls' : 'recipes.list.tenScoops') : s.portion === 'pickup' ? t('recipes.list.tenBeforeAfter') : '';
    return portion ? `${head} · ${portion}` : head;
  };
}

export function DraftsGroup({ drafts, onOpen }: { drafts: readonly Draft[]; onOpen: (d: Draft) => void }) {
  const { t, lang } = useT();
  if (!drafts.length) return null;
  return (
    <ListGroup title={t('recipes.list.onPhone')} meta={t('recipes.list.onPhoneMeta')}>
      {drafts.map((d) => {
        const tone = d.state === 'failed' ? 'danger' : d.state === 'waiting' || d.state === 'sending' ? 'warning' : 'neutral';
        const when = istParts(new Date(d.updatedAt).toISOString());
        return (
          <ListRow
            key={d.id}
            leading={<CodeBadge code={sheetCode(d.sheetId)} />}
            title={sheetName(lang, d.sheetId)}
            subtitle={d.state === 'failed' ? d.error || t('recipes.draft.failed') : t('recipes.list.savedAt', { day: fmtDay(t, when.date), time: when.time })}
            trailing={<StatusChip tone={tone} icon={d.state === 'waiting' ? CloudOff : undefined}>{t(`recipes.draft.${d.state}` as I18nKey)}</StatusChip>}
            chevron
            onClick={() => onOpen(d)}
          />
        );
      })}
    </ListGroup>
  );
}

export function SheetGroups({ overview, filter, onOpen, drafts }: { overview: Overview; filter: SheetFilter; onOpen: (sheetId: string) => void; drafts?: readonly Draft[] }) {
  const { t, lang } = useT();
  const weigh = useWhatToWeigh();
  const byId = new Map(overview.sheets.map((s) => [s.sheetId, s]));
  return (
    <>
      {GROUPS.map((g) => {
        const sheets = SHEETS.filter((s) => s.group === g.id).filter((s) => {
          const st = byId.get(s.id)?.status;
          if (!st || filter === 'all') return true;
          return st.code === filter;
        });
        if (!sheets.length) return null;
        return (
          <ListGroup key={g.id} title={pick(lang, g)}>
            {sheets.map((s) => {
              const sum = byId.get(s.id);
              const view = sum ? statusView(t, sum.status) : null;
              const onPhone = drafts?.filter((d) => d.sheetId === s.id).length || 0;
              return (
                <ListRow
                  key={s.id}
                  leading={<CodeBadge code={s.code} />}
                  title={sheetName(lang, s.id)}
                  subtitle={onPhone ? `${weigh(s.id)} · ${t('recipes.list.draftsHere', { n: onPhone })}` : weigh(s.id)}
                  trailing={view ? <StatusChip tone={view.tone}>{view.label}</StatusChip> : undefined}
                  chevron
                  onClick={() => onOpen(s.id)}
                />
              );
            })}
          </ListGroup>
        );
      })}
    </>
  );
}

export function sheetFilterOptions(t: (k: I18nKey, v?: Record<string, string | number>) => string, overview: Overview) {
  const count = (code: string) => overview.sheets.filter((s) => s.status.code === code).length;
  return [
    { value: 'all' as SheetFilter, label: t('recipes.filter.all'), count: overview.sheets.length },
    { value: 'todo' as SheetFilter, label: t('recipes.filter.todo'), count: count('todo') },
    { value: 'ready' as SheetFilter, label: t('recipes.filter.ready'), count: count('ready') },
    { value: 'set' as SheetFilter, label: t('recipes.filter.set'), count: count('set') },
  ];
}

export function SheetFilterChips({ overview, value, onChange }: { overview: Overview; value: SheetFilter; onChange: (v: SheetFilter) => void }) {
  const { t } = useT();
  return <FilterChips aria-label={t('recipes.filter.label')} value={value} onValueChange={onChange} options={sheetFilterOptions(t, overview)} />;
}

// What each momo is made of, from the approved standards; the cost per piece for those who see costs.
export function PerMomoGroup({ items, showCosts, pricesAsOf }: { items: PerMomo[]; showCosts: boolean; pricesAsOf?: string | null }) {
  const { t, lang } = useT();
  return (
    <ListGroup
      title={showCosts ? t('recipes.momo.titleCost') : t('recipes.momo.title')}
      meta={showCosts && pricesAsOf ? t('recipes.momo.pricesAsOf', { date: fmtDay(t, pricesAsOf) }) : undefined}
      footer={<p className="text-caption text-text-3">{showCosts ? t('recipes.momo.footCost') : t('recipes.momo.foot')}</p>}
    >
      {MOMO_TYPES.map((m) => {
        const it = items.find((x) => x.momoType === m.key);
        const g = it?.grams || {};
        const parts = [
          g.wrapper != null ? t('recipes.momo.wrapper', { g: fmtG(g.wrapper) }) : null,
          g.filling != null ? t('recipes.momo.filling', { g: fmtG(g.filling) }) : null,
          g.batter != null ? t('recipes.momo.batter', { g: fmtG(g.batter) }) : null,
          g.coating != null ? t('recipes.momo.coating', { g: fmtG(g.coating) }) : null,
        ].filter(Boolean);
        const needs = it?.needs || [];
        const cost = it?.cost;
        const costMissing = cost && !cost.ok ? cost.missing.filter((x) => x.reason === 'no-price' || x.reason === 'cycle') : [];
        const subtitle = needs.length
          ? t('recipes.momo.needs', { list: needs.map((id) => sheetCode(id)).join(', ') })
          : costMissing.length && showCosts
            ? t('recipes.momo.needsPrice', { list: costMissing.map((x) => sheetCode(x.sheetId)).join(', ') })
            : parts.join(' · ');
        return (
          <ListRow
            key={m.key}
            density="compact"
            title={momoName(lang, m.key)}
            subtitle={subtitle}
            trailing={
              showCosts && cost?.ok ? (
                <span className="flex flex-col items-end">
                  <span className="num text-body-md font-semibold">{fmtRs(cost.costPerPiece, 2)}</span>
                  <span className="text-caption text-text-3">{t('recipes.momo.perPiece')}</span>
                </span>
              ) : needs.length || (showCosts && costMissing.length) ? (
                <StatusChip tone="neutral">{t('recipes.momo.notYet')}</StatusChip>
              ) : (
                <StatusChip tone="success">{t('recipes.momo.ready')}</StatusChip>
              )
            }
          />
        );
      })}
    </ListGroup>
  );
}

export function CrewRow({ overview, onOpen }: { overview: Overview; onOpen: () => void }) {
  const { t } = useT();
  if (!overview.crew) return null;
  const picked = overview.crew.filter((c) => c.picked);
  return (
    <ListGroup>
      <ListRow
        icon={Users}
        title={t('recipes.crew.row', { n: picked.length })}
        subtitle={picked.length ? picked.map((c) => c.name).join(', ') : t('recipes.crew.none')}
        chevron
        onClick={onOpen}
      />
    </ListGroup>
  );
}

export function ProgressLine({ overview }: { overview: Overview }) {
  const { t } = useT();
  const sent = overview.sheets.reduce((s, x) => s + Math.min(TRIALS, x.status.code === 'set' ? TRIALS : x.status.n), 0);
  const total = overview.sheets.length * TRIALS;
  const set = overview.sheets.filter((s) => s.standard).length;
  const pct = total ? Math.round((sent / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <FileText className="size-5 text-text-2" aria-hidden="true" />
        <span className="flex-1 text-subtitle font-semibold">{t('recipes.list.progress', { done: sent, total })}</span>
        <span className="num text-body-sm text-text-2">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={sent} aria-label={t('recipes.list.progress', { done: sent, total })}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-body-sm text-text-2">{t('recipes.list.standardsSet', { n: set, total: overview.sheets.length })}</p>
    </div>
  );
}

export function useSheetFilter() {
  return React.useState<SheetFilter>('all');
}
