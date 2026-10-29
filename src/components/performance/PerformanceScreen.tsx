// More > Performance reports (owner, 29 Oct 2026): the notes about you, month by month; for
// managers and the owner, the people to write for (each checklist point scored 1-5 plus a personal
// note, on the 1st-5th of the next month); for the owner, the checklist itself (server performance.ts).
import { useCallback, useEffect, useState } from 'react';
import { Award, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '../../utils/i18n';
import { getTodayIST } from '../../utils/timezone';
import { useShell } from '../shell/ShellContext';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { ListGroup, ListRow } from '../ui/list-row';
import { NativeSelect } from '../ui/select';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SegmentedControl } from '../ui/segmented-control';
import { StatusChip } from '../ui/status-chip';
import { Textarea } from '../ui/textarea';
import { cn } from '../ui/utils';
import * as api from './perfApi';
import { monthText } from './PayslipCard';
import { ReportView } from './ReportView';

type Tab = 'mine' | 'write' | 'checklist';
const prev = (m: string) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4 lg:px-8">{children}</div>;
}

export function PerformanceScreen() {
  const { t } = useT();
  const { nav } = useShell();
  const isOwner = nav.kind === 'owner';
  const [tab, setTab] = useState<Tab>(isOwner ? 'write' : 'mine');
  const [writes, setWrites] = useState<boolean>(isOwner);
  // Managers get the Write tab once the server says they have people to write for.
  useEffect(() => {
    if (isOwner) return;
    api.getToWrite().then((r) => setWrites(r.people.length > 0)).catch(() => undefined);
  }, [isOwner]);
  const tabs = [
    ...(isOwner ? [] : [{ value: 'mine' as Tab, label: t('perf.tabMine') }]),
    ...(writes ? [{ value: 'write' as Tab, label: t('perf.tabWrite') }] : []),
    ...(isOwner ? [{ value: 'checklist' as Tab, label: t('perf.tabChecklist') }] : []),
  ];
  return (
    <Page>
      {tabs.length > 1 && <SegmentedControl aria-label={t('more.performance')} value={tab} onValueChange={setTab} options={tabs} />}
      {tab === 'mine' && <MyReports />}
      {tab === 'write' && <WriteList />}
      {tab === 'checklist' && <ChecklistEditor />}
    </Page>
  );
}

