// Password rotation in the app (server side: supabase/functions/make-server-c2dd9b9d/passwords.ts).
// - usePasswordPolicy: reads /auth/password-status at sign-in (and again when the app comes back
//   after an hour), and listens for the PASSWORD_EXPIRED event api.ts fires when the server
//   refuses a request because the password must be changed first.
// - ChangePasswordDialog: the change-password form. Full-screen and blocking when the password has
//   expired or the owner forced a reset; a closable sheet when opened from the menu.
// - PasswordExpiryBanner: the home-screen reminder from 7 days before expiry, dismissible for the day.
// Staff read Bengali and English, so every label carries both.

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Eye, EyeOff, KeyRound, Loader2, LogOut, ShieldAlert, X } from 'lucide-react';
import * as api from '../utils/api';
import { getSupabaseClient } from '../utils/supabase/client';
import { passwordChecklist, toBengaliDigits } from '../utils/passwordPolicy';
import { getTodayIST } from '../utils/timezone';

type PolicyUser = { email: string; name: string; employeeId: string | null; accessToken: string };
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

function Bilingual({ en, bn, className = '' }: { en: string; bn: string; className?: string }) {
  return (
    <span className={className}>
      <span className="block">{en}</span>
      <span className="block text-[0.85em] opacity-80">{bn}</span>
    </span>
  );
}

