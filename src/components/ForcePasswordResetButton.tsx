// Owner-only "Force password reset" for one employee (Employees screen). The server sets a
// temporary password, signs the person out on every phone and makes them choose their own at the
// next sign-in (supabase/functions/make-server-c2dd9b9d/passwords.ts). The temporary password is
// shown here once and kept only in this component's state until the owner closes it.
// Self-contained (own modal, rendered into document.body) so EmployeeManagement only needs a
// single line for it.

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Loader2, ShieldAlert, X } from 'lucide-react';
import * as api from '../utils/api';

export function ForcePasswordResetButton({ employee }: { employee: { employeeId: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<api.ForcedPasswordReset | null>(null);
  const [copied, setCopied] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setResult(null);
    setError(null);
    setCopied(false);
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.forcePasswordReset(employee.employeeId));
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

  const modal = (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start gap-3 p-5 border-b border-gray-100">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Force password reset</h2>
            <p className="text-sm text-gray-600 truncate">{employee.name} ({employee.employeeId})</p>
          </div>
          <button onClick={close} className="p-2 -m-1 text-gray-400 hover:text-gray-700 rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-700">Temporary password for {result.name || employee.name}:</p>
            <div className="flex gap-2">
              <input
                ref={passwordRef}
                readOnly
                value={result.temporaryPassword}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 px-3 py-3 font-mono text-xl tracking-wider text-center bg-gray-50 border border-gray-300 rounded-xl"
                aria-label="Temporary password"
              />
              <button
                onClick={copy}
                className="shrink-0 flex items-center gap-1.5 px-4 rounded-xl bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              <p><strong>Shown only once</strong> - it is not saved anywhere. Give it to them in person or by phone.</p>
              <p>When they sign in with it, the app makes them choose their own password.</p>
              {!result.signedOutEverywhere && (
                <p>Could not confirm they were signed out on every phone, but the app on those phones is blocked until they set a new password.</p>
              )}
            </div>
            <button onClick={close} className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors">
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>Their current password stops working straight away.</li>
              <li>They are signed out on every phone.</li>
              <li>You get a temporary password to give them; at their next sign-in they must choose their own.</li>
            </ul>
            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}
            <button
              onClick={reset}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 className="w-5 h-5 animate-spin" />}
              Reset and show temporary password
            </button>
            <button onClick={close} className="w-full py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        title="Force password reset"
      >
        <ShieldAlert className="w-5 h-5" />
      </button>
      {open && createPortal(modal, document.body)}
    </>
  );
}
