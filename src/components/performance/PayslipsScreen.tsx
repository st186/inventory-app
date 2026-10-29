// More > Payslips (owner, 29 Oct 2026): the last 12 months with pay, each as a PDF to download
// again (the design the owner picked: utils/payslipPdf.ts; the numbers: server performance.ts).
import { useCallback, useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '../../utils/i18n';
import { downloadPayslip } from '../../utils/payslipPdf';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { ListGroup, ListRow } from '../ui/list-row';
import { formatINR } from '../ui/money';
import { StatusChip } from '../ui/status-chip';
import { getPayslip, getPayslipMonths, markSeen } from './perfApi';
import { monthText } from './PayslipCard';

export function PayslipsScreen() {
  const { t, lang } = useT();
  const [months, setMonths] = useState<{ month: string; paid: number; ready: boolean }[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { setError(false); getPayslipMonths().then(setMonths).catch(() => setError(true)); }, []);
  useEffect(() => { load(); }, [load]);

  const download = async (month: string) => {
    setBusy(month);
    try {
      await downloadPayslip(await getPayslip(month));
      await markSeen(month, { downloaded: true }).catch(() => undefined);
      toast.success(t('pslip.downloaded'));
    } catch {
      toast.error(t('pslip.failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4 lg:px-8">
      {error ? <ErrorState onRetry={load} /> : !months ? <p className="text-body-sm text-text-3">…</p> : (
        <ListGroup empty={<EmptyState icon={FileText} title={t('pslip.none')} body={t('pslip.noneBody')} />}>
          {months.map((m) => (
            <ListRow
              key={m.month}
              icon={FileText}
              title={monthText(m.month, lang)}
              subtitle={t('pslip.paid', { amount: formatINR(m.paid) })}
              chip={m.ready ? undefined : <StatusChip tone="warning" size="sm">{t('pslip.beingPaid')}</StatusChip>}
              trailing={<Button size="sm" variant="secondary" leadingIcon={<Download />} loading={busy === m.month} onClick={() => download(m.month)}>{t('pslip.pdf')}</Button>}
            />
          ))}
        </ListGroup>
      )}
    </div>
  );
}
