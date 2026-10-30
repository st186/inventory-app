// Kitchen activity from camera stills (owner, 29 Oct 2026: "how much time vijay or aniket folds momo
// actually and whos talking on phone - total phone usage and other key metrics"). Work sampling:
// every still (one every few minutes) says what each person in view is doing; each sighting stands
// for the minutes since the last still. The camera sees no faces, so a person is a "slot" by the
// colour of their top for the day, and someone at the place taps the real name once a day. Two
// people in the same top are told apart by their trousers (owner, 30 Oct 2026: Vijay and Rudra both
// came in red): the slot is "red~blue"; trousers not seen goes to the one person known in that top.
// Bursts (owner, 29 Oct 2026, "for better detection"): 20 frames 15 seconds apart, looked at
// together so the AI follows each person through the 5 minutes, then 30 minutes without; each
// frame a person is in stands for its share of the whole cycle (35 / 20 = 1.75 minutes).
// Kept apart from cctv.ts so it can be tested with plain node:
//   node supabase/functions/make-server-c2dd9b9d/activityRules.test.ts

export const ACTIVITIES = ['folding', 'machine', 'prep', 'filling', 'cooking', 'packing', 'cleaning', 'phone', 'idle', 'other'] as const;
export type Activity = typeof ACTIVITIES[number];
export const TOPS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'navy', 'purple', 'pink', 'white', 'grey', 'black', 'brown', 'beige', 'patterned', 'other'] as const;
export type Top = typeof TOPS[number];

export const ACTIVITY_LABEL: Record<Activity, string> = {
  folding: 'Folding momos', machine: 'At the machine / dough', prep: 'Cutting veg (prep)', filling: 'Making filling', cooking: 'Steaming / frying',
  packing: 'Packing', cleaning: 'Cleaning', phone: 'On the phone', idle: 'Standing idle', other: 'Other',
};

export type Sighting = { top: string; bottom?: string; activity: string; phone: string; cap?: string; gloves?: string; apron?: string };
export type Slot = {
  minutes: Partial<Record<Activity, number>>;
  phoneMinutes: number;
  phoneTimes: number; // separate times seen on the phone (a new time after a still without it)
  onPhone: boolean;
  samples: number;
  first: string; // HH:MM first seen
  last: string;
  ppe: { judged: number; ok: number }; // sightings where every checked item could be seen; all on
  at?: number[]; // when they were seen: minutes of the day, one per frame
};
export type ActivityDay = {
  date: string; cameraId: string; stills: number; bursts?: number; slots: Record<string, Slot>;
  frames?: number[]; // when the camera looked: minutes of the day, one per frame
  mpf?: number; // minutes each frame stands for
  folding?: [number, number][]; // [minute of the day, people folding] for each frame with anyone folding
};

