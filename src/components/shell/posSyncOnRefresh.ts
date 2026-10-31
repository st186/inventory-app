// A refresh also brings in the day's sales from the POS (owner, 31 Oct 2026: "the sales data we
// need to press sync now to get updated, can't we pull down the screen and it also gets updated
// and also in home screen of owner"). Only for the logins whose Sales screen has Sync now, and only
// while today's sync can run: from the 3 PM opening until the 11:50 PM pause (server
// STORE_OPENING_HOUR_IST / POS_QUIET_START_MIN_IST). The server skips a pull that comes within
// 2 minutes of the last sync, so several pulls in a row cost one.
import { useMemo } from 'react';
import { toast } from 'sonner';
import { triggerPosSync } from '../../utils/api';
import { useT } from '../../utils/i18n';
import type { Permissions } from './navConfig';

const OPENS_MIN = 15 * 60;
const PAUSE_MIN = 23 * 60 + 50;
const WAIT_MS = 8000; // usually 3-5 s; a slow POS finishes after the arrow has gone

function istMinutes(now = new Date()): number {
  const [h, m] = now.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
  return (h % 24) * 60 + m;
}

/** Starts the POS sync for a refresh, or undefined when this login or the time doesn't sync. The
 *  promise says whether new sales came in. */
export function usePosSyncOnRefresh(perms: Permissions, token: string | undefined, off: boolean): (() => Promise<boolean> | undefined) | undefined {
  const { t } = useT();
  const canSync = perms.isClusterHead || perms.isOperationsManager || perms.isStoreIncharge || perms.isStoreInchargeManager || perms.isProductionIncharge;
  return useMemo(() => {
    if (off || !token || !canSync) return undefined;
    return () => {
      const now = istMinutes();
      if (now < OPENS_MIN || now >= PAUSE_MIN) return undefined;
      return triggerPosSync(token, { fromPull: true }).then((r: any) => {
        if (r?.skipped) return false;
        if (r?.success) { toast.success(t('shell.posSynced')); return true; }
        toast.error(t('shell.posFailed'), { description: r?.error });
        return false;
      }, (e: any) => {
        toast.error(t('shell.posFailed'), { description: e?.message });
        return false;
      });
    };
  }, [off, token, canSync, t]);
}

/** Reloads once the POS sync is done, so the new sales come with it (one reload: the free plan's
 *  calls, see bunny-supabase-quota); a POS slower than WAIT_MS reloads now and again when it's done. */
export async function reloadWithSales(reload: () => unknown, sales: Promise<boolean> | undefined) {
  if (!sales) return reload();
  const slow = Symbol('slow');
  const got = await Promise.race([sales, new Promise<typeof slow>((r) => setTimeout(() => r(slow), WAIT_MS))]);
  await reload();
  if (got === slow) void sales.then((ok) => (ok ? reload() : undefined));
}
