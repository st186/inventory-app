// The owner's "Sales today" card (design review d2): the day's sales so far against the
// forecast's usual range, and the Counter / Zomato / Swiggy split. Before the store opens (3 PM)
// it shows yesterday instead, against what was expected for yesterday.
import { StatSplit, StatTile, DeltaChip } from '../ui/stat-tile';
import { StatusChip } from '../ui/status-chip';
import { Money, formatCompactINR } from '../ui/money';
import { useT } from '../../utils/i18n';
import type { InsightsOverview } from '../../utils/api';
import type { DaySales } from './homeFigures';
import { posSyncTimeOf, useDateWords } from './HomeParts';

const STORE_OPENS_MIN = 15 * 60; // stores open at 3 PM IST (SalesView STORE_OPENING_HOUR_IST)
const STORE_CLOSES_MIN = 22 * 60 + 30;

export function SalesTodayHero({ today, nowMinutes, sales, yesterdaySales, overview, forecastApplies, loading, onOpen }: {
  today: string;
  nowMinutes: number;
  sales: DaySales;
  yesterdaySales: DaySales;
  /** The forecast for the store whose sales these are (null while loading or for several stores). */
  overview: InsightsOverview | null;
  /** The forecast is for the same store(s) as the sales. */
  forecastApplies: boolean;
  loading?: boolean;
  onOpen?: () => void;
}) {
  const { t } = useT();
  const words = useDateWords();
  const beforeOpen = nowMinutes < STORE_OPENS_MIN;
  const shown = beforeOpen ? yesterdaySales : sales;
  const todayForecast = forecastApplies ? overview?.forecast?.find((f) => f.date === today) ?? null : null;
  const yesterday = forecastApplies ? overview?.yesterday ?? null : null;

  let headerChip: React.ReactNode;
  let caption: React.ReactNode;
  if (beforeOpen) {
    const expected = yesterday?.expected?.revenue || 0;
    headerChip = expected > 0 && yesterdaySales.total > 0
      ? <DeltaChip delta={{ value: ((yesterdaySales.total - expected) / expected) * 100, label: t('home.vsUsual') }} />
      : undefined;
    caption = t('home.storeOpens');
  } else {
    if (todayForecast && todayForecast.revenue > 0) {
      const { revenueLow: low, revenueHigh: high } = todayForecast;
      if (sales.total > high) headerChip = <StatusChip tone="success">{t('home.aboveUsual')}</StatusChip>;
      else if (sales.total >= low) headerChip = <StatusChip tone="success">{t('status.onTrack')}</StatusChip>;
      // Below the range only means something once the day is over.
      else if (nowMinutes >= STORE_CLOSES_MIN) headerChip = <StatusChip tone="warning">{t('status.belowUsual')}</StatusChip>;
      caption = t('home.usualRange', { day: words.weekday(today), low: formatCompactINR(low), high: formatCompactINR(high).replace('₹', '') });
    } else if (!sales.hasEntry && sales.total === 0) {
      caption = t('home.noSalesYet');
    }
    if (sales.syncedAt) caption = caption ? <>{caption}<br />{t('home.posSynced', { time: posSyncTimeOf(sales.syncedAt) })}</> : t('home.posSynced', { time: posSyncTimeOf(sales.syncedAt) });
  }

  return (
    <StatTile
      hero
      loading={loading}
      label={beforeOpen ? t('home.salesYesterday') : t('home.salesToday')}
      value={<Money value={shown.total} />}
      headerChip={headerChip}
      caption={caption}
      onClick={onOpen}
      className="h-full w-full"
    >
      <StatSplit items={[
        { label: t('home.counter'), value: <Money value={shown.counter} /> },
        { label: t('home.zomato'), value: <Money value={shown.zomato} /> },
        { label: t('home.swiggy'), value: <Money value={shown.swiggy} /> },
      ]} />
    </StatTile>
  );
}
