// The day's people on a kitchen camera, by number (owner, 30 Oct 2026: two men in red were taken
// for one, and naming colours every day was tedious). The camera PC (tools/kitchen-ai kai/people.py)
// finds the people in a burst and draws a numbered box round each; the numbers hold within that burst
// only. Bunny is shown reference crops of the people seen earlier that day and says which of them each
// box is (insights.ts aiLookAtBurst, numbered), so a person keeps one day number - slot "p3" - all
// day, and Who is who shows the photo with their box. No I/O here: cctv.ts stores the crops.
//
//   cctv-people:{cameraId}:{date}   {date, next, people: [{id, refs: [{path, at}], first, last, top, spot}]}
//   cctv-ignore:{cameraId}          spots where a box is an object, not a person (owner, 31 Oct 2026:
//                                   a sack on the water jar was boxed as Person 3 and counted without a cap)
// Not a person: picking it in Who is who takes that number out of the day (activity, PPE, the
// roundup) and keeps the box's spot; later boxes the same size in the same spot are dropped before
// Bunny reads the burst. The person finder was 76% sure of the sack - as sure as of real people - so
// a score cut-off can't tell; a person standing there is a taller box and still counts.
// The spot is the box in the Who is who photo (the number's first burst), never one Bunny matched
// later, and Bunny is never shown an object's crops: at 13:25 on 31 Oct it took Vijay, folding on the
// front seat, for the sack's number, the seat was kept as the sack's spot, and his folding was
// dropped from every burst after (owner: "Vijay is folding since long time but no data of that").
//
// Tags (owner, 31 Oct 2026: "once marked don't show those, come up with new ones... mark complete
// when all persons are tagged at least twice"): Who is who asks only about numbers without a name.
// A name counts one tag per number it was given, and one more when a later photo of that number is
// confirmed (when Bunny kept them on one number all day). Two tags each and nothing unnamed is a
// complete day. A person named on two numbers goes to Bunny as one, with looks from both.
//   cctv-confirm:{cameraId}:{date}  slot -> {photo, at} a later photo to confirm; {name, by, on} once
//                                   confirmed; {after} when it was someone else (asked again later)

export type DayPerson = { id: number; refs: { path: string; at: string }[]; first: string; last: string; top: string; spot?: number[] };
export type IgnoreSpot = { box: number[]; from: string; slot: string; by: string };
export const NOT_A_PERSON = 'Not a person';
export const SOMEONE_ELSE = 'Someone else'; // visitors, delivery, a technician: no tags needed
export const MAX_SPOTS = 20;
export const TAGS_NEEDED = 2;
export const CONFIRM_AFTER_MIN = 60; // a later photo to confirm is at least this long after the first
export type Confirm = { photo?: string; at?: string; after?: string; name?: string; by?: string; on?: string };
export type DayPeople = { date: string; next: number; people: DayPerson[] };
export type NumberedBody = {
  frames: { n: number; box: number[] }[][]; // per frame, the boxes drawn on it (0-1 of the frame)
  crops: Record<number, string>; // box number -> small crop of that person (base64 JPEG), for references
  photos: Record<number, string>; // box number -> the frame with only that box drawn, for Who is who
};

export const MAX_REFS = 3; // reference crops kept per person
export const REF_EVERY_MIN = 90; // a fresh one at most this often (apron on, sleeves rolled up...)
export const SEND_REFS = 2; // the newest this many go to Bunny
export const SEND_NAMED_REFS = 3; // ...for someone named on two or more numbers, from all of them
export const SEND_PEOPLE = 8; // the people seen most recently
const MAX_CROP_CHARS = 150_000;
const MAX_PHOTO_CHARS = 400_000;
const B64 = /^[A-Za-z0-9+/=]+$/;

export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const slotOf = (id: number) => `p${id}`;

/** The PC's numbered boxes, checked; null when absent or not one entry per frame (then the burst is
 *  read the old way, by clothes). */
export function cleanNumbered(raw: any, frames: number): NumberedBody | null {
  if (!raw || !Array.isArray(raw.frames) || raw.frames.length !== frames) return null;
  const out: NumberedBody = { frames: [], crops: {}, photos: {} };
  for (const f of raw.frames) {
    if (!Array.isArray(f)) return null;
    out.frames.push(f.slice(0, 12)
      .filter((b: any) => Number.isInteger(b?.n) && b.n >= 1 && b.n <= 30 && Array.isArray(b.box) && b.box.length === 4 && b.box.every((v: any) => typeof v === 'number' && v >= 0 && v <= 1))
      .map((b: any) => ({ n: b.n, box: b.box.map((v: number) => Math.round(v * 1e4) / 1e4) })));
  }
  const drawn = new Set(out.frames.flat().map((b) => b.n));
  const pick = (o: any, max: number) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {})
    .filter(([n, v]) => drawn.has(Number(n)) && typeof v === 'string' && v.length <= max && B64.test(v.slice(0, 200)))
    .slice(0, 12).map(([n, v]) => [Number(n), v as string]));
  out.crops = pick(raw.crops, MAX_CROP_CHARS);
  out.photos = pick(raw.photos, MAX_PHOTO_CHARS);
  return out;
}

