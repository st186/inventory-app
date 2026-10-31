// At work or stepped out, from the phone during the shift (owner, 31 Oct 2026: "when a person is
// not visible for a long time can we also pull up the location data just to be sure"). The phone's
// shift tracker (src/components/kpi/shiftTracker.ts) sends stretches of time - inside the
// workplace zone or outside it, and at most how far when outside - never positions. Only with
// shift-consent version 2. Kept apart from attendance.ts so it can be tested with plain node:
//   node supabase/functions/make-server-c2dd9b9d/presenceRules.test.ts

export type PresenceSpan = { from: number; to: number; state: 'in' | 'out'; farthestM?: number }; // ms
export type PresenceDay = { employeeId: string; date: string; spans: PresenceSpan[] };

const JOIN_MS = 90 * 1000; // the phone ticks once a minute: a smaller gap is the same stretch
export const MAX_SPANS = 400;

/** Cleans what a phone sent: known states, real times, not in the future, not over a day old;
 *  the distance rounded to 50 m. */
export function cleanSpans(raw: unknown, nowMs: number): PresenceSpan[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 100).flatMap((s: any) => {
    const from = typeof s?.from === 'number' ? s.from : Date.parse(s?.from);
    const to = typeof s?.to === 'number' ? s.to : Date.parse(s?.to);
    const state = s?.state === 'in' || s?.state === 'out' ? s.state : null;
    if (!state || !Number.isFinite(from) || !Number.isFinite(to) || from >= to) return [];
    if (to > nowMs + 2 * 60000 || nowMs - from > 36 * 3600000) return [];
    const far = Number(s?.farthestM);
    return [{ from, to, state, ...(state === 'out' && Number.isFinite(far) && far > 0 ? { farthestM: Math.round(far / 50) * 50 } : {}) }];
  });
}

/** Adds newly sent stretches: they replace whatever the day had for the same minutes (a phone
 *  sends its current stretch again as it grows), then touching stretches of one state join up. */
export function mergeSpans(old: PresenceSpan[], add: PresenceSpan[]): PresenceSpan[] {
  let kept = [...old];
  for (const n of add) {
    kept = kept.flatMap((o) => {
      if (o.to <= n.from || o.from >= n.to) return [o];
      const parts: PresenceSpan[] = [];
      if (o.from < n.from) parts.push({ ...o, to: n.from });
      if (o.to > n.to) parts.push({ ...o, from: n.to });
      return parts;
    });
    kept.push({ ...n });
  }
  kept.sort((a, b) => a.from - b.from);
  const out: PresenceSpan[] = [];
  for (const s of kept) {
    const last = out[out.length - 1];
    if (last && last.state === s.state && s.from - last.to <= JOIN_MS) {
      last.to = Math.max(last.to, s.to);
      if (s.farthestM) last.farthestM = Math.max(last.farthestM || 0, s.farthestM);
    } else out.push({ ...s });
  }
  return out.slice(-MAX_SPANS);
}
