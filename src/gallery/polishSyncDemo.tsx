// Dev-only: the status line under the top bar (SyncStatus) in each of its states, and the
// "waiting to send" note a form shows, for polish-preview.html?screen=sync. Two made-up
// expenses are put in this preview origin's outbox (their sending fails on purpose).
import { useEffect, useState } from 'react';
import { SyncStatus, WaitingToSend } from '../components/SyncStatus';
import * as outbox from '../utils/outbox';

const now = Date.now();

export function SyncStatusDemo() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      await outbox.setOwner('preview-user');
      if (outbox.getEntries().length === 0) {
        for (const [label, amount] of [['₹450 · Chicken', 450], ['₹120 · Cabbage', 120]] as const) {
          try {
            await outbox.submit({ kind: 'inventory', method: 'POST', path: '/inventory', body: { amount, date: '2026-10-27' }, label });
          } catch {
            /* the preview's server refuses or drops it - it stays waiting */
          }
        }
      }
      setReady(true);
    })();
  }, []);
  const states: { title: string; props: Parameters<typeof SyncStatus>[0] }[] = [
    { title: 'Up to date', props: { lastUpdatedAt: now - 4 * 60_000, refreshing: false, failed: [], offline: false, hasData: true, onRetry: () => {} } },
    { title: 'Refreshing', props: { lastUpdatedAt: now - 12 * 60_000, refreshing: true, failed: [], offline: false, hasData: true, onRetry: () => {} } },
    { title: 'Part of it could not refresh', props: { lastUpdatedAt: now - 40 * 60_000, refreshing: false, failed: ['expenses', 'sales'], offline: false, hasData: true, onRetry: () => {} } },
    { title: 'Offline', props: { lastUpdatedAt: now - 3 * 3600_000, refreshing: false, failed: [], offline: true, hasData: true, onRetry: () => {} } },
  ];
  return (
    <div className="flex flex-col gap-6">
      {states.map((s) => (
        <section key={s.title} className="flex flex-col gap-2">
          <h2 className="text-subtitle font-semibold text-text">{s.title}</h2>
          <div className="overflow-hidden rounded-lg border border-border">
            <SyncStatus {...s.props} />
          </div>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2 className="text-subtitle font-semibold text-text">Inside a form: entries waiting to send</h2>
        {ready ? <WaitingToSend kinds={['inventory']} /> : null}
      </section>
    </div>
  );
}
