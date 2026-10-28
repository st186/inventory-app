import * as React from 'react';
import { Camera, Check, Plus, Trash2, Wand2, X } from 'lucide-react';

import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { confirm } from '../ui/confirm';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { NumberStepper } from '../ui/number-stepper';
import { PageHeader } from '../ui/page-header';
import { PickerField } from '../ui/picker-sheet';
import { SegmentedControl } from '../ui/segmented-control';
import { StatusChip } from '../ui/status-chip';
import { Textarea } from '../ui/textarea';
import { toast } from '../ui/sonner';
import { cn } from '../ui/utils';
import { useT, type I18nKey } from '../../utils/i18n';
import { COUNT_LABEL, HOW_TO, INGREDIENT_BY_ID, SHEET_BY_ID } from '../../utils/recipeCatalog';
import {
  PORTION_SAMPLES, batchFacts, extraKey, isExtraKey, outputGrams, validateBatch,
  type Batch, type BatchInput, type BatchLine, type Issue, type WeightUnit,
} from '../../utils/recipeRules';
import { getDraft, removeDraft, saveDraft, sendDraft, useRecipesApi, type Draft, type SendResult, type TeamMember } from '../../utils/recipesApi';
import { compressPhoto } from '../workplace/workplaceUtils';
import { NumInput } from './NumInput';
import { fixLabel, fmtG, fmtNum, ingName, issueText, pick, sheetCode, sheetName } from './recipeText';

type Props = {
  draftId: string;
  team: TeamMember[];
  history: Batch[]; // the sheet's active batches (for the "usual share" check)
  trialNo: number;
  today: string;
  onBack: () => void;
  onDone: (result: SendResult) => void;
};

const OTHER = '__other';

