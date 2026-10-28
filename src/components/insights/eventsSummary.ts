// Event totals for Insights (Store | Production | Events). The Events feature serves
// GET /events/summary?from&to with the business totals across events for a window (server
// events.ts, summarizeEvents in utils/eventRules.ts). For people it isn't meant for it answers
// 403, and an older server 404 - either way, and with no events in the window, Insights shows no
// Events choice and adds nothing.
import { useEffect, useState } from 'react';
import { API_BASE } from '../../utils/api';
import { requestRaw } from '../../utils/http';

export type EventSummaryRow = { id: string; name: string; status: string; startDate: string; endDate: string; sales: number; costs: number; profit: number };
export type EventSummary = {
  from: string | null;
  to: string | null;
  sales: number;
  costs: number;
  profit: number;
  /** Momos sent, less those returned to production and those wasted. */
  momoCost: number;
  /** Momos written off at the stall, at the cost per piece. */
  wastage: number;
  itemsCost: number;
  expenses: number;
  rent: number;
  commission: number;
  events: EventSummaryRow[];
  byDate: { date: string; sales: number; costs: number; profit: number }[];
};

export type EventsSummaryState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'ready'; summary: EventSummary };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** Reads the server's answer defensively: missing numbers count as 0, odd rows are dropped. */
export function parseEventSummary(body: any): EventSummary | null {
  const s = body?.summary ?? body;
  if (!s || typeof s !== 'object') return null;
  const events = Array.isArray(s.events) ? s.events : [];
  const byDate = Array.isArray(s.byDate) ? s.byDate : [];
  return {
    from: s.from ?? null,
    to: s.to ?? null,
    sales: num(s.sales),
    costs: num(s.costs),
    profit: num(s.profit),
    momoCost: num(s.momoCost),
    wastage: num(s.wastage),
    itemsCost: num(s.itemsCost),
    expenses: num(s.expenses),
    rent: num(s.rent),
    commission: num(s.commission),
    events: events
      .filter((e: any) => e && e.id)
      .map((e: any) => ({ id: String(e.id), name: String(e.name || 'Event'), status: String(e.status || ''), startDate: String(e.startDate || ''), endDate: String(e.endDate || ''), sales: num(e.sales), costs: num(e.costs), profit: num(e.profit) })),
    byDate: byDate
      .filter((r: any) => r && typeof r.date === 'string')
      .map((r: any) => ({ date: r.date, sales: num(r.sales), costs: num(r.costs), profit: num(r.profit) })),
  };
}

const cache = new Map<string, { at: number; value: EventSummary | null }>();
const CACHE_MS = 60_000;

/** The events summary for a window, or null when the route isn't there / isn't for this person. */
export async function fetchEventsSummary(from: string, to: string): Promise<EventSummary | null> {
  const key = `${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value: EventSummary | null = null;
  try {
    const query = new URLSearchParams({ from, to }).toString();
    const response = await requestRaw(`${API_BASE}/events/summary?${query}`, { headers: { 'Content-Type': 'application/json' } });
    if (response.ok && response.text) value = parseEventSummary(JSON.parse(response.text));
  } catch {
    value = null; // offline or not deployed yet: no Events choice
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Is there anything to show (the route answered and at least one event falls in the window)? */
export const hasEvents = (state: EventsSummaryState | undefined) => state?.status === 'ready' && state.summary.events.length > 0;

/** Events summary for Insights; `enabled` false skips the request entirely. */
export function useEventsSummary(from: string | null, to: string | null, enabled: boolean): EventsSummaryState {
  const [state, setState] = useState<EventsSummaryState>({ status: enabled ? 'loading' : 'none' });
  useEffect(() => {
    if (!enabled || !from || !to) {
      setState({ status: 'none' });
      return;
    }
    let alive = true;
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    fetchEventsSummary(from, to).then((summary) => {
      if (!alive) return;
      // 'ready' with no events still counts as "the route answered": Insights hides the Events
      // choice then, unless that view is already open (it shows its empty state instead).
      setState(summary ? { status: 'ready', summary } : { status: 'none' });
    });
    return () => { alive = false; };
  }, [from, to, enabled]);
  return state;
}
