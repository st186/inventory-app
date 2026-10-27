// The offline outbox: expenses (quick add, purchases, fixed costs) and the day close are saved on the
// phone first (IndexedDB) and sent from there, so an entry made with no signal isn't lost and an
// entry is never sent twice in effect.
//
// - Every entry gets a client id, sent as the Idempotency-Key header (when the server advertises
//   idempotency-v1, it turns a repeat into the stored first answer) and as `clientEntryId` in the
//   body (the server keeps unknown fields, so a later list download shows whether it arrived).
// - Sent automatically when the signal is back (online / app resume / server reachable again, and
//   every 30 s while anything waits). An entry never attempted is always safe to send.
// - An attempt that may or may not have reached the server (the signal dropped mid-request) is
//   "unsure". The day close is safe to repeat (the server saves onto the day's row), so it is just
//   sent again. An expense is a new row each time: it is resent automatically only when the server
//   dedupes (idempotency-v1); otherwise it waits for a person to tap "Send now" - unless a later
//   download shows it did arrive, which clears it (reconcile()).
// - A refusal (4xx) stops: the entry is shown with the server's reason until someone removes it.
//
// Entries belong to the person who made them and are only sent while that person is signed in.

import { idbDelete, idbEntries, idbGet, idbSet } from './idbStore';
import {
  API_BASE, hasFeature, isNetworkError, isOnline, newIdempotencyKey, onConnectivity, parseJsonResponse,
  requestRaw, whenFeaturesKnown,
} from './http';
import { currentAuthUserId } from './accessToken';

export type OutboxKind = 'inventory' | 'overhead' | 'fixed-cost' | 'sales';
export type OutboxState = 'queued' | 'sending' | 'unsure' | 'failed';

export interface OutboxEntry {
  id: string; // client id: Idempotency-Key, and clientEntryId in the body
  owner: string; // auth user id of the person who made it
  kind: OutboxKind;
  method: 'POST' | 'PUT';
  path: string; // e.g. '/inventory', '/sales/<id>'
  body: Record<string, any>;
  label: string; // "₹450 · Chicken" for the waiting list
  coalesceKey?: string; // a newer save with the same key replaces this one (one day close per store+date)
  createdAt: number;
  state: OutboxState;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  notOnServer?: boolean; // unsure, and a full download made well after the attempt doesn't have it
}

export interface OutboxInput {
  kind: OutboxKind;
  method: 'POST' | 'PUT';
  path: string;
  body: Record<string, any>;
  label: string;
  coalesceKey?: string;
}

export type SubmitResult = { status: 'sent'; entry: OutboxEntry; response: any } | { status: 'kept'; entry: OutboxEntry };

// Provisional rows on screen use this id prefix (see App.tsx) - edits and deletes of such a row
// change the outbox entry instead of calling the server.
export const PENDING_PREFIX = 'pending:';
export const isPendingId = (id: string | null | undefined): boolean => !!id && id.startsWith(PENDING_PREFIX);
export const entryIdOf = (rowId: string): string => rowId.slice(PENDING_PREFIX.length);

const SEND_TIMEOUT_MS = 30_000;
const FLUSH_EVERY_MS = 30_000;
const MAX_AUTO_ATTEMPTS = 8;
// The longest a request can run on the server (Supabase edge functions stop at 150 s): a download
// that starts later than this after an attempt shows everything that attempt could have saved.
const SERVER_MAX_RUN_MS = 150_000;

let owner: string | null = null;
let entries: OutboxEntry[] = []; // this person's, oldest first
let snapshot: readonly OutboxEntry[] = [];
const listeners = new Set<() => void>();
const sentListeners = new Set<(entry: OutboxEntry, response: any) => void>();
const sendingNow = new Set<string>();
let flushTimer: ReturnType<typeof setInterval> | null = null;
let wired = false;

