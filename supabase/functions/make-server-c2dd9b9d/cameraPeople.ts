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

export type DayPerson = { id: number; refs: { path: string; at: string }[]; first: string; last: string; top: string; spot?: number[] };
export type IgnoreSpot = { box: number[]; from: string; slot: string; by: string };
export const NOT_A_PERSON = 'Not a person';
export const MAX_SPOTS = 20;
export type DayPeople = { date: string; next: number; people: DayPerson[] };
export type NumberedBody = {
  frames: { n: number; box: number[] }[][]; // per frame, the boxes drawn on it (0-1 of the frame)
  crops: Record<number, string>; // box number -> small crop of that person (base64 JPEG), for references
  photos: Record<number, string>; // box number -> the frame with only that box drawn, for Who is who
};

export const MAX_REFS = 3; // reference crops kept per person
export const REF_EVERY_MIN = 90; // a fresh one at most this often (apron on, sleeves rolled up...)
export const SEND_REFS = 2; // the newest this many go to Bunny
export const SEND_PEOPLE = 8; // the people seen most recently
const MAX_CROP_CHARS = 150_000;
const MAX_PHOTO_CHARS = 400_000;
const B64 = /^[A-Za-z0-9+/=]+$/;

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
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

/** The people whose reference crops go to Bunny with this burst: seen most recently first. */
export function toShow(day: DayPeople | null): { id: number; paths: string[] }[] {
  return [...(day?.people || [])].filter((p) => p.refs.length)
    .sort((a, b) => b.last.localeCompare(a.last)).slice(0, SEND_PEOPLE)
    .map((p) => ({ id: p.id, paths: p.refs.slice(-SEND_REFS).map((r) => r.path) }));
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
