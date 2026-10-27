import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { isOnline, onConnectivity } from '../utils/http';

// The quiet status line under the top bar: how old the data on screen is, whether it is being
// refreshed, and what couldn't be refreshed - the app now opens on the copy saved on the phone
// instead of a full-screen spinner, so people need to see when that copy is from.

type Props = {
  lastUpdatedAt: number | null; // when the data on screen last came from the server
  refreshing: boolean;
  failed: string[]; // parts that couldn't be refreshed ("expenses", "sales")
  offline: boolean; // the last refresh failed on the network
  hasData: boolean; // anything on screen at all (false on a first load with nothing saved)
  onRetry: () => void;
  quiet?: boolean; // only show when something is wrong
};

export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline());
  useEffect(() => onConnectivity(() => setOnline(isOnline())), []);
  return online;
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

export function SyncStatus({ lastUpdatedAt, refreshing, failed, offline, hasData, onRetry, quiet = false }: Props) {
  const online = useOnline();
  const now = useNow();
  const isOffline = !online || offline;
  const updated = lastUpdatedAt ? formatUpdated(lastUpdatedAt, now) : null;
  const problem = isOffline || failed.length > 0;
  if (quiet && !problem) return null;

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

  return (
    <div className={`border-b px-4 py-1.5 text-xs ${problem ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-gray-200 text-gray-500'}`} role="status">
      <div className="max-w-7xl mx-auto flex items-center gap-2">
        {isOffline ? <WifiOff className="w-3.5 h-3.5 flex-shrink-0" /> : refreshing ? <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 animate-spin" /> : null}
        <span className="truncate">{text}</span>
        {problem && !refreshing && (
          <button onClick={onRetry} className="ml-auto flex-shrink-0 underline hover:text-amber-900">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
