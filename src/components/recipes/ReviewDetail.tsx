import * as React from 'react';
import { AlertTriangle, BadgeCheck, Check, Link2, Plus, X } from 'lucide-react';

import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { confirm } from '../ui/confirm';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { ListGroup, ListRow } from '../ui/list-row';
import { PageHeader } from '../ui/page-header';
import { PickerField } from '../ui/picker-sheet';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SkeletonListRows } from '../ui/skeleton';
import { StatusChip } from '../ui/status-chip';
import { Textarea } from '../ui/textarea';
import { toast } from '../ui/sonner';
import { cn } from '../ui/utils';
import { useT, type I18nKey } from '../../utils/i18n';
import { INGREDIENT_BY_ID, SHEET_BY_ID } from '../../utils/recipeCatalog';
import { SPREAD_LIMIT, TRIALS, batchFacts, type Batch, type CostLine, type StandardCalc } from '../../utils/recipeRules';
import { useRecipesApi, type ApiError, type PriceItem, type Review } from '../../utils/recipesApi';
import { NumInput } from './NumInput';
import { fmtDay, fmtG, fmtNum, fmtPct, fmtRs, ingName, priceMissText, priceSourceText, sheetCode, sheetName, statusView } from './recipeText';
import { StandardTable } from './SheetDetail';

type Props = { sheetId: string; onBack: () => void; onChanged?: () => void };

function SpreadChip({ value, flag }: { value: number | null; flag: boolean }) {
  const { t } = useT();
  if (value === null) return <span className="text-label text-text-3">–</span>;
  return flag
    ? <StatusChip tone="warning" icon={AlertTriangle}>{fmtPct(value)}</StatusChip>
    : <span className="num text-label text-text-2" title={t('recipes.review.spread')}>{fmtPct(value)}</span>;
}

// One compared figure: per batch (phone: under the name; desktop: own columns), the average, the spread.
function CompareRow({ title, values, avg, spread, flag, note }: { title: React.ReactNode; values: string[]; avg: string; spread: number | null; flag: boolean; note?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_88px]">
      <div className="flex min-w-0 flex-col">
        <span className="text-body-md font-medium">{title}</span>
        <span className="num text-label text-text-3 md:hidden">{values.map((v, i) => `${i + 1}: ${v}`).join(' · ')}</span>
        {note && <span className="text-label text-text-3">{note}</span>}
      </div>
      {[0, 1, 2].map((i) => <span key={i} className="num hidden text-right text-body-sm text-text-2 md:block">{values[i] ?? ''}</span>)}
      <span className="num text-right text-body-md font-semibold">{avg}</span>
      <span className="col-start-2 row-start-2 text-right md:col-start-auto md:row-start-auto"><SpreadChip value={spread} flag={flag} /></span>
    </div>
  );
}

function CompareHead({ batches }: { batches: Batch[] }) {
  const { t } = useT();
  return (
    <div className="hidden grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_88px] gap-x-3 border-b border-border bg-surface-2 px-4 py-2 text-label font-medium text-text-2 md:grid">
      <span />
      {[0, 1, 2].map((i) => <span key={i} className="text-right">{batches[i] ? `${i + 1} · ${fmtDay(t, batches[i].date)}` : ''}</span>)}
      <span className="text-right">{t('recipes.review.average')}</span>
      <span className="text-right">{t('recipes.review.spread')}</span>
    </div>
  );
}

