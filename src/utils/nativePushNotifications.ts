// Native (Android/Capacitor) Push Notification Utilities via Firebase Cloud Messaging
import { Capacitor } from '@capacitor/core';
import { PushNotifications, type Token, type PushNotificationSchema, type ActionPerformed } from '@capacitor/push-notifications';
import { projectId, publicAnonKey } from './supabase/info';
import { getNavigationTarget, type NotificationNavigationTarget } from './notificationNavigation';

export function isNativePushSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

async function sendFcmTokenToServer(token: string, userId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/push/subscribe-fcm`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ token, userId }),
      }
    );
    return response.ok;
  } catch (error) {
    console.error('Error sending FCM token to server:', error);
    return false;
  }
}

export async function unsubscribeNativePushNotifications(userId: string): Promise<boolean> {
  try {
    await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/push/unsubscribe-fcm`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ userId }),
      }
    );
    return true;
  } catch (error) {
    console.error('Error unsubscribing FCM token:', error);
    return false;
  }
}

// Initialize native push notifications; onNavigate is called when a notification is tapped
export async function initializeNativePushNotifications(
  userId: string,
  onNavigate: (target: NotificationNavigationTarget) => void
): Promise<boolean> {
  if (!isNativePushSupported()) {
    return false;
  }

  try {
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.log('ℹ️ Native push permission not granted');
      return false;
    }

    // Clear any stale listeners before re-registering (e.g. on user change)
    await PushNotifications.removeAllListeners();

    PushNotifications.addListener('registration', (token: Token) => {
      console.log('✅ FCM registration token received');
      sendFcmTokenToServer(token.value, userId);
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('FCM registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('🔔 Push notification received in foreground:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      const data = action.notification.data;
      const target = getNavigationTarget(data);
      if (target) {
        onNavigate(target);
      }
    });

    await PushNotifications.register();
    return true;
  } catch (error) {
    console.error('Error initializing native push notifications:', error);
    return false;
  }
}
