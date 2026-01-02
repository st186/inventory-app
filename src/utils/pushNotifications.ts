// Push Notification Utilities
import { projectId, publicAnonKey } from './supabase/info';

// Check if push notifications are supported
export function isPushNotificationSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushNotificationSupported()) {
    console.warn('Push notifications are not supported in this browser');
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  return permission;
}

// Register service worker
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushNotificationSupported()) {
    return null;
  }

  try {
    // Try to register the normal service worker file
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    console.log('✅ Service Worker registered successfully');
    return registration;
  } catch (error) {
    // Service Workers cannot work in certain environments (preview, iframe, etc.)
    // This is expected and not an error - just silently return null
    // The app will work fine without push notifications in preview
    return null;
  }
}

// Convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Subscribe to push notifications
export async function subscribeToPushNotifications(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    console.log('Push subscription successful:', subscription);
    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    return null;
  }
}

// Send subscription to server
export async function sendSubscriptionToServer(
  subscription: PushSubscription,
  userId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/push/subscribe`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userId,
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to send subscription to server');
    }

    console.log('Subscription sent to server successfully');
    return true;
  } catch (error) {
    console.error('Error sending subscription to server:', error);
    return false;
  }
}

// Get existing subscription
export async function getExistingSubscription(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  try {
    const subscription = await registration.pushManager.getSubscription();
    return subscription;
  } catch (error) {
    console.error('Error getting existing subscription:', error);
    return null;
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPushNotifications(
  userId: string
): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      
      // Remove from server
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/push/unsubscribe`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ userId }),
        }
      );

      console.log('Unsubscribed from push notifications');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    return false;
  }
}

// Initialize push notifications (call this on app load)
export async function initializePushNotifications(userId: string, vapidPublicKey: string): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    console.warn('Push notifications not supported');
    return false;
  }

  try {
    // Register service worker
    const registration = await registerServiceWorker();
    if (!registration) {
      return false;
    }

    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;

    // Check if already subscribed
    const existingSubscription = await getExistingSubscription(registration);
    
    if (existingSubscription) {
      console.log('Already subscribed to push notifications');
      // Update server with subscription (in case userId changed)
      await sendSubscriptionToServer(existingSubscription, userId);
      return true;
    }

    // Request permission
    const permission = await requestNotificationPermission();
    
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return false;
    }

    // Subscribe to push notifications
    const subscription = await subscribeToPushNotifications(registration, vapidPublicKey);
    
    if (!subscription) {
      return false;
    }

    // Send subscription to server
    await sendSubscriptionToServer(subscription, userId);

    return true;
  } catch (error) {
    console.error('Error initializing push notifications:', error);
    return false;
  }
}