// Three Insights cards (owner, 30 Oct 2026):
//   StaffingCard  - people on shift against orders, hour by hour, and wages against sales a day
//                   (shift check-ins, server /insights/staffing; sums in staffWeatherMath.ts)
//   AppReportsCard - Zomato and Swiggy's own numbers (rating, prep time, menu-to-order, rejected
//                   orders) that Bunny reads off a screenshot of the partner app's report
//   WeatherCard   - the coming week's rain, and what rainy days have done to the counter and the
//                   apps (Open-Meteo, server /insights/weather)
import { useEffect, useMemo, useState } from 'react';
import { CloudRain, ImagePlus, Sun } from 'lucide-react';
import * as api from '../../utils/api';
import { getTodayIST } from '../../utils/timezone';
import { compressPhoto } from '../assets/assetsApi';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatGrid, StatTile } from '../ui/stat-tile';
import { StatusChip } from '../ui/status-chip';
import { toast } from '../ui/sonner';
import { cn } from '../ui/utils';
import { ChartCard, ChartEmpty, inr } from './tabs/shared';
import { rainEffect, staffing, upcomingWeather, type OrderDay } from './staffWeatherMath';

const hourText = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;

export function StaffingCard({ accessToken, storeId, range, orders }: { accessToken: string; storeId: string | null; range: { startDate: string; endDate: string }; orders: OrderDay[] }) {
  const [data, setData] = useState<{ days: api.StaffingDay[]; since: string | null; staff: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    api.getStaffing(accessToken, storeId, range.startDate, range.endDate).then((d) => { if (!cancelled) setData(d); }).catch((e) => { if (!cancelled) setError(e?.message || 'Could not load staffing'); });
    return () => { cancelled = true; };
  }, [accessToken, storeId, range.startDate, range.endDate]);
  const s = useMemo(() => (data ? staffing(data.days, orders) : null), [data, orders]);
  const maxPer = Math.max(1, ...(s?.hours || []).map((h) => h.perStaff || 0));
  return (
    <ChartCard title="Staffing against orders" caption="People checked in each hour against orders, and wages against sales"
      footer={s && s.daysCounted ? `From ${s.daysCounted} day${s.daysCounted === 1 ? '' : 's'} with shift check-ins${data?.since ? ` (since ${new Date(`${data.since}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })})` : ''}. Stretched: ${6}+ orders an hour a person; spare: 1 or fewer with two or more on shift.` : undefined}>
      {error ? <ChartEmpty title={error} /> : !s ? <p className="text-body-sm text-text-3">Loading…</p> : s.daysCounted === 0 ? (
        <ChartEmpty title="No shift check-ins in this period" body="This fills in as the store staff check in and out of their shifts." />
      ) : (
        <>
          <StatGrid columns={2}>
            <StatTile label="Wages as % of sales" value={s.labourPct === null ? '–' : `${s.labourPct}%`} caption="store staff, salaries spread over the month" />
            <StatTile label="Sales a staff hour" value={inr(s.salesPerStaffHour)} />
          </StatGrid>
          <p className="text-label font-semibold text-text-2">Orders an hour for each person on shift</p>
          <ul className="flex flex-col gap-2.5">
            {s.hours.map((h) => (
              <li key={h.hour} className="flex flex-col gap-1 text-body-sm">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="num font-medium text-text">{hourText(h.hour)}</span>
                  <span className="num flex items-center gap-1.5 text-text-2">
                    {h.perStaff === null ? (h.flag === 'nobody' ? <StatusChip tone="danger" size="sm">nobody in</StatusChip> : '–') : <>{h.orders} orders · {h.staff} on · <span className="font-semibold text-text">{h.perStaff}</span></>}
                    {h.flag === 'stretched' && <StatusChip tone="danger" size="sm">stretched</StatusChip>}
                    {h.flag === 'spare' && <StatusChip tone="warning" size="sm">spare</StatusChip>}
                  </span>
                </span>
                <span className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="presentation">
                  <span className={cn('block h-full rounded-full', h.flag === 'stretched' ? 'bg-danger' : h.flag === 'spare' ? 'bg-warning' : 'bg-primary')} style={{ width: `${((h.perStaff || 0) / maxPer) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ChartCard>
  );
}

const fmt = (n: number, suffix = '') => (n === -1 || n === null || n === undefined ? '–' : `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 })}${suffix}`);

export function AppReportsCard({ accessToken, storeId, canManage }: { accessToken: string; storeId: string | null; canManage: boolean }) {
  const [reports, setReports] = useState<api.AppReport[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.getAppReports(accessToken, storeId).then(setReports).catch(() => setReports([]));
  useEffect(() => { load(); }, [accessToken, storeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api.readAppReport(accessToken, storeId, await compressPhoto(file));
      toast.success(`${r.platform === 'zomato' ? 'Zomato' : 'Swiggy'} report read`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not read that screenshot');
    } finally {
      setBusy(false);
    }
  };
  const latest = (p: 'zomato' | 'swiggy') => (reports || []).filter((r) => r.platform === p);
  return (
    <ChartCard title="Zomato and Swiggy health" caption="The apps' own numbers, read from a screenshot of their partner report"
      actions={canManage ? (
        <label className={cn('inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-body-sm font-semibold text-primary hover:bg-surface-2', busy && 'pointer-events-none opacity-60')}>
          <ImagePlus className="size-4" aria-hidden="true" />{busy ? 'Reading…' : 'Add screenshot'}
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { add(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      ) : undefined}>
      {!reports ? <p className="text-body-sm text-text-3">Loading…</p> : reports.length === 0 ? (
        <ChartEmpty title="No app reports yet" body="Once a week, take a screenshot of the Zomato and Swiggy partner app's report (ratings, orders, menu to order, kitchen prep time) and add it here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(['zomato', 'swiggy'] as const).map((p) => {
            const [now, before] = latest(p);
            if (!now) return null;
            const delta = (k: keyof api.AppReport, better: 'up' | 'down') => {
              const a = Number(now[k]), b = before ? Number(before[k]) : -1;
              if (a === -1 || b === -1 || a === b) return null;
              const good = better === 'up' ? a > b : a < b;
              return <StatusChip tone={good ? 'success' : 'danger'} size="sm">{a > b ? '▲' : '▼'} {fmt(Math.abs(a - b))}</StatusChip>;
            };
            return (
              <ListGroup key={p} title={p === 'zomato' ? 'Zomato' : 'Swiggy'} meta={`to ${new Date(`${now.periodEnd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`}>
                <ListRow title="Rating" subtitle={now.ratingCount > 0 ? `${fmt(now.ratingCount)} ratings` : undefined} trailing={<span className="flex items-center gap-2"><span className="num font-semibold text-text">{fmt(now.rating)}</span>{delta('rating', 'up')}</span>} />
                <ListRow title="Menu opens to orders" trailing={<span className="flex items-center gap-2"><span className="num font-semibold text-text">{fmt(now.menuToOrderPct, '%')}</span>{delta('menuToOrderPct', 'up')}</span>} />
                <ListRow title="Kitchen prep time" trailing={<span className="flex items-center gap-2"><span className="num font-semibold text-text">{fmt(now.prepMinutes, ' min')}</span>{delta('prepMinutes', 'down')}</span>} />
                <ListRow title="Rejected orders" trailing={<span className="flex items-center gap-2"><span className="num font-semibold text-text">{fmt(now.rejectedOrders)}</span>{delta('rejectedOrders', 'down')}</span>} />
                {now.note && <ListRow title={<span className="text-body-sm font-normal text-text-2">{now.note}</span>} />}
              </ListGroup>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

export function WeatherCard({ accessToken, sales }: { accessToken: string; sales: { date: string; counter: number; online: number }[] }) {
  const [days, setDays] = useState<api.WeatherDay[] | null>(null);
  useEffect(() => { api.getWeather(accessToken).then(setDays).catch(() => setDays([])); }, [accessToken]);
  const today = getTodayIST();
  const effect = useMemo(() => (days ? rainEffect(days, sales, today) : null), [days, sales, today]);
  const next = useMemo(() => (days ? upcomingWeather(days, today) : []), [days, today]);
  if (!days || !days.length) return null;
  const sign = (n: number | null) => (n === null ? '–' : `${n > 0 ? '+' : ''}${n}%`);
  return (
    <ChartCard title="Weather" caption="Burdwan, the coming week, and what rain has done to sales">
      <ul className="grid grid-cols-7 gap-1 text-center">
        {next.map((w) => (
          <li key={w.date} className={cn('flex flex-col items-center gap-1 rounded-md py-2', w.rainy ? 'bg-info-soft' : 'bg-surface-2')}>
            <span className="text-caption text-text-3">{new Date(`${w.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })}</span>
            {w.rainy ? <CloudRain className="size-5 text-info" aria-label="Rain" /> : <Sun className="size-5 text-warning" aria-label="Dry" />}
            <span className="num text-caption text-text-2">{w.rainChance !== null ? `${w.rainChance}%` : `${Math.round(w.rainMm)} mm`}</span>
          </li>
        ))}
      </ul>
      {effect ? (
        <p className="text-body-sm text-text">
          On rainy days (5 mm or more) the counter sells <span className="num font-semibold">{sign(effect.counter)}</span>
          {effect.online !== null ? <> and the apps <span className="num font-semibold">{sign(effect.online)}</span></> : ''} against dry days of the same weekday ({effect.rainyDays} rainy days in the last 3 months).
          {next.some((w) => w.rainy) && (() => {
            // What to do about the rain coming follows what rain has done here, not a rule of thumb.
            const tips = [
              effect.counter !== null && effect.counter <= -5 ? 'plan the counter lighter' : effect.counter !== null && effect.counter >= 5 ? 'plan the counter heavier' : '',
              effect.online !== null && effect.online >= 5 ? 'keep more stock for delivery' : effect.online !== null && effect.online <= -5 ? 'expect fewer app orders' : '',
            ].filter(Boolean);
            return tips.length ? ` Rain is coming this week: ${tips.join(' and ')}.` : ' Rain is coming this week; it has not changed sales much before.';
          })()}
        </p>
      ) : (
        <p className="text-body-sm text-text-2">Not enough rainy days in the last 3 months to say what rain does to sales yet.</p>
      )}
    </ChartCard>
  );
}

