import * as React from 'react';
import { BarChart3, ClipboardList, CloudOff, Plus, RotateCcw } from 'lucide-react';

import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { promptText } from '../ui/confirm';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { ListGroup, ListRow } from '../ui/list-row';
import { PageHeader } from '../ui/page-header';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SkeletonListRows } from '../ui/skeleton';
import { StatusChip } from '../ui/status-chip';
import { toast } from '../ui/sonner';
import { useT, type I18nKey } from '../../utils/i18n';
import { HOW_TO, INGREDIENT_BY_ID, SHEET_BY_ID, defaultScale } from '../../utils/recipeCatalog';
import { TRIALS, batchFacts, countingBatches, type Batch } from '../../utils/recipeRules';
import { readRecipesCache, useDrafts, useRecipesApi, writeRecipesCache, type Draft, type SheetDetail as Detail } from '../../utils/recipesApi';
import { isNetworkError } from '../../utils/http';
import { fmtDay, fmtG, fmtNum, fmtPct, fmtTime, ingName, issueText, pick, sheetName, statusView } from './recipeText';
import { CodeBadge } from './SheetList';

const offlineDetail = (sheetId: string): Detail => ({
  sheetId,
  status: { code: 'todo', n: 0, version: null, newSince: 0 },
  batches: [],
  standard: null,
  access: { canView: true, canEnter: true, canReview: false, canApprove: false, canManageCrew: false, canSeeCosts: false, canEditPrices: false, isCrew: false },
  today: new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10),
});

type Props = {
  sheetId: string;
  refreshKey: number;
  onBack: () => void;
  onStart: (detail: Detail) => void;
  onOpenDraft: (d: Draft) => void;
  onReview?: () => void;
};

