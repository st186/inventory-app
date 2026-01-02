import { useState, useEffect } from 'react';
import { Bell, BellOff, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import * as pushNotifications from '../utils/pushNotifications';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface PushNotificationStatusProps {
  userId: string;
}

export function PushNotificationStatus({ userId }: PushNotificationStatusProps) {
  const [status, setStatus] = useState<{
    supported: boolean;
    permission: NotificationPermission;
    swRegistered: boolean;
    subscribed: boolean;
    vapidConfigured: boolean;
    loading: boolean;
  }>({
    supported: pushNotifications.isPushNotificationSupported(),
    permission: 'default',
    swRegistered: false,
    subscribed: false,
    vapidConfigured: false,
    loading: true,
  });

  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    setError(null);

    try {
      // Check if supported
      const supported = pushNotifications.isPushNotificationSupported();
      
      if (!supported) {
        setStatus({
          supported: false,
          permission: 'denied',
          swRegistered: false,
          subscribed: false,
          vapidConfigured: false,
          loading: false,
        });
        return;
      }

      // Check permission
      const permission = Notification.permission;

      // Check if VAPID is configured
      const vapidResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/push/vapid-public-key`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );
      const vapidData = await vapidResponse.json();
      const vapidConfigured = vapidData.configured === true;

      // Check service worker registration
      let swRegistered = false;
      let subscribed = false;

      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration('/');
        swRegistered = !!registration;

        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          subscribed = !!subscription;
        }
      }

      setStatus({
        supported,
        permission,
        swRegistered,
        subscribed,
        vapidConfigured,
        loading: false,
      });
    } catch (err) {
      console.error('Error checking push notification status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    checkStatus();
  }, [userId]);

  const handleEnableNotifications = async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    setError(null);

    try {
      // Get VAPID public key
      const vapidResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/push/vapid-public-key`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );
      
      if (!vapidResponse.ok) {
        throw new Error('Failed to fetch VAPID key');
      }

      const vapidData = await vapidResponse.json();
      
      if (!vapidData.configured || !vapidData.publicKey) {
        throw new Error('VAPID keys not configured on server');
      }

      // Initialize push notifications
      const success = await pushNotifications.initializePushNotifications(userId, vapidData.publicKey);
      
      if (success) {
        await checkStatus();
      } else {
        throw new Error('Failed to enable push notifications');
      }
    } catch (err) {
      console.error('Error enabling push notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to enable notifications');
      setStatus(prev => ({ ...prev, loading: false }));
    }
  };

  const handleDisableNotifications = async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    setError(null);

    try {
      await pushNotifications.unsubscribeFromPushNotifications(userId);
      await checkStatus();
    } catch (err) {
      console.error('Error disabling push notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to disable notifications');
      setStatus(prev => ({ ...prev, loading: false }));
    }
  };

  if (status.loading && !status.supported) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Checking push notification status...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Browser Support */}
        <div className={`rounded-xl p-4 border-2 ${
          status.supported 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {status.supported ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            <span className="text-sm text-gray-900">Browser Support</span>
          </div>
          <p className="text-xs text-gray-600">
            {status.supported ? 'Supported' : 'Not Supported'}
          </p>
        </div>

        {/* VAPID Configuration */}
        <div className={`rounded-xl p-4 border-2 ${
          status.vapidConfigured 
            ? 'bg-green-50 border-green-200' 
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {status.vapidConfigured ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            )}
            <span className="text-sm text-gray-900">Server Config</span>
          </div>
          <p className="text-xs text-gray-600">
            {status.vapidConfigured ? 'VAPID Keys Set' : 'Not Configured'}
          </p>
        </div>

        {/* Permission Status */}
        <div className={`rounded-xl p-4 border-2 ${
          status.permission === 'granted' 
            ? 'bg-green-50 border-green-200' 
            : status.permission === 'denied'
            ? 'bg-red-50 border-red-200'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {status.permission === 'granted' ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : status.permission === 'denied' ? (
              <XCircle className="w-5 h-5 text-red-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-gray-600" />
            )}
            <span className="text-sm text-gray-900">Permission</span>
          </div>
          <p className="text-xs text-gray-600 capitalize">
            {status.permission}
          </p>
        </div>

        {/* Service Worker */}
        <div className={`rounded-xl p-4 border-2 ${
          status.swRegistered 
            ? 'bg-green-50 border-green-200' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {status.swRegistered ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-gray-600" />
            )}
            <span className="text-sm text-gray-900">Service Worker</span>
          </div>
          <p className="text-xs text-gray-600">
            {status.swRegistered ? 'Registered' : 'Not Registered'}
          </p>
        </div>

        {/* Subscription Status */}
        <div className={`rounded-xl p-4 border-2 ${
          status.subscribed 
            ? 'bg-green-50 border-green-200' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {status.subscribed ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-gray-600" />
            )}
            <span className="text-sm text-gray-900">Push Subscription</span>
          </div>
          <p className="text-xs text-gray-600">
            {status.subscribed ? 'Active' : 'Inactive'}
          </p>
        </div>

        {/* Overall Status */}
        <div className={`rounded-xl p-4 border-2 ${
          status.subscribed && status.permission === 'granted'
            ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-300' 
            : 'bg-gradient-to-br from-orange-50 to-yellow-50 border-orange-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {status.subscribed && status.permission === 'granted' ? (
              <Bell className="w-5 h-5 text-green-600" />
            ) : (
              <BellOff className="w-5 h-5 text-orange-600" />
            )}
            <span className="text-sm text-gray-900">Notifications</span>
          </div>
          <p className="text-xs text-gray-600">
            {status.subscribed && status.permission === 'granted' ? 'Enabled' : 'Disabled'}
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-900">Error</p>
              <p className="text-xs text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {!status.subscribed && status.supported && status.vapidConfigured && (
          <button
            onClick={handleEnableNotifications}
            disabled={status.loading || status.permission === 'denied'}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Bell className="w-4 h-4" />
            <span>Enable Push Notifications</span>
          </button>
        )}

        {status.subscribed && (
          <button
            onClick={handleDisableNotifications}
            disabled={status.loading}
            className="flex-1 px-4 py-3 bg-gray-500 text-white rounded-xl hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <BellOff className="w-4 h-4" />
            <span>Disable Notifications</span>
          </button>
        )}

        <button
          onClick={checkStatus}
          disabled={status.loading}
          className="px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${status.loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Help Text */}
      {!status.supported && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm text-yellow-900">
            ⚠️ Your browser doesn't support push notifications. Please use Chrome, Firefox, Edge, or Safari 16+.
          </p>
        </div>
      )}

      {!status.vapidConfigured && status.supported && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm text-yellow-900 mb-2">
            ⚠️ Push notifications are not configured on the server.
          </p>
          <p className="text-xs text-yellow-800">
            Ask your system administrator to configure VAPID keys in Supabase environment variables.
          </p>
        </div>
      )}

      {status.permission === 'denied' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-900 mb-2">
            🚫 Notification permission was blocked
          </p>
          <p className="text-xs text-red-800">
            To enable notifications:
          </p>
          <ol className="text-xs text-red-800 mt-2 space-y-1 list-decimal list-inside">
            <li>Click the 🔒 or ⚙️ icon in your browser's address bar</li>
            <li>Find "Notifications" and change it to "Allow"</li>
            <li>Refresh this page</li>
          </ol>
        </div>
      )}
    </div>
  );
}
