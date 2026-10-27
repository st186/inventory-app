// The events outbox: an event's day close and expenses are saved on the phone first (IndexedDB)
// and sent from there, like the store's (utils/outbox.ts), so an entry made at a stall with no
// signal isn't lost.
//
// Why not the shared outbox: App.tsx lays every outbox entry that isn't an expense over the
// store's sales list as a waiting day close, so an event entry there would show up as a store
// sale. This one keeps its own entries (key prefix "event-outbox:", owner field `eventOwner`, which
// the shared outbox's owner filter never matches) and its own small sender.
//
// Both event writes are safe to repeat: the day close saves onto the day's one row and an expense
// uses the entry id as its row id (server events.ts), and the entry id also goes as the
// Idempotency-Key. So anything not refused (4xx) is simply sent again until it arrives.
import { idbDelete, idbEntries, idbSet } from './idbStore';
import { API_BASE, isNetworkError, isOnline, newIdempotencyKey, onConnectivity, parseJsonResponse, requestRaw } from './http';
import { currentAuthUserId } from './accessToken';

export type EventOutboxKind = 'event-day' | 'event-expense';
export interface EventOutboxEntry {
  id: string;
  eventOwner: string;
  kind: EventOutboxKind;
  eventId: string;
  method: 'PUT' | 'POST';
  path: string;
  body: Record<string, any>;
  label: string;
  coalesceKey?: string;
  createdAt: number;
  attempts: number;
  state: 'queued' | 'sending' | 'failed';
  lastError?: string;
}
export type EventSubmitResult = { status: 'sent'; response: any } | { status: 'kept'; entry: EventOutboxEntry };

const PREFIX = 'event-outbox:';
const SEND_TIMEOUT_MS = 30_000;
const FLUSH_EVERY_MS = 30_000;

let entries: EventOutboxEntry[] = [];
let loadedFor: string | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let wired = false;
let flushing: Promise<void> | null = null;

function notify() {
  entries = [...entries];
  listeners.forEach((l) => l());
  const waiting = entries.some((e) => e.state === 'queued');
  if (waiting && !timer) timer = setInterval(() => { void flush(); }, FLUSH_EVERY_MS);
  if (!waiting && timer) { clearInterval(timer); timer = null; }
}

async function ensureLoaded(): Promise<string | null> {
  const me = currentAuthUserId();
  if (!me) return null;
  if (loadedFor !== me) {
    const all = await idbEntries<EventOutboxEntry>('outbox', PREFIX);
    entries = all.map(([, e]) => e).filter((e) => e?.eventOwner === me).map((e) => (e.state === 'sending' ? { ...e, state: 'queued' as const } : e));
    loadedFor = me;
    notify();
  }
  if (!wired) {
    wired = true;
    onConnectivity((event) => { if (event !== 'offline') void flush(); });
  }
  return me;
}

const persist = (e: EventOutboxEntry) => idbSet('outbox', PREFIX + e.id, e);
async function drop(id: string) {
  entries = entries.filter((e) => e.id !== id);
  await idbDelete('outbox', PREFIX + id);
  notify();
}
async function patch(id: string, p: Partial<EventOutboxEntry>) {
  entries = entries.map((e) => (e.id === id ? { ...e, ...p } : e));
  const next = entries.find((e) => e.id === id);
  if (next) await persist(next);
  notify();
}

type SendOutcome = { status: 'sent'; response: any } | { status: 'kept' } | { status: 'refused'; error: Error };

async function send(entry: EventOutboxEntry): Promise<SendOutcome> {
  await patch(entry.id, { state: 'sending', attempts: entry.attempts + 1 });
  const target = `${API_BASE}${entry.path}`;
  try {
    const response = await requestRaw(target, {
      method: entry.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry.body),
    }, { idempotencyKey: entry.id, timeoutMs: SEND_TIMEOUT_MS, retries: 0 });
    if (response.ok) {
      let body: any = null;
      try { body = parseJsonResponse(target, response); } catch { body = null; }
      await drop(entry.id);
      return { status: 'sent', response: body };
    }
    let body: any = null;
    try { body = response.text ? JSON.parse(response.text) : null; } catch { body = null; }
    const message = (body && (body.error || body.message)) || `HTTP ${response.status}`;
    // Not done: sign-in renewal, rate limits, server trouble - safe to send again later.
    if (response.status === 401 || response.status === 408 || response.status === 429 || response.status >= 500 || body?.code === 'IDEMPOTENCY_IN_PROGRESS') {
      await patch(entry.id, { state: 'queued', lastError: message });
      return { status: 'kept' };
    }
    return { status: 'refused', error: Object.assign(new Error(message), { status: response.status, details: body }) };
  } catch (error) {
    await patch(entry.id, { state: 'queued', lastError: isNetworkError(error) ? 'No signal - will send when back online' : String((error as Error)?.message || error) });
    return { status: 'kept' };
  }
}

// Saves an entry on the phone and sends it straight away when there is a signal. Resolves 'sent'
// with the server's answer or 'kept' (waiting); throws the server's refusal (the form keeps what
// was typed and shows the reason).
export async function submitEventEntry(input: Omit<EventOutboxEntry, 'id' | 'eventOwner' | 'createdAt' | 'attempts' | 'state'> & { id?: string }): Promise<EventSubmitResult> {
  const me = await ensureLoaded();
  if (!me) throw new Error('Not signed in');
  if (input.coalesceKey) {
    for (const old of entries.filter((e) => e.coalesceKey === input.coalesceKey && e.state !== 'sending')) await drop(old.id);
  }
  const id = input.id || newIdempotencyKey();
  const entry: EventOutboxEntry = {
    ...input, id, eventOwner: me, body: { ...input.body, clientEntryId: id }, createdAt: Date.now(), attempts: 0, state: 'queued',
  };
  entries = [...entries, entry];
  await persist(entry);
  notify();
  if (!isOnline()) return { status: 'kept', entry };
  const outcome = await send(entry);
  if (outcome.status === 'sent') return { status: 'sent', response: outcome.response };
  if (outcome.status === 'refused') {
    await drop(id);
    throw outcome.error;
  }
  return { status: 'kept', entry: entries.find((e) => e.id === id) || entry };
}

// Sends whatever is waiting; stops at the first entry that couldn't go (no signal).
export function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const me = await ensureLoaded();
    if (!me) return;
    for (const entry of entries.filter((e) => e.state === 'queued')) {
      const outcome = await send(entry);
      if (outcome.status === 'kept') break;
      if (outcome.status === 'refused') await patch(entry.id, { state: 'failed', lastError: outcome.error.message });
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

export function subscribeEventOutbox(listener: () => void): () => void {
  listeners.add(listener);
  void ensureLoaded();
  return () => { listeners.delete(listener); };
}
export const eventOutboxEntries = (): readonly EventOutboxEntry[] => entries;
export async function removeEventEntry(id: string) { await drop(id); }