function notify() {
  snapshot = [...entries];
  listeners.forEach((listener) => listener());
  scheduleFlushes();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getEntries(): readonly OutboxEntry[] {
  return snapshot;
}

// Called when an entry reached the server (from any path: the first try, a flush, "Send now"),
// with the server's answer - App.tsx puts the saved row on screen.
export function onSent(listener: (entry: OutboxEntry, response: any) => void): () => void {
  sentListeners.add(listener);
  return () => { sentListeners.delete(listener); };
}

const safeToRepeat = (entry: OutboxEntry) => entry.kind === 'sales' || hasFeature('idempotency-v1');

// Entries whose last write to the phone's storage failed (storage full): they still send this
// session, and their absence from storage doesn't mean another tab sent them.
const notDurable = new Set<string>();
// Entries whose first send (straight after saving) hasn't started yet - a flush leaves them alone.
const firstSendPending = new Set<string>();

async function persist(entry: OutboxEntry) {
  if (await idbSet('outbox', entry.id, entry)) notDurable.delete(entry.id);
  else notDurable.add(entry.id);
}

function replaceLocal(entry: OutboxEntry) {
  entries = entries.map((e) => (e.id === entry.id ? entry : e));
}

async function update(id: string, patch: Partial<OutboxEntry>): Promise<OutboxEntry | null> {
  const current = entries.find((e) => e.id === id);
  if (!current) return null;
  const next = { ...current, ...patch };
  replaceLocal(next);
  await persist(next);
  notify();
  return next;
}

async function drop(id: string) {
  entries = entries.filter((e) => e.id !== id);
  notDurable.delete(id);
  await idbDelete('outbox', id);
  notify();
}

// Whose entries are shown and sent: the signed-in person's auth id, or null after sign-out.
export async function setOwner(authUserId: string | null): Promise<void> {
  owner = authUserId;
  if (!authUserId) {
    entries = [];
    notify();
    return;
  }
  wire();
  const all = await idbEntries<OutboxEntry>('outbox');
  if (owner !== authUserId) return;
  entries = all.map(([, e]) => e).filter((e) => e?.owner === authUserId).sort((a, b) => a.createdAt - b.createdAt);
  notify();
  flush();
}

function wire() {
  if (wired) return;
  wired = true;
  onConnectivity((event) => {
    if (event !== 'offline') flush();
  });
}

function scheduleFlushes() {
  const waiting = entries.some((e) => e.state === 'queued' || (e.state === 'unsure' && safeToRepeat(e)));
  if (waiting && !flushTimer) {
    flushTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') flush();
    }, FLUSH_EVERY_MS);
  } else if (!waiting && flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

// One send at a time, across tabs too where the browser supports it - two tabs must not both send
// the same entry.
let localLock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
  if (locks?.request) return locks.request('bunny-outbox', fn);
  const run = localLock.then(fn, fn);
  localLock = run.catch(() => undefined);
  return run;
}

// Entries left "sending" by an app that was closed mid-request: nobody knows if they arrived.
async function recoverInterrupted() {
  for (const entry of entries) {
    if (entry.state !== 'sending' || sendingNow.has(entry.id)) continue;
    await update(entry.id, { state: safeToRepeat(entry) ? 'queued' : 'unsure', lastError: 'The app was closed while this was being sent.' });
  }
}

type SendMode = 'first' | 'auto' | 'manual';
type SendOutcome =
  | { status: 'sent'; entry: OutboxEntry; response: any }
  | { status: 'kept'; entry: OutboxEntry; network: boolean }
  | { status: 'refused'; entry: OutboxEntry; error: Error }
  | { status: 'gone' };

