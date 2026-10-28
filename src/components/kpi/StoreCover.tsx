// Store cover (owner, 28 Oct 2026). On a store-cover day - a store staff member on leave, a
// Saturday or Sunday, or a festival - the person set up for it works at the production house from
// 8 AM and covers the store in the evening. StoreCoverCard is their reminder and their separate
// store check-in / check-out (GPS-checked against the store's pin); StoreCoverNotice tells the
// store incharge and the owner who is covering today. Server: storeCover.ts.
import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, MapPin, MapPinOff, Store } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { StatusChip } from '../ui/status-chip';
import { currentPosition } from './ShiftClockCard';
import * as kpi from './kpiApi';

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const where = (ev: kpi.CoverPunchEvent) => (ev.noGps ? 'no location' : ev.outside ? `${ev.distanceM ?? '?'} m from the store` : 'at the store');

export function StoreCoverCard() {
  const [data, setData] = useState<kpi.CoverToday | null>(null);
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const load = useCallback(() => { kpi.getCoverToday().then(setData).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);
  if (!data?.setUp || !data.cover) return null;

  const punch = async (action: 'in' | 'out') => {
    setBusy(action);
    try {
      const pos = await currentPosition();
      const r = await kpi.coverPunch(action, pos);
      setData({ ...data, punch: r.punch });
      const ev = action === 'in' ? r.punch.in : r.punch.out;
      if (ev?.outside) toast.warning(`Saved, but you're ${ev.distanceM} m from ${data.storeName}`);
      else toast.success(action === 'in' ? `Checked in at ${data.storeName}` : 'Checked out of the store');
    } catch (e) {
      toast.error((e as Error)?.message || 'Could not save that');
    } finally {
      setBusy(null);
    }
  };
  const p = data.punch;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 p-4" aria-label="Store cover today">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary" aria-hidden="true"><Store className="size-5" /></span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-body-md font-semibold text-text">Store cover today · {kpi.hhmm12(data.start)}–{kpi.hhmm12(data.end)}</p>
          <p className="text-label text-text-2">{data.reasons.join(' · ')}</p>
          <p className="text-label text-text-3">Production house from 8 AM, leave by {kpi.hhmm12(data.productionEnd)}, then check in at {data.storeName}.</p>
        </div>
      </div>
      {(p?.in || p?.out) && (
        <div className="flex flex-wrap gap-2">
          {p?.in && <StatusChip tone={p.in.outside ? 'warning' : 'success'} icon={p.in.outside ? MapPinOff : MapPin}>In {timeOf(p.in.at)} · {where(p.in)}</StatusChip>}
          {p?.out && <StatusChip tone={p.out.outside ? 'warning' : 'success'} icon={p.out.outside ? MapPinOff : MapPin}>Out {timeOf(p.out.at)} · {where(p.out)}</StatusChip>}
        </div>
      )}
      {!p?.in ? (
        <Button size="lg" fullWidth leadingIcon={<LogIn />} loading={busy === 'in'} onClick={() => punch('in')}>Check in at the store</Button>
      ) : (
        <Button size="lg" variant="secondary" fullWidth leadingIcon={<LogOut />} loading={busy === 'out'} onClick={() => punch('out')}>
          {p.out ? 'Check out again' : 'Check out of the store'}
        </Button>
      )}
    </section>
  );
}

/** For the store incharge and the owner: who covers the store today, and whether they've arrived. */
export function StoreCoverNotice() {
  const [covers, setCovers] = useState<kpi.CoverTeamEntry[]>([]);
  useEffect(() => { kpi.getCoverTeam().then((r) => setCovers(r.covers || [])).catch(() => undefined); }, []);
  if (!covers.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {covers.map((c) => (
        <Callout key={c.employeeId} tone="info" icon={Store} title={`${c.name} covers ${c.storeName} today, ${kpi.hhmm12(c.start)}–${kpi.hhmm12(c.end)}`}>
          {c.reasons.join(' · ')}
          {c.punch?.in ? ` · checked in ${timeOf(c.punch.in.at)}${c.punch.in.outside ? ' (away from the store)' : ''}` : ' · not checked in yet'}
        </Callout>
      ))}
    </div>
  );
}
