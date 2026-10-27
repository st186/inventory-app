import { useEffect, useState, useSyncExternalStore } from 'react';
import { RefreshCw, WifiOff, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { hasFeature, isOnline, onConnectivity } from '../utils/http';
import * as outbox from '../utils/outbox';

// The quiet status line under the top bar: how old the data on screen is, whether it is being
// refreshed, what couldn't be refreshed, and entries waiting in the outbox (utils/outbox.ts). The app
// now opens on the copy saved on the phone instead of a full-screen spinner, so people need to see
// when that copy is from - and that an entry made without signal is safe and still to be sent.

type Props = {
  lastUpdatedAt: number | null; // when the data on screen last came from the server
  refreshing: boolean;
  failed: string[]; // parts that couldn't be refreshed ("expenses", "sales")
  offline: boolean; // the last refresh failed on the network
  hasData: boolean; // anything on screen at all (false on a first load with nothing saved)
  onRetry: () => void;
  quiet?: boolean; // only show when something is wrong or waiting
};

export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline());
  useEffect(() => onConnectivity(() => setOnline(isOnline())), []);
  return online;
}

// This person's outbox entries, oldest first.
export function useOutbox(): readonly outbox.OutboxEntry[] {
  return useSyncExternalStore(outbox.subscribe, outbox.getEntries, outbox.getEntries);
}

// Re-renders every 30 s so "5 min ago" keeps moving.
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function formatUpdated(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const date = new Date(at);
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (new Date(now).toDateString() === date.toDateString()) return `at ${time}`;
  return `on ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
}

export function entryStatus(entry: outbox.OutboxEntry, short = false): string {
  switch (entry.state) {
    case 'queued': return 'Waiting to send';
    case 'sending': return 'Sending…';
    case 'unsure':
      if (short) return 'Not confirmed';
      return entry.notOnServer
        ? 'Not on the server yet - tap Send now'
        : entry.uncertainty === 'server'
        ? 'Not confirmed - the server failed while saving; it may already be saved'
        : 'Not confirmed - the signal dropped while sending; it may already be saved';
    case 'failed': return short ? 'Not saved' : `Not saved: ${entry.lastError || 'the server refused it'}`;
  }
}

async function sendNow(entry: outbox.OutboxEntry) {
  // Sending an expense again when it may already be saved could make a duplicate - unless the
  // server replays the first answer (idempotency-v1, after a dropped signal), ask first.
  const serverReplays = hasFeature('idempotency-v1') && entry.uncertainty !== 'server';
  if (entry.state === 'unsure' && entry.kind !== 'sales' && !serverReplays) {
    const question = entry.notOnServer
      ? `Send "${entry.label}" again? The latest download from the server doesn't have it.`
      : entry.uncertainty === 'server'
      ? `The server failed while saving "${entry.label}", so it may be partly saved. Check the expense list first. Send it again anyway?`
      : `The signal dropped while "${entry.label}" was being sent, so it may already be saved. Check the expense list first. Send it again anyway?`;
    if (!confirm(question)) return;
  }
  const outcome = await outbox.sendManually(entry.id);
  if (outcome.status === 'sent') toast.success(`Sent: ${entry.label}`);
  else if (outcome.status === 'refused') toast.error(`Not saved: ${outcome.error.message}`);
  else if (outcome.status === 'kept') toast.error('Still no connection to the server - it stays on this phone.');
}

async function removeEntry(entry: outbox.OutboxEntry) {
  if (!confirm(`Remove "${entry.label}" from this phone? It will not be sent.`)) return;
  try {
    await outbox.removeEntry(entry.id);
  } catch (error: any) {
    toast.error(error?.message || 'Could not remove it');
  }
}

export function SyncStatus({ lastUpdatedAt, refreshing, failed, offline, hasData, onRetry, quiet = false }: Props) {
  const online = useOnline();
  const now = useNow();
  const waiting = useOutbox();
  const [open, setOpen] = useState(false);
  const isOffline = !online || offline;
  const updated = lastUpdatedAt ? formatUpdated(lastUpdatedAt, now) : null;
  const problem = isOffline || failed.length > 0;
  const needsAttention = waiting.some((e) => e.state === 'unsure' || e.state === 'failed');
  if (quiet && !problem && waiting.length === 0) return null;

  let text: string;
  if (isOffline) {
    text = hasData ? `Offline · showing data saved ${updated || 'earlier'}` : 'Offline · nothing saved on this phone yet';
  } else if (refreshing && !hasData) {
    text = 'Loading your data…';
  } else if (failed.length > 0) {
    text = `Couldn't refresh ${failed.join(', ')}${updated ? ` · showing data from ${updated}` : ''}`;
  } else if (refreshing) {
    text = `Updated ${updated || 'earlier'} · Refreshing…`;
  } else {
    text = updated ? `Updated ${updated}` : 'Refreshing…';
  }
  const amber = problem || needsAttention;

  return (
    <div className={`border-b px-4 py-1.5 text-xs ${amber ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-gray-200 text-gray-500'}`} role="status">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          {isOffline ? <WifiOff className="w-3.5 h-3.5 flex-shrink-0" /> : refreshing ? <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 animate-spin" /> : null}
          {!(quiet && !problem) && <span className="truncate">{text}</span>}
          <div className="ml-auto flex items-center gap-3 flex-shrink-0">
            {waiting.length > 0 && (
              <button onClick={() => setOpen(!open)} className="flex items-center gap-1 font-medium text-amber-800">
                {waiting.length} waiting to send
                {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
            {problem && !refreshing && (
              <button onClick={onRetry} className="underline hover:text-amber-900">
                Retry
              </button>
            )}
          </div>
        </div>
        {open && waiting.length > 0 && (
          <ul className="mt-1.5 mb-1 space-y-1.5">
            {waiting.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-gray-700">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{entry.label}</p>
                  <p className="text-[11px] text-gray-500">
                    {entryStatus(entry)} · saved on this phone {formatUpdated(entry.createdAt, now)}
                  </p>
                </div>
                {entry.state !== 'sending' && (
                  <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                    {(entry.state !== 'queued' || online) && (
                      <button onClick={() => sendNow(entry)} className="text-orange-600 font-medium hover:text-orange-700">
                        Send now
                      </button>
                    )}
                    {entry.state !== 'queued' && (
                      <button onClick={() => removeEntry(entry)} className="text-gray-400 hover:text-gray-600">
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// The entries of these kinds still waiting to send, as a small list inside a form - so whoever is
// entering expenses or the day close sees what is already saved on the phone and doesn't enter it
// again.
export function WaitingToSend({ kinds, date }: { kinds: outbox.OutboxKind[]; date?: string }) {
  const entries = useOutbox().filter((e) => kinds.includes(e.kind) && (!date || e.body?.date === date));
  if (entries.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 space-y-0.5">
      {entries.map((entry) => (
        <p key={entry.id}>
          <span className="font-medium">{entryStatus(entry, true)}:</span> {entry.label}
        </p>
      ))}
      <p className="text-[11px] text-amber-700">
        {entries.every((e) => e.state === 'queued' || e.state === 'sending')
          ? 'Saved on this phone - it sends by itself when the signal is back.'
          : 'Saved on this phone - open "waiting to send" at the top to check it.'}
      </p>
    </div>
  );
}
