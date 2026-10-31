// Leftover stuffing at the day's close, and stuffing made while yesterday's was still there (owner,
// 29 Oct 2026: "leftover should be immediately flagged to operation manager and also owner with
// proper reasoning", "why so much stuffing was prepared even when there was stuffing left").
// index.ts uses these when a batch is logged and when the day is closed; the flags go out through
// productionReview.ts flagLedgerDay. Kept apart so it can be tested with plain node:
//   node supabase/functions/make-server-c2dd9b9d/leftoverRules.test.ts

export const LEFTOVER_MIN_KG = 0.5; // this much stuffing or coating left needs a reason (and is flagged)

export type PoolState = { opening: number; prepared: number; closingActual: number | null };

const TYPE_LABEL: Record<string, string> = {
  chicken: 'Chicken', chickenCheese: 'Chicken cheese', veg: 'Veg', cheeseCorn: 'Cheese corn', paneer: 'Paneer',
  vegKurkure: 'Veg kurkure', chickenKurkure: 'Chicken kurkure',
};
const MOMO_KEY: Record<string, string> = {
  chicken: 'chickenMomos', chickenCheese: 'chickenCheeseMomos', veg: 'vegMomos', cheeseCorn: 'cheeseCornMomos', paneer: 'paneerMomos',
  vegKurkure: 'vegKurkureMomos', chickenKurkure: 'chickenKurkureMomos',
};

/** "Chicken stuffing", "Dough", "Cheese corn dough". */
export function poolLabel(id: string): string {
  if (id === 'dough') return 'Dough';
  if (id === 'batter') return 'Batter';
  const [field, type] = id.split(':');
  return `${TYPE_LABEL[type] || type} ${field}`;
}
export const isStuffingPool = (id: string) => /^(stuffing|coating):/.test(id);
const kg = (n: number) => `${Math.round(n * 100) / 100} kg`;

/** Pools with something to account for at the close: carried over or made today. */
export const relevantPools = (pools: Record<string, PoolState>) =>
  Object.keys(pools).filter((id) => (pools[id]?.opening || 0) > 0.005 || (pools[id]?.prepared || 0) > 0.005);

/** Pools that must be counted but weren't (a blank one used to carry on as if none was used). */
export const uncountedPools = (pools: Record<string, PoolState>, closing: Record<string, unknown>) =>
  relevantPools(pools).filter((id) => typeof closing[id] !== 'number');

/**
 * Pieces a kg of each type's stuffing / coating makes, from the house's recent closed days (the
 * median of pieces made / kg used, on days with at least 1 kg used).
 */
export function piecesPerKg(days: { pools: Record<string, PoolState>; pieces: Record<string, number> }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const type of Object.keys(MOMO_KEY)) {
    const id = `${type.endsWith('Kurkure') ? 'coating' : 'stuffing'}:${type}`;
    const ratios = days.map((d) => {
      const p = d.pools[id];
      if (!p || typeof p.closingActual !== 'number') return NaN;
      const used = (p.opening || 0) + (p.prepared || 0) - p.closingActual;
      const pieces = d.pieces[MOMO_KEY[type]] || 0;
      return used >= 1 && pieces > 0 ? pieces / used : NaN;
    }).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (ratios.length) out[type] = Math.round(ratios[Math.floor((ratios.length - 1) / 2)]);
  }
  // The dough, cheese corn's own dough (owner, 31 Oct 2026: "corn cheese dough is different from
  // the rest") and the kurkure batter, the same way.
  const shared: Record<string, string[]> = { dough: ['chicken', 'chickenCheese', 'veg', 'paneer'], 'dough:cheeseCorn': ['cheeseCorn'], batter: ['vegKurkure', 'chickenKurkure'] };
  for (const [pool, types] of Object.entries(shared)) {
    const ratios = days.map((d) => {
      const p = d.pools[pool];
      if (!p || typeof p.closingActual !== 'number') return NaN;
      const used = (p.opening || 0) + (p.prepared || 0) - p.closingActual;
      const pieces = types.reduce((s, t) => s + (d.pieces[MOMO_KEY[t]] || 0), 0);
      return used >= 1 && pieces > 0 ? pieces / used : NaN;
    }).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (ratios.length) out[pool] = Math.round(ratios[Math.floor((ratios.length - 1) / 2)]);
  }
  return out;
}

