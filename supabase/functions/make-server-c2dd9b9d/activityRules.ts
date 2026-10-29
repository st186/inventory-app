// Kitchen activity from camera stills (owner, 29 Oct 2026: "how much time vijay or aniket folds momo
// actually and whos talking on phone - total phone usage and other key metrics"). Work sampling:
// every still (one every few minutes) says what each person in view is doing; each sighting stands
// for the minutes since the last still. The camera sees no faces, so a person is a "slot" by the
// colour of their top for the day, and someone at the place taps the real name once a day.
// Kept apart from cctv.ts so it can be tested with plain node:
//   node supabase/functions/make-server-c2dd9b9d/activityRules.test.ts

export const ACTIVITIES = ['folding', 'machine', 'filling', 'cooking', 'packing', 'cleaning', 'phone', 'idle', 'other'] as const;
export type Activity = typeof ACTIVITIES[number];
export const TOPS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'navy', 'purple', 'pink', 'white', 'grey', 'black', 'brown', 'beige', 'patterned', 'other'] as const;
export type Top = typeof TOPS[number];

export const ACTIVITY_LABEL: Record<Activity, string> = {
  folding: 'Folding momos', machine: 'At the machine / dough', filling: 'Making filling', cooking: 'Steaming / frying',
  packing: 'Packing', cleaning: 'Cleaning', phone: 'On the phone', idle: 'Standing idle', other: 'Other',
};

export type Sighting = { top: string; activity: string; phone: string; cap?: string; gloves?: string; apron?: string };
export type Slot = {
  minutes: Partial<Record<Activity, number>>;
  phoneMinutes: number;
  phoneTimes: number; // separate times seen on the phone (a new time after a still without it)
  onPhone: boolean;
  samples: number;
  first: string; // HH:MM first seen
  last: string;
  ppe: { judged: number; ok: number }; // sightings where every checked item could be seen; all on
};
export type ActivityDay = { date: string; cameraId: string; stills: number; slots: Record<string, Slot> };

const onPhone = (p: Sighting) => p.phone === 'in_hand' || p.phone === 'at_ear' || p.activity === 'phone';
const topOf = (t: string): Top => ((TOPS as readonly string[]).includes(t) ? t as Top : 'other');
const activityOf = (a: string): Activity => ((ACTIVITIES as readonly string[]).includes(a) ? a as Activity : 'other');

/** Adds one still's sightings to the day. Two people in the same colour get "red", "red-2". */
export function addStill(day: ActivityDay | null, o: {
  date: string; cameraId: string; clock: string; everyMin: number; people: Sighting[]; checks: string[];
}): ActivityDay {
  const d: ActivityDay = day && day.date === o.date ? day : { date: o.date, cameraId: o.cameraId, stills: 0, slots: {} };
  d.stills += 1;
  const seen = new Set<string>();
  const used: Record<string, number> = {};
  for (const p of o.people) {
    const top = topOf(p.top);
    used[top] = (used[top] || 0) + 1;
    const key = used[top] === 1 ? top : `${top}-${used[top]}`;
    seen.add(key);
    const s: Slot = d.slots[key] || { minutes: {}, phoneMinutes: 0, phoneTimes: 0, onPhone: false, samples: 0, first: o.clock, last: o.clock, ppe: { judged: 0, ok: 0 } };
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
    if (o.checks.length) {
      const vals = o.checks.map((c) => (p as any)[c]);
      if (vals.every((v) => v === 'yes' || v === 'no')) {
        s.ppe.judged += 1;
        if (vals.every((v) => v === 'yes')) s.ppe.ok += 1;
      }
    }
    d.slots[key] = s;
  }
  // Out of view this time: a phone streak ends.
  for (const [key, s] of Object.entries(d.slots)) if (!seen.has(key)) s.onPhone = false;
  return d;
}

export type PersonRow = {
  slot: string; name: string | null; minutes: Partial<Record<Activity, number>>; seenMinutes: number;
  foldingMinutes: number; phoneMinutes: number; phoneTimes: number; idleMinutes: number; ppePercent: number | null; first: string; last: string;
};

/** Per person (named where someone tapped the name) and the kitchen as a whole, for one or more days. */
export function summarise(days: ActivityDay[], names: Record<string, Record<string, string>>, piecesMade: number) {
  const rows = new Map<string, PersonRow>();
  for (const d of days) {
    for (const [slot, s] of Object.entries(d.slots)) {
      const name = names[d.date]?.[slot] || null;
      // A named person adds up across days; an unnamed colour stays that day's colour.
      const key = name ? `name:${name}` : `${d.date}:${slot}`;
      const r = rows.get(key) || { slot, name, minutes: {}, seenMinutes: 0, foldingMinutes: 0, phoneMinutes: 0, phoneTimes: 0, idleMinutes: 0, ppePercent: null, first: s.first, last: s.last, _judged: 0, _ok: 0 } as PersonRow & { _judged: number; _ok: number };
      for (const [a, m] of Object.entries(s.minutes)) r.minutes[a as Activity] = (r.minutes[a as Activity] || 0) + (m || 0);
      r.seenMinutes += Object.values(s.minutes).reduce((x, y) => x + (y || 0), 0);
      r.phoneMinutes += s.phoneMinutes;
      r.phoneTimes += s.phoneTimes;
      (r as any)._judged += s.ppe.judged;
      (r as any)._ok += s.ppe.ok;
      if (s.first < r.first) r.first = s.first;
      if (s.last > r.last) r.last = s.last;
      rows.set(key, r);
    }
  }
  const people = [...rows.values()].map((r: any) => {
    const { _judged, _ok, ...rest } = r;
    return {
      ...rest,
      foldingMinutes: r.minutes.folding || 0,
      idleMinutes: r.minutes.idle || 0,
      ppePercent: _judged ? Math.round((_ok / _judged) * 100) : null,
    } as PersonRow;
  }).sort((a, b) => b.seenMinutes - a.seenMinutes);
  const foldingMinutes = people.reduce((s, p) => s + p.foldingMinutes, 0);
  return {
    people,
    kitchen: {
      foldingHours: Math.round((foldingMinutes / 60) * 10) / 10,
      phoneMinutes: people.reduce((s, p) => s + p.phoneMinutes, 0),
      idleMinutes: people.reduce((s, p) => s + p.idleMinutes, 0),
      piecesMade,
      // Pieces made for each hour of folding seen on camera (the whole house's production).
      piecesPerFoldingHour: foldingMinutes >= 30 ? Math.round(piecesMade / (foldingMinutes / 60)) : null,
      stills: days.reduce((s, d) => s + d.stills, 0),
    },
  };
}
