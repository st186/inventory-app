// Owner-only "Force password reset" for one person (Team → People → a person). The server sets a
// temporary password, signs the person out on every phone and makes them choose their own at the
// next sign-in (supabase/functions/make-server-c2dd9b9d/passwords.ts). The temporary password is
// shown here once and kept only in this component's state until the owner closes it.
import { useRef, useState } from 'react';
import { Check, Copy, ShieldAlert } from 'lucide-react';
import * as api from '../utils/api';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { ListRow } from './ui/list-row';
import { ResponsiveModal } from './ui/responsive-modal';
import { teamApi } from './team/teamApi';

export function ForcePasswordResetButton({ employee, trigger = 'icon' }: { employee: { employeeId: string; name: string }; trigger?: 'icon' | 'row' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<api.ForcedPasswordReset | null>(null);
  const [copied, setCopied] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const clear = () => {
    setResult(null);
    setError(null);
    setCopied(false);
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await teamApi.forcePasswordReset(employee.employeeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset the password');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard blocked (older Android WebView): select it so a long-press copy works.
      passwordRef.current?.select();
    }
  };

  return (
    <>
      {trigger === 'row' ? (
        <ListRow icon={ShieldAlert} title="Force password reset" subtitle="Signs them out everywhere; they choose a new password" onClick={() => setOpen(true)} />
      ) : (
        <IconButton label="Force password reset" icon={<ShieldAlert />} onClick={() => setOpen(true)} />
      )}
      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        onClosed={clear}
        title="Force password reset"
        description={`${employee.name} · ${employee.employeeId}`}
        footer={
          result ? (
            <Button size="lg" className="flex-1" onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <Button variant="danger" size="lg" className="flex-1" loading={busy} onClick={reset}>
              Reset and show temporary password
            </Button>
          )
        }
      >
        {result ? (
          <div className="flex flex-col gap-4">
            <p className="text-body-sm text-text-2">Temporary password for {result.name || employee.name}:</p>
            <div className="flex items-center gap-2">
              <Input
                ref={passwordRef}
                readOnly
                value={result.temporaryPassword}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Temporary password"
                className="num font-semibold tracking-wide"
              />
              <Button variant="secondary" leadingIcon={copied ? <Check /> : <Copy />} onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <Callout tone="warning" title="Shown only once">
              It isn't saved anywhere. Give it to them in person or by phone; when they sign in with it, the app makes them choose their own password.
            </Callout>
            {!result.signedOutEverywhere && (
              <Callout tone="neutral">Couldn't confirm they were signed out on every phone, but the app on those phones is blocked until they set a new password.</Callout>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-sm text-text-2">
              <li>Their current password stops working straight away.</li>
              <li>They are signed out on every phone.</li>
              <li>You get a temporary password to give them; at their next sign-in they must choose their own.</li>
            </ul>
            {error && <Callout tone="danger" title="Couldn't reset">{error}</Callout>}
          </div>
        )}
      </ResponsiveModal>
    </>
  );
}