export function ReviewDetail({ sheetId, onBack, onChanged }: Props) {
  const { t, lang } = useT();
  const api = useRecipesApi();
  const sheet = SHEET_BY_ID[sheetId];
  const [data, setData] = React.useState<Review | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ids, setIds] = React.useState<string[] | null>(null);
  const [priceLine, setPriceLine] = React.useState<CostLine | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState<number | null>(null);
  const [note, setNote] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback((wanted?: string[] | null) => {
    setError(null);
    api.review(sheetId, wanted || undefined).then((r) => { setData(r); setIds(r.selected); }, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [api, sheetId]);
  React.useEffect(() => { load(null); }, [load]);

  const toggle = (id: string) => {
    const cur = ids || [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= TRIALS ? cur : [...cur, id];
    setIds(next);
    if (next.length) load(next);
  };

  const calc = data?.calc;
  const cost = data?.cost;
  const chosen = (data?.selected || []).map((id) => data!.batches.find((b) => b.id === id)!).filter(Boolean);
  const facts = chosen.map((b) => batchFacts(sheet, b));
  const flagged = (what: string, key?: string) => !!calc?.flags.some((f) => f.what === what && (key ? f.key === key : true));
  const view = data ? statusView(t, data.status) : null;
  const nextVersion = (data?.standard?.history.length ? Math.max(...data.standard.history.map((h) => h.version)) : 0) + 1;
  const active = (data?.batches || []).filter((b) => b.status !== 'excluded');

  async function setStandard() {
    if (!data || !calc) return;
    if (calc.flags.length && !reason.trim()) { toast.error(t('recipes.review.reasonNeeded')); return; }
    const ok = await confirm({
      title: t('recipes.review.setTitle', { v: nextVersion }),
      body: t('recipes.review.setBody', { code: sheet.code, name: sheetName(lang, sheetId) }),
      confirmLabel: t('recipes.review.setButton', { v: nextVersion }),
      tone: 'primary',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.setStandard(sheetId, { batchIds: data.selected, note: note.trim(), ...(calc.flags.length ? { overrideReason: reason.trim() } : {}) });
      toast.success(t('recipes.review.setDone', { v: nextVersion }));
      setNote(''); setReason('');
      load(null);
      onChanged?.();
    } catch (e) {
      toast.error((e as ApiError).details?.error || (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-bg text-text" lang={lang}>
      <PageHeader title={`${sheet.code} · ${sheetName(lang, sheetId)}`} caption={view ? `${t('recipes.review.title')} · ${view.label}` : t('recipes.review.title')} onBack={onBack} />
      <main className="mx-auto flex w-full max-w-[960px] flex-col gap-5 p-4 pb-8 lg:px-8">
        {error && <ErrorState body={error} onRetry={() => load(ids)} />}
        {!data && !error && <SkeletonListRows count={6} leading="none" />}
        {data && !active.length && <EmptyState icon={BadgeCheck} title={t('recipes.review.noBatches')} body={t('recipes.review.noBatchesBody')} />}
        {data && active.length > 0 && (
          <>
            <section className="flex flex-col gap-2">
              <h2 className="text-subtitle font-semibold">{t('recipes.review.pickBatches', { n: TRIALS })}</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('recipes.review.pickBatches', { n: TRIALS })}>
                {active.map((b) => {
                  const on = (ids || []).includes(b.id);
                  const used = data.standard?.current?.calc.batchIds.includes(b.id);
                  return (
                    <button key={b.id} type="button" aria-pressed={on} onClick={() => toggle(b.id)}
                      className={cn('hit-44 inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-label font-medium', on ? 'border-primary bg-primary-soft text-primary' : 'border-border-strong bg-surface text-text-2 hover:bg-surface-2')}>
                      {on && <Check className="size-4" aria-hidden="true" />}
                      {fmtDay(t, b.date)} · {b.madeByName || b.enteredByName}{used ? ` · v${data.standard!.current!.version}` : ''}
                    </button>
                  );
                })}
              </div>
              {chosen.length < TRIALS && <p className="text-body-sm text-text-2">{t('recipes.review.needMore', { n: TRIALS - chosen.length })}</p>}
            </section>

            {calc && calc.flags.length > 0 && (
              <Callout tone="warning" title={t('recipes.review.flagsTitle', { n: calc.flags.length, limit: SPREAD_LIMIT })}>
                <p>{calc.flags.map((f) => {
                  const what = f.what === 'ingredient' ? ingName(lang, f.key || '') : t(`recipes.review.flag.${f.what}` as I18nKey);
                  return f.spreadPct === null ? t('recipes.review.usedIn', { what, n: f.usedIn ?? 0, total: calc.n }) : `${what}: ${fmtPct(f.spreadPct)}`;
                }).join(' · ')}</p>
                <p className="mt-1">{t('recipes.review.flagsBody')}</p>
              </Callout>
            )}

            {calc && (
              <ListGroup title={t('recipes.review.whatItMade')}>
                <CompareHead batches={chosen} />
                <CompareRow title={t('recipes.review.totalIn')} values={facts.map((f) => fmtG(f.inputG))} avg={fmtG(calc.inputG)} spread={null} flag={false} />
                <CompareRow title={t('recipes.review.finished')} values={facts.map((f) => fmtG(f.outputG))} avg={fmtG(calc.outputG)} spread={null} flag={false} />
                <CompareRow title={t('recipes.review.yield')} values={calc.yields.map((y) => fmtPct(y))} avg={fmtPct(calc.yieldPct)} spread={calc.yieldSpread} flag={flagged('yield')} />
                {calc.portionG != null && (
                  <CompareRow title={t(sheet.kind === 'dough' ? 'recipes.review.ball' : 'recipes.review.scoop')} values={calc.portionMeans.map((p) => fmtG(p))} avg={fmtG(calc.portionG)} spread={calc.portionSpread} flag={flagged('portion')}
                    note={calc.portionMin != null ? t('recipes.review.range', { min: fmtG(calc.portionMin), max: fmtG(calc.portionMax) }) : undefined} />
                )}
                {calc.pickupG != null && <CompareRow title={t('recipes.review.pickup')} values={calc.pickups.map((p) => fmtG(p))} avg={fmtG(calc.pickupG)} spread={calc.pickupSpread} flag={flagged('pickup')} />}
                {calc.count != null && <CompareRow title={t('recipes.review.counted')} values={calc.counts.map((c) => fmtNum(c, 0))} avg={fmtNum(calc.count, 0)} spread={null} flag={false}
                  note={calc.portionG ? t('recipes.review.expected', { n: fmtNum(Math.floor(calc.outputG / calc.portionG), 0) }) : undefined} />}
                {calc.minutes != null && <CompareRow title={t('recipes.form.minutes')} values={calc.minutesList.map((m) => fmtNum(m, 0))} avg={fmtNum(calc.minutes, 0)} spread={calc.minutesSpread} flag={flagged('minutes')} />}
              </ListGroup>
            )}

            {calc && (
              <ListGroup title={t('recipes.review.ingredients')} meta={t('recipes.review.ingredientsMeta')}>
                <CompareHead batches={chosen} />
                {calc.ingredients.map((i) => (
                  <CompareRow
                    key={i.key}
                    title={ingName(lang, i.key, i.name)}
                    values={i.grams.map((g) => (g ? fmtG(g) : t('recipes.review.none')))}
                    avg={i.usedIn ? fmtG(i.stdG) : t('recipes.review.none')}
                    spread={i.spreadPct}
                    flag={flagged('ingredient', i.key)}
                    note={i.usedIn ? [
                      t('recipes.review.perKg', { g: fmtG(i.perKgOutput) }),
                      i.usable != null ? t('recipes.review.usable', { pct: fmtNum(i.usable * 100, 0) }) : null,
                      i.usedIn < calc.n ? t('recipes.review.usedIn', { what: '', n: i.usedIn, total: calc.n }).trim() : null,
                    ].filter(Boolean).join(' · ') : undefined}
                  />
                ))}
              </ListGroup>
            )}

            {data.access.canSeeCosts && cost && calc && (
              <CostSection cost={cost} calc={calc} data={data} onOpenPrice={setPriceLine} />
            )}

            {data.standard?.history.length ? (
              <ListGroup title={t('recipes.review.versions')}>
                {[...data.standard.history].reverse().map((h) => (
                  <ListRow
                    key={h.version}
                    icon={BadgeCheck}
                    iconTone={data.standard?.current?.version === h.version ? 'success' : 'neutral'}
                    title={t('recipes.review.versionLine', { v: h.version, day: fmtDay(t, h.setAt), who: h.setByName })}
                    subtitle={[h.note, h.overrideReason ? t('recipes.review.override', { why: h.overrideReason }) : null].filter(Boolean).join(' · ') || undefined}
                    trailing={data.access.canSeeCosts && h.costAtSet?.costPerKg != null ? <span className="num text-body-sm text-text-2">{t('recipes.review.thenCost', { rs: fmtRs(h.costAtSet.costPerKg) })}</span> : undefined}
                    chevron
                    onClick={() => setHistoryOpen(h.version)}
                  />
                ))}
              </ListGroup>
            ) : null}

            {calc && (data.access.canApprove ? (
              <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                <h2 className="text-subtitle font-semibold">{t('recipes.review.setSection', { v: nextVersion })}</h2>
                <p className="text-body-sm text-text-2">{t('recipes.review.setHint')}</p>
                {calc.flags.length > 0 && (
                  <Field label={t('recipes.review.overrideLabel')} required helper={t('recipes.review.overrideHelp')}>
                    <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
                  </Field>
                )}
                <Field label={t('recipes.review.noteLabel')} optional>
                  <Textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <Button size="lg" className="sm:self-start" disabled={chosen.length !== TRIALS} loading={saving} leadingIcon={<BadgeCheck />} onClick={() => void setStandard()}>
                  {t('recipes.review.setButton', { v: nextVersion })}
                </Button>
              </section>
            ) : (
              <Callout tone="neutral" title={t('recipes.review.ownerOnly')}>{t('recipes.review.ownerOnlyBody')}</Callout>
            ))}
          </>
        )}
      </main>

      {priceLine && data && (
        <PriceSheet line={priceLine} data={data} onClose={() => setPriceLine(null)} onSaved={() => { setPriceLine(null); load(ids); }} />
      )}
      {historyOpen !== null && data?.standard && (() => {
        const h = data.standard.history.find((x) => x.version === historyOpen);
        return h ? (
          <ResponsiveModal open onOpenChange={(o) => { if (!o) setHistoryOpen(null); }} size="detail" title={t('recipes.sheet.standard', { v: h.version })} description={h.note || undefined}>
            <StandardTable sheetId={sheetId} calc={h.calc} />
          </ResponsiveModal>
        ) : null;
      })()}
    </div>
  );
}

function CostSection({ cost, calc, data, onOpenPrice }: { cost: NonNullable<Review['cost']>; calc: StandardCalc; data: Review; onOpenPrice: (l: CostLine) => void }) {
  const { t, lang } = useT();
  const portionLabel = calc.portionG != null ? t(SHEET_BY_ID[data.sheetId]?.kind === 'dough' ? 'recipes.review.perBall' : 'recipes.review.perScoop') : calc.pickupG != null ? t('recipes.review.perMomoCoat') : null;
  return (
    <ListGroup
      title={t('recipes.review.costTitle')}
      meta={cost.pricesAsOf ? t('recipes.momo.pricesAsOf', { date: fmtDay(t, cost.pricesAsOf) }) : undefined}
      footer={
        <div className="flex flex-col gap-1 text-caption text-text-3">
          <span>{t('recipes.review.costFoot')}</span>
          {data.batchCosts.length > 0 && (
            <span className="num">{t('recipes.review.eachBatch')}: {data.batchCosts.map((b, i) => `${i + 1}: ${b.costPerKg != null ? fmtRs(b.costPerKg) : '–'}`).join(' · ')}</span>
          )}
        </div>
      }
    >
      {cost.lines.map((l) => {
        const source = l.price.ok ? priceSourceText(t, l.price) : priceMissText(t, lang, l.price);
        const perKg = l.price.ok && l.price.source !== 'free' ? `${fmtRs(l.price.perG * 1000)}/kg` : null;
        return (
          <ListRow
            key={l.key}
            title={ingName(lang, l.key, l.name)}
            subtitle={
              <span className={l.price.ok ? undefined : 'text-danger'}>
                {[perKg, source, l.prepLossUnmeasured ? t('recipes.review.prepLossUnmeasured') : null].filter(Boolean).join(' · ')}
              </span>
            }
            trailing={l.costPerKgOutput != null ? <span className="num text-body-md font-semibold">{fmtRs(l.costPerKgOutput)}</span> : <StatusChip tone="danger">{t('recipes.review.noPrice')}</StatusChip>}
            chevron
            onClick={() => onOpenPrice(l)}
          />
        );
      })}
      <ListRow
        density="compact"
        title={<span className="font-semibold">{t('recipes.review.costPerKg')}</span>}
        subtitle={cost.complete ? undefined : t('recipes.review.incomplete', { n: cost.missing.length, rs: fmtRs(cost.knownPerKgOutput) })}
        trailing={<span className="num text-subtitle font-semibold">{cost.complete ? fmtRs(cost.costPerKgOutput) : '–'}</span>}
      />
      {portionLabel && cost.costPerPortion != null && (
        <ListRow density="compact" title={portionLabel} trailing={<span className="num text-body-md font-semibold">{fmtRs(cost.costPerPortion, 2)}</span>} />
      )}
    </ListGroup>
  );
}

// Where an ingredient's price comes from: the bills used (date, quantity, amount, ₹ a kg) and,
// for the owner and operations managers, which purchase items it is linked to.
function PriceSheet({ line, data, onClose, onSaved }: { line: CostLine; data: Review; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useT();
  const api = useRecipesApi();
  const def = INGREDIENT_BY_ID[line.key];
  const linkable = data.access.canEditPrices && (line.key.startsWith('x:') || (def && !def.free && !def.component));
  const existing = data.links[line.key];
  const [items, setItems] = React.useState<PriceItem[] | null>(null);
  const [keys, setKeys] = React.useState<string[]>(existing?.itemKeys || []);
  const [gpp, setGpp] = React.useState<number | null>(existing?.gramsPerPiece ?? null);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (linkable) api.priceItems().then((r) => setItems(r.items), () => setItems([]));
  }, [api, linkable]);
  const p = line.price;
  const detail = p.ok ? p.detail : undefined;
  const matched = !p.ok && p.detail ? p.detail.matchedNames : [];

  async function save() {
    setSaving(true);
    try {
      await api.savePriceLink(line.key, { itemKeys: keys, gramsPerPiece: gpp });
      toast.success(t('recipes.price.saved'));
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      size="detail"
      title={ingName(lang, line.key, line.name)}
      description={p.ok ? (p.source === 'free' ? t('recipes.price.free') : `${fmtRs(p.perG * 1000)}/kg · ${priceSourceText(t, p)}`) : priceMissText(t, lang, p)}
      footer={linkable ? <Button size="lg" className="flex-1" loading={saving} leadingIcon={<Link2 />} onClick={() => void save()}>{t('recipes.price.saveLink')}</Button> : undefined}
    >
      <div className="flex flex-col gap-4">
        {line.usable != null && <p className="text-body-sm text-text-2">{t('recipes.price.usableNote', { pct: fmtNum(line.usable * 100, 0) })}</p>}
        {line.prepLossUnmeasured && <Callout tone="warning" title={t('recipes.review.prepLossUnmeasured')}>{t('recipes.price.prepLossBody')}</Callout>}
        {detail && (
          <ListGroup title={t('recipes.price.billsUsed')} meta={t('recipes.price.window', { n: detail.windowDays })}
            footer={<p className="text-caption text-text-3">{t('recipes.price.how')}{detail.litreAsKg ? ` ${t('recipes.price.litreAsKg')}` : ''}</p>}>
            {detail.used.map((u, i) => (
              <ListRow key={i} density="compact" muted={!u.kept} title={u.itemName} subtitle={`${fmtDay(t, u.date)} · ${fmtNum(u.quantity, 3)} ${u.unit} · ${fmtRs(u.totalCost)}${u.kept ? '' : ` · ${t('recipes.price.ignored')}`}`}
                trailing={<span className="num text-body-sm font-semibold">{fmtRs(u.perKg)}/kg</span>} />
            ))}
          </ListGroup>
        )}
        {!p.ok && matched.length > 0 && (
          <p className="text-body-sm text-text-2">{t('recipes.price.matched', { list: matched.join(', ') })}</p>
        )}
        {p.ok && p.source === 'component' && (
          <p className="text-body-sm text-text-2">{t('recipes.price.componentBody', { code: sheetCode(p.component?.sheetId || '') })}</p>
        )}
        {linkable && (
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <h3 className="text-subtitle font-semibold">{t('recipes.price.linkTitle')}</h3>
            <p className="text-body-sm text-text-2">{t('recipes.price.linkHint')}</p>
            {keys.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {keys.map((k) => (
                  <li key={k} className="inline-flex h-9 items-center gap-1 rounded-full border border-border-strong bg-surface-2 pr-1 pl-3 text-label font-medium">
                    {items?.find((i) => i.key === k)?.name || k}
                    <IconButton size="sm" label={t('recipes.price.unlink', { name: k })} icon={<X />} onClick={() => setKeys(keys.filter((x) => x !== k))} />
                  </li>
                ))}
              </ul>
            )}
            <Field label={t('recipes.price.addItem')}>
              <PickerField
                title={t('recipes.price.addItem')}
                items={(items || []).filter((i) => !keys.includes(i.key)).map((i) => ({ value: i.key, label: i.name, description: t('recipes.price.itemMeta', { n: i.count, date: fmtDay(t, i.lastDate), units: i.units.join(', ') }) }))}
                value={null}
                placeholder={items ? t('recipes.price.pick') : t('common.loading')}
                leadingIcon={<Plus />}
                onValueChange={(v) => setKeys([...keys, v].slice(0, 10))}
              />
            </Field>
            <Field label={t('recipes.price.gramsPerPiece')} optional helper={t('recipes.price.gramsPerPieceHelp')}>
              <NumInput value={gpp} onChange={setGpp} unit="g" className="text-right" />
            </Field>
          </section>
        )}
      </div>
    </ResponsiveModal>
  );
}
