// Bunny's roundup for the owner and the operations managers (owner, 31 Oct 2026): the day's camera
// PPE checks and workplace photo checks, counted by roundupRules.ts and put into a few plain lines
// by Bunny - one message instead of an alert per check. Sent with the 1 PM and 9 PM summary
// (index.ts /cron/notification-digest). The numbers come from the code; Bunny only words them, and
// without Bunny the same facts go out as plain lines.
import { photoFacts, plainRoundup, ppeFacts, worthTelling, type PhotoFacts, type PhotoRow, type PpeCheck, type PpeDay, type PpeFacts } from './roundupRules.ts';

type Deps = {
  kv: { get: (key: string) => Promise<any> };
  getAllByPrefix: (prefix: string) => Promise<any[]>;
  ask: (facts: { cameras: PpeFacts[]; photos: PhotoFacts[]; time: string }) => Promise<{ headline: string; lines: string[] }>;
};
export type Roundup = { headline: string; lines: string[]; worth: boolean; byBunny: boolean };

const IST_MS = 330 * 60000;
const istDate = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const istHHMM = (ms: number) => new Date(ms + IST_MS).toISOString().slice(11, 16);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** The day so far, counted, and Bunny's words for it (plain lines when Bunny can't be reached). */
export async function roundupFor(deps: Deps, nowMs = Date.now()): Promise<Roundup> {
  const date = istDate(nowMs);
  const yesterday = addDays(date, -1);
  const [cams, stores, houses, employees, photoRows, alerts] = await Promise.all([
    deps.getAllByPrefix('cctv-camera:'), deps.getAllByPrefix('store:'), deps.getAllByPrefix('production_house_'),
    deps.getAllByPrefix('unified-employee:'), deps.getAllByPrefix(`workplace-check:${date}:`), deps.getAllByPrefix('cctv-alert:'),
  ]);
  const placeName = (kind: string, id: string) => (kind === 'store' ? stores : houses).find((p: any) => String(p?.id) === String(id))?.name || (kind === 'store' ? 'Store' : 'Production house');

  const cameras: PpeFacts[] = [];
  for (const cam of (cams || []).filter((x: any) => x?.id && x.active !== false && (x.checks || []).length)) {
    // A day in India runs from 18:30 the evening before (UTC), so two days of keys.
    const rows = (await Promise.all([yesterday, date].map((d) => deps.getAllByPrefix(`cctv-check:${cam.id}:${d}`)))).flat()
      .filter((r: any) => r?.at && istDate(Date.parse(r.at)) === date) as PpeCheck[];
    if (!rows.length) continue;
    const [names, day, yday] = await Promise.all([
      deps.kv.get(`cctv-names:${cam.id}:${date}`), deps.kv.get(`ppe-day:${cam.id}:${date}`), deps.kv.get(`ppe-day:${cam.id}:${yesterday}`),
    ]) as [Record<string, string> | null, PpeDay | null, PpeDay | null];
    const falseAlarms = (alerts || []).filter((a: any) => a?.cameraId === cam.id && a.mark === 'false' && istDate(Date.parse(a.at)) === date).length;
    cameras.push(ppeFacts({
      place: `${placeName(cam.placeKind, cam.placeId)} (${cam.name})`, checks: rows, names: names || {},
      reminders: day?.reminders?.length || 0, falseAlarms, yesterdayBad: yday ? (yday.badAt || []).length : null,
    }));
  }

  const nameOf = new Map((employees || []).filter((e: any) => e?.employeeId).map((e: any) => [String(e.employeeId), String(e.name || e.employeeId)]));
  const byPlace = new Map<string, PhotoRow[]>();
  for (const r of (photoRows || []) as PhotoRow[]) {
    if (!r?.employeeId) continue;
    const kind = r.locationKind || r.assigned?.[0]?.locationKind || 'store';
    const id = r.locationId || r.assigned?.[0]?.locationId || '';
    const k = `${kind}:${id}`;
    byPlace.set(k, [...(byPlace.get(k) || []), { ...r, name: nameOf.get(String(r.employeeId)) || r.employeeId }]);
  }
  const hhmm = istHHMM(nowMs);
  const photos = [...byPlace.entries()].map(([k, rows]) => photoFacts(placeName(k.split(':')[0], k.split(':').slice(1).join(':')), rows, hhmm));

  const worth = worthTelling(cameras, photos);
  if (!worth) return { ...plainRoundup([], []), worth: false, byBunny: false };
  try {
    const r = await deps.ask({ cameras: cameras.filter((c) => c.checks), photos: photos.filter((p) => p.required || p.missedTotal || p.dirty.length), time: hhmm });
    const lines = (r.lines || []).map((l) => String(l).trim()).filter(Boolean).slice(0, 5);
    if (r.headline && lines.length) return { headline: String(r.headline).slice(0, 70), lines, worth, byBunny: true };
  } catch (e: any) {
    console.error('[roundup] Bunny could not write it:', e?.message || e);
  }
  return { ...plainRoundup(cameras, photos), worth, byBunny: false };
}