export const isStaffName = (name?: string | null): name is string => !!name && name !== NOT_A_PERSON && name !== SOMEONE_ELSE;

/** The people whose reference crops go to Bunny with this burst: seen most recently first. Numbers
 *  given the same name are one person, under the first number, with each number's newest look.
 *  Objects (Not a person) aren't shown, so no one can be matched to them. */
export function toShow(day: DayPeople | null, names: Record<string, string> = {}): { id: number; paths: string[] }[] {
  const groups = new Map<string, DayPerson[]>();
  for (const p of day?.people || []) {
    const name = names[slotOf(p.id)];
    if (!p.refs.length || name === NOT_A_PERSON) continue;
    const k = isStaffName(name) ? `n:${name}` : `p:${p.id}`;
    groups.set(k, [...(groups.get(k) || []), p]);
  }
  const newestFirst = (a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at);
  return [...groups.values()].map((g) => {
    const refs = g.length === 1 ? g[0].refs.slice(-SEND_REFS).reverse()
      : [...g.map((p) => p.refs[p.refs.length - 1]).sort(newestFirst), ...g.flatMap((p) => p.refs.slice(0, -1)).sort(newestFirst)].slice(0, SEND_NAMED_REFS);
    return { id: Math.min(...g.map((p) => p.id)), last: g.reduce((m, p) => (p.last > m ? p.last : m), ''), paths: refs.reverse().map((r) => r.path) };
  }).sort((a, b) => b.last.localeCompare(a.last)).slice(0, SEND_PEOPLE).map(({ id, paths }) => ({ id, paths }));
}

/** The day's tags: per name, how many; the numbers still unnamed (open); named once with a later photo
 *  waiting (ask); names short of TAGS_NEEDED; complete when nothing is open and every name has enough.
 *  Someone else and Not a person need no tags. */
export function tagState(slots: { slot: string; name: string | null }[], confirms: Record<string, Confirm>) {
  const tags: Record<string, number> = {};
  for (const s of slots) if (isStaffName(s.name)) tags[s.name] = (tags[s.name] || 0) + 1 + (confirms[s.slot]?.name === s.name ? 1 : 0);
  const open = slots.filter((s) => !s.name).map((s) => s.slot);
  const ask = slots.filter((s) => isStaffName(s.name) && tags[s.name] < TAGS_NEEDED && confirms[s.slot]?.photo && !confirms[s.slot].name).map((s) => s.slot);
  const short = Object.keys(tags).filter((n) => tags[n] < TAGS_NEEDED).sort();
  return { tags, open, ask, short, complete: !open.length && !short.length && Object.keys(tags).length > 0 };
}

/** Whether this sighting of a named number is due a photo to confirm it (a second tag). */
export function wantsConfirm(slot: string, name: string | undefined, tags: Record<string, number>, c: Confirm | undefined, first: string, clock: string): boolean {
  if (!/^p\d+$/.test(slot) || !isStaffName(name) || (tags[name] || 0) >= TAGS_NEEDED || c?.photo) return false;
  return toMin(clock) - toMin(c?.after || first) >= CONFIRM_AFTER_MIN;
}

/**
 * Bunny's answer into day numbers: a known person keeps theirs, anyone else boxed gets the next one.
 * Returns the day (updated), the day number for each person in `people` (same order; 0 = none), and
 * the boxes whose crop should be kept as a new reference (a new person, or a known one not refreshed
 * lately).
 */
