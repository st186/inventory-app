import { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import * as api from '../utils/api';

type Props = {
  accessToken: string;
  email: string;
  onVerified: () => Promise<void> | void;
  onCancel: () => void;
};

export function TwoFactorVerify({ accessToken, email, onVerified, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (code.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.verify2FALogin(accessToken, code);
      await onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 sm:p-8">
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-blue-600 rounded-full mb-3 sm:mb-4">
            <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <h1 className="text-gray-900 mb-2">Two-Factor Authentication</h1>
          <p className="text-sm sm:text-base text-gray-600">
            Enter the 6-digit code from your authenticator app for{' '}
            <span className="font-medium">{email}</span>
          </p>
        </div>

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs sm:text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex justify-center mb-6">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(value) => setCode(value.replace(/\D/g, ''))}
            onComplete={handleVerify}
            autoFocus
          >
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

        <button
          onClick={handleVerify}
          disabled={code.length !== 6 || loading}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base touch-manipulation"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Verifying...</span>
            </>
          ) : (
            <span>Verify</span>
          )}
        </button>

        <div className="mt-4 sm:mt-6 text-center">
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-sm text-blue-600 hover:text-blue-700 active:text-blue-800 touch-manipulation disabled:opacity-50"
          >
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
