// Push notifications status and switch, inside Account -> Notifications (it used to be the
// floating bell bubble on the website).
//   Website: browser support, server keys, permission, service worker and subscription, with
//            Turn on / Turn off.
//   Android app: the system permission; turning it on asks the phone and registers this device.
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, CircleAlert, RefreshCw, XCircle } from 'lucide-react';
import * as pushNotifications from '../utils/pushNotifications';
import { isNativePushSupported } from '../utils/nativePushNotifications';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { ListGroup, ListRow, IconWell } from './ui/list-row';
import { StatusChip } from './ui/status-chip';
import { useT } from '../utils/i18n';

export type PushState = 'loading' | 'on' | 'off' | 'blocked' | 'unsupported';

type WebChecks = { supported: boolean; permission: NotificationPermission; swRegistered: boolean; subscribed: boolean; vapidConfigured: boolean };

async function fetchVapid(): Promise<{ configured?: boolean; publicKey?: string }> {
  const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/push/vapid-public-key`, {
    headers: { Authorization: `Bearer ${publicAnonKey}` },
  });
  if (!response.ok) throw new Error('Could not reach the notification server');
  return response.json();
}

async function readWebChecks(): Promise<WebChecks> {
  const supported = pushNotifications.isPushNotificationSupported();
  if (!supported) return { supported: false, permission: 'denied', swRegistered: false, subscribed: false, vapidConfigured: false };
  const permission = Notification.permission;
  let vapidConfigured = false;
  try {
    vapidConfigured = (await fetchVapid()).configured === true;
  } catch {
    vapidConfigured = false;
  }
  let swRegistered = false;
  let subscribed = false;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration('/');
    swRegistered = !!registration;
    if (registration) subscribed = !!(await registration.pushManager.getSubscription());
  }
  return { supported, permission, swRegistered, subscribed, vapidConfigured };
}

async function readNativePermission(): Promise<PushState> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const status = await PushNotifications.checkPermissions();
    if (status.receive === 'granted') return 'on';
    if (status.receive === 'denied') return 'blocked';
    return 'off';
  } catch {
    return 'unsupported';
  }
}

/** On / off / blocked for the Account sheet row, and the actions behind it. */
export function usePushStatus(userId: string, onEnableNative?: () => Promise<boolean>, enabled = true) {
  const native = isNativePushSupported();
  const [state, setState] = useState<PushState>('loading');
  const [web, setWeb] = useState<WebChecks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    if (!enabled) {
      setState('on');
      return;
    }
    if (native) {
      setState(await readNativePermission());
      return;
    }
    try {
      const checks = await readWebChecks();
      setWeb(checks);
      if (!checks.supported || !checks.vapidConfigured) setState('unsupported');
      else if (checks.permission === 'denied') setState('blocked');
      else setState(checks.subscribed && checks.permission === 'granted' ? 'on' : 'off');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check notifications');
      setState('off');
    }
  }, [native, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh, userId]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (native) {
        const ok = onEnableNative ? await onEnableNative() : false;
        if (!ok) setError('The phone did not allow notifications. Turn them on for Bunny Momos in the phone settings.');
      } else {
        const vapid = await fetchVapid();
        if (!vapid.configured || !vapid.publicKey) throw new Error('Notifications are not set up on the server yet.');
        const result = await pushNotifications.enablePushNotifications(userId, vapid.publicKey);
        if (!result.success) throw new Error(result.message || 'Could not turn notifications on');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn notifications on');
    } finally {
      await refresh();
      setBusy(false);
    }
  }, [native, onEnableNative, refresh, userId]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await pushNotifications.unsubscribeFromPushNotifications(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn notifications off');
    } finally {
      await refresh();
      setBusy(false);
    }
  }, [refresh, userId]);

  return { native, state, web, error, busy, refresh, enable, disable };
}

export function pushStateChip(state: PushState, t: ReturnType<typeof useT>['t']) {
  if (state === 'on') return <StatusChip tone="success">{t('status.on')}</StatusChip>;
  if (state === 'blocked') return <StatusChip tone="danger">{t('account.notificationsBlocked')}</StatusChip>;
  if (state === 'unsupported') return <StatusChip tone="neutral">{t('account.notificationsUnsupported')}</StatusChip>;
  if (state === 'off') return <StatusChip tone="warning">{t('status.off')}</StatusChip>;
  return null;
}

function Check({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return (
    <ListRow
      density="compact"
      leading={<IconWell icon={ok ? CheckCircle2 : ok === false ? XCircle : CircleAlert} tone={ok ? 'success' : ok === false ? 'danger' : 'neutral'} />}
      title={label}
      subtitle={detail}
    />
  );
}

/** The detail panel: what is on, and the switch. */
export function PushNotificationStatus({ userId, onEnableNative }: { userId: string; onEnableNative?: () => Promise<boolean> }) {
  const { t } = useT();
  const push = usePushStatus(userId, onEnableNative);
  const { web, state } = push;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3.5">
        <IconWell icon={state === 'on' ? Bell : BellOff} tone={state === 'on' ? 'success' : 'neutral'} size={40} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-md font-semibold text-text">{t('account.notifications')}</span>
          <span className="text-label text-text-3">{t('account.notificationsHint')}</span>
        </div>
        {pushStateChip(state, t)}
      </div>

      {push.native ? (
        <ListGroup>
          <Check ok={state === 'on' ? true : state === 'blocked' ? false : null} label="Android app" detail={state === 'on' ? 'Allowed on this phone' : state === 'blocked' ? 'Blocked in the phone settings' : 'Not allowed yet'} />
        </ListGroup>
      ) : (
        web && (
          <ListGroup>
            <Check ok={web.supported} label="This browser" detail={web.supported ? 'Supports notifications' : 'No notifications here: use Chrome, Edge, Firefox or Safari 16+'} />
            <Check ok={web.vapidConfigured} label="Server" detail={web.vapidConfigured ? 'Set up' : 'Not set up yet: ask the admin'} />
            <Check ok={web.permission === 'granted' ? true : web.permission === 'denied' ? false : null} label="Permission" detail={web.permission === 'granted' ? 'Allowed' : web.permission === 'denied' ? 'Blocked' : 'Not asked yet'} />
            <Check ok={web.subscribed} label="This device" detail={web.subscribed ? 'Receiving notifications' : web.swRegistered ? 'Not subscribed' : 'Not registered'} />
          </ListGroup>
        )
      )}

      {push.error && <Callout tone="danger">{push.error}</Callout>}
      {state === 'blocked' && (
        <Callout tone="warning" title={t('account.notificationsBlocked')}>
          {push.native
            ? 'Open the phone settings, find Bunny Momos, and allow notifications.'
            : 'Click the lock icon in the address bar, set Notifications to Allow, then reload the page.'}
        </Callout>
      )}

      <div className="flex gap-2.5">
        {state === 'off' && (
          <Button size="lg" className="flex-1" loading={push.busy} onClick={push.enable} leadingIcon={<Bell aria-hidden="true" />}>
            {t('account.enable')}
          </Button>
        )}
        {state === 'on' && !push.native && (
          <Button variant="secondary" size="lg" className="flex-1" loading={push.busy} onClick={push.disable} leadingIcon={<BellOff aria-hidden="true" />}>
            {t('account.disable')}
          </Button>
        )}
        <Button variant="ghost" size="lg" onClick={push.refresh} disabled={push.busy} leadingIcon={<RefreshCw aria-hidden="true" />}>
          {t('shell.refresh')}
        </Button>
      </div>
    </div>
  );
}