export function assign(day: DayPeople | null, date: string, clock: string, people: { box?: number; known?: number; top: string }[], crops: Record<number, string>) {
  const d: DayPeople = day && day.date === date ? { ...day, people: day.people.map((p) => ({ ...p, refs: [...p.refs] })) } : { date, next: 1, people: [] };
  const byId = new Map(d.people.map((p) => [p.id, p]));
  const ids: number[] = [];
  const keep: { box: number; id: number }[] = [];
  const fresh = new Map<number, number>(); // box -> new id (a box listed twice stays one person)
  for (const p of people) {
    const box = Number(p.box);
    let person = p.known ? byId.get(p.known) : undefined;
    if (!person && box) {
      const again = fresh.get(box);
      person = again ? byId.get(again) : undefined;
    }
    // Never boxed (box 0) and not one of the day's people: no number - counted by their clothes.
    if (!person && !box) { ids.push(0); continue; }
    if (!person) {
      person = { id: d.next++, refs: [], first: clock, last: clock, top: p.top };
      d.people.push(person);
      byId.set(person.id, person);
      fresh.set(box, person.id);
    }
    if (clock < person.first) person.first = clock;
    if (clock > person.last) person.last = clock;
    const lastRef = person.refs[person.refs.length - 1];
    const due = !lastRef || toMin(clock) - toMin(lastRef.at) >= REF_EVERY_MIN;
    if (crops[box] && due && !keep.some((k) => k.id === person!.id)) keep.push({ box, id: person.id });
    ids.push(person.id);
  }
  return { day: d, ids, keep };
}

/** A new reference crop stored: the first one is kept for good (the clearest early look), then the newest. */
export function addRef(day: DayPeople, id: number, path: string, at: string): string[] {
  const p = day.people.find((x) => x.id === id);
  if (!p) return [];
  p.refs.push({ path, at });
  if (p.refs.length <= MAX_REFS) return [];
  const [dropped] = p.refs.splice(1, 1);
  return [dropped.path];
}

/** People Bunny gave the same day number in one burst (one person boxed twice): one row, frame by
 *  frame whichever box saw them. */
export function mergeSamePerson<T extends { key?: string; activities: string[]; phoneFrames: number[] }>(people: T[]): T[] {
  const out: T[] = [];
  for (const p of people) {
    const had = p.key ? out.find((q) => q.key === p.key) : undefined;
    if (!had) { out.push({ ...p, activities: [...p.activities], phoneFrames: [...p.phoneFrames] }); continue; }
    p.activities.forEach((a, f) => { if (had.activities[f] === 'away' && a !== 'away') had.activities[f] = a; });
    had.phoneFrames = [...new Set([...had.phoneFrames, ...p.phoneFrames])];
  }
  return out;
}

// ---- Objects boxed as people ----

const iou = (a: number[], b: number[]) => {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = w * h;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
};
/** A box in a remembered object's spot: overlapping well, and about the same height (a person there is taller). */
export function inSpot(box: number[], spot: number[]): boolean {
  const ratio = (box[3] - box[1]) / Math.max(1e-6, spot[3] - spot[1]);
  return iou(box, spot) >= 0.6 && ratio >= 0.75 && ratio <= 1.33;
}

/** One number's box across the burst: the median of each edge. */
export function spotOf(numbered: NumberedBody, n: number): number[] | null {
  const boxes = numbered.frames.flatMap((f) => f.filter((b) => b.n === n).map((b) => b.box));
  if (!boxes.length) return null;
  const mid = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return [0, 1, 2, 3].map((i) => Math.round(mid(boxes.map((b) => b[i])) * 1e4) / 1e4);
}

/** The burst's numbers that sit in an object's spot in most of the frames they are drawn in. */
export function objectBoxes(numbered: NumberedBody, spots: IgnoreSpot[]): Set<number> {
  const out = new Set<number>();
  if (!spots.length) return out;
  const drawn = new Set(numbered.frames.flat().map((b) => b.n));
  for (const n of drawn) {
    const boxes = numbered.frames.flatMap((f) => f.filter((b) => b.n === n).map((b) => b.box));
    const inside = boxes.filter((b) => spots.some((sp) => inSpot(b, sp.box))).length;
    if (inside / boxes.length >= 0.6) out.add(n);
  }
  return out;
}

/** The burst without those numbers: Bunny is never told about them (its answer keeps only drawn boxes). */
export function dropBoxes(numbered: NumberedBody, drop: Set<number>): NumberedBody {
  if (!drop.size) return numbered;
  const keep = <T>(o: Record<number, T>) => Object.fromEntries(Object.entries(o).filter(([n]) => !drop.has(Number(n)))) as Record<number, T>;
  return { frames: numbered.frames.map((f) => f.filter((b) => !drop.has(b.n))), crops: keep(numbered.crops), photos: keep(numbered.photos) };
}

/** A new spot, unless one already covers it (newest kept, at most MAX_SPOTS). */
export function addSpot(spots: IgnoreSpot[], spot: IgnoreSpot): IgnoreSpot[] {
  if (spots.some((s) => inSpot(spot.box, s.box))) return spots;
  return [...spots, spot].slice(-MAX_SPOTS);
}

// ---- What a person did in frames where their box isn't drawn ----

