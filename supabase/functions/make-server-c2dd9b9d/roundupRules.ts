// Bunny's roundups (owner, 31 Oct 2026: "can't we make notifications get AI capabilities, like a
// cluster of all PPE violations in a single notification"). The owner chose: the first problem of
// the day goes at once to whoever runs the place, then quiet; still going after 3 checks, a firmer
// one; the crew get a Bengali reminder after 2 bad checks in a row (or when the incharge taps Remind);
// the owner gets one roundup at 1 PM and 9 PM that Bunny writes from these facts. Pilot: camera
// PPE and the workplace photo checks. The sums are here (code counts, Bunny only words them):
//   node supabase/functions/make-server-c2dd9b9d/roundupRules.test.ts

export type PpeItem = 'cap' | 'gloves' | 'apron';
export type PpeCheck = {
  at: string; kind?: string; peopleCount: number; missing?: Partial<Record<PpeItem, number>> | null;
  missingBy?: { id?: number | null; items: PpeItem[] }[];
};
export type PpeDay = { streak: number; firstBadAt: string | null; lastReminderAt: string | null; reminders: string[]; stillAt: string[]; badAt: string[] };
export const emptyPpeDay = (): PpeDay => ({ streak: 0, firstBadAt: null, lastReminderAt: null, reminders: [], stillAt: [], badAt: [] });

export const REMIND_AFTER = 2;   // bad checks in a row before the crew are reminded
export const STILL_AFTER = 3;    // ... before the incharge and operations get a firmer alert
export const REMIND_GAP_MIN = 60;

/** A check that saw people with something clearly missing; null when nobody was in view. */
export function badCheck(c: PpeCheck): boolean | null {
  if (!c.peopleCount) return null;
  return Object.values(c.missing || {}).some((n) => (n || 0) > 0);
}

/**
 * What one scheduled check means for the day: the incharge told ('first' the day's first problem,
 * 'still' a run of STILL_AFTER, 'again' added to the day's row without a buzz), the crew reminded.
 */
export function ppeStep(day: PpeDay, check: PpeCheck, nowMs: number): { day: PpeDay; tell: 'first' | 'still' | 'again' | null; remindCrew: boolean } {
  const bad = badCheck(check);
  if (bad === null) return { day, tell: null, remindCrew: false };
  if (!bad) return { day: { ...day, streak: 0 }, tell: null, remindCrew: false };
  const streak = day.streak + 1;
  const first = !day.firstBadAt;
  const remind = streak >= REMIND_AFTER && (!day.lastReminderAt || nowMs - Date.parse(day.lastReminderAt) >= REMIND_GAP_MIN * 60000);
  const tell = first ? 'first' : streak === STILL_AFTER ? 'still' : 'again';
  const next: PpeDay = {
    ...day, streak, firstBadAt: day.firstBadAt || check.at, badAt: [...day.badAt, check.at].slice(-40),
    ...(remind ? { lastReminderAt: check.at, reminders: [...day.reminders, check.at] } : {}),
    ...(tell === 'still' ? { stillAt: [...day.stillAt, check.at] } : {}),
  };
  return { day: next, tell, remindCrew: remind };
}

const clock = (iso: string) => {
  const d = new Date(Date.parse(iso) + 330 * 60000);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};

export type PpeFacts = {
  place: string; checks: number; bad: number; badTimes: string[]; worst: { at: string; people: number } | null;
  missingChecks: Partial<Record<PpeItem, number>>; people: { who: string; items: Partial<Record<PpeItem, number>> }[];
  longestRun: number; endsBad: boolean; reminders: number; falseAlarms: number; yesterdayBad: number | null;
};

/** One camera's day so far, from its checks (names: day number -> name, from Who is who). */
export function ppeFacts(o: { place: string; checks: PpeCheck[]; names?: Record<string, string>; reminders?: number; falseAlarms?: number; yesterdayBad?: number | null }): PpeFacts {
  const seen = o.checks.filter((c) => (c.kind || 'scheduled') === 'scheduled' && badCheck(c) !== null).sort((a, b) => a.at.localeCompare(b.at));
  const bads = seen.filter((c) => badCheck(c));
  const missingChecks: Partial<Record<PpeItem, number>> = {};
  const byWho = new Map<string, Partial<Record<PpeItem, number>>>();
  let run = 0;
  let longestRun = 0;
  let worst: PpeFacts['worst'] = null;
  for (const c of seen) {
    if (badCheck(c)) {
      run++;
      longestRun = Math.max(longestRun, run);
      const people = Math.max(0, ...Object.values(c.missing || {}).map((n) => n || 0));
      if (!worst || people > worst.people) worst = { at: clock(c.at), people };
      for (const item of Object.keys(c.missing || {}) as PpeItem[]) if ((c.missing![item] || 0) > 0) missingChecks[item] = (missingChecks[item] || 0) + 1;
      for (const m of c.missingBy || []) {
        if (m.id === undefined || m.id === null) continue;
        const who = o.names?.[`p${m.id}`] || `Person ${m.id}`;
        if (who === 'Not a person') continue; // an object the camera boxed (cameraPeople.ts)
        const cur = byWho.get(who) || {};
        for (const item of m.items) cur[item] = (cur[item] || 0) + 1;
        byWho.set(who, cur);
      }
    } else run = 0;
  }
  return {
    place: o.place, checks: seen.length, bad: bads.length, badTimes: bads.map((c) => clock(c.at)), worst, missingChecks,
    people: [...byWho.entries()].map(([who, items]) => ({ who, items })).sort((a, b) => sum(b.items) - sum(a.items)).slice(0, 6),
    longestRun, endsBad: seen.length > 0 && !!badCheck(seen[seen.length - 1]), reminders: o.reminders || 0, falseAlarms: o.falseAlarms || 0,
    yesterdayBad: o.yesterdayBad ?? null,
  };
}
const sum = (r: Partial<Record<PpeItem, number>>) => Object.values(r).reduce((a: number, b) => a + (b || 0), 0);

