// The change-password form (server side: supabase/functions/make-server-c2dd9b9d/passwords.ts).
// Full-screen and blocking when the password has expired or the owner forced a reset; a sheet
// (dialog on desktop) when opened from the Account sheet or the expiry banner. Loaded on demand.
import { useEffect, useState, type FormEvent } from 'react';
import { Check, Eye, EyeOff, LogOut, ShieldAlert, X } from 'lucide-react';
import * as api from '../utils/api';
import { getSupabaseClient } from '../utils/supabase/client';
import { passwordChecklist } from '../utils/passwordPolicy';
import { useLang } from '../utils/i18n';
import { Button } from './ui/button';
import { IconButton } from './ui/icon-button';
import { Callout } from './ui/callout';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { ResponsiveModal } from './ui/responsive-modal';
import { cn } from './ui/utils';
import { usePick, type PasswordPolicy, type PolicyUser, type Text } from './PasswordSecurity';

export function ChangePasswordDialog({ policy, user, onLogout }: { policy: PasswordPolicy; user: PolicyUser; onLogout: () => void }) {
  if (policy.blocking) return <ChangePasswordPanel key="blocking" policy={policy} user={user} onLogout={onLogout} />;
  // A sheet on phones / dialog on desktop; keyed so every opening starts with empty fields.
  return <ChangePasswordSheet policy={policy} user={user} onLogout={onLogout} />;
}

function ChangePasswordSheet({ policy, user, onLogout }: { policy: PasswordPolicy; user: PolicyUser; onLogout: () => void }) {
  const pick = usePick();
  const [opening, setOpening] = useState(0);
  useEffect(() => {
    if (policy.dialogOpen) setOpening((n) => n + 1);
  }, [policy.dialogOpen]);
  return (
    <ResponsiveModal
      open={policy.dialogOpen}
      onOpenChange={(open) => (open ? policy.openDialog() : policy.closeDialog())}
      title={pick({ en: 'Change password', bn: 'পাসওয়ার্ড বদলান' })}
    >
      <ChangePasswordPanel key={opening} policy={policy} user={user} onLogout={onLogout} inSheet />
    </ResponsiveModal>
  );
}

function PasswordField({ label, value, onChange, autoComplete, autoFocus }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const pick = usePick();
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <Input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        trailing={
          <IconButton
            size="sm"
            className="-mr-2"
            label={visible ? pick({ en: 'Hide password', bn: 'পাসওয়ার্ড লুকান' }) : pick({ en: 'Show password', bn: 'পাসওয়ার্ড দেখান' })}
            icon={visible ? <EyeOff /> : <Eye />}
            onClick={() => setVisible((v) => !v)}
          />
        }
      />
    </Field>
  );
}

function ChangePasswordPanel({ policy, user, onLogout, inSheet = false }: { policy: PasswordPolicy; user: PolicyUser; onLogout: () => void; inSheet?: boolean }) {
  const pick = usePick();
  const lang = useLang();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<Text | null>(null);
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

  const heading: Text = reason === 'reset'
    ? { en: 'Set your own password', bn: 'নিজের পাসওয়ার্ড দিন' }
    : { en: 'Time for a new password', bn: 'নতুন পাসওয়ার্ড দেওয়ার সময় হয়েছে' };
  const intro: Text | null = !blocking
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

  const body = done ? (
    <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
      <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success" aria-hidden="true">
        <Check className="size-7" />
      </span>
      <p className="text-body-md font-semibold text-text">{pick({ en: 'Password changed. Opening the app again...', bn: 'পাসওয়ার্ড বদলানো হয়েছে। অ্যাপ আবার খুলছে...' })}</p>
      <p className="text-body-sm text-text-2">{pick({ en: 'Other phones signed in as you will need the new password.', bn: 'অন্য ফোনে আপনার অ্যাকাউন্টে নতুন পাসওয়ার্ড দিয়ে ঢুকতে হবে।' })}</p>
    </div>
  ) : (
    <form onSubmit={save} className="flex flex-col gap-4" lang={lang}>
      {intro && <Callout tone="warning">{pick(intro)}</Callout>}
      <PasswordField
        label={reason === 'reset' ? pick({ en: 'Temporary password', bn: 'অস্থায়ী পাসওয়ার্ড' }) : pick({ en: 'Current password', bn: 'বর্তমান পাসওয়ার্ড' })}
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        autoFocus
      />
      <PasswordField label={pick({ en: 'New password', bn: 'নতুন পাসওয়ার্ড' })} value={next} onChange={setNext} autoComplete="new-password" />
      <PasswordField label={pick({ en: 'New password again', bn: 'নতুন পাসওয়ার্ড আবার লিখুন' })} value={confirm} onChange={setConfirm} autoComplete="new-password" />

      <ul className="flex flex-col gap-1.5" aria-label={pick({ en: 'Password rules', bn: 'পাসওয়ার্ডের নিয়ম' })}>
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-start gap-2 text-body-sm">
            <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full', rule.ok ? 'bg-success-soft text-success' : 'bg-surface-2 text-text-3')} aria-hidden="true">
              {rule.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            </span>
            <span className={rule.ok ? 'text-text' : 'text-text-2'}>{pick(rule)}</span>
          </li>
        ))}
      </ul>

      <p className="text-label text-text-3">
        {pick({ en: 'Tip: three words you can remember plus a number, like river-lamp-tiger-48.', bn: 'টিপ: মনে রাখা সহজ তিনটি শব্দ আর একটি সংখ্যা, যেমন river-lamp-tiger-48।' })}
      </p>

      {error && <Callout tone="danger">{pick(error)}</Callout>}

      <Button type="submit" size="lg" fullWidth disabled={!canSave} loading={saving}>
        {pick({ en: 'Save new password', bn: 'নতুন পাসওয়ার্ড সেভ করুন' })}
      </Button>

      {blocking ? (
        <Button variant="ghost" size="lg" fullWidth leadingIcon={<LogOut aria-hidden="true" />} onClick={onLogout}>
          {pick({ en: 'Log out', bn: 'লগ আউট' })}
        </Button>
      ) : (
        <Button variant="ghost" size="lg" fullWidth onClick={policy.closeDialog}>
          {pick({ en: 'Cancel', bn: 'বাতিল' })}
        </Button>
      )}
    </form>
  );

  if (inSheet) return body;

  // Blocking: replaces the whole app until a new password is set.
  return (
    <div className="flex min-h-dvh flex-col items-center justify-start bg-bg px-4 py-6 sm:justify-center">
      <div className="mb-4 flex items-center gap-2">
        <img src="/bunny-logo.png" alt="" className="size-9 object-contain" />
        <span className="text-title font-semibold text-text">Bunny Momos</span>
      </div>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface">
        <div className="flex items-start gap-3 border-b border-border p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-danger-soft text-danger" aria-hidden="true">
            <ShieldAlert className="size-5" />
          </span>
          <h1 className="text-title font-semibold text-text">{pick(heading)}</h1>
        </div>
        <div className="p-5">{body}</div>
      </div>
    </div>
  );
}
