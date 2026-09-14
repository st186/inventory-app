import { useState } from 'react';
import { UserPlus, AlertCircle, CheckCircle } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

export function SetupClusterHead() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const handleSetup = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess(false);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/setup-cluster-head`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            email: 'subham.tewari@bunnymomos.com',
            password: 'Subham@186',
            name: 'Subham Tewari'
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to setup account');
      }

      setSuccess(true);
      setResult(data);
      console.log('Setup successful:', data);
    } catch (err) {
      console.error('Setup error:', err);
      setError(err instanceof Error ? err.message : 'Failed to setup account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-rose-50 to-blue-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg shadow-orange-500/30 flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight mb-2">
            Setup Cluster Head Account
          </h1>
          <p className="text-gray-500 text-sm">
            This will create a cluster head account for Subham Tewari
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {success && result && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-start gap-3 mb-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">Success!</p>
                <p className="text-sm text-green-700 mt-1">{result.message}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Email:</span>
                <span className="font-medium text-gray-900">{result.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Employee ID:</span>
                <span className="font-medium text-orange-600">{result.employeeId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Password:</span>
                <span className="font-medium text-gray-900">Subham@186</span>
              </div>
            </div>
            <p className="text-xs text-green-700 mt-3">
              You can now log in with these credentials
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Email:</span>
              <span className="font-medium text-gray-900">subham.tewari@bunnymomos.com</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Password:</span>
              <span className="font-medium text-gray-900">Subham@186</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Name:</span>
              <span className="font-medium text-gray-900">Subham Tewari</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Role:</span>
              <span className="font-medium text-orange-600">Cluster Head</span>
            </div>
          </div>

          <button
            onClick={handleSetup}
            disabled={loading || success}
            className="w-full bg-gradient-to-r from-orange-600 to-amber-500 text-white py-3 rounded-xl font-medium hover:shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Setting up...
              </>
            ) : success ? (
              <>
                <CheckCircle className="w-5 h-5" />
                Account Created
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5" />
                Create Cluster Head Account
              </>
            )}
          </button>

          {success && (
            <a
              href="/login"
              className="block w-full text-center bg-white border border-gray-300 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 transition-all"
            >
              Go to Login
            </a>
          )}
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="text-xs text-blue-900 font-medium mb-2">What this will do:</p>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• Delete any existing account with this email</li>
            <li>• Create a new cluster head account</li>
            <li>• Generate a unique employee ID (e.g., BM001)</li>
            <li>• Set up proper permissions and access</li>
          </ul>
        </div>
      </div>
    </div>
  );
}