export function SheetDetail({ sheetId, refreshKey, onBack, onStart, onOpenDraft, onReview }: Props) {
  const { t, lang } = useT();
  const api = useRecipesApi();
  const drafts = useDrafts().filter((d) => d.sheetId === sheetId);
  const [data, setData] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const [open, setOpen] = React.useState<Batch | null>(null);
  const [standardOpen, setStandardOpen] = React.useState(false);
  const sheet = SHEET_BY_ID[sheetId];

  const load = React.useCallback(() => {
    setError(null);
    api.sheet(sheetId).then(
      (d) => { setData(d); setStale(false); writeRecipesCache(`sheet:${sheetId}`, d); },
      async (e) => {
        // No signal: the last saved answer, or an empty sheet - a batch can still be started.
        if (!isNetworkError(e)) { setError(e instanceof Error ? e.message : String(e)); return; }
        const cached = await readRecipesCache<Detail>(`sheet:${sheetId}`);
        setData(cached || offlineDetail(sheetId));
        setStale(true);
      },
    );
  }, [api, sheetId]);
  React.useEffect(load, [load, refreshKey]);

  const view = data ? statusView(t, data.status) : null;
  const counting = data ? countingBatches(data.batches, data.standard) : [];
  const nextNo = counting.length + 1;
  const cur = data?.standard?.current;

  return (
    <div className="flex min-h-full flex-col bg-bg text-text" lang={lang}>
      <PageHeader title={`${sheet.code} · ${sheetName(lang, sheetId)}`} caption={view?.label} onBack={onBack} />
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-5 p-4 pb-6 lg:px-8">
        {error && <ErrorState title={t('error.title')} body={error} onRetry={load} />}
        {stale && <Callout tone="warning" icon={CloudOff} title={t('recipes.offlineTitle')}>{t('recipes.offlineBody')}</Callout>}
        {!data && !error && <SkeletonListRows count={4} />}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {view && <StatusChip tone={view.tone}>{view.label}</StatusChip>}
              <span className="text-body-sm text-text-2">
                {data.status.code === 'ready' ? t('recipes.sheet.readyHint') : t('recipes.sheet.nextBatch', { n: Math.min(nextNo, TRIALS), total: TRIALS })}
              </span>
            </div>

            <Callout tone="neutral" title={t('recipes.form.usualWay')}>{pick(lang, HOW_TO[sheet.kind])}</Callout>

            {drafts.length > 0 && (
              <ListGroup title={t('recipes.list.onPhone')}>
                {drafts.map((d) => (
                  <ListRow
                    key={d.id}
                    icon={ClipboardList}
                    title={t('recipes.sheet.draft')}
                    subtitle={d.state === 'failed' ? d.error : fmtDay(t, d.input.date)}
                    trailing={<StatusChip tone={d.state === 'failed' ? 'danger' : d.state === 'waiting' ? 'warning' : 'neutral'}>{t(`recipes.draft.${d.state}` as I18nKey)}</StatusChip>}
                    chevron
                    onClick={() => onOpenDraft(d)}
                  />
                ))}
              </ListGroup>
            )}

            <ListGroup title={t('recipes.sheet.batches')} meta={t('recipes.sheet.batchesMeta', { n: counting.length, total: TRIALS })}
              empty={<EmptyState compact icon={ClipboardList} title={t('recipes.sheet.noBatches')} body={t('recipes.sheet.noBatchesBody')} />}>
              {[...data.batches].reverse().map((b) => {
                const f = batchFacts(sheet, b);
                return (
                  <ListRow
                    key={b.id}
                    title={`${fmtDay(t, b.date)}${b.time ? `, ${fmtTime(b.time)}` : ''}`}
                    subtitle={t('recipes.sheet.batchLine', { who: b.madeByName || b.enteredByName, out: fmtG(f.outputG), y: fmtPct(f.yieldPct) })}
                    trailing={
                      b.status === 'excluded' ? <StatusChip tone="neutral">{t('recipes.sheet.leftOut')}</StatusChip>
                        : cur?.calc.batchIds.includes(b.id) ? <StatusChip tone="success">{t('recipes.sheet.inStandard', { v: cur.version })}</StatusChip>
                          : b.issues?.length ? <StatusChip tone="warning">{t('recipes.sheet.checks', { n: b.issues.length })}</StatusChip> : undefined
                    }
                    chevron
                    onClick={() => setOpen(b)}
                  />
                );
              })}
            </ListGroup>

            {cur && (
              <ListGroup title={t('recipes.sheet.standard', { v: cur.version })} meta={t('recipes.sheet.setBy', { who: cur.setByName, day: fmtDay(t, cur.setAt) })}>
                <ListRow density="compact" title={t('recipes.sheet.usualBatch')} trailing={<span className="num text-body-md font-semibold">{fmtG(cur.calc.inputG)} → {fmtG(cur.calc.outputG)}</span>} />
                <ListRow density="compact" title={t('recipes.review.yield')} trailing={<span className="num text-body-md font-semibold">{fmtPct(cur.calc.yieldPct)}</span>} />
                {cur.calc.portionG != null && <ListRow density="compact" title={t(sheet.kind === 'dough' ? 'recipes.review.ball' : 'recipes.review.scoop')} trailing={<span className="num text-body-md font-semibold">{fmtG(cur.calc.portionG)}</span>} />}
                {cur.calc.pickupG != null && <ListRow density="compact" title={t('recipes.review.pickup')} trailing={<span className="num text-body-md font-semibold">{fmtG(cur.calc.pickupG)}</span>} />}
                <ListRow title={t('recipes.sheet.seeStandard')} chevron onClick={() => setStandardOpen(true)} />
              </ListGroup>
            )}

            <ListGroup title={t('recipes.sheet.whatToWeigh')}>
              {sheet.ingredients.map((k) => {
                const d = INGREDIENT_BY_ID[k];
                return (
                  <ListRow
                    key={k}
                    density="compact"
                    title={ingName(lang, k)}
                    subtitle={d.prepLoss ? t('recipes.sheet.beforeAfter') : d.component ? t('recipes.form.fromSheet', { code: SHEET_BY_ID[d.component].code }) : undefined}
                    trailing={<span className="text-label text-text-3">{defaultScale(sheet, d) === 'B' ? t('recipes.sheet.bigScale') : t('recipes.sheet.smallScale')}</span>}
                  />
                );
              })}
            </ListGroup>
          </>
        )}
      </main>

      {data && (data.access.canEnter || (onReview && data.access.canReview)) && (
        <div className="sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-(--z-sticky) border-t border-border bg-surface md:bottom-0">
          <div className="mx-auto flex w-full max-w-[720px] gap-2.5 px-4 py-3 lg:px-8">
            {onReview && data.access.canReview && (
              <Button variant="secondary" size="lg" leadingIcon={<BarChart3 />} className={data.access.canEnter ? undefined : 'flex-1'} onClick={onReview}>{t('recipes.sheet.review')}</Button>
            )}
            {data.access.canEnter && (
              <Button size="lg" className="flex-1" leadingIcon={<Plus />} onClick={() => onStart(data)}>
                {t('recipes.sheet.start', { n: nextNo })}
              </Button>
            )}
          </div>
        </div>
      )}

      {open && data && (
        <BatchSheet batch={open} detail={data} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />
      )}
      {cur && (
        <ResponsiveModal open={standardOpen} onOpenChange={setStandardOpen} size="detail" title={t('recipes.sheet.standard', { v: cur.version })} description={cur.note || undefined}>
          <StandardTable sheetId={sheetId} calc={cur.calc} />
        </ResponsiveModal>
      )}
    </div>
  );
}