// Steady work (owner, 31 Oct 2026: "no folding has started, then how is folding shown"): at 11:05 the
// PC drew Rudra's box in 3 of 20 frames as he walked past, and Bunny gave him 16 frames of activity,
// 11 of them folding. The boxes are trusted over the guess: a frame more than one away from a drawn
// box is away; folding or the machine in a frame without the box only between two drawn frames (a
// moment hidden); and folding while the box crosses the picture is walking.
const STEADY = new Set(['folding', 'machine', 'filling']);
const WALKED = 0.12; // share of the picture's width the box's centre moved to or from the nearest drawn frame
const SPREAD_GAP = 60; // seconds between frames from which a burst is "spread" (as cameraRules SPREAD_GAP_SEC)

export function trustBoxes<T extends { box?: number; activities: string[]; phoneFrames?: number[] }>(people: T[], numbered: NumberedBody, gapSec = 15): T[] {
  // Frames minutes apart (spread bursts, 31 Oct 2026): someone may simply have changed seats in
  // between, so the walking check is only for frames seconds apart.
  const walkCheck = gapSec < SPREAD_GAP;
  return people.map((p) => {
    if (!p.box) return p;
    const at = new Map<number, number[]>(); // frame index -> this person's box
    numbered.frames.forEach((f, i) => { const b = f.find((x) => x.n === p.box); if (b) at.set(i, b.box); });
    if (!at.size) return p;
    const drawn = [...at.keys()].sort((a, b) => a - b);
    const near = (i: number) => drawn.some((d) => Math.abs(d - i) <= 1);
    const cx = (b: number[]) => (b[0] + b[2]) / 2;
    const activities = p.activities.map((a, i) => {
      if (a === 'away') return a;
      if (!at.has(i)) {
        if (!near(i)) return 'away';
        if (STEADY.has(a) && !(at.has(i - 1) && at.has(i + 1))) return 'away';
        return a;
      }
      if (a === 'folding' && walkCheck) {
        // Moving to or from this frame's spot across the picture: walking, not folding.
        const prev = drawn.filter((d) => d < i).pop();
        const next = drawn.find((d) => d > i);
        const moved = Math.max(...[prev, next].filter((d) => d !== undefined).map((d) => Math.abs(cx(at.get(i)!) - cx(at.get(d!)!))), 0);
        if (moved > WALKED) return 'other';
      }
      return a;
    });
    return { ...p, activities, phoneFrames: (p.phoneFrames || []).filter((f) => activities[f - 1] !== 'away') };
  });
}

export const FOLD_SHARE = 0.5; // folding counts when it is at least half the frames the person was in view...
export const FOLD_RUN = 3;     // ...with at least this many frames of it in a row
export const FOLD_RUN_SPREAD = 2; // spread frames: two in a row (3.5 minutes apart at 35 minutes)

/**
 * Folding is steady work (owner, 31 Oct 2026, again: "still folding hasn't started and it says folding
 * by Rudra"): at 11:40 Bunny gave him folding in 4 scattered frames at the wooden table, between idle,
 * prep and filling, with no wrappers in sight. Someone folding momos folds most of the five minutes of
 * a burst, so a person's folding frames count only when folding is at least half of the frames they
 * were in view and 3 come in a row; otherwise those frames are "other".
 * Spread frames (minutes apart) cover half an hour, so someone may fold for part of it and peel onions
 * the rest: there folding counts in runs of two or more frames in a row, and a lone frame of it is "other".
 */
export function steadyFolding<T extends { activities: string[] }>(people: T[], gapSec = 15): T[] {
  const spread = gapSec >= SPREAD_GAP;
  return people.map((p) => {
    const folds = p.activities.filter((a) => a === 'folding').length;
    if (!folds) return p;
    if (spread) {
      const activities = [...p.activities];
      for (let i = 0; i < activities.length;) {
        let j = i;
        while (j < activities.length && activities[j] === 'folding') j++;
        if (j - i > 0 && j - i < FOLD_RUN_SPREAD) activities.fill('other', i, j);
        i = Math.max(j, i + 1);
      }
      return activities.some((a, i) => a !== p.activities[i]) ? { ...p, activities } : p;
    }
    const seen = p.activities.filter((a) => a !== 'away').length;
    let run = 0;
    let best = 0;
    for (const a of p.activities) { run = a === 'folding' ? run + 1 : 0; best = Math.max(best, run); }
    if (folds >= FOLD_SHARE * seen && best >= FOLD_RUN) return p;
    return { ...p, activities: p.activities.map((a) => (a === 'folding' ? 'other' : a)) };
  });
}

