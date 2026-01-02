// Push Notification Handler for Supabase Edge Function
// This file handles sending push notifications to subscribed users

import * as kv from './kv_store.tsx';

// VAPID key type
interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string; // mailto:your-email@example.com or your website URL
}

// Push subscription type
interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface StoredSubscription {
  userId: string;
  subscription: PushSubscription;
  createdAt: string;
}

// Store push subscription
export async function storeSubscription(userId: string, subscription: PushSubscription): Promise<void> {
  const key = `push_subscription:${userId}`;
  const data: StoredSubscription = {
    userId,
    subscription,
    createdAt: new Date().toISOString(),
  };
  await kv.set(key, data);
  console.log(`Stored push subscription for user: ${userId}`);
}

// Get push subscription for a user
export async function getSubscription(userId: string): Promise<StoredSubscription | null> {
  const key = `push_subscription:${userId}`;
  const data = await kv.get(key);
  return data as StoredSubscription | null;
}

// Remove push subscription
export async function removeSubscription(userId: string): Promise<void> {
  const key = `push_subscription:${userId}`;
  await kv.del(key);
  console.log(`Removed push subscription for user: ${userId}`);
}

// Get all subscriptions (for sending to multiple users)
export async function getAllSubscriptions(): Promise<StoredSubscription[]> {
  const subscriptions = await kv.getByPrefix('push_subscription:');
  return subscriptions as StoredSubscription[];
}

// Generate VAPID keys (call this once and store the keys securely)
// You need to install web-push: npm install web-push
// For now, we'll use a simplified version with environment variables
function getVapidKeys(): VapidKeys {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@bhandar-ims.com';

  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys not configured. Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.');
  }

  return { publicKey, privateKey, subject };
}

// JWT token generation for VAPID
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateVapidAuthHeader(
  subscription: PushSubscription,
  vapidKeys: VapidKeys
): Promise<string> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  // Create JWT header
  const header = {
    typ: 'JWT',
    alg: 'ES256',
  };

  // Create JWT payload
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12 hours
    sub: vapidKeys.subject,
  };

  // For simplicity, we'll use a library approach
  // In production, you'd use proper JWT signing with the VAPID private key
  
  const headerEncoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadEncoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));

  return `vapid t=${headerEncoded}.${payloadEncoded}.signature, k=${vapidKeys.publicKey}`;
}

// Send push notification to a user
export async function sendPushNotification(
  userId: string,
  payload: {
    title: string;
    message: string;
    icon?: string;
    tag?: string;
    data?: any;
  }
): Promise<boolean> {
  try {
    const storedSub = await getSubscription(userId);
    if (!storedSub) {
      console.log(`No push subscription found for user: ${userId}`);
      return false;
    }

    const vapidKeys = getVapidKeys();
    const subscription = storedSub.subscription;

    // Prepare notification payload
    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.message,
      message: payload.message,
      icon: payload.icon || '/icon-192x192.png',
      tag: payload.tag || 'bhandar-notification',
      data: payload.data,
    });

    // Generate VAPID auth header
    const authHeader = await generateVapidAuthHeader(subscription, vapidKeys);

    // Send push notification using Web Push Protocol
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'TTL': '86400', // 24 hours
      },
      body: notificationPayload,
    });

    if (response.ok || response.status === 201) {
      console.log(`Push notification sent successfully to user: ${userId}`);
      return true;
    } else {
      console.error(`Failed to send push notification: ${response.status} ${response.statusText}`);
      
      // If subscription is invalid (410 Gone), remove it
      if (response.status === 410) {
        await removeSubscription(userId);
        console.log(`Removed invalid subscription for user: ${userId}`);
      }
      
      return false;
    }
  } catch (error) {
    console.error(`Error sending push notification to user ${userId}:`, error);
    return false;
  }
}

// Send push notification to multiple users
export async function sendPushNotificationToMultipleUsers(
  userIds: string[],
  payload: {
    title: string;
    message: string;
    icon?: string;
    tag?: string;
    data?: any;
  }
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  await Promise.all(
    userIds.map(async (userId) => {
      const result = await sendPushNotification(userId, payload);
      if (result) {
        success++;
      } else {
        failed++;
      }
    })
  );

  return { success, failed };
}

// Send push notification to all subscribed users
export async function sendPushNotificationToAll(
  payload: {
    title: string;
    message: string;
    icon?: string;
    tag?: string;
    data?: any;
  }
): Promise<{ success: number; failed: number }> {
  const allSubscriptions = await getAllSubscriptions();
  const userIds = allSubscriptions.map(sub => sub.userId);
  return sendPushNotificationToMultipleUsers(userIds, payload);
}
