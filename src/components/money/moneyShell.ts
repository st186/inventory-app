// What the app shell's Money tab already shows around a screen, so the screen doesn't draw a
// second tab bar of its own. Outside the shell (audit view, previews) nothing is assumed.
import { toast } from 'sonner';
import { useShell, type ShellContextValue } from '../shell/ShellContext';

export type MoneySubTab = 'entry' | 'payout' | 'loans' | 'cash';

/** The shell's context, or null outside it. useShell() reads the context first and only then
 * throws, so the hook order is the same either way. */
export function useShellOptional(): ShellContextValue | null {
  try {
    return useShell();
  } catch {
    return null;
  }
}

/** True when the shell's Money tab has its own sub-tab for `tab` rendered by `screen`. */
export function useShellHasMoneyTab(screen: 'SalesView' | 'SalesManagement', tab: MoneySubTab): boolean {
  return shellHasMoneyTab(useShellOptional(), screen, tab);
}

export function shellHasMoneyTab(shell: ShellContextValue | null, screen: string, tab: MoneySubTab): boolean {
  if (!shell) return false;
  const path = tab === 'entry' ? 'money/sales' : tab === 'payout' ? 'money/payouts' : tab === 'loans' ? 'money/loans' : 'money/cash';
  const dest = shell.nav.destinations[path];
  if (!dest) return false;
  const spec = dest.spec as { screen: string; tab?: string };
  if (tab === 'entry') return spec.screen === screen;
  return spec.screen === screen && spec.tab === tab;
}

/** Stores open at 3 PM IST - keep in sync with the server's STORE_OPENING_HOUR_IST. */
export function istHourNow(now = new Date()): number {
  return parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit' }), 10);
}

/** Today's sync waits for the store to open; re-syncing a past day is always allowed. */
export function posSyncTooEarly(selectedDate: string, todayIST: string, now = new Date()): boolean {
  return !(selectedDate < todayIST) && istHourNow(now) < 15;
}

// The server pauses POS syncs between 11:50 PM and 6:10 AM (Ciferon is still closing the day)
// and answers 423 with a sentence saying so - shown as a calm notice, not an error.
const QUIET_HOURS = /11:50|6:10|paused/i;
const QUIET_TITLE = 'POS sync is paused until 6:10 AM';

/** Toast for a sync the server answered; true when it really synced. */
export function toastPosSyncResult(result: any, okText: string): boolean {
  if (result?.skipped) {
    if (result?.status === 423 || QUIET_HOURS.test(result?.message || '')) toast.info(QUIET_TITLE, { description: result?.message });
    else toast.info(result?.message || "Skipped - the store hasn't opened yet");
    return false;
  }
  if (result?.success) {
    toast.success(okText);
    return true;
  }
  toast.error(result?.error || 'POS sync ran but reported an error - check the results');
  return false;
}

/** Toast for a sync request that threw (the 423 quiet-hours answer arrives this way). */
export function toastPosSyncError(error: any) {
  const message = error?.message || 'Failed to trigger POS sync';
  if (error?.status === 423 || QUIET_HOURS.test(message)) toast.info(QUIET_TITLE, { description: message });
  else toast.error(message);
}
