import { useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { IconButton } from './ui/icon-button';
import { useT } from '../utils/i18n';

// Sign-in: the logo and one card on the warm paper background. Email and password only (there
// is no sign-up form; accounts are made by the owner). Shown in the last language used on this
// phone.

type Props = {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, name: string, role: 'manager' | 'cluster_head' | 'employee' | 'audit') => Promise<void>;
  error: string | null;
};

export function AuthPage({ onLogin, error }: Props) {
  const { t, lang } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Prevent duplicate submissions
    if (loading) return;
    setLoading(true);
    try {
      await onLogin(email, password);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8" lang={lang}>
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/bunny-logo.png" alt="" className="size-20 object-contain" draggable={false} />
          <div className="flex flex-col gap-1">
            <h1 className="text-title-lg font-semibold text-text">Bunny Momos</h1>
            <p className="text-body-sm text-text-2">{t('auth.subtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
          {error && <Callout tone="danger" live>{error}</Callout>}
          <Field label={t('auth.email')} id="login-email">
            <Input
              type="email"
              name="username"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label={t('auth.password')} id="login-password">
            <Input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              trailing={
                <IconButton
                  size="sm"
                  className="-mr-2"
                  label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  icon={showPassword ? <EyeOff /> : <Eye />}
                  onClick={() => setShowPassword(!showPassword)}
                />
              }
            />
          </Field>
          <Button type="submit" size="lg" fullWidth loading={loading} leadingIcon={<LogIn aria-hidden="true" />}>
            {loading ? t('auth.signingIn') : t('auth.signIn')}
          </Button>
        </form>
      </div>
    </div>
  );
}