/**
 * One line per stuffing / coating pool with more than a little left:
 * "Chicken stuffing: 10 kg left of 17.68 kg (8.88 kg from yesterday + 8.8 kg made today); 7.68 kg
 * used for 710 momos. 10 kg is about 920 momos. 8.8 kg was made while 8.88 kg from yesterday was
 * still there."
 */
export function leftoverLines(pools: Record<string, PoolState>, pieces: Record<string, number>, perKg: Record<string, number>): string[] {
  const lines: string[] = [];
  for (const [id, p] of Object.entries(pools)) {
    if (!isStuffingPool(id) || typeof p?.closingActual !== 'number' || p.closingActual < LEFTOVER_MIN_KG) continue;
    const type = id.split(':')[1];
    const start = (p.opening || 0) + (p.prepared || 0);
    const used = Math.max(0, start - p.closingActual);
    const made = pieces[MOMO_KEY[type]] || 0;
    const parts = [
      `${poolLabel(id)}: ${kg(p.closingActual)} left of ${kg(start)} (${kg(p.opening || 0)} from yesterday + ${kg(p.prepared || 0)} made today)`,
      `; ${kg(used)} used${made ? ` for ${made.toLocaleString('en-IN')} momos` : ''}.`,
    ];
    const per = perKg[type] || (made && used >= 1 ? made / used : 0);
    if (per) parts.push(` ${kg(p.closingActual)} is about ${(Math.round((p.closingActual * per) / 10) * 10).toLocaleString('en-IN')} momos.`);
    if ((p.opening || 0) >= LEFTOVER_MIN_KG && (p.prepared || 0) > 0) parts.push(` ${kg(p.prepared)} was made while ${kg(p.opening)} from yesterday was still there.`);
    lines.push(parts.join(''));
  }
  return lines;
}

// ---- Why the stuffing was left over: the checklist (app LeftoverReasons.tsx) ----

export const OVER_PREPARED_CAUSES = ['no_plan_check', 'no_leftover_check', 'told', 'batch_size'] as const;
const CAUSE_TEXT: Record<string, string> = {
  no_plan_check: "didn't check today's plan", no_leftover_check: "didn't check what was left from yesterday",
  told: 'told to make extra', batch_size: 'the recipe batch is a fixed size',
};
// 'fridge': thawed in the fridge overnight, ready first thing (frozen stuffing takes 4-5 hours).
export const LEFTOVER_PLANS = ['fridge', 'use_first', 'discard', 'freezer'] as const;
const PLAN_TEXT: Record<string, string> = {
  fridge: 'in the fridge to thaw for tomorrow', use_first: 'used first tomorrow (less fresh stuffing made)', discard: 'thrown away (not fit to use)', freezer: 'kept in the freezer',
};
const KIND_TEXT: Record<string, string> = {
  power_cut: 'Power cut', late_start: 'Late start', long_break: 'Break went too long', machine: 'Machine broke down',
  low_demand: 'Stores asked for fewer momos', planned: 'Made ahead for tomorrow', short_staff: 'Short of staff',
  over_prepared: 'Made more than the plan needed', old_not_used: "Fresh stuffing used before yesterday's",
  slow_folding: 'Folding was slower than usual', dough_problem: "Dough ran out or didn't work", other: 'Other',
};
/** Notes shorter than this don't explain anything ("Over time"). */
export const NOTE_MIN: Record<string, number> = { other: 30, old_not_used: 10, slow_folding: 10, dough_problem: 10, planned: 5, short_staff: 3 };

/** Checks the reasons for the kinds added on 29 Oct; null when fine, else what is missing. */
export function checkNewReason(kind: string, x: any): string | null {
  const note = typeof x?.note === 'string' ? x.note.trim() : '';
  if (kind === 'over_prepared') {
    const causes = (Array.isArray(x?.causes) ? x.causes : []).filter((c: string) => (OVER_PREPARED_CAUSES as readonly string[]).includes(c));
    if (!causes.length) return 'Made more than the plan needed: say why';
    if (causes.includes('told') && String(x?.who || '').trim().length < 2) return 'Made more than the plan needed: say who told you to make extra';
    return null;
  }
  const min = NOTE_MIN[kind];
  if (min && note.length < min) {
    return kind === 'other'
      ? 'Other: describe what happened in a full sentence - which stuffing, why it was not used, what went wrong'
      : `${KIND_TEXT[kind]}: write what happened`;
  }
  return null;
}