export function PasswordExpiryBanner({ policy }: { policy: PasswordPolicy }) {
  if (!policy.showBanner || !policy.status) return null;
  const days = policy.status.daysLeft;
  const en = days === 0 ? 'Your password expires today.' : days === 1 ? 'Your password expires tomorrow.' : `Your password expires in ${days} days.`;
  const bn = days === 0
    ? 'আজই আপনার পাসওয়ার্ডের মেয়াদ শেষ হবে।'
    : days === 1
      ? 'আগামীকাল আপনার পাসওয়ার্ডের মেয়াদ শেষ হবে।'
      : `${toBengaliDigits(days)} দিনের মধ্যে আপনার পাসওয়ার্ডের মেয়াদ শেষ হবে।`;
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3" role="status">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <KeyRound className="w-5 h-5 text-amber-600 shrink-0" />
        <Bilingual en={en} bn={bn} className="flex-1 min-w-0 text-sm text-amber-900" />
        <button
          onClick={policy.openDialog}
          className="shrink-0 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          Change · বদলান
        </button>
        <button onClick={policy.dismissBanner} className="shrink-0 p-2 text-amber-700 hover:bg-amber-100 rounded-lg" aria-label="Hide for today">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordDialog({ policy, user, onLogout }: { policy: PasswordPolicy; user: PolicyUser; onLogout: () => void }) {
  if (!policy.blocking && !policy.dialogOpen) return null;
  // Keyed so every opening starts with empty fields.
  return <ChangePasswordPanel key={policy.blocking ? 'blocking' : 'menu'} policy={policy} user={user} onLogout={onLogout} />;
}

function PasswordField({ id, label, value, onChange, autoComplete, autoFocus }: {
  id: string;
  label: { en: string; bn: string };
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800 mb-1">
        {label.en} <span className="font-normal text-gray-500">· {label.bn}</span>
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          className="w-full pl-3 pr-12 py-3 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-800"
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide · লুকান' : 'Show · দেখান'}
        >
          {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

function ChangePasswordPanel({ policy, user, onLogout }: { policy: PasswordPolicy; user: PolicyUser; onLogout: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ en: string; bn: string } | null>(null);
  const blocking = policy.blocking;
  const reason = policy.reason;

  const rules = [
    ...passwordChecklist(next, { name: user.name, employeeId: user.employeeId, email: user.email }),
    { id: 'different', ok: next.length > 0 && next !== current, en: 'Different from the current password', bn: 'বর্তমান পাসওয়ার্ড থেকে আলাদা' },
    { id: 'match', ok: confirm.length > 0 && confirm === next, en: 'Both new passwords match', bn: 'দুটো নতুন পাসওয়ার্ড মিলেছে' },
  ];
  const canSave = !saving && !done && current.length > 0 && rules.every((r) => r.ok);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await api.changePassword(user.accessToken, current, next);
      setDone(true);
      // Supabase ends this login's sessions when its password changes, so sign in again with the
      // new password, then reload so every screen picks up the fresh session.
      const supabase = getSupabaseClient();
      try {
        await supabase.auth.signOut({ scope: 'local' });
        await supabase.auth.signInWithPassword({ email: user.email, password: next });
      } catch {
        // Worst case the reload shows the sign-in page and they use the new password there.
      }
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      const code = err?.details?.code;
      if (code === 'WRONG_CURRENT_PASSWORD') {
        setError(reason === 'reset'
          ? { en: 'The temporary password is not right. Check it with the owner.', bn: 'অস্থায়ী পাসওয়ার্ড ভুল। মালিকের কাছে মিলিয়ে নিন।' }
          : { en: 'Your current password is not right.', bn: 'বর্তমান পাসওয়ার্ড ভুল।' });
      } else if (code === 'TOO_MANY_TRIES') {
        setError({ en: 'Too many wrong tries. Wait 15 minutes and try again.', bn: 'অনেকবার ভুল হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।' });
      } else if (code === 'AUTH_BUSY') {
        setError({ en: 'Could not check your password right now. Try again in a few minutes.', bn: 'এখন যাচাই করা যাচ্ছে না। কয়েক মিনিট পরে আবার চেষ্টা করুন।' });
      } else if (code === 'WEAK_PASSWORD') {
        setError({ en: err.message || 'This password is not allowed. Choose another.', bn: 'এই পাসওয়ার্ড চলবে না। অন্য একটা দিন।' });
      } else {
        setError({ en: err?.message || 'Could not change the password. Try again.', bn: 'পাসওয়ার্ড বদলানো গেল না। আবার চেষ্টা করুন।' });
      }
    } finally {
      setSaving(false);
    }
  };

  const heading = !blocking
    ? { en: 'Change password', bn: 'পাসওয়ার্ড বদলান' }
    : reason === 'reset'
      ? { en: 'Set your own password', bn: 'নিজের পাসওয়ার্ড দিন' }
      : { en: 'Time for a new password', bn: 'নতুন পাসওয়ার্ড দেওয়ার সময় হয়েছে' };
  const intro = !blocking
    ? null
    : reason === 'reset'
      ? {
          en: 'The owner reset your password. Type the temporary password they gave you in the first box, then choose your own.',
          bn: 'মালিক আপনার পাসওয়ার্ড রিসেট করেছেন। মালিকের দেওয়া অস্থায়ী পাসওয়ার্ডটি প্রথম ঘরে লিখুন, তারপর নিজের নতুন পাসওয়ার্ড দিন।',
        }
      : {
          en: 'Your password is more than 90 days old. Set a new one to keep using the app.',
          bn: 'আপনার পাসওয়ার্ড ৯০ দিনের বেশি পুরনো। অ্যাপ চালিয়ে যেতে নতুন পাসওয়ার্ড দিন।',
        };

  const card = (
    <form
      onSubmit={save}
      className={blocking
        ? 'bg-white w-full max-w-md rounded-2xl shadow-xl'
        : 'bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto'}
    >
      <div className="flex items-start gap-3 p-5 border-b border-gray-100">
        <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${blocking ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
          {blocking ? <ShieldAlert className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-900">{heading.en}</h2>
          <p className="text-sm text-gray-600">{heading.bn}</p>
        </div>
        {!blocking && (
          <button type="button" onClick={policy.closeDialog} className="p-2 -m-1 text-gray-400 hover:text-gray-700 rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {done ? (
        <div className="p-6 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-green-100 text-green-600 flex items-center justify-center">
            <Check className="w-7 h-7" />
          </div>
          <Bilingual en="Password changed. Opening the app again..." bn="পাসওয়ার্ড বদলানো হয়েছে। অ্যাপ আবার খুলছে..." className="text-gray-800 font-medium" />
          <Bilingual
            en="Other phones signed in as you will need the new password."
            bn="অন্য ফোনে আপনার অ্যাকাউন্টে নতুন পাসওয়ার্ড দিয়ে ঢুকতে হবে।"
            className="text-sm text-gray-500"
          />
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {intro && <Bilingual en={intro.en} bn={intro.bn} className="text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded-xl p-3" />}

          <PasswordField
            id="pw-current"
            label={reason === 'reset' ? { en: 'Temporary password', bn: 'অস্থায়ী পাসওয়ার্ড' } : { en: 'Current password', bn: 'বর্তমান পাসওয়ার্ড' }}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            autoFocus
          />
          <PasswordField id="pw-new" label={{ en: 'New password', bn: 'নতুন পাসওয়ার্ড' }} value={next} onChange={setNext} autoComplete="new-password" />
          <PasswordField id="pw-confirm" label={{ en: 'New password again', bn: 'নতুন পাসওয়ার্ড আবার লিখুন' }} value={confirm} onChange={setConfirm} autoComplete="new-password" />

          <ul className="space-y-1.5" aria-label="Password rules">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${rule.ok ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {rule.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                </span>
                <Bilingual en={rule.en} bn={rule.bn} className={rule.ok ? 'text-gray-800' : 'text-gray-500'} />
              </li>
            ))}
          </ul>

          <Bilingual
            en="Tip: three words you can remember plus a number, like river-lamp-tiger-48."
            bn="টিপ: মনে রাখা সহজ তিনটি শব্দ আর একটি সংখ্যা, যেমন river-lamp-tiger-48।"
            className="text-xs text-gray-500"
          />

          {error && <Bilingual en={error.en} bn={error.bn} className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3" />}

          <button
            type="submit"
            disabled={!canSave}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="w-5 h-5 animate-spin" />}
            <Bilingual en="Save new password" bn="নতুন পাসওয়ার্ড সেভ করুন" />
          </button>

          {blocking ? (
            <button type="button" onClick={onLogout} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors">
              <LogOut className="w-4 h-4" />
              <span>Log out · লগ আউট</span>
            </button>
          ) : (
            <button type="button" onClick={policy.closeDialog} className="w-full py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors">
              Cancel · বাতিল
            </button>
          )}
        </div>
      )}
    </form>
  );

  if (blocking) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-start sm:justify-center px-4 py-6">
        <div className="flex items-center gap-2 mb-4">
          <img src="/bunny-logo.png" alt="" className="w-9 h-9" />
          <span className="text-lg font-bold text-stone-800">Bhandar-IMS</span>
        </div>
        {card}
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      {card}
    </div>
  );
}