// The card a standard turns into: each ingredient for a usual batch and per kg of output.
export function StandardTable({ sheetId, calc }: { sheetId: string; calc: NonNullable<Detail['standard']>['history'][number]['calc'] }) {
  const { t, lang } = useT();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-text-2">{t('recipes.sheet.standardHint', { inG: fmtG(calc.inputG), outG: fmtG(calc.outputG), y: fmtPct(calc.yieldPct) })}</p>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-body-sm">
          <thead className="bg-surface-2 text-left text-label text-text-2">
            <tr>
              <th className="px-3 py-2 font-medium">{t('recipes.review.ingredient')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('recipes.review.usualBatch')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('recipes.review.perKgOut')}</th>
            </tr>
          </thead>
          <tbody>
            {calc.ingredients.filter((i) => i.usedIn > 0).map((i) => (
              <tr key={i.key} className="border-t border-border">
                <td className="px-3 py-2">{ingName(lang, i.key, i.name)}</td>
                <td className="num px-3 py-2 text-right">{fmtG(i.stdG)}</td>
                <td className="num px-3 py-2 text-right">{fmtG(i.perKgOutput)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {calc.portionG != null && <p className="text-body-sm">{t(SHEET_BY_ID[sheetId]?.kind === 'dough' ? 'recipes.review.ball' : 'recipes.review.scoop')}: <span className="num font-semibold">{fmtG(calc.portionG)}</span></p>}
      {calc.pickupG != null && <p className="text-body-sm">{t('recipes.review.pickup')}: <span className="num font-semibold">{fmtG(calc.pickupG)}</span></p>}
    </div>
  );
}

function BatchSheet({ batch, detail, onClose, onChanged }: { batch: Batch; detail: Detail; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const api = useRecipesApi();
  const sheet = SHEET_BY_ID[batch.sheetId];
  const f = batchFacts(sheet, batch);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (batch.photo) api.photoUrl(batch.sheetId, batch.id).then(setPhoto, () => setPhoto(null));
  }, [api, batch]);
  const inStandard = detail.standard?.current?.calc.batchIds.includes(batch.id);
  const canChange = detail.access.canReview || detail.access.canManageCrew || detail.access.canEnter;

  async function toggle() {
    let note = '';
    if (batch.status !== 'excluded') {
      const reason = await promptText({ title: t('recipes.sheet.leaveOutTitle'), label: t('recipes.sheet.leaveOutWhy'), required: true, confirmLabel: t('recipes.sheet.leaveOut'), tone: 'danger', multiline: true });
      if (!reason) return;
      note = reason;
    }
    setBusy(true);
    try {
      await api.setBatchStatus(batch.sheetId, batch.id, batch.status === 'excluded' ? 'active' : 'excluded', note);
      toast.success(batch.status === 'excluded' ? t('recipes.sheet.broughtBack') : t('recipes.sheet.leftOutDone'));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      size="detail"
      title={`${fmtDay(t, batch.date)}${batch.time ? `, ${fmtTime(batch.time)}` : ''}`}
      description={t('recipes.sheet.madeByWrote', { who: batch.madeByName || batch.enteredByName, writer: batch.enteredByName })}
      footer={canChange && !inStandard ? (
        <Button variant={batch.status === 'excluded' ? 'secondary' : 'danger-ghost'} size="lg" className="flex-1" loading={busy} leadingIcon={batch.status === 'excluded' ? <RotateCcw /> : undefined} onClick={() => void toggle()}>
          {batch.status === 'excluded' ? t('recipes.sheet.bringBack') : t('recipes.sheet.leaveOut')}
        </Button>
      ) : undefined}
    >
      <div className="flex flex-col gap-4">
        {batch.status === 'excluded' && <Callout tone="neutral" title={t('recipes.sheet.leftOut')}>{batch.statusNote}</Callout>}
        <ListGroup>
          {batch.lines.map((l) => (
            <ListRow key={l.key} density="compact" muted={l.notUsed} title={ingName(lang, l.key, l.name)}
              subtitle={l.beforeQty != null ? t('recipes.sheet.beforeWas', { w: fmtG((l.beforeQty || 0) * (l.beforeUnit === 'kg' ? 1000 : 1)) }) : undefined}
              trailing={<span className="num text-body-md font-semibold">{l.notUsed ? t('recipes.form.notUsed') : `${fmtNum(l.qty, 3)} ${l.unit} · ${l.scale}`}</span>} />
          ))}
        </ListGroup>
        <ListGroup>
          <ListRow density="compact" title={t('recipes.review.totalIn')} trailing={<span className="num font-semibold">{fmtG(f.inputG)}</span>} />
          <ListRow density="compact" title={t('recipes.review.finished')} trailing={<span className="num font-semibold">{fmtG(f.outputG)}</span>} />
          <ListRow density="compact" title={t('recipes.review.yield')} trailing={<span className="num font-semibold">{fmtPct(f.yieldPct)}</span>} />
          {f.portionMean != null && <ListRow density="compact" title={t(sheet.kind === 'dough' ? 'recipes.review.ball' : 'recipes.review.scoop')} subtitle={f.portions.map((p) => fmtNum(p, 1)).join(' · ')} trailing={<span className="num font-semibold">{fmtG(f.portionMean)}</span>} />}
          {f.pickupG != null && <ListRow density="compact" title={t('recipes.review.pickup')} trailing={<span className="num font-semibold">{fmtG(f.pickupG)}</span>} />}
          {f.count != null && <ListRow density="compact" title={t('recipes.review.counted')} trailing={<span className="num font-semibold">{fmtNum(f.count, 0)}</span>} />}
          {f.minutes != null && <ListRow density="compact" title={t('recipes.form.minutes')} trailing={<span className="num font-semibold">{fmtNum(f.minutes, 0)}</span>} />}
        </ListGroup>
        {batch.issues?.length > 0 && (
          <Callout tone="warning" title={t('recipes.sheet.checkedWarnings')}>
            <ul className="list-disc pl-5">{batch.issues.map((i) => <li key={i.id}>{issueText(t, lang, i)}</li>)}</ul>
          </Callout>
        )}
        {batch.notes && <p className="text-body-sm whitespace-pre-wrap text-text-2">{batch.notes}</p>}
        {photo && <img src={photo} alt={t('recipes.form.photo')} className="max-h-80 w-full rounded-lg border border-border object-contain" />}
      </div>
    </ResponsiveModal>
  );
}
