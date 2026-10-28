// The Account sheet, opened from the avatar (design review d1, wireframe AccountSheet):
// who you are, App language, Bunny's language, your profile, notifications, password, the app
// version, and Log out on its own at the bottom. A bottom sheet on phones, a dialog on desktop.
// Notifications open in place (the sheet's content swaps, with a back arrow - never a sheet on
// a sheet).
import { useEffect, useState } from 'react';
import { Bell, IdCard, KeyRound, LogOut, Smartphone } from 'lucide-react';
import { ResponsiveModal } from '../ui/responsive-modal';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { Button } from '../ui/button';
import { InitialsAvatar } from '../ui/avatar';
import { LanguagePicker } from '../BunnyLanguagePicker';
import { ThemePicker } from './ThemePicker';
import { PushNotificationStatus, pushStateChip, usePushStatus } from '../PushNotificationStatus';
import { APP_VERSION, isNewerVersion } from '../../utils/appVersion';
import { applyUpdateNow, getLiveUpdateState, liveUpdatesOn } from '../../utils/liveUpdate';
import * as api from '../../utils/api';
import { useT } from '../../utils/i18n';

export type AccountSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  roleLine: string;
  accessToken: string;
  /** Push subscriptions are keyed by employee id (or email). */
  pushUserId: string;
  onEnableNativePush?: () => Promise<boolean>;
  showBunnyLanguage: boolean;
  /** Owner and audit logins have no profile to complete. */
  showProfile: boolean;
  passwordDaysLeft: number | null;
  onChangePassword: () => void;
  onCompleteProfile: () => void;
  onLogout: () => void;
  /** Role preview: fixed answers instead of server calls. */
  preview?: { profileComplete: boolean; latestVersion: string | null };
};

export function AccountSheet(props: AccountSheetProps) {
  const { open, onOpenChange, name, roleLine, preview } = props;
  const { t, lang } = useT();
  const [view, setView] = useState<'main' | 'notifications'>('main');
  const [profile, setProfile] = useState<api.MyProfileStatus | null>(null);
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (preview) {
      setProfile({ required: props.showProfile, complete: preview.profileComplete, missing: preview.profileComplete ? [] : ['phone'] });
      setLatest(preview.latestVersion);
      return;
    }
    let cancelled = false;
    if (props.showProfile && props.accessToken) {
      api.getMyProfile(props.accessToken).then((s) => { if (!cancelled) setProfile(s); }).catch(() => undefined);
    }
    // The Android app reads its updates from the live-update manifest instead (below).
    if (!liveUpdatesOn()) api.getLatestAppVersion().then((v) => { if (!cancelled) setLatest(v); });
    return () => { cancelled = true; };
  }, [open, preview, props.showProfile, props.accessToken]);

  const close = () => onOpenChange(false);
  const live = liveUpdatesOn() && !preview ? getLiveUpdateState() : null;
  const liveVersion = live?.apk?.version ?? live?.readyVersion ?? null;
  const newVersion = live ? liveVersion : latest && isNewerVersion(latest, APP_VERSION) ? latest : null;
  const updateAvailable = !!newVersion;
  const days = props.passwordDaysLeft;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => setView('main')}
      onBack={view === 'notifications' ? () => setView('main') : undefined}
      title={
        view === 'notifications' ? (
          t('account.notifications')
        ) : (
          <span className="flex items-center gap-3">
            <InitialsAvatar name={name} size={56} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{name}</span>
              <span className="truncate text-body-sm font-normal text-text-2">{roleLine}</span>
            </span>
          </span>
        )
      }
      bodyClassName="flex flex-col gap-4"
    >
      {view === 'notifications' ? (
        <PushNotificationStatus userId={props.pushUserId} onEnableNative={props.onEnableNativePush} />
      ) : (
        <div className="flex flex-col gap-4" lang={lang}>
          <LanguagePicker kind="app" />
          {props.showBunnyLanguage && <LanguagePicker kind="bunny" />}
          <ThemePicker />

          <ListGroup>
            {props.showProfile && profile?.required && (
              <ListRow
                icon={IdCard}
                title={profile.complete ? t('account.profile') : t('account.completeProfile')}
                subtitle={t('account.profileHint')}
                trailing={profile.complete ? <StatusChip tone="success">{t('status.complete')}</StatusChip> : <StatusChip tone="warning">{t('account.addDetails')}</StatusChip>}
                chevron={!profile.complete}
                onClick={profile.complete ? undefined : () => { close(); props.onCompleteProfile(); }}
              />
            )}
            <NotificationsRow pushUserId={props.pushUserId} onEnableNative={props.onEnableNativePush} onOpen={() => setView('notifications')} preview={!!preview} />
            <ListRow
              icon={KeyRound}
              title={t('account.changePassword')}
              subtitle={days != null && days >= 0 ? t('account.passwordDue', { n: days }) : undefined}
              trailing={days != null && days <= 7 ? <StatusChip tone="warning">{t('account.passwordSoon')}</StatusChip> : undefined}
              chevron
              onClick={() => { close(); props.onChangePassword(); }}
            />
            <ListRow
              icon={Smartphone}
              title={t('account.version', { v: APP_VERSION })}
              subtitle={updateAvailable ? t('account.updateAvailable', { v: newVersion! }) : t('account.upToDate')}
              trailing={updateAvailable ? <StatusChip tone="info">{t('account.update')}</StatusChip> : undefined}
              // A newer APK downloads in the phone's browser; a downloaded live update switches in.
              href={live?.apk?.url}
              onClick={!live?.apk && live?.readyVersion ? applyUpdateNow : undefined}
            />
          </ListGroup>

          <Button variant="danger-ghost" size="lg" fullWidth leadingIcon={<LogOut aria-hidden="true" />} onClick={() => { close(); props.onLogout(); }}>
            {t('account.logout')}
          </Button>
        </div>
      )}
    </ResponsiveModal>
  );
}

function NotificationsRow({ pushUserId, onEnableNative, onOpen, preview }: { pushUserId: string; onEnableNative?: () => Promise<boolean>; onOpen: () => void; preview: boolean }) {
  const { t } = useT();
  const push = usePushStatus(pushUserId, onEnableNative, !preview);
  return (
    <ListRow
      icon={Bell}
      title={t('account.notifications')}
      subtitle={t('account.notificationsHint')}
      trailing={preview ? <StatusChip tone="success">{t('status.on')}</StatusChip> : pushStateChip(push.state, t)}
      chevron
      onClick={onOpen}
    />
  );
}
