// Password rotation in the app (server side: supabase/functions/make-server-c2dd9b9d/passwords.ts).
// - usePasswordPolicy: reads /auth/password-status at sign-in (and again when the app comes back
//   after an hour), and listens for the PASSWORD_EXPIRED event api.ts fires when the server
//   refuses a request because the password must be changed first.
// - ChangePasswordDialog: the change-password form. Full-screen and blocking when the password has
//   expired or the owner forced a reset; a sheet (dialog on desktop) when opened from the
//   Account sheet or the banner.
// - PasswordExpiryBanner: the reminder under the top bar from 7 days before expiry, dismissible
//   for the day.
// Labels show in the person's App language (Bengali or English).

// The form itself is in ChangePasswordDialog.tsx, loaded only when it opens (it brings the sheet
// and dialog code, which the first frame doesn't need).

import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import * as api from '../utils/api';
import { toBengaliDigits } from '../utils/passwordPolicy';
import { getTodayIST } from '../utils/timezone';
import { useLang } from '../utils/i18n';
import { Button } from './ui/button';
import { IconButton } from './ui/icon-button';

export type PolicyUser = { email: string; name: string; employeeId: string | null; accessToken: string };
type Reason = 'expired' | 'reset';

// Matches PASSWORD_WARN_DAYS on the server.
const WARN_DAYS = 7;
// A phone can stay open for days; look again when the app comes back after this long.
const RECHECK_MS = 60 * 60 * 1000;
const dismissKey = (userKey: string) => `password-banner-dismissed:${userKey}`;

export function usePasswordPolicy(user: PolicyUser | null) {
  const [status, setStatus] = useState<api.PasswordStatus | null>(null);
  const [blockedReason, setBlockedReason] = useState<Reason | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bannerDismissedOn, setBannerDismissedOn] = useState<string | null>(null);
  const lastCheckRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = user?.accessToken || null;
  const userKey = user ? user.employeeId || user.email : null;

  const check = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    lastCheckRef.current = Date.now();
    try {
      const next = await api.getPasswordStatus(token);
      setStatus(next);
      setBlockedReason(next.mustChange ? next.reason || 'expired' : null);
    } catch {
      // Offline or a server hiccup: a refused request still blocks through the event below, and
      // the next return to the app checks again.
    }
  }, []);

  // A new sign-in (or sign-out) starts from scratch.
  useEffect(() => {
    setStatus(null);
    setBlockedReason(null);
    setDialogOpen(false);
    let dismissedOn: string | null = null;
    try {
      dismissedOn = userKey ? localStorage.getItem(dismissKey(userKey)) : null;
    } catch {
      // Storage switched off: the banner just shows again.
    }
    setBannerDismissedOn(dismissedOn);
    if (userKey) check();
  }, [userKey, check]);

  useEffect(() => {
    if (!userKey) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheckRef.current > RECHECK_MS) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userKey, check]);

  useEffect(() => {
    if (!userKey) return;
    const onExpired = (event: Event) => {
      setBlockedReason((event as CustomEvent).detail?.reason === 'reset' ? 'reset' : 'expired');
    };
    window.addEventListener(api.PASSWORD_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(api.PASSWORD_EXPIRED_EVENT, onExpired);
  }, [userKey]);

  const dismissBanner = useCallback(() => {
    const today = getTodayIST();
    try {
      if (userKey) localStorage.setItem(dismissKey(userKey), today);
    } catch {
      // Storage switched off: hidden until the app is reopened.
    }
    setBannerDismissedOn(today);
  }, [userKey]);
  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  return {
    status,
    blocking: blockedReason !== null,
    reason: blockedReason,
    dialogOpen,
    openDialog,
    closeDialog,
    showBanner: !!status && !blockedReason && !status.mustChange && status.daysLeft <= WARN_DAYS && bannerDismissedOn !== getTodayIST(),
    dismissBanner,
  };
}

export type PasswordPolicy = ReturnType<typeof usePasswordPolicy>;

// One language at a time (the person's App language); Hindi readers get English here until the
// password texts are translated.
export type Text = { en: string; bn: string };
export function usePick() {
  const lang = useLang();
  return (text: Text) => (lang === 'bn' ? text.bn : text.en);
}

export function PasswordExpiryBanner({ policy }: { policy: PasswordPolicy }) {
  const pick = usePick();
  if (!policy.showBanner || !policy.status) return null;
  const days = policy.status.daysLeft;
  const message: Text = {
    en: days === 0 ? 'Your password expires today.' : days === 1 ? 'Your password expires tomorrow.' : `Your password expires in ${days} days.`,
    bn: days === 0
      ? 'আজই আপনার পাসওয়ার্ডের মেয়াদ শেষ হবে।'
      : days === 1
        ? 'আগামীকাল আপনার পাসওয়ার্ডের মেয়াদ শেষ হবে।'
        : `${toBengaliDigits(days)} দিনের মধ্যে আপনার পাসওয়ার্ডের মেয়াদ শেষ হবে।`,
  };
  return (
    <div className="flex items-center gap-2 border-b border-warning-border bg-warning-soft py-1 pr-1 pl-4" role="status">
      <KeyRound className="size-5 shrink-0 text-warning" aria-hidden="true" />
      <span className="min-w-0 flex-1 py-2 text-body-sm text-text">{pick(message)}</span>
      <Button variant="secondary" size="sm" onClick={policy.openDialog}>
        {pick({ en: 'Change', bn: 'বদলান' })}
      </Button>
      <IconButton label={pick({ en: 'Hide for today', bn: 'আজকের জন্য লুকান' })} icon={<X />} onClick={policy.dismissBanner} />
    </div>
  );
}