function MyReports() {
  const { t, lang } = useT();
  const [months, setMonths] = useState<{ month: string; reports: api.Report[] }[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => { setError(false); api.getMyReports().then(setMonths).catch(() => setError(true)); }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState onRetry={load} />;
  if (!months) return <p className="text-body-sm text-text-3">…</p>;
  if (!months.length) return <EmptyState icon={Award} title={t('perf.empty')} body={t('perf.emptyBody')} />;
  return (
    <>
      {months.map((m) => (
        <section key={m.month} className="flex flex-col gap-3">
          <h2 className="overline-label mx-1">{monthText(m.month, lang)}</h2>
          {m.reports.map((r) => <ReportView key={r.kind} report={r} />)}
        </section>
      ))}
    </>
  );
}

function WriteList() {
  const { t, lang } = useT();
  const thisMonth = getTodayIST().slice(0, 7);
  // Notes are written in the first days of the next month, so last month comes up first.
  const choices = [thisMonth, prev(thisMonth), prev(prev(thisMonth))];
  const [month, setMonth] = useState(choices[1]);
  const [data, setData] = useState<{ month: string; items: api.ChecklistItem[]; people: api.WritePerson[] } | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<api.WritePerson | null>(null);
  const load = useCallback(() => { setError(false); setData(null); api.getToWrite(month).then(setData).catch(() => setError(true)); }, [month]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Field label={t('perf.month')}>
        <NativeSelect value={month} onChange={(e) => setMonth(e.target.value)}>
          {choices.map((m) => <option key={m} value={m}>{monthText(m, lang)}</option>)}
        </NativeSelect>
      </Field>
      {error ? <ErrorState onRetry={load} /> : !data ? <p className="text-body-sm text-text-3">…</p> : (
        <ListGroup empty={<EmptyState compact icon={Award} title={t('perf.noneToWrite')} />}>
          {data.people.map((p) => (
            <ListRow
              key={p.employeeId}
              title={p.name}
              subtitle={[p.managerName && p.kind === 'owner' ? t('perf.managedBy', { name: p.managerName }) : null, p.manager ? t('perf.managerSent', { n: p.manager.average }) : null].filter(Boolean).join(' · ') || undefined}
              trailing={p.mine ? <StatusChip tone="success" size="sm">{t('perf.written', { n: p.mine.average })}</StatusChip> : <StatusChip tone="warning" size="sm">{t('perf.toWrite')}</StatusChip>}
              onClick={() => setOpen(p)}
            />
          ))}
        </ListGroup>
      )}
      {data && open && (
        <WriteSheet
          month={data.month}
          checklist={data.items}
          person={open}
          onClose={() => setOpen(null)}
          onSaved={(report) => {
            setData((d) => d && { ...d, people: d.people.map((p) => (p.employeeId === open.employeeId ? { ...p, mine: report } : p)) });
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

function ScorePicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex gap-2" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          aria-label={`${label}: ${n} / 5`}
          onClick={() => onChange(n)}
          className={cn(
            'num flex size-11 items-center justify-center rounded-md border text-body-md font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary',
            value === n ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface text-text hover:bg-surface-2',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function WriteSheet({ month, checklist, person, onClose, onSaved }: {
  month: string; checklist: api.ChecklistItem[]; person: api.WritePerson; onClose: () => void; onSaved: (r: api.Report) => void;
}) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(true);
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries((person.mine?.items || []).map((i) => [i.key, i.score])));
  const [note, setNote] = useState(person.mine?.note || '');
  const [saving, setSaving] = useState(false);
  const complete = checklist.every((c) => scores[c.key]) && note.trim().length >= 10;
  const dirty = checklist.some((c) => scores[c.key] !== person.mine?.items.find((i) => i.key === c.key)?.score) || note !== (person.mine?.note || '');
  const send = async () => {
    setSaving(true);
    try {
      const report = await api.writeReport(month, person.employeeId, { items: checklist.map((c) => ({ key: c.key, score: scores[c.key] })), note });
      toast.success(t('perf.sent'));
      onSaved(report);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('pslip.failed'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      onClosed={onClose}
      dirty={dirty && !saving}
      title={t('perf.writeTitle', { name: person.name })}
      description={monthText(month, lang)}
      footer={<Button size="lg" className="flex-1" loading={saving} disabled={!complete} onClick={send}>{person.mine ? t('perf.update') : t('perf.send')}</Button>}
    >
      <div className="flex flex-col gap-5">
        <p className="text-body-sm text-text-2">{t('perf.writeHint', { name: person.name })}</p>
        {person.manager && (
          <div className="flex flex-col gap-2">
            <h3 className="overline-label mx-1">{t('perf.managerWrote', { name: person.managerName || '' })}</h3>
            <ReportView report={person.manager} />
          </div>
        )}
        {checklist.map((c) => (
          <div key={c.key} className="flex flex-col gap-2">
            <span className="flex flex-col">
              <span className="text-body-md font-medium text-text">{c.label}</span>
              {c.labelBn && <span lang="bn" className="text-body-sm text-text-3">{c.labelBn}</span>}
            </span>
            <ScorePicker value={scores[c.key] || 0} onChange={(n) => setScores((s) => ({ ...s, [c.key]: n }))} label={c.label} />
          </div>
        ))}
        <Field label={t('perf.note')} required helper={t('perf.noteHelp')}>
          <Textarea rows={4} value={note} placeholder={t('perf.notePlaceholder')} onChange={(e) => setNote(e.target.value)} maxLength={1500} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}

function ChecklistEditor() {
  const { t } = useT();
  const [items, setItems] = useState<{ label: string; labelBn: string }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const load = useCallback(() => { setError(false); api.getChecklist().then((x) => setItems(x.map(({ label, labelBn }) => ({ label, labelBn })))).catch(() => setError(true)); }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState onRetry={load} />;
  if (!items) return <p className="text-body-sm text-text-3">…</p>;
  const change = (i: number, patch: Partial<{ label: string; labelBn: string }>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveChecklist(items.filter((x) => x.label.trim()));
      setItems(saved.map(({ label, labelBn }) => ({ label, labelBn })));
      toast.success(t('perf.checklistSaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('pslip.failed'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <p className="text-body-sm text-text-2">{t('perf.checklistHint')}</p>
      {items.map((x, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
            <Field label={t('perf.pointEn', { n: i + 1 })}><Input value={x.label} onChange={(e) => change(i, { label: e.target.value })} maxLength={60} /></Field>
            <Field label={t('perf.pointBn')}><Input lang="bn" value={x.labelBn} onChange={(e) => change(i, { labelBn: e.target.value })} maxLength={80} /></Field>
          </div>
          <IconButton label={t('perf.removePoint')} icon={<Trash2 />} variant="danger-ghost" disabled={items.length <= 3} onClick={() => setItems(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" leadingIcon={<Plus />} disabled={items.length >= 10} onClick={() => setItems([...items, { label: '', labelBn: '' }])}>{t('perf.addPoint')}</Button>
        <Button loading={saving} onClick={save}>{t('perf.saveChecklist')}</Button>
      </div>
    </>
  );
}
