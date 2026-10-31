// Handing a workplace check to someone else from a set day (owner, 30 Oct 2026: Vijay's morning checks
// handed to Aniket). The change starts on its day, so today's checks - maybe half done - stay with
// whoever has them, and nobody is told they "missed" a window that closed before they had it.
// Tested with plain node:  node supabase/functions/make-server-c2dd9b9d/workplaceHandover.test.ts

export type Handover = { to: string; from: string; coverId?: string | null };
type Holding = { assigneeId: string | null; coverId?: string | null; handover?: Handover };

/** Who has a check on a date, and who stands in when they're on leave. */
export function holderOn(it: Holding, date: string): { assigneeId: string | null; coverId: string | null } {
  if (it.handover && date >= it.handover.from) return { assigneeId: it.handover.to, coverId: it.handover.coverId ?? null };
  return { assigneeId: it.assigneeId, coverId: it.coverId ?? null };
}

/** The checklist with handovers that have started written in (what the checklist screen shows). */
export function settled<I extends Holding, T extends { items: I[] }>(t: T, today: string): T {
  if (!t.items.some((it) => it.handover && today >= it.handover.from)) return t;
  return {
    ...t,
    items: t.items.map((it) => {
      if (!it.handover || today < it.handover.from) return it;
      const { handover: _h, ...rest } = it;
      const h = holderOn(it, today);
      return { ...rest, assigneeId: h.assigneeId, coverId: h.coverId } as I;
    }),
  };
}
