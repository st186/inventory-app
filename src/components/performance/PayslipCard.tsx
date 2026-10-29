// Home: last month's payslip once its salary is paid (Download PDF), with the performance notes from
// the manager and the owner just under it (owner, 29 Oct 2026). The payslip leaves Home once
// downloaded, the notes once read; both stay in More > Payslips and Performance reports.
import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '../../utils/i18n';
import { downloadPayslip } from '../../utils/payslipPdf';
import { practiceSession } from '../learn/learn';
import { Button } from '../ui/button';
import { useShellMaybe } from '../shell/ShellContext';
import { getInbox, getPayslip, markSeen, type InboxItem } from './perfApi';
import { ReportView } from './ReportView';

// One look per hour is plenty: payslips turn up once a month, notes in its first days.
const CHECK_EVERY_MS = 60 * 60 * 1000;
let cache: { at: number; items: InboxItem[] } | null = null;

export const monthText = (m: string, lang: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString(lang === 'bn' ? 'bn-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function PayslipCard() {
  return useShellMaybe() && !practiceSession() ? <PayslipCardInShell /> : null;
}

function PayslipCardInShell() {
  const [items, setItems] = useState<InboxItem[]>(cache?.items || []);
  useEffect(() => {
    if (cache && Date.now() - cache.at < CHECK_EVERY_MS) return;
    getInbox().then((x) => { cache = { at: Date.now(), items: x }; setItems(x); }).catch(() => undefined);
  }, []);
  const update = useCallback((month: string, change: (i: InboxItem) => InboxItem | null) => {
    setItems((list) => {
      const next = list.map((i) => (i.month === month ? change(i) : i)).filter(Boolean) as InboxItem[];
      cache = { at: cache?.at || Date.now(), items: next };
      return next;
    });
  }, []);
  if (!items.length) return null;
  return <>{items.map((i) => <MonthCard key={i.month} item={i} update={update} />)}</>;
}

function MonthCard({ item, update }: { item: InboxItem; update: (month: string, change: (i: InboxItem) => InboxItem | null) => void }) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState<'download' | 'read' | null>(null);
  const month = monthText(item.month, lang);
  const showPayslip = item.payslipReady && !item.downloaded;
  const unread = item.reports.filter((r) => !r.read);
  // Done when the payslip (if any) is downloaded and every note is read.
  const settle = (i: InboxItem) => ((!i.payslipReady || i.downloaded) && i.reports.every((r) => r.read) ? null : i);

  const download = async () => {
    setBusy('download');
    try {
      await downloadPayslip(await getPayslip(item.month));
      await markSeen(item.month, { downloaded: true }).catch(() => undefined);
      toast.success(t('pslip.downloaded'));
      update(item.month, (i) => settle({ ...i, downloaded: true }));
    } catch {
      toast.error(t('pslip.failed'));
    } finally {
      setBusy(null);
    }
  };
  const read = async () => {
    setBusy('read');
    try {
      await markSeen(item.month, { read: unread.map((r) => r.kind) });
      update(item.month, (i) => settle({ ...i, reports: i.reports.map((r) => ({ ...r, read: true })) }));
    } catch {
      toast.error(t('pslip.failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-label={t('pslip.ready', { month })}>
      {showPayslip && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary [&_svg]:size-5" aria-hidden="true"><FileText /></span>
            <span className="flex min-w-0 flex-col">
              <span className="text-body-md font-semibold text-text">{t('pslip.ready', { month })}</span>
              <span className="text-body-sm text-text-2">{t('pslip.readyBody')}</span>
            </span>
          </div>
          <Button leadingIcon={<Download />} loading={busy === 'download'} onClick={download}>{t('pslip.download')}</Button>
        </div>
      )}
      {unread.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-body-md font-semibold text-text">{t('perf.notesFor', { month })}</h2>
          {unread.map((r) => <ReportView key={r.kind} report={r} />)}
          <Button variant="secondary" leadingIcon={<CheckCheck />} loading={busy === 'read'} onClick={read}>{t('perf.readDone')}</Button>
        </div>
      )}
    </section>
  );
}
