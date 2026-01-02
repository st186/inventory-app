import { useState } from 'react';
import { Bell, Key, Copy, Check, AlertCircle } from 'lucide-react';

export function PushNotificationSetup() {
  const [step, setStep] = useState<'intro' | 'generate' | 'configure'>('intro');
  const [vapidKeys, setVapidKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [copied, setCopied] = useState<'public' | 'private' | null>(null);

  const generateKeys = async () => {
    try {
      // Generate VAPID keys using Web Crypto API
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        true,
        ['sign', 'verify']
      );

      // Export public key
      const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));

      // Export private key
      const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      const privateKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer)));

      // Convert to URL-safe base64
      const publicKeyUrlSafe = publicKeyBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const privateKeyUrlSafe = privateKeyBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      setVapidKeys({
        publicKey: publicKeyUrlSafe,
        privateKey: privateKeyUrlSafe,
      });
      setStep('configure');
    } catch (error) {
      console.error('Error generating VAPID keys:', error);
      alert('Failed to generate keys. Please try again or use the web-push CLI method.');
    }
  };

  const copyToClipboard = (text: string, type: 'public' | 'private') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl text-gray-900">Push Notifications Setup</h1>
              <p className="text-sm text-gray-600">Enable mobile push notifications for your team</p>
            </div>
          </div>

          {/* Step 1: Introduction */}
          {step === 'intro' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h2 className="text-lg text-gray-900 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                  What are Push Notifications?
                </h2>
                <p className="text-gray-700 mb-4">
                  Push notifications allow your team to receive instant alerts on their mobile devices, 
                  even when they're not actively using the app. Perfect for:
                </p>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 mt-1">•</span>
                    <span>Sales approval requests</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 mt-1">•</span>
                    <span>Production requests from stores</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 mt-1">•</span>
                    <span>Timesheet and leave approvals</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 mt-1">•</span>
                    <span>Urgent system notifications</span>
                  </li>
                </ul>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                <h3 className="text-gray-900 mb-2">Browser Support</h3>
                <p className="text-sm text-gray-700">
                  ✅ Chrome (Desktop & Mobile)<br />
                  ✅ Firefox (Desktop & Mobile)<br />
                  ✅ Edge (Desktop & Mobile)<br />
                  ✅ Safari 16+ (Desktop & Mobile)
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg text-gray-900">Setup Process (2 steps):</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <div className="w-8 h-8 bg-purple-500 text-white rounded-lg flex items-center justify-center mb-3">
                      1
                    </div>
                    <h4 className="text-gray-900 mb-2">Generate VAPID Keys</h4>
                    <p className="text-sm text-gray-600">
                      We'll generate secure encryption keys for push notifications
                    </p>
                  </div>
                  <div className="bg-pink-50 border border-pink-200 rounded-xl p-4">
                    <div className="w-8 h-8 bg-pink-500 text-white rounded-lg flex items-center justify-center mb-3">
                      2
                    </div>
                    <h4 className="text-gray-900 mb-2">Configure in Supabase</h4>
                    <p className="text-sm text-gray-600">
                      Copy the keys to your Supabase environment variables
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep('generate')}
                className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg"
              >
                Start Setup →
              </button>
            </div>
          )}

          {/* Step 2: Generate Keys */}
          {step === 'generate' && !vapidKeys && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-pink-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Key className="w-10 h-10 text-purple-600" />
                </div>
                <h2 className="text-xl text-gray-900 mb-3">Generate VAPID Keys</h2>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Click the button below to generate secure encryption keys for push notifications. 
                  These keys will be used to authenticate your push notification server.
                </p>
                <button
                  onClick={generateKeys}
                  className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg"
                >
                  Generate Keys
                </button>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                <h3 className="text-sm text-gray-900 mb-2">Alternative Method</h3>
                <p className="text-sm text-gray-600 mb-3">
                  If you prefer, you can generate keys using the web-push CLI:
                </p>
                <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
                  npm install -g web-push{'\n'}
                  web-push generate-vapid-keys
                </pre>
              </div>
            </div>
          )}

          {/* Step 3: Configure */}
          {step === 'configure' && vapidKeys && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                <h2 className="text-lg text-gray-900 mb-2 flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  Keys Generated Successfully!
                </h2>
                <p className="text-sm text-gray-700">
                  Now copy these keys to your Supabase environment variables.
                </p>
              </div>

              {/* Public Key */}
              <div className="space-y-2">
                <label className="block text-sm text-gray-700">
                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs mr-2">PUBLIC KEY</span>
                  VAPID_PUBLIC_KEY
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={vapidKeys.publicKey}
                    readOnly
                    className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono"
                  />
                  <button
                    onClick={() => copyToClipboard(vapidKeys.publicKey, 'public')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-purple-600 transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied === 'public' ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Private Key */}
              <div className="space-y-2">
                <label className="block text-sm text-gray-700">
                  <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs mr-2">PRIVATE KEY</span>
                  VAPID_PRIVATE_KEY
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={vapidKeys.privateKey}
                    readOnly
                    className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono"
                  />
                  <button
                    onClick={() => copyToClipboard(vapidKeys.privateKey, 'private')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-purple-600 transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied === 'private' ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <label className="block text-sm text-gray-700">
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs mr-2">OPTIONAL</span>
                  VAPID_SUBJECT
                </label>
                <input
                  type="text"
                  placeholder="mailto:your-email@example.com"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-sm"
                />
                <p className="text-xs text-gray-500">
                  Your contact email (e.g., mailto:admin@bunnymomos.com) or website URL
                </p>
              </div>

              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 space-y-4">
                <h3 className="text-gray-900 mb-2">📝 Next Steps:</h3>
                <ol className="space-y-3 text-sm text-gray-700">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs">1</span>
                    <span>Go to your Supabase project dashboard</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs">2</span>
                    <span>Navigate to <strong>Settings → Edge Functions → Secrets</strong></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs">3</span>
                    <span>Click <strong>"Add new secret"</strong> and add each environment variable</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs">4</span>
                    <span>Redeploy your edge function or restart it from the dashboard</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs">5</span>
                    <span>Refresh this page and allow notifications when prompted</span>
                  </li>
                </ol>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-800">
                  ⚠️ <strong>Important:</strong> Keep your private key secure! Never share it publicly or commit it to version control.
                </p>
              </div>

              <button
                onClick={() => window.location.reload()}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg"
              >
                Done - Test Push Notifications
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