function Section({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-subtitle font-semibold">{title}</h2>
        {hint && <p className="text-body-sm text-text-2">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function IssueRow({ issue, text, fix, confirmed, onFix, onConfirm }: { issue: Issue; text: string; fix?: string; confirmed?: boolean; onFix?: () => void; onConfirm?: () => void }) {
  const { t } = useT();
  const error = issue.level === 'error';
  return (
    <div role={error ? 'alert' : undefined} className={cn('flex flex-col gap-2 rounded-md border px-3 py-2', error ? 'border-danger-border bg-danger-soft' : confirmed ? 'border-border bg-surface-2' : 'border-warning-border bg-warning-soft')}>
      <p className={cn('text-body-sm', error ? 'text-danger' : 'text-text')}>{text}</p>
      {!error && (
        <div className="flex flex-wrap gap-2">
          {fix && onFix && <Button size="sm" variant="secondary" leadingIcon={<Wand2 />} onClick={onFix}>{fix}</Button>}
          {onConfirm && (
            <Button size="sm" variant={confirmed ? 'secondary' : 'ghost'} leadingIcon={confirmed ? <Check /> : undefined} aria-pressed={!!confirmed} onClick={onConfirm}>
              {t('recipes.form.itsRight')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function BatchForm({ draftId, team, history, trialNo, today, onBack, onDone }: Props) {
  const { t, lang } = useT();
  const api = useRecipesApi();
  const initial = getDraft(draftId);
  const [draft, setDraft] = React.useState<Draft | null>(initial);
  const [tried, setTried] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [potMode, setPotMode] = React.useState(() => initial?.input.output.qty == null && initial?.input.output.full != null);
  const [beforeOpen, setBeforeOpen] = React.useState<Record<string, boolean>>(() => Object.fromEntries((initial?.input.lines || []).filter((l) => l.beforeQty != null).map((l) => [l.key, true])));
  const [extraName, setExtraName] = React.useState('');
  const portionRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const saveTimer = React.useRef<number | undefined>(undefined);

  const sheet = draft ? SHEET_BY_ID[draft.sheetId] : null;
  const input = draft?.input;

  // Every change is kept on the phone (half a second after typing stops).
  const update = React.useCallback((fn: (i: BatchInput) => BatchInput) => {
    setDraft((d) => {
      if (!d) return d;
      const next: Draft = { ...d, input: fn(d.input), state: d.state === 'failed' ? 'failed' : 'editing' };
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveDraft(next), 500);
      return next;
    });
  }, []);
  React.useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const issues = React.useMemo(() => (sheet && input ? validateBatch(sheet, input, history, today) : []), [sheet, input, history, today]);
  const facts = React.useMemo(() => (sheet && input ? batchFacts(sheet, input) : null), [sheet, input]);

  if (!draft || !sheet || !input) {
    return (
      <div className="flex flex-col">
        <PageHeader title={t('recipes.form.title')} onBack={onBack} />
        <div className="p-4"><Callout tone="warning" title={t('recipes.form.draftGone')} /></div>
      </div>
    );
  }

  const confirmed = new Set(input.confirmed || []);
  const shown = (i: Issue) => i.level === 'warning' || tried;
  const issuesFor = (key: string) => issues.filter((i) => i.lineKey === key && shown(i));
  const general = issues.filter((i) => !i.lineKey && shown(i));
  const setLine = (key: string, patch: Partial<BatchLine>) => update((i) => ({ ...i, lines: i.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const toggleConfirm = (id: string) => update((i) => {
    const set = new Set(i.confirmed || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    return { ...i, confirmed: [...set] };
  });
  const applyFix = (issue: Issue) => {
    if (!issue.fix) return;
    const unit = issue.fix.unit;
    if (issue.fix.target === 'line' && issue.fix.lineKey) setLine(issue.fix.lineKey, { unit });
    else update((i) => (i.output.qty != null ? { ...i, output: { ...i.output, unit } } : { ...i, output: { ...i.output, containerUnit: unit } }));
  };
  const issueRow = (i: Issue, qty?: number | null) => (
    <IssueRow key={i.id} issue={i} text={issueText(t, lang, i)} fix={i.fix ? fixLabel(t, i, qty) : undefined} confirmed={confirmed.has(i.id)} onFix={() => applyFix(i)} onConfirm={() => toggleConfirm(i.id)} />
  );

  const unitOptions = [{ value: 'g' as WeightUnit, label: 'g' }, { value: 'kg' as WeightUnit, label: 'kg' }];
  const scaleOptions = [{ value: 'S' as const, label: t('recipes.form.scaleS') }, { value: 'B' as const, label: t('recipes.form.scaleB') }];
  const teamItems = [
    ...team.map((m) => ({ value: m.id, label: m.name })),
    { value: OTHER, label: t('recipes.form.someoneElse') },
  ];
  const madeByValue = input.madeById || (input.madeByName ? OTHER : null);
  const outG = outputGrams(input);
  const kindKey = sheet.kind;

  async function discard() {
    const ok = await confirm({ title: t('recipes.form.discardTitle'), body: t('recipes.form.discardBody'), confirmLabel: t('recipes.form.discard'), tone: 'danger' });
    if (!ok) return;
    await removeDraft(draftId);
    onBack();
  }

  async function saveAndLeave() {
    window.clearTimeout(saveTimer.current);
    await saveDraft({ ...draft!, state: draft!.state === 'failed' ? 'failed' : 'editing' });
    toast.success(t('recipes.form.draftSaved'));
    onBack();
  }

  async function send() {
    setTried(true);
    const errors = issues.filter((i) => i.level === 'error');
    if (errors.length) {
      toast.error(t('recipes.form.fixErrors', { n: errors.length }));
      window.setTimeout(() => document.querySelector('[data-recipe-error="true"], [role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    const open = issues.filter((i) => i.level === 'warning' && !confirmed.has(i.id));
    let finalInput = input!;
    if (open.length) {
      const ok = await confirm({
        title: t('recipes.form.checkTitle', { n: open.length }),
        body: (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body-sm text-text-2">
            {open.map((i) => <li key={i.id}>{issueText(t, lang, i)}</li>)}
          </ul>
        ),
        confirmLabel: t('recipes.form.sendAnyway'),
        cancelLabel: t('recipes.form.goBack'),
        tone: 'primary',
      });
      if (!ok) return;
      finalInput = { ...finalInput, confirmed: [...new Set([...(finalInput.confirmed || []), ...open.map((i) => i.id)])] };
    }
    window.clearTimeout(saveTimer.current);
    await saveDraft({ ...draft!, input: finalInput, state: 'waiting', error: undefined, issues: undefined });
    setSending(true);
    const result = await sendDraft(api, draftId);
    setSending(false);
    if (result.status === 'sent') {
      toast.success(t('recipes.form.sent', { code: sheet!.code, n: trialNo }));
      if (result.answer.photoError) toast.warning(t('recipes.form.photoNotSaved'));
      onDone(result);
    } else if (result.status === 'waiting') {
      toast.info(t('recipes.form.savedOffline'));
      onDone(result);
    } else {
      setDraft(getDraft(draftId));
      toast.error(result.error);
    }
  }

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const { image } = await compressPhoto(file);
      update((i) => ({ ...i, photo: image }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('recipes.form.photoNotSaved'));
    }
  }

  const serverIssues = draft.state === 'failed' ? draft.issues || [] : [];

  return (
    <div className="flex min-h-full flex-col bg-bg text-text" lang={lang}>
      <PageHeader
        title={`${sheet.code} · ${sheetName(lang, sheet.id)}`}
        caption={t('recipes.form.batchN', { n: trialNo })}
        onBack={() => void saveAndLeave()}
        actions={<IconButton label={t('recipes.form.discard')} icon={<Trash2 />} onClick={() => void discard()} />}
      />

      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4 p-4 pb-6 lg:px-8">
        <Callout tone="neutral" title={t('recipes.form.usualWay')}>{pick(lang, HOW_TO[kindKey])}</Callout>
        {draft.state === 'failed' && (
          <Callout tone="danger" title={t('recipes.form.notSent')}>
            {draft.error}
            {serverIssues.length > 0 && (
              <ul className="mt-1 list-disc pl-5">{serverIssues.map((i) => <li key={i.id}>{issueText(t, lang, i)}</li>)}</ul>
            )}
          </Callout>
        )}

        <Section title={t('recipes.form.whenWho')}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('recipes.form.date')}>
              <Input type="date" value={input.date} max={today} onChange={(e) => update((i) => ({ ...i, date: e.target.value }))} />
            </Field>
            <Field label={t('recipes.form.time')} optional>
              <Input type="time" value={input.time || ''} onChange={(e) => update((i) => ({ ...i, time: e.target.value }))} />
            </Field>
          </div>
          <Field label={t('recipes.form.madeBy')}>
            <PickerField
              title={t('recipes.form.madeBy')}
              items={teamItems}
              value={madeByValue}
              placeholder={t('recipes.form.pickPerson')}
              onValueChange={(v, item) => update((i) => (v === OTHER ? { ...i, madeById: null, madeByName: i.madeById ? '' : i.madeByName } : { ...i, madeById: v, madeByName: item.label }))}
            />
          </Field>
          {madeByValue === OTHER && (
            <Field label={t('recipes.form.name')}>
              <Input value={input.madeByName || ''} maxLength={80} onChange={(e) => update((i) => ({ ...i, madeByName: e.target.value }))} />
            </Field>
          )}
        </Section>

        <Section title={t('recipes.form.ingredients')} hint={t('recipes.form.ingredientsHint')}>
          <div className="-mx-4 flex flex-col">
            {input.lines.map((l) => {
              const def = INGREDIENT_BY_ID[l.key];
              const name = ingName(lang, l.key, l.name);
              const lineIssues = issuesFor(l.key);
              const err = lineIssues.some((i) => i.level === 'error');
              return (
                <div key={l.key} data-recipe-error={err || undefined} className="flex flex-col gap-2 border-t border-border px-4 py-3 first:border-t-0">
                  <div className="flex items-start gap-2">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className={cn('text-body-md font-medium', l.notUsed && 'text-text-3 line-through')}>{name}</span>
                      {lang === 'en' && def && <span lang="bn" className="text-caption text-text-3">{def.bn}</span>}
                      {def?.component && <span className="text-caption text-text-3">{t('recipes.form.fromSheet', { code: sheetCode(def.component) })}</span>}
                    </div>
                    {isExtraKey(l.key) ? (
                      <IconButton size="sm" label={t('recipes.form.removeItem', { name })} icon={<X />} onClick={() => update((i) => ({ ...i, lines: i.lines.filter((x) => x.key !== l.key) }))} />
                    ) : (
                      <Button size="sm" variant={l.notUsed ? 'secondary' : 'ghost'} aria-pressed={!!l.notUsed} onClick={() => setLine(l.key, { notUsed: !l.notUsed })}>
                        {l.notUsed ? t('recipes.form.usedIt') : t('recipes.form.notUsed')}
                      </Button>
                    )}
                  </div>
                  {!l.notUsed && (
                    <div className="flex items-center gap-2">
                      <NumInput
                        value={l.qty}
                        onChange={(qty) => setLine(l.key, { qty })}
                        label={t('recipes.form.weightOf', { name })}
                        unit={l.unit}
                        invalid={err}
                        wrapperClassName="flex-1 min-w-0"
                        className="text-right"
                      />
                      <SegmentedControl aria-label={t('recipes.form.unitOf', { name })} options={unitOptions} value={l.unit} onValueChange={(unit) => setLine(l.key, { unit, ...(l.beforeQty == null ? { beforeUnit: unit } : {}) })} className="w-[84px] shrink-0" />
                      <SegmentedControl aria-label={t('recipes.form.scaleOf', { name })} options={scaleOptions} value={l.scale} onValueChange={(scale) => setLine(l.key, { scale })} className="w-[84px] shrink-0" />
                    </div>
                  )}
                  {!l.notUsed && def?.prepLoss && (beforeOpen[l.key] ? (
                    <Field label={t('recipes.form.beforePeeling')} helper={facts?.byKey[l.key]?.beforeG && facts.byKey[l.key].g ? t('recipes.form.usable', { pct: fmtNum((facts.byKey[l.key].g / facts.byKey[l.key].beforeG!) * 100, 0) }) : t('recipes.form.beforeHelp')}>
                      <NumInput value={l.beforeQty} onChange={(beforeQty) => setLine(l.key, { beforeQty, beforeUnit: l.beforeUnit || l.unit })} unit={l.beforeUnit || l.unit} className="text-right" />
                    </Field>
                  ) : (
                    <Button variant="link" size="sm" className="self-start" leadingIcon={<Plus />} onClick={() => setBeforeOpen((o) => ({ ...o, [l.key]: true }))}>
                      {t('recipes.form.addBefore')}
                    </Button>
                  ))}
                  {lineIssues.map((i) => issueRow(i, l.qty))}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 border-t border-border pt-3">
            <Input
              value={extraName}
              maxLength={60}
              placeholder={t('recipes.form.extraPlaceholder')}
              aria-label={t('recipes.form.extraLabel')}
              onChange={(e) => setExtraName(e.target.value)}
              wrapperClassName="flex-1"
            />
            <Button
              variant="secondary"
              leadingIcon={<Plus />}
              disabled={!extraName.trim()}
              onClick={() => {
                const name = extraName.trim();
                const key = extraKey(name);
                if (input.lines.some((l) => l.key === key)) { toast.info(t('recipes.form.alreadyListed')); return; }
                update((i) => ({ ...i, lines: [...i.lines, { key, name, qty: null, unit: 'g', scale: 'S' }] }));
                setExtraName('');
              }}
            >
              {t('common.add')}
            </Button>
          </div>
        </Section>

        <Section title={t('recipes.form.whatItMade')} hint={facts && facts.inputG > 0 ? t('recipes.form.wentIn', { w: fmtG(facts.inputG) }) : undefined}>
          {!potMode ? (
            <div className="flex items-end gap-2">
              <Field label={t('recipes.form.finishedWeight')} className="flex-1" error={tried && general.some((i) => i.code === 'output-missing') ? t('recipes.issue.output-missing') : undefined}>
                <NumInput value={input.output.qty} onChange={(qty) => update((i) => ({ ...i, output: { ...i.output, qty } }))} unit={input.output.unit} className="text-right" />
              </Field>
              <SegmentedControl aria-label={t('recipes.form.unitOf', { name: t('recipes.form.finishedWeight') })} options={unitOptions} value={input.output.unit} onValueChange={(unit) => update((i) => ({ ...i, output: { ...i.output, unit } }))} className="mb-1 w-[84px] shrink-0" />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('recipes.form.fullPot')}>
                  <NumInput value={input.output.full} onChange={(full) => update((i) => ({ ...i, output: { ...i.output, full, qty: null } }))} unit={input.output.containerUnit || 'kg'} className="text-right" />
                </Field>
                <Field label={t('recipes.form.emptyPot')}>
                  <NumInput value={input.output.empty} onChange={(empty) => update((i) => ({ ...i, output: { ...i.output, empty, qty: null } }))} unit={input.output.containerUnit || 'kg'} className="text-right" />
                </Field>
              </div>
              <SegmentedControl aria-label={t('recipes.form.potUnit')} options={unitOptions} value={input.output.containerUnit || 'kg'} onValueChange={(containerUnit) => update((i) => ({ ...i, output: { ...i.output, containerUnit } }))} className="w-[120px]" />
              <p className="text-body-sm text-text-2">{t('recipes.form.netIs', { w: fmtG(outG) })}</p>
            </div>
          )}
          <Button
            variant="link"
            size="sm"
            className="self-start"
            onClick={() => {
              setPotMode((m) => !m);
              update((i) => ({ ...i, output: potMode ? { qty: null, unit: i.output.containerUnit || 'kg' } : { qty: null, unit: i.output.unit, full: null, empty: null, containerUnit: 'kg' } }));
            }}
          >
            {potMode ? t('recipes.form.typeNet') : t('recipes.form.usePot')}
          </Button>
          {facts?.yieldPct != null && <p className="text-body-sm text-text-2">{t('recipes.form.yieldIs', { pct: fmtNum(facts.yieldPct, 1) })}</p>}
          {general.filter((i) => ['output-more', 'output-low'].includes(i.code)).map((i) => issueRow(i, input.output.qty ?? input.output.full))}

          <Field label={pick(lang, COUNT_LABEL[kindKey])} optional>
            <NumInput value={input.count} onChange={(count) => update((i) => ({ ...i, count }))} integer unit={t('recipes.form.pcs')} className="text-right" />
          </Field>
          {(kindKey === 'sauce' || kindKey === 'premix' || kindKey === 'seasoning') && (
            <div className="flex items-end gap-2">
              <Field label={t('recipes.form.packWeight')} optional className="flex-1">
                <NumInput value={input.packWeight?.qty ?? null} onChange={(qty) => update((i) => ({ ...i, packWeight: { qty, unit: i.packWeight?.unit || 'g' } }))} unit={input.packWeight?.unit || 'g'} className="text-right" />
              </Field>
              <SegmentedControl aria-label={t('recipes.form.unitOf', { name: t('recipes.form.packWeight') })} options={unitOptions} value={input.packWeight?.unit || 'g'} onValueChange={(unit) => update((i) => ({ ...i, packWeight: { qty: i.packWeight?.qty ?? null, unit } }))} className="mb-1 w-[84px] shrink-0" />
            </div>
          )}
          {kindKey === 'premix' && (
            <Field label={t('recipes.form.waterPerPack')} optional>
              <NumInput value={input.waterPerPackMl} onChange={(waterPerPackMl) => update((i) => ({ ...i, waterPerPackMl }))} unit="ml" className="text-right" />
            </Field>
          )}
        </Section>

        {sheet.portion === 'samples' && (
          <Section id="recipe-portions" title={t(sheet.kind === 'dough' ? 'recipes.form.portionsDough' : 'recipes.form.portionsFilling')} hint={t('recipes.form.portionsHint')}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5">
              {Array.from({ length: PORTION_SAMPLES }, (_, idx) => (
                <Field key={idx} label={t('recipes.form.portionN', { n: idx + 1 })}>
                  <NumInput
                    inputRef={(el) => { portionRefs.current[idx] = el; }}
                    value={input.portions?.[idx] ?? null}
                    onChange={(v) => update((i) => {
                      const ps = [...(i.portions || Array(PORTION_SAMPLES).fill(null))];
                      ps[idx] = v;
                      return { ...i, portions: ps };
                    })}
                    unit="g"
                    enterKeyHint={idx < PORTION_SAMPLES - 1 ? 'next' : 'done'}
                    onEnter={() => portionRefs.current[idx + 1]?.focus()}
                    className="text-right"
                  />
                </Field>
              ))}
            </div>
            {facts && facts.portions.length > 0 && (
              <p className="text-body-sm text-text-2">
                {t('recipes.form.portionSummary', { n: facts.portions.length, avg: fmtNum(facts.portionMean, 1), min: fmtNum(Math.min(...facts.portions), 1), max: fmtNum(Math.max(...facts.portions), 1) })}
              </p>
            )}
            {general.filter((i) => i.code.startsWith('portion')).map((i) => issueRow(i))}
          </Section>
        )}

        {sheet.portion === 'pickup' && (
          <Section title={t(sheet.kind === 'batter' ? 'recipes.form.pickupBatter' : 'recipes.form.pickupCoating')} hint={t('recipes.form.pickupHint')}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t(sheet.kind === 'batter' ? 'recipes.form.beforeBatter' : 'recipes.form.beforeCoating')}>
                <NumInput value={input.pickup?.before ?? null} onChange={(before) => update((i) => ({ ...i, pickup: { before, after: i.pickup?.after ?? null, n: i.pickup?.n || PORTION_SAMPLES } }))} unit="g" className="text-right" />
              </Field>
              <Field label={t(sheet.kind === 'batter' ? 'recipes.form.afterBatter' : 'recipes.form.afterCoating')}>
                <NumInput value={input.pickup?.after ?? null} onChange={(after) => update((i) => ({ ...i, pickup: { before: i.pickup?.before ?? null, after, n: i.pickup?.n || PORTION_SAMPLES } }))} unit="g" className="text-right" />
              </Field>
            </div>
            {facts?.pickupG != null && <p className="text-body-sm text-text-2">{t('recipes.form.pickupIs', { g: fmtNum(facts.pickupG, 1) })}</p>}
            {general.filter((i) => i.code.startsWith('pickup')).map((i) => issueRow(i))}
          </Section>
        )}

        <Section title={t('recipes.form.timeNotes')}>
          <Field label={t('recipes.form.minutes')} optional>
            <NumberStepper label={t('recipes.form.minutesShort')} value={input.minutes ?? 0} onChange={(minutes) => update((i) => ({ ...i, minutes: minutes || null }))} step={5} min={0} max={1440} unit={t('recipes.form.min')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('recipes.form.leftover')} optional>
              <NumInput value={input.leftoverG} onChange={(leftoverG) => update((i) => ({ ...i, leftoverG }))} unit="g" className="text-right" />
            </Field>
            <Field label={t('recipes.form.thrown')} optional>
              <NumInput value={input.thrownG} onChange={(thrownG) => update((i) => ({ ...i, thrownG }))} unit="g" className="text-right" />
            </Field>
          </div>
          {(input.thrownG ?? 0) > 0 && (
            <Field label={t('recipes.form.thrownWhy')}>
              <Input value={input.thrownWhy || ''} maxLength={200} onChange={(e) => update((i) => ({ ...i, thrownWhy: e.target.value }))} />
            </Field>
          )}
          <Field label={t('recipes.form.notes')} optional helper={t('recipes.form.notesHelp')}>
            <Textarea value={input.notes || ''} maxLength={1000} onChange={(e) => update((i) => ({ ...i, notes: e.target.value }))} />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-medium">{t('recipes.form.photo')} <span className="font-normal text-text-3">· {t('common.optional')}</span></span>
            {input.photo ? (
              <div className="flex items-start gap-3">
                <img src={input.photo} alt={t('recipes.form.photo')} className="size-24 rounded-md border border-border object-cover" />
                <Button variant="secondary" size="sm" leadingIcon={<X />} onClick={() => update((i) => ({ ...i, photo: null }))}>{t('recipes.form.removePhoto')}</Button>
              </div>
            ) : (
              <label className="hit-44 inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-body-md font-medium text-text hover:bg-surface-2">
                <Camera className="size-5" aria-hidden="true" />
                {t('recipes.form.addPhoto')}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void addPhoto(e.target.files?.[0])} />
              </label>
            )}
          </div>
        </Section>

        {tried && general.some((i) => i.level === 'error' && !['output-missing'].includes(i.code) && !i.code.startsWith('portion') && !i.code.startsWith('pickup')) && (
          <Callout tone="danger" title={t('recipes.form.fixBelow')}>
            <ul className="list-disc pl-5">
              {general.filter((i) => i.level === 'error' && i.code !== 'output-missing' && !i.code.startsWith('portion') && !i.code.startsWith('pickup')).map((i) => <li key={i.id}>{issueText(t, lang, i)}</li>)}
            </ul>
          </Callout>
        )}
      </main>

      <div className="sticky bottom-0 z-(--z-sticky) border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-2.5 px-4 py-3 lg:px-8">
          <div className="hidden min-w-0 flex-1 sm:block">
            <StatusChip tone={draft.state === 'failed' ? 'danger' : 'neutral'}>{t(`recipes.draft.${draft.state}` as I18nKey)}</StatusChip>
          </div>
          <Button variant="secondary" size="lg" onClick={() => void saveAndLeave()}>{t('recipes.form.saveDraft')}</Button>
          <Button size="lg" className="flex-1 sm:flex-none" loading={sending} onClick={() => void send()}>{t('recipes.form.send')}</Button>
        </div>
      </div>
    </div>
  );
}
