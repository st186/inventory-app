import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import * as api from '../utils/api';

type Props = {
  accessToken: string;
  enabled: boolean;
  onStatusChange: (enabled: boolean) => void;
};

export function TwoFactorSetup({ accessToken, enabled, onStatusChange }: Props) {
  const [step, setStep] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const startSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.setup2FA(accessToken);
      setSecret(result.secret);
      setOtpauthUrl(result.otpauthUrl);
      setCode('');
      setStep('setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const confirmSetup = async () => {
    if (code.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.confirm2FASetup(accessToken, code);
      onStatusChange(true);
      setStep('idle');
      setSecret(null);
      setOtpauthUrl(null);
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const confirmDisable = async () => {
    if (code.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.disable2FA(accessToken, code);
      onStatusChange(false);
      setStep('idle');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (e.g. insecure context); ignore silently.
    }
  };

  const cancel = () => {
    setStep('idle');
    setSecret(null);
    setOtpauthUrl(null);
    setCode('');
    setError(null);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-gray-900 font-medium">Two-Factor Authentication</h3>
          <p className="text-sm text-gray-600 mt-1">
            {enabled
              ? 'Enabled — a code from your authenticator app is required to sign in.'
              : 'Add an extra layer of security using an authenticator app like Google Authenticator.'}
          </p>
        </div>
        <div className={`shrink-0 rounded-full p-2 ${enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
          {enabled ? (
            <ShieldCheck className="w-5 h-5 text-green-600" />
          ) : (
            <ShieldOff className="w-5 h-5 text-gray-500" />
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {step === 'idle' && (
        <button
          onClick={enabled ? () => setStep('disable') : startSetup}
          disabled={loading}
          className={`px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-2 ${
            enabled
              ? 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {enabled ? 'Disable 2FA' : 'Enable 2FA'}
        </button>
      )}

      {step === 'setup' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Scan this QR code with Google Authenticator (or any compatible app), then enter the
            6-digit code it generates.
          </p>
          {otpauthUrl && (
            <div className="flex justify-center bg-white p-4 border border-gray-200 rounded-lg w-fit mx-auto">
              <QRCodeSVG value={otpauthUrl} size={180} />
            </div>
          )}
          {secret && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <span className="font-mono break-all">{secret}</span>
              <button
                onClick={copySecret}
                type="button"
                className="text-blue-600 hover:text-blue-700"
                title="Copy secret"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}

          <div className="flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={(value) => setCode(value.replace(/\D/g, ''))} onComplete={confirmSetup}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <div className="flex gap-2">
            <button
              onClick={confirmSetup}
              disabled={code.length !== 6 || loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Enable'}
            </button>
            <button
              onClick={cancel}
              disabled={loading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Enter a current code from your authenticator app to disable 2FA.
          </p>
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={(value) => setCode(value.replace(/\D/g, ''))} onComplete={confirmDisable}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <div className="flex gap-2">
            <button
              onClick={confirmDisable}
              disabled={code.length !== 6 || loading}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Disable'}
            </button>
            <button
              onClick={cancel}
              disabled={loading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
