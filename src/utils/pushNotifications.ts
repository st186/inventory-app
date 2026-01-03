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

// Service worker code as inline string
const serviceWorkerCode = `
// Service Worker for Push Notifications
self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);
  
  let notificationData = {
    title: 'Bhandar-IMS',
    body: 'You have a new notification',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: 'bhandar-notification',
    requireInteraction: false,
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        title: data.title || notificationData.title,
        body: data.message || data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        tag: data.tag || notificationData.tag,
        data: data,
      };
    } catch (e) {
      console.error('Error parsing push data:', e);
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      data: notificationData.data,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
`;

// Register service worker
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushNotificationSupported()) {
    return null;
  }

  try {
    // Try to register the normal service worker file first
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.log('✅ Service Worker registered successfully from /sw.js');
      return registration;
    } catch (fileError) {
      // If file doesn't exist, create inline service worker
      console.log('📦 /sw.js not found, using inline service worker');
      
      // Create blob from service worker code
      const blob = new Blob([serviceWorkerCode], { type: 'application/javascript' });
      const swUrl = URL.createObjectURL(blob);
      
      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: '/',
      });
      console.log('✅ Service Worker registered successfully (inline)');
      return registration;
    }
  } catch (error) {
    // Service Workers cannot work in certain environments (preview, iframe, etc.)
    // This is expected and not an error - just silently return null
    // The app will work fine without push notifications in preview
    // Status messages are handled by initializePushNotifications()
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

// Manually enable push notifications (for user-triggered action)
export async function enablePushNotifications(userId: string, vapidPublicKey: string): Promise<{ success: boolean; message: string }> {
  if (!isPushNotificationSupported()) {
    return { 
      success: false, 
      message: 'Push notifications are not supported in this browser' 
    };
  }

  try {
    // Register service worker
    const registration = await registerServiceWorker();
    if (!registration) {
      return { 
        success: false, 
        message: 'Service worker registration failed' 
      };
    }

    await navigator.serviceWorker.ready;

    // Check if already subscribed
    const existingSubscription = await getExistingSubscription(registration);
    if (existingSubscription) {
      return { 
        success: true, 
        message: 'Push notifications are already enabled' 
      };
    }

    // Request permission
    const permission = await requestNotificationPermission();
    
    if (permission === 'denied') {
      return { 
        success: false, 
        message: 'Notification permission denied. Please enable notifications in your browser settings.' 
      };
    }
    
    if (permission !== 'granted') {
      return { 
        success: false, 
        message: 'Notification permission not granted' 
      };
    }

    // Subscribe to push notifications
    const subscription = await subscribeToPushNotifications(registration, vapidPublicKey);
    
    if (!subscription) {
      return { 
        success: false, 
        message: 'Failed to create push subscription' 
      };
    }

    // Send subscription to server
    const sent = await sendSubscriptionToServer(subscription, userId);
    
    if (!sent) {
      return { 
        success: false, 
        message: 'Failed to register subscription with server' 
      };
    }

    console.log('✅ Push notifications enabled successfully');
    return { 
      success: true, 
      message: 'Push notifications enabled successfully!' 
    };
  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

// Initialize push notifications (call this on app load)
export async function initializePushNotifications(userId: string, vapidPublicKey: string): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    console.log('ℹ️ Push notifications not supported in this browser');
    return false;
  }

  try {
    // Register service worker
    const registration = await registerServiceWorker();
    if (!registration) {
      console.log('ℹ️ Service worker registration failed - push notifications unavailable');
      return false;
    }

    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;

    // Check if already subscribed
    const existingSubscription = await getExistingSubscription(registration);
    
    if (existingSubscription) {
      console.log('✅ Push notifications already enabled');
      // Update server with subscription (in case userId changed)
      await sendSubscriptionToServer(existingSubscription, userId);
      return true;
    }

    // Check current permission status
    const currentPermission = Notification.permission;
    
    if (currentPermission === 'denied') {
      console.log('ℹ️ Push notifications blocked. To enable: Click 🔔 icon in address bar → Allow notifications');
      return false;
    }
    
    if (currentPermission === 'default') {
      // Don't auto-request permission on load - let user trigger it
      console.log('ℹ️ Push notifications available. Click the notification bell to enable.');
      return false;
    }

    // Permission is 'granted' but no subscription - subscribe now
    if (currentPermission === 'granted') {
      const subscription = await subscribeToPushNotifications(registration, vapidPublicKey);
      
      if (!subscription) {
        console.log('⚠️ Failed to create push subscription');
        return false;
      }

      // Send subscription to server
      await sendSubscriptionToServer(subscription, userId);
      console.log('✅ Push notifications enabled successfully');
      return true;
    }

    return false;
  } catch (error) {
    console.log('ℹ️ Push notifications unavailable:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}