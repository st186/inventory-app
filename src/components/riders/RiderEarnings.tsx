// Rider: what delivered rides have earned and how much has been paid (GET /rider/summary,
// refreshed every minute while the app is open and whenever a ride is delivered).
import { useCallback, useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import type { RiderSummary } from '../../utils/api';
import { isAppVisible } from '../../utils/appVisibility';
import { ErrorState } from '../ui/error-state';
import { Money, formatINR } from '../ui/money';
import { SkeletonStatTiles } from '../ui/skeleton';
import { StatGrid, StatTile } from '../ui/stat-tile';
import { StatusChip } from '../ui/status-chip';
import { useRiderApi } from './riderApi';
import { useRideWords } from './rideWords';
import { summaryFigures, wholeRupees } from './tripUtils';

export function useRiderSummary(deliveredCount: number) {
  const rapi = useRiderApi();
  const [summary, setSummary] = useState<RiderSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = () => rapi.getRiderSummary()
      .then((r) => { if (!cancelled) { setSummary(r); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    fetchOnce();
    const interval = setInterval(() => { if (isAppVisible()) fetchOnce(); }, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [deliveredCount, attempt, rapi]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { summary, failed, retry };
}

/** Home: today's earnings and what is still to be paid this month; tapping opens Payments. */
export function RiderEarningsTiles({ deliveredCount, onOpen }: { deliveredCount: number; onOpen?: () => void }) {
  const w = useRideWords();
  const { summary, failed, retry } = useRiderSummary(deliveredCount);
  if (!summary) {
    return failed ? <ErrorState onRetry={retry} /> : <SkeletonStatTiles count={2} />;
  }
  const f = summaryFigures(summary);
  return (
    <StatGrid>
      <StatTile
        label={w.t('rider.earn.today')}
        value={<Money value={wholeRupees(f.todayEarned)} />}
        caption={w.rides(f.todayRides)}
        onClick={onOpen}
      />
      <StatTile
        label={w.t('rider.earn.due')}
        value={<Money value={wholeRupees(f.stillToPay)} />}
        caption={`${w.t('rider.earn.month')}: ${formatINR(wholeRupees(f.monthEarned))}`}
        onClick={onOpen}
      />
    </StatGrid>
  );
}

/** Trips → Payments: the full month picture. */
export function RiderPayments({ deliveredCount }: { deliveredCount: number }) {
  const w = useRideWords();
  const { summary, failed, retry } = useRiderSummary(deliveredCount);
  if (!summary) {
    return failed ? <ErrorState onRetry={retry} /> : <SkeletonStatTiles count={4} />;
  }
  const f = summaryFigures(summary);
  return (
    <section className="flex flex-col gap-3" aria-label={w.t('rider.earn.title')}>
      <StatGrid>
        <StatTile label={w.t('rider.earn.today')} value={<Money value={wholeRupees(f.todayEarned)} />} caption={w.rides(f.todayRides)} />
        <StatTile label={w.t('rider.earn.month')} value={<Money value={wholeRupees(f.monthEarned)} />} caption={w.rides(f.monthRides)} />
        <StatTile label={w.t('rider.earn.paid')} value={<Money value={wholeRupees(f.monthPaid)} />} />
        <StatTile
          label={w.t('rider.earn.due')}
          value={<Money value={wholeRupees(f.stillToPay)} />}
          chip={f.stillToPay > 0 ? <StatusChip status="pay.due" /> : undefined}
        />
      </StatGrid>
      <p className="flex items-start gap-2 px-1 text-label text-text-3">
        <Wallet className="mt-px size-4 shrink-0" aria-hidden="true" />
        {w.t('rider.earn.note')}
      </p>
    </section>
  );
}
