// Push Notification Handler for Supabase Edge Function
// This file handles sending push notifications to subscribed users

import webpush from 'npm:web-push';
import * as kv from './kv_store.tsx';

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

let vapidConfigured = false;

function ensureVapidConfigured(): void {
  if (vapidConfigured) return;

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@bhandar-ims.com';

  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys not configured. Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
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

    ensureVapidConfigured();

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.message,
      message: payload.message,
      icon: payload.icon || '/icon-192x192.png',
      tag: payload.tag || 'bhandar-notification',
      data: payload.data,
    });

    await webpush.sendNotification(storedSub.subscription, notificationPayload, {
      TTL: 86400, // 24 hours
    });

    console.log(`Push notification sent successfully to user: ${userId}`);
    return true;
  } catch (error: any) {
    console.error(`Error sending push notification to user ${userId}:`, error);

    // If subscription is gone/invalid, remove it so we stop retrying
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await removeSubscription(userId);
      console.log(`Removed invalid subscription for user: ${userId}`);
    }

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
