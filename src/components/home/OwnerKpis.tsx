// The owner's four tiles (design review d2): net profit this month with rent and salaries spread
// through the month (the owner's headline, 27 Oct 2026), spent today, cash in hand and the Paytm
// balance. The other profit figures are one tap away in "How profit is counted".
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { StatGrid, StatTile } from '../ui/stat-tile';
import { StatusChip } from '../ui/status-chip';
import { Money, formatINR } from '../ui/money';
import { Button } from '../ui/button';
import { ResponsiveModal } from '../ui/responsive-modal';
import { useT } from '../../utils/i18n';
import type { DaySpend, MonthProfit } from './homeFigures';
import { useDateWords } from './HomeParts';

export type OwnerKpisProps = {
  today: string;
  profit: { data: MonthProfit | null; error: string | null; loading: boolean };
  onRetryProfit: () => void;
  spent: DaySpend;
  cash: { cash: number; counted: boolean; storeCount: number };
  paytm: { balance: number; asOf: string | null; known: boolean };
  onOpen: (what: 'insights' | 'expenses' | 'cash' | 'paytm') => void;
  canOpenInsights: boolean;
};

function ProfitSheet({ open, onOpenChange, profit, monthWord, onInsights }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profit: MonthProfit;
  monthWord: (ym: string) => string;
  onInsights?: () => void;
}) {
  const { t } = useT();
  const Line = ({ label, value, hint }: { label: string; value: number; hint: string }) => (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body-md font-semibold text-text">{label}</span>
        <Money value={Math.round(value)} className="text-body-md font-semibold text-text" />
      </div>
      <p className="text-label text-text-2">{hint}</p>
    </div>
  );
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('home.profitInfoTitle')}
      footer={onInsights ? <Button variant="secondary" size="lg" fullWidth onClick={onInsights}>{t('home.openInsights')}</Button> : undefined}
    >
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-border">
        <Line label={t('home.profitNormalized')} value={profit.normalized} hint={t('home.profitNormalizedHint')} />
        <Line label={t('home.profitRealized')} value={profit.realized} hint={t('home.profitRealizedHint')} />
        <Line label={t('home.profitNetRealised')} value={profit.netRealised} hint={t('home.profitNetRealisedHint')} />
        <div className="flex flex-col gap-1.5 py-3 text-label text-text-2">
          <p className="num">{t('home.profitAccrued', {
            accrued: formatINR(Math.round(profit.accrued)),
            days: profit.daysCounted,
            pool: formatINR(profit.monthPool),
            recorded: formatINR(Math.round(profit.recorded)),
          })}</p>
          {profit.estimatedAmount > 0 && <p className="num">{t('home.profitEstimated', { amount: formatINR(Math.round(profit.estimatedAmount)) })}</p>}
          <p className="num">{profit.carryForward < 0
            ? t('home.profitCarried', { amount: formatINR(Math.round(profit.carryForward)), months: profit.carriedMonths.map(monthWord).join(', ') })
            : t('home.profitNoCarry')}</p>
        </div>
      </div>
    </ResponsiveModal>
  );
}

export function OwnerKpis({ today, profit, onRetryProfit, spent, cash, paytm, onOpen, canOpenInsights }: OwnerKpisProps) {
  const { t } = useT();
  const words = useDateWords();
  const [sheetOpen, setSheetOpen] = useState(false);
  const p = profit.data;
  const loss = !!p && p.normalized < 0;

  return (
    <>
      <StatGrid>
        <StatTile
          label={t('home.netProfitMonth', { month: words.monthShort(today) })}
          loading={profit.loading && !p}
          value={p ? <Money value={Math.round(p.normalized)} /> : '–'}
          tone={loss ? 'danger' : 'default'}
          chip={loss ? <StatusChip tone="danger" icon={AlertTriangle}>{t('home.loss')}</StatusChip> : undefined}
          caption={p ? t('home.profitSpread') : profit.error ? t('home.couldNotLoad') : undefined}
          onClick={p ? () => setSheetOpen(true) : profit.error ? onRetryProfit : undefined}
        />
        <StatTile
          label={t('home.spentToday')}
          value={<Money value={spent.total} />}
          caption={spent.count === 0 ? t('home.noEntries') : spent.count === 1 ? t('home.entry') : t('home.entries', { n: spent.count })}
          onClick={() => onOpen('expenses')}
        />
        <StatTile
          label={t('home.cashInHand')}
          value={<Money value={cash.cash} />}
          chip={cash.storeCount > 0 ? (cash.counted
            ? <StatusChip tone="success">{t('home.counted')}</StatusChip>
            : <StatusChip tone="warning">{t('home.notCounted')}</StatusChip>) : undefined}
          onClick={() => onOpen('cash')}
        />
        <StatTile
          label={t('home.paytmBalance')}
          value={paytm.known ? <Money value={paytm.balance} /> : '–'}
          caption={paytm.known && paytm.asOf ? t('home.asOf', { date: words.dayMonth(paytm.asOf) }) : t('home.noPaytmYet')}
          onClick={() => onOpen('paytm')}
        />
      </StatGrid>
      {p && (
        <ProfitSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          profit={p}
          monthWord={(ym) => words.monthShort(`${ym}-01`)}
          onInsights={canOpenInsights ? () => { setSheetOpen(false); onOpen('insights'); } : undefined}
        />
      )}
    </>
  );
}