/** "Made more than the plan needed (didn't check what was left from yesterday); Other: ...". */
export function reasonsText(report: any): string {
  const parts = (report?.reasons || []).map((r: any) => {
    const head = KIND_TEXT[r.kind] || r.kind;
    let detail = '';
    if (r.kind === 'over_prepared') detail = [(r.causes || []).map((c: string) => CAUSE_TEXT[c] || c).join(', '), r.who ? `told by ${r.who}` : '', r.note].filter(Boolean).join('; ');
    else if (r.kind === 'power_cut') detail = (r.periods || []).map((p: any) => `${p.from}-${p.to}`).join(', ');
    else if (r.kind === 'late_start') detail = [r.startedAt ? `started ${r.startedAt}` : '', r.why].filter(Boolean).join('; ');
    else if (r.kind === 'long_break') detail = (r.entries || []).map((e: any) => [e.name, e.minutes ? `${e.minutes} min over` : '', e.why].filter(Boolean).join(' ')).join('; ');
    else if (r.kind === 'machine') detail = [r.machine, r.alternative ? `used ${r.alternative}` : ''].filter(Boolean).join('; ');
    else detail = [(r.people || []).map((p: any) => p.name).join(', '), r.note].filter(Boolean).join('; ');
    return detail ? `${head} (${detail})` : head;
  });
  const plan = report?.plan ? ` What happens to it: ${PLAN_TEXT[report.plan] || report.plan}.` : '';
  return `${parts.length ? `Reasons given${report?.by ? ` by ${report.by}` : ''}: ${parts.join('; ')}.` : 'No reason given.'}${plan}`;
}

// ---- Stuffing made while yesterday's was still there (app PrepareLineItemForm) ----

export const WITH_LEFTOVER_REASONS = ['not_enough', 'not_fit', 'for_tomorrow', 'told', 'other'] as const;
const WITH_LEFTOVER_TEXT: Record<string, string> = {
  not_enough: "today's plan needs more than what was left", not_fit: "yesterday's isn't fit to use",
  for_tomorrow: 'making ahead for tomorrow', told: 'told to make it', other: 'other',
};

/** The reason sent with a batch made while yesterday's was still there, tidied; or an error. */
export function cleanWithLeftover(raw: any): { value?: { reason: string; who: string; note: string }; error?: string } {
  const reason = String(raw?.reason || '');
  if (!(WITH_LEFTOVER_REASONS as readonly string[]).includes(reason)) return { error: "Yesterday's stuffing is still there: say why you are making more" };
  const who = String(raw?.who || '').trim().slice(0, 60);
  const note = String(raw?.note || '').trim().slice(0, 300);
  if ((reason === 'told' || reason === 'for_tomorrow') && who.length < 2) return { error: reason === 'told' ? 'Say who told you to make it' : 'Say who decided to make it ahead' };
  if (reason === 'not_fit' && note.length < 5) return { error: "Say what is wrong with yesterday's stuffing" };
  if (reason === 'other' && note.length < 20) return { error: 'Describe why more is being made in a full sentence' };
  return { value: { reason, who, note } };
}

/** One line per batch made while yesterday's was still there, for the flag. */
export function withLeftoverLines(items: { pool: string; kg: number; openingKg: number; at: string; by: string; withLeftover: { reason: string; who?: string; note?: string } }[]): string[] {
  return items.map((i) => {
    const r = i.withLeftover;
    const why = [WITH_LEFTOVER_TEXT[r.reason] || r.reason, r.who ? `(${r.who})` : '', r.note].filter(Boolean).join(' ');
    return `${i.by} made ${kg(i.kg)} ${poolLabel(i.pool).toLowerCase()} at ${i.at} while ${kg(i.openingKg)} from yesterday was there. Reason: ${why}.`;
  });
}