// Not in the kitchen (owner, 30 Oct 2026): gone and not back within this many minutes. Shorter is just
// out of view for a moment.
export const AWAY_MIN = 15;
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const clockOf = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`;

const onPhone = (p: Sighting) => p.phone === 'in_hand' || p.phone === 'at_ear' || p.activity === 'phone';
const topOf = (t: string): Top => ((TOPS as readonly string[]).includes(t) ? t as Top : 'other');
const activityOf = (a: string): Activity => ((ACTIVITIES as readonly string[]).includes(a) ? a as Activity : 'other');

/**
 * Slot keys for the people in one look: top and trousers ("red~blue"). Trousers not seen: the one
 * person already known today in that top, else the top alone. The same again in one look gets "-2".
 * `known` = the day's slot keys before this look.
 */
export function slotKeys(people: { top: string; bottom?: string; key?: string }[], known: string[] = []): string[] {
  const used: Record<string, number> = {};
  return people.map((p) => {
    if (p.key) return p.key; // a numbered burst: the day's person number ("p3"), from the camera PC's boxes
    const top = topOf(p.top);
    const bottom = p.bottom && p.bottom !== 'other' && (TOPS as readonly string[]).includes(p.bottom) ? p.bottom : '';
    let base = bottom ? `${top}~${bottom}` : top;
    if (!bottom) {
      const same = known.filter((k) => !/-\d+$/.test(k) && k.split('~')[0] === top);
      if (same.length === 1) base = same[0];
    }
    used[base] = (used[base] || 0) + 1;
    return used[base] === 1 ? base : `${base}-${used[base]}`;
  });
}
const newSlot = (clock: string): Slot => ({ minutes: {}, phoneMinutes: 0, phoneTimes: 0, onPhone: false, samples: 0, first: clock, last: clock, ppe: { judged: 0, ok: 0 } });
function judgePpe(s: Slot, p: Record<string, any>, checks: string[]) {
  if (!checks.length) return;
  const vals = checks.map((c) => p[c]);
  if (vals.every((v) => v === 'yes' || v === 'no')) {
    s.ppe.judged += 1;
    if (vals.every((v) => v === 'yes')) s.ppe.ok += 1;
  }
}

/** Adds one still's sightings to the day. Two people in the same colour get "red", "red-2". */
export function addStill(day: ActivityDay | null, o: {
  date: string; cameraId: string; clock: string; everyMin: number; people: Sighting[]; checks: string[];
}): ActivityDay {
  const d: ActivityDay = day && day.date === o.date ? day : { date: o.date, cameraId: o.cameraId, stills: 0, slots: {} };
  d.stills += 1;
  const t = toMin(o.clock);
  d.frames = [...(d.frames || []), t];
  d.mpf = o.everyMin;
  const folders = o.people.filter((p) => activityOf(p.activity) === 'folding').length;
  if (folders) d.folding = [...(d.folding || []), [t, folders]];
  const seen = new Set<string>();
  const keys = slotKeys(o.people, Object.keys(d.slots));
  for (const [i, p] of o.people.entries()) {
    const key = keys[i];
    seen.add(key);
    const s: Slot = d.slots[key] || newSlot(o.clock);
    const act = activityOf(p.activity);
    s.minutes[act] = (s.minutes[act] || 0) + o.everyMin;
    const phone = onPhone(p);
    if (phone) {
      s.phoneMinutes += o.everyMin;
      if (!s.onPhone) s.phoneTimes += 1;
    }
    s.onPhone = phone;
    s.samples += 1;
    s.last = o.clock;
    s.at = [...(s.at || []), t];
    judgePpe(s, p, o.checks);
    d.slots[key] = s;
  }
  // Out of view this time: a phone streak ends.
  for (const [key, s] of Object.entries(d.slots)) if (!seen.has(key)) s.onPhone = false;
  return d;
}

/** One person followed through a burst: what they were doing in each frame ("away" = not in view). */
export type BurstPerson = { top: string; bottom?: string; key?: string; activities: string[]; phoneFrames: number[]; cap?: string; gloves?: string; apron?: string };

/**
 * Adds a burst to the day: every frame a person is in counts `minutesPerFrame` of what they were
 * doing. Phone: each unbroken run of frames with the phone is one time; a new burst starts afresh.
 * PPE is judged once per burst (the AI looks across all the frames).
 */
export function addBurst(day: ActivityDay | null, o: {
  date: string; cameraId: string; from: string; to: string; frames: number; minutesPerFrame: number; people: BurstPerson[]; checks: string[]; gapSec?: number;
}): ActivityDay {
  const d: ActivityDay = day && day.date === o.date ? day : { date: o.date, cameraId: o.cameraId, stills: 0, slots: {} };
  d.stills += o.frames;
  d.bursts = (d.bursts || 0) + 1;
  const times = Array.from({ length: o.frames }, (_, f) => toMin(o.from) + (f * (o.gapSec || 15)) / 60);
  d.frames = [...(d.frames || []), ...times];
  d.mpf = o.minutesPerFrame;
  times.forEach((t, f) => {
    const folders = o.people.filter((p) => activityOf(p.activities[f] || 'away') === 'folding' && p.activities[f] !== 'away').length;
    if (folders) d.folding = [...(d.folding || []), [t, folders]];
  });
  const keys = slotKeys(o.people, Object.keys(d.slots));
  for (const s of Object.values(d.slots)) s.onPhone = false;
  for (const [i, p] of o.people.entries()) {
    const frames = p.activities.slice(0, o.frames);
    if (!frames.some((a) => a !== 'away')) continue;
    const key = keys[i];
    const s: Slot = d.slots[key] || newSlot(o.from);
    const phoneAt = new Set(p.phoneFrames);
    let onPhoneNow = false;
    frames.forEach((a, f) => {
      if (a === 'away') { onPhoneNow = false; return; }
      const act = activityOf(a);
      s.minutes[act] = (s.minutes[act] || 0) + o.minutesPerFrame;
      const phone = act === 'phone' || phoneAt.has(f + 1);
      if (phone) {
        s.phoneMinutes += o.minutesPerFrame;
        if (!onPhoneNow) s.phoneTimes += 1;
      }
      onPhoneNow = phone;
      s.samples += 1;
      s.at = [...(s.at || []), times[f]];
    });
    if (o.from < s.first) s.first = o.from;
    if (o.to > s.last) s.last = o.to;
    judgePpe(s, p, o.checks);
    d.slots[key] = s;
  }
  return d;
}

/**
 * Minutes a person was out of the kitchen: between their first and last sighting, every absence that
 * lasted AWAY_MIN or more; each frame the camera took while they were gone counts what a frame stands
 * for. Before they first come in and after they leave for the day isn't counted.
 */
export function notInKitchen(d: ActivityDay, s: Slot, awayMin = AWAY_MIN): number {
  return awaySpells(d, s, awayMin).reduce((t, x) => t + x.minutes, 0);
}

/** Each time out of the kitchen (owner, 30 Oct 2026: "along with timestamp"): last seen, back, and
 *  the minutes it counts (the frames missed in between). */
export type AwaySpell = { date: string; from: string; to: string; minutes: number };
export function awaySpells(d: ActivityDay, s: Slot, awayMin = AWAY_MIN): AwaySpell[] {
  const at = [...(s.at || [])].sort((a, b) => a - b);
  const frames = d.frames || [];
  const out: AwaySpell[] = [];
  for (let i = 1; i < at.length; i++) {
    if (at[i] - at[i - 1] < awayMin) continue;
    const missed = frames.filter((t) => t > at[i - 1] + 1e-6 && t < at[i] - 1e-6).length;
    if (missed) out.push({ date: d.date, from: clockOf(at[i - 1]), to: clockOf(at[i]), minutes: missed * (d.mpf || 0) });
  }
  return out;
}

/** When folding started and ended that day, and the most people folding at once (from the frames). */
export function foldingSpan(d: ActivityDay): { from: string; to: string; mostPeople: number } | null {
  const f = d.folding || [];
  if (!f.length) return null;
  const times = f.map(([t]) => t);
  return { from: clockOf(Math.min(...times)), to: clockOf(Math.max(...times)), mostPeople: Math.max(...f.map(([, n]) => n)) };
}

export type PersonRow = {
  slot: string; name: string | null; minutes: Partial<Record<Activity, number>>; seenMinutes: number; notInKitchenMinutes: number; away: AwaySpell[];
  foldingMinutes: number; phoneMinutes: number; phoneTimes: number; idleMinutes: number; ppePercent: number | null; first: string; last: string;
};

/** Two slots of one person (two numbers or colours given the same name) as one. */
export function mergeSlots(a: Slot, b: Slot): Slot {
  const minutes = { ...a.minutes };
  for (const [k, m] of Object.entries(b.minutes)) minutes[k as Activity] = (minutes[k as Activity] || 0) + (m || 0);
  return {
    minutes, phoneMinutes: a.phoneMinutes + b.phoneMinutes, phoneTimes: a.phoneTimes + b.phoneTimes, onPhone: a.onPhone || b.onPhone, samples: a.samples + b.samples,
    first: a.first < b.first ? a.first : b.first, last: a.last > b.last ? a.last : b.last, ppe: { judged: a.ppe.judged + b.ppe.judged, ok: a.ppe.ok + b.ppe.ok },
    at: [...(a.at || []), ...(b.at || [])].sort((x, y) => x - y),
  };
}

/** Per person (named where someone tapped the name) and the kitchen as a whole, for one or more days. */
export function summarise(days: ActivityDay[], names: Record<string, Record<string, string>>, piecesMade: number) {
  const rows = new Map<string, PersonRow>();
  for (const d of days) {
    // The day's slots of one named person together first, so time under one number isn't counted
    // as away from the other.
    const merged = new Map<string, [string, Slot]>();
    for (const [slot, s] of Object.entries(d.slots)) {
      const name = names[d.date]?.[slot];
      const k = name ? `name:${name}` : `slot:${slot}`;
      const had = merged.get(k);
      merged.set(k, had ? [had[0], mergeSlots(had[1], s)] : [slot, s]);
    }
    for (const [slot, s] of merged.values()) {
      const name = names[d.date]?.[slot] || null;
      // A named person adds up across days; an unnamed colour stays that day's colour.
      const key = name ? `name:${name}` : `${d.date}:${slot}`;
      const r = rows.get(key) || { slot, name, minutes: {}, seenMinutes: 0, notInKitchenMinutes: 0, away: [], foldingMinutes: 0, phoneMinutes: 0, phoneTimes: 0, idleMinutes: 0, ppePercent: null, first: s.first, last: s.last, _judged: 0, _ok: 0 } as PersonRow & { _judged: number; _ok: number };
      for (const [a, m] of Object.entries(s.minutes)) r.minutes[a as Activity] = (r.minutes[a as Activity] || 0) + (m || 0);
      r.seenMinutes += Object.values(s.minutes).reduce((x, y) => x + (y || 0), 0);
      const spells = awaySpells(d, s);
      r.notInKitchenMinutes += spells.reduce((t, x) => t + x.minutes, 0);
      r.away.push(...spells);
      r.phoneMinutes += s.phoneMinutes;
      r.phoneTimes += s.phoneTimes;
      (r as any)._judged += s.ppe.judged;
      (r as any)._ok += s.ppe.ok;
      if (s.first < r.first) r.first = s.first;
      if (s.last > r.last) r.last = s.last;
      rows.set(key, r);
    }
  }
  // A burst frame counts a fraction of a minute; whole minutes are shown.
  const raw = [...rows.values()];
  const foldingMinutes = raw.reduce((s, r) => s + (r.minutes.folding || 0), 0);
  const people = raw.map((r: any) => {
    const { _judged, _ok, ...rest } = r;
    const minutes = Object.fromEntries(Object.entries(r.minutes as Record<string, number>).map(([a, m]) => [a, Math.round(m)])) as PersonRow['minutes'];
    return {
      ...rest,
      minutes,
      seenMinutes: Math.round(r.seenMinutes),
      notInKitchenMinutes: Math.round(r.notInKitchenMinutes),
      away: (r.away as AwaySpell[]).map((x) => ({ ...x, minutes: Math.round(x.minutes) })).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from)),
      phoneMinutes: Math.round(r.phoneMinutes),
      foldingMinutes: minutes.folding || 0,
      idleMinutes: minutes.idle || 0,
      ppePercent: _judged ? Math.round((_ok / _judged) * 100) : null,
    } as PersonRow;
  }).sort((a, b) => b.seenMinutes - a.seenMinutes);
  return {
    people,
    kitchen: {
      foldingHours: Math.round((foldingMinutes / 60) * 10) / 10,
      phoneMinutes: Math.round(raw.reduce((s, r) => s + r.phoneMinutes, 0)),
      idleMinutes: Math.round(raw.reduce((s, r) => s + (r.minutes.idle || 0), 0)),
      piecesMade,
      // Pieces made for each hour of folding seen on camera (the whole house's production).
      piecesPerFoldingHour: foldingMinutes >= 30 ? Math.round(piecesMade / (foldingMinutes / 60)) : null,
      // When folding started and ended, and the most people at it at once (one day; null over several).
      folding: days.length === 1 ? foldingSpan(days[0]) : null,
      stills: days.reduce((s, d) => s + d.stills, 0),
      bursts: days.reduce((s, d) => s + (d.bursts || 0), 0),
    },
  };
}