async function sendEntry(id: string, mode: SendMode): Promise<SendOutcome> {
  return withLock(async () => {
    // Re-read inside the lock: another tab may have sent (and removed) it meanwhile.
    const stored = await idbGet<OutboxEntry>('outbox', id);
    const local = entries.find((e) => e.id === id);
    if (!local) return { status: 'gone' } as SendOutcome;
    if (!stored && !notDurable.has(id)) {
      await drop(id);
      return { status: 'gone' } as SendOutcome;
    }
    if (stored && stored.state !== local.state) replaceLocal(stored);
    let entry = entries.find((e) => e.id === id)!;
    if (entry.owner !== currentAuthUserId()) return { status: 'kept', entry, network: false } as SendOutcome;
    if (mode === 'auto' && (entry.state === 'failed' || (entry.state === 'unsure' && !safeToRepeat(entry)))) {
      return { status: 'kept', entry, network: false } as SendOutcome;
    }

    sendingNow.add(id);
    entry = (await update(id, { state: 'sending', attempts: entry.attempts + 1, lastAttemptAt: Date.now(), notOnServer: false }))!;
    const url = `${API_BASE}${entry.path}`;
    try {
      const response = await requestRaw(url, {
        method: entry.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.body),
      }, { idempotencyKey: entry.id, timeoutMs: SEND_TIMEOUT_MS });

      if (response.ok) {
        let json: any = null;
        try { json = parseJsonResponse(url, response); } catch { json = null; }
        await drop(id);
        sentListeners.forEach((listener) => {
          try { listener(entry, json); } catch (error) { console.error('Outbox sent-listener failed:', error); }
        });
        return { status: 'sent', entry, response: json } as SendOutcome;
      }

      let body: any = null;
      try { body = response.text ? JSON.parse(response.text) : null; } catch { body = null; }
      const message = (body && (body.error || body.message)) || `HTTP ${response.status}`;
      // Login trouble (renewal pending, password expired): the server did nothing - try again later.
      if (response.status === 401 || (response.status === 403 && body?.code === 'PASSWORD_EXPIRED')) {
        const kept = await update(id, { state: 'queued', lastError: 'Waiting for you to sign in again.' });
        return { status: 'kept', entry: kept!, network: false } as SendOutcome;
      }
      // Busy / rate limited: not processed. A server error may have saved part of it.
      if (response.status === 408 || response.status === 429 || response.status >= 500) {
        const processed = response.status >= 500;
        const tooMany = entry.attempts >= MAX_AUTO_ATTEMPTS;
        const state: OutboxState = tooMany ? 'failed' : (!processed || safeToRepeat(entry) ? 'queued' : 'unsure');
        const kept = await update(id, { state, lastError: tooMany ? `The server keeps failing on this entry (${message}).` : message });
        return { status: 'kept', entry: kept!, network: false } as SendOutcome;
      }
      // Refused (4xx): someone has to fix or remove it. On the first try the form shows the reason
      // and keeps what was typed, so nothing is left in the outbox.
      const error = Object.assign(new Error(message), { status: response.status, details: body });
      if (mode === 'first') {
        await drop(id);
      } else {
        await update(id, { state: 'failed', lastError: message });
      }
      return { status: 'refused', entry, error } as SendOutcome;
    } catch (error) {
      const network = isNetworkError(error);
      const kept = await update(id, {
        state: safeToRepeat(entry) ? 'queued' : 'unsure',
        lastError: error instanceof Error ? error.message : String(error),
      });
      return { status: 'kept', entry: kept!, network } as SendOutcome;
    } finally {
      sendingNow.delete(id);
    }
  });
}

