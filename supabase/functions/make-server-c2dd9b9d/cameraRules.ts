// The rules behind the camera checks (cctv.ts), kept apart so they can be tested with plain node:
//   node supabase/functions/make-server-c2dd9b9d/cameraRules.test.ts
//
// Owner, 29 Oct 2026: one Tapo C200 in the production kitchen. In working hours a still every 30
// minutes is checked for cap, gloves and apron; outside them the camera PC watches for movement
// and anyone in view is an unauthorised entry ("its enough if it can detect the person").

export type PpeItem = 'cap' | 'gloves' | 'apron';
export const PPE_ITEMS: PpeItem[] = ['cap', 'gloves', 'apron'];
export type Look = { peopleCount: number; people: { cap: string; gloves: string; apron: string }[] };

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Whether an India time "HH:MM" is inside working hours (which may run past midnight). */
export function inHours(now: string, from: string, to: string): boolean {
  const n = toMin(now), f = toMin(from), t = toMin(to);
  if (f === t) return true; // all day
  return f < t ? n >= f && n < t : n >= f || n < t;
}

/** Minutes until working hours start (0 when inside them). */
export function minutesUntilHours(now: string, from: string, to: string): number {
  if (inHours(now, from, to)) return 0;
  return (toMin(from) - toMin(now) + 1440) % 1440;
}

/** Minutes until working hours end (0 when outside them). */
export function minutesUntilHoursEnd(now: string, from: string, to: string): number {
  if (!inHours(now, from, to) || toMin(from) === toMin(to)) return 0;
  return (toMin(to) - toMin(now) + 1440) % 1440;
}

/**
 * Seconds until the camera PC should next send a scheduled still. A camera with nothing to check
 * (a door, the customer area) sends none in working hours - it only watches after them.
 */
export function nextStillSeconds(o: { now: string; from: string; to: string; active: boolean; everyMin: number; hasChecks: boolean; sinceLastS: number }): number {
  if (!o.active) return 3600;
  if (!inHours(o.now, o.from, o.to)) return minutesUntilHours(o.now, o.from, o.to) * 60;
  if (!o.hasChecks) return Math.max(60, minutesUntilHoursEnd(o.now, o.from, o.to) * 60);
  return Math.max(0, Math.round(o.everyMin * 60 - o.sinceLastS));
}

/** Kitchen-activity cameras look in bursts (owner, 29 Oct 2026): 20 frames 15 seconds apart. */
export const BURST = { frames: 20, gapSec: 15 };

/** Minutes each burst frame stands for: the burst plus the wait after it, shared by its frames. */
export const minutesPerFrame = (everyMin: number, burst = BURST) => (everyMin + (burst.frames * burst.gapSec) / 60) / burst.frames;

/**
 * Whether a burst that has just come in was taken in working hours: it counts when it started
 * inside them (one that runs a few minutes past closing still counts).
 */
export function burstInHours(nowMs: number, from: string, to: string, burst = BURST): boolean {
  const startedMs = nowMs - (burst.frames * burst.gapSec + 60) * 1000;
  return inHours(istClock(nowMs), from, to) || inHours(istClock(startedMs), from, to);
}

/** People seen clearly without each item (only a clear "no" counts; "unclear" never alerts). */
export function missingPpe(look: Look, checks: PpeItem[]): Partial<Record<PpeItem, number>> {
  const out: Partial<Record<PpeItem, number>> = {};
  for (const p of look.people || []) for (const item of checks) if ((p as any)[item] === 'no') out[item] = (out[item] || 0) + 1;
  return out;
}

export type Decision = { alert: 'ppe' | 'intruder' | null; missing: Partial<Record<PpeItem, number>> };

/**
 * What a checked frame means. A scheduled still in working hours: an alert when someone is clearly
 * without a checked item. A movement still outside working hours: an alert when anyone is in view.
 * Alerts of a kind are spaced out (`lastAlertAt` of that kind, `gapMin` minutes).
 */
export function decide(o: {
  kind: 'scheduled' | 'motion'; look: Look; checks: PpeItem[]; nowMs: number; lastAlertAt?: string | null; gapMin: number;
}): Decision {
  const recent = !!o.lastAlertAt && o.nowMs - Date.parse(o.lastAlertAt) < o.gapMin * 60000;
  if (o.kind === 'motion') return { alert: o.look.peopleCount > 0 && !recent ? 'intruder' : null, missing: {} };
  const missing = missingPpe(o.look, o.checks);
  return { alert: Object.keys(missing).length && !recent ? 'ppe' : null, missing };
}

const ITEM_WORD: Record<PpeItem, [string, string]> = { cap: ['a cap', 'caps'], gloves: ['gloves', 'gloves'], apron: ['an apron', 'aprons'] };

/** "1 person without gloves, 2 without caps". */
export function missingText(missing: Partial<Record<PpeItem, number>>): string {
  return PPE_ITEMS.filter((i) => missing[i]).map((i) => {
    const n = missing[i]!;
    return `${n} ${n === 1 ? 'person' : 'people'} without ${ITEM_WORD[i][n === 1 ? 0 : 1]}`;
  }).join(', ');
}

/** Faces the camera PC recognised in a still (faces.py; the face numbers stay on the PC). */
export type Faces = { names: string[]; unknown: number };

export function cleanFaces(raw: any): Faces | null {
  if (!raw || typeof raw !== 'object') return null;
  const names = (Array.isArray(raw.names) ? raw.names : []).map((n: any) => String(n || '').trim().slice(0, 60)).filter(Boolean).slice(0, 10);
  const unknown = Math.max(0, Math.min(30, Math.round(Number(raw.unknown) || 0)));
  return { names: [...new Set(names)] as string[], unknown };
}

/** After hours: everyone in view is a recognised colleague (every face known, no more people than names). */
export const onlyKnownStaff = (faces: Faces | null, peopleCount: number) =>
  !!faces && faces.names.length > 0 && faces.unknown === 0 && peopleCount <= faces.names.length;

/** "HH:MM" India time of an instant. */
export const istClock = (ms: number) => new Date(ms + 330 * 60000).toISOString().slice(11, 16);