export type PhotoRow = {
  employeeId: string; name?: string; required?: number; done?: number; onTime?: number; locationKind?: string; locationId?: string;
  assigned?: { id: string; name: string; end?: string; locationId?: string; locationKind?: string }[];
  items?: Record<string, { name?: string; aiScore?: number; aiVerdict?: string; aiIssues?: string[]; flag?: { status?: string }; late?: boolean }>;
};
export type PhotoFacts = {
  place: string; required: number; done: number; onTime: number; missedTotal: number; missed: { item: string; who: string }[];
  dirty: { item: string; score: number; issue: string; who: string; fixed: boolean }[];
};

/** One place's photo checks so far today. A photo whose window is still open isn't missed yet. */
export function photoFacts(place: string, rows: PhotoRow[], nowHHMM: string): PhotoFacts {
  const f: PhotoFacts = { place, required: 0, done: 0, onTime: 0, missedTotal: 0, missed: [], dirty: [] };
  for (const r of rows) {
    f.required += r.required || 0;
    f.done += r.done || 0;
    f.onTime += r.onTime || 0;
    const who = r.name || r.employeeId;
    for (const a of r.assigned || []) {
      const it = r.items?.[a.id];
      if (!it && a.end && a.end < nowHHMM) f.missed.push({ item: a.name, who });
    }
    for (const it of Object.values(r.items || {})) {
      if (typeof it?.aiScore === 'number' && (it.aiScore < 6 || it.aiVerdict === 'needs_cleaning')) {
        f.dirty.push({ item: it.name || 'photo', score: it.aiScore, issue: String(it.aiIssues?.[0] || '').slice(0, 80), who, fixed: it.flag?.status === 'ok' || it.flag?.status === 'cleaned' });
      }
    }
  }
  f.missedTotal = f.missed.length;
  f.missed = f.missed.slice(0, 8); // the first few by name; missedTotal has them all
  f.dirty = f.dirty.sort((a, b) => a.score - b.score).slice(0, 6);
  return f;
}

/** Anything worth the owner's attention in the facts (a quiet day gets one short line at night). */
export const worthTelling = (ppe: PpeFacts[], photos: PhotoFacts[]) =>
  ppe.some((p) => p.bad > 0) || photos.some((p) => p.missedTotal > 0 || p.dirty.some((d) => !d.fixed));

/** The roundup without Bunny: plain lines from the same facts. */
export function plainRoundup(ppe: PpeFacts[], photos: PhotoFacts[]): { headline: string; lines: string[] } {
  const lines: string[] = [];
  for (const p of ppe) {
    if (!p.bad) continue;
    const items = (Object.keys(p.missingChecks) as PpeItem[]).join(', ');
    lines.push(`${p.place}: ${items || 'PPE'} missing in ${p.bad} of ${p.checks} camera checks (${p.badTimes.slice(-3).join(', ')})${p.endsBad ? ', still at the last check' : ''}.`);
  }
  for (const f of photos) {
    if (f.missedTotal) lines.push(`${f.place}: ${f.missedTotal} of ${f.required} photo checks missed (${f.missed.slice(0, 3).map((m) => m.item).join(', ')}${f.missedTotal > 3 ? '…' : ''}).`);
    const open = f.dirty.filter((d) => !d.fixed);
    if (open.length) lines.push(`${f.place}: ${open.map((d) => `${d.item} ${d.score}/10`).join(', ')} need cleaning.`);
  }
  const bad = ppe.reduce((s, p) => s + p.bad, 0);
  const missed = photos.reduce((s, f) => s + f.missedTotal, 0);
  const headline = lines.length ? [bad ? `${bad} PPE miss${bad === 1 ? '' : 'es'}` : '', missed ? `${missed} photo${missed === 1 ? '' : 's'} missed` : ''].filter(Boolean).join(', ') || 'Things to look at' : 'All clear';
  return { headline, lines: lines.length ? lines.slice(0, 5) : ['Caps, aprons and photo checks all fine so far.'] };
}