// Saves an entry: on the phone first, then straight to the server if there is a signal. Resolves
// 'sent' (with the server's answer) or 'kept' (waiting to send); throws the server's refusal.
export async function submit(input: OutboxInput): Promise<SubmitResult> {
  const me = owner || currentAuthUserId();
  if (!me) throw new Error('Not signed in');
  if (owner !== me) await setOwner(me);

  // A newer day close for the same store and date replaces the waiting one.
  if (input.coalesceKey) {
    for (const old of entries.filter((e) => e.coalesceKey === input.coalesceKey && e.state !== 'sending')) {
      await drop(old.id);
    }
  }
  const id = newIdempotencyKey();
  const entry: OutboxEntry = {
    id,
    owner: me,
    kind: input.kind,
    method: input.method,
    path: input.path,
    body: { ...input.body, clientEntryId: id },
    label: input.label,
    coalesceKey: input.coalesceKey,
    createdAt: Date.now(),
    state: 'queued',
    attempts: 0,
  };
  entries = [...entries, entry];
  if (!isOnline()) {
    await persist(entry);
    notify();
    return { status: 'kept', entry };
  }
  firstSendPending.add(id);
  try {
    await persist(entry);
    notify();
    await whenFeaturesKnown(2_000);
    const outcome = await sendEntry(id, 'first');
    if (outcome.status === 'sent') return { status: 'sent', entry: outcome.entry, response: outcome.response };
    if (outcome.status === 'refused') throw outcome.error;
    // Gone: another tab sent it meanwhile (its row arrives with the next refresh).
    if (outcome.status === 'gone') return { status: 'sent', entry, response: null };
    return { status: 'kept', entry: outcome.entry };
  } finally {
    firstSendPending.delete(id);
  }
}

// Sends what is waiting. Stops at the first network failure (no signal - try again later).
let flushing: Promise<void> | null = null;
export function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    if (!owner || !isOnline() || entries.length === 0) return;
    await whenFeaturesKnown(3_000);
    await withLock(recoverInterrupted);
    for (const entry of [...entries]) {
      if (entry.owner !== owner || firstSendPending.has(entry.id)) continue;
      if (!(entry.state === 'queued' || (entry.state === 'unsure' && safeToRepeat(entry)))) continue;
      const outcome = await sendEntry(entry.id, 'auto');
      if (outcome.status === 'kept' && outcome.network) break;
    }
  })().catch((error) => {
    console.error('Outbox flush failed:', error);
  }).finally(() => { flushing = null; });
  return flushing;
}

// "Send now" on an entry waiting, unsure or refused.
export async function sendManually(id: string): Promise<SendOutcome> {
  return sendEntry(id, 'manual');
}

// Edits a waiting entry (its provisional row was edited on screen).
export async function updateBody(id: string, body: Record<string, any>): Promise<void> {
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error('This entry has already been sent - refresh and edit it again.');
  if (entry.state === 'sending' || sendingNow.has(id)) throw new Error('This entry is being sent right now - try again in a moment.');
  await update(id, { body: { ...body, clientEntryId: entry.id }, state: entry.state === 'failed' ? 'queued' : entry.state, lastError: undefined });
}

// Removes an entry without sending it.
export async function removeEntry(id: string): Promise<void> {
  if (sendingNow.has(id)) throw new Error('This entry is being sent right now - try again in a moment.');
  await drop(id);
}

export function waitingCount(): number {
  return entries.length;
}

// A fresh download from the server: entries whose clientEntryId is in it did arrive (clears an
// unsure one). An unsure entry missing from a complete download that started well after the attempt
// is marked as not on the server, so "Send now" can say so with confidence.
export function reconcile(kind: OutboxKind, rows: any[], opts: { fetchStartedAt: number; from?: string; to?: string }): void {
  const arrived = new Set(rows.map((row) => row?.clientEntryId).filter(Boolean));
  for (const entry of entries) {
    if (entry.kind !== kind || (entry.state !== 'unsure' && entry.state !== 'failed')) continue;
    if (arrived.has(entry.id)) {
      drop(entry.id);
      continue;
    }
    const date = entry.body?.date as string | undefined;
    const covered = !opts.from || !opts.to || (!!date && date >= opts.from && date <= opts.to);
    if (entry.state === 'unsure' && covered && entry.lastAttemptAt && opts.fetchStartedAt - entry.lastAttemptAt > SERVER_MAX_RUN_MS && !entry.notOnServer) {
      update(entry.id, { notOnServer: true });
    }
  }
}
