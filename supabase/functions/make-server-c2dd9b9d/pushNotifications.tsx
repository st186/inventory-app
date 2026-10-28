// Push Notification Handler for Supabase Edge Function
// This file handles sending push notifications to subscribed users,
// both via Web Push (VAPID, browsers) and Firebase Cloud Messaging (native Android app).

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

interface StoredFcmToken {
  userId: string;
  token: string;
  createdAt: string;
  nativeBuild?: number; // the Android app's versionCode, sent by app 1.17.0 on
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

// Store a native (Android/FCM) push token. Kept separate from web-push subscriptions
// (different key prefix) so a user signed in on both the web app and the native app
// gets notified on both at once, instead of one overwriting the other.
export async function storeFcmToken(userId: string, token: string, nativeBuild?: number): Promise<void> {
  // A token identifies one phone's app install, and that phone belongs to whoever is signed in on
  // it NOW. If it was registered for another account earlier (someone signed out without the
  // server hearing about it, or one phone is used for two logins), release it from them first -
  // otherwise their notifications keep arriving on this phone, e.g. the rider's loud ride-request
  // alert ringing on the cluster head's phone.
  try {
    const existing = await kv.getByPrefix('fcm_token:');
    for (const other of (existing || []) as StoredFcmToken[]) {
      if (other?.token === token && other.userId !== userId) {
        await kv.del(`fcm_token:${other.userId}`);
        console.log(`Released FCM token from ${other.userId} (device now belongs to ${userId})`);
      }
    }
  } catch (error) {
    console.log('Could not check for a shared FCM token:', error);
  }
  const key = `fcm_token:${userId}`;
  const data: StoredFcmToken = {
    userId,
    token,
    createdAt: new Date().toISOString(),
    ...(nativeBuild && Number.isFinite(nativeBuild) ? { nativeBuild } : {}),
  };
  await kv.set(key, data);
  console.log(`Stored FCM token for user: ${userId}`);
}

export async function getFcmToken(userId: string): Promise<StoredFcmToken | null> {
  const key = `fcm_token:${userId}`;
  const data = await kv.get(key);
  return data as StoredFcmToken | null;
}

export async function removeFcmToken(userId: string): Promise<void> {
  const key = `fcm_token:${userId}`;
  await kv.del(key);
  console.log(`Removed FCM token for user: ${userId}`);
}

export async function getAllFcmTokens(): Promise<StoredFcmToken[]> {
  const tokens = await kv.getByPrefix('fcm_token:');
  return tokens as StoredFcmToken[];
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

// ---- Firebase Cloud Messaging (HTTP v1) ----
// Requires a Firebase service account with FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY
// env vars set. Implemented with Web Crypto directly (no google-auth-library dependency)
// since Deno Edge Functions support crypto.subtle for RS256 JWT signing.

let cachedFcmAccessToken: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importFcmPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function getFcmAccessToken(): Promise<string> {
  if (cachedFcmAccessToken && cachedFcmAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedFcmAccessToken.token;
  }

  const clientEmail = Deno.env.get('FCM_CLIENT_EMAIL');
  const privateKeyRaw = Deno.env.get('FCM_PRIVATE_KEY');

  if (!clientEmail || !privateKeyRaw) {
    throw new Error('FCM service account not configured. Please set FCM_PROJECT_ID, FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY environment variables.');
  }

  // Env vars typically store the PEM with literal \n sequences instead of real newlines.
  const privateKeyPem = privateKeyRaw.includes('\\n') ? privateKeyRaw.replace(/\\n/g, '\n') : privateKeyRaw;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const key = await importFcmPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedJwt));
  const signedJwt = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to obtain FCM access token: ${response.status} ${errText}`);
  }

  const tokenData = await response.json();
  cachedFcmAccessToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };
  return cachedFcmAccessToken.token;
}

// What happened on the most recent FCM send to each user - lets callers (e.g. the rider ride
// requests) record whether Google accepted the message, for diagnosing "no alert arrived".
type FcmOutcome = { at: string; hasToken: boolean; ok: boolean; status?: number; error?: string };
const lastFcmOutcome = new Map<string, FcmOutcome>();
const recordFcm = (userId: string, o: Omit<FcmOutcome, 'at'>) => lastFcmOutcome.set(userId, { at: new Date().toISOString(), ...o });
export const getLastFcmOutcome = (userId: string): FcmOutcome | null => lastFcmOutcome.get(userId) || null;

// Send a push notification to a single FCM token. Returns false (without throwing)
// if FCM isn't configured, so callers can fall back to/coexist with web push.
async function sendFcmNotification(
  userId: string,
  token: string,
  payload: { title: string; message: string; icon?: string; tag?: string; data?: any }
): Promise<boolean> {
  const projectId = Deno.env.get('FCM_PROJECT_ID');
  if (!projectId) {
    recordFcm(userId, { hasToken: true, ok: false, error: 'FCM_PROJECT_ID is not configured' });
    return false;
  }

  try {
    const accessToken = await getFcmAccessToken();

    // FCM data payloads must be flat string maps.
    const dataStrings: Record<string, string> = {};
    if (payload.data && typeof payload.data === 'object') {
      for (const [k, v] of Object.entries(payload.data)) {
        dataStrings[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    }

    // Data-only message (no top-level "notification" block) so Android always invokes
    // onMessageReceived - including while the app is backgrounded/killed - instead of the
    // OS auto-displaying a plain notification and skipping our code entirely. This is
    // what lets the native side (QuickActionMessagingService.java) build the notification
    // itself and attach Approve/Reject action buttons when a quick-action token is present.
    dataStrings.title = payload.title;
    dataStrings.message = payload.message;
    if (payload.tag) dataStrings.tag = payload.tag;

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token,
            data: dataStrings,
            android: {
              // Reminders and updates can wait for the phone's next wake-up (notificationRules.ts).
              priority: payload.data?.category === 'update' || payload.data?.category === 'reminder' ? 'normal' : 'high',
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const status = errBody?.error?.status;
      // Token is no longer valid on the device - stop retrying.
      if (status === 'NOT_FOUND' || status === 'UNREGISTERED' || status === 'INVALID_ARGUMENT') {
        await removeFcmToken(userId);
        console.log(`Removed invalid FCM token for user: ${userId}`);
      }
      console.error(`Error sending FCM notification to user ${userId}:`, response.status, errBody);
      recordFcm(userId, { hasToken: true, ok: false, status: response.status, error: errBody?.error?.status || errBody?.error?.message || 'FCM rejected the message' });
      return false;
    }

    console.log(`FCM notification sent successfully to user: ${userId}`);
    recordFcm(userId, { hasToken: true, ok: true, status: response.status });
    return true;
  } catch (error) {
    console.error(`Error sending FCM notification to user ${userId}:`, error);
    recordFcm(userId, { hasToken: true, ok: false, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

// Takes notifications off the phone's tray once they were dealt with elsewhere or read in the
// app ('all' after Mark all read). Only to Android builds that understand it: an older one would
// show it as an empty notification (QuickActionMessagingService.java).
const DISMISS_MIN_BUILD = 59;
export async function sendFcmDismiss(userId: string, notificationIds: string[] | 'all'): Promise<boolean> {
  const stored = await getFcmToken(userId);
  if (!stored || (Number(stored.nativeBuild) || 0) < DISMISS_MIN_BUILD) return false;
  const ids = notificationIds === 'all' ? '*' : notificationIds.filter(Boolean).join(',');
  if (!ids) return false;
  return sendFcmNotification(userId, stored.token, { title: '', message: '', data: { type: 'notification_resolved', notificationIds: ids, category: 'update' } });
}

// Send push notification to a user, across every channel they're subscribed on
// (web push and/or native FCM). Returns true if at least one channel succeeded.
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
  const [webResult, fcmResult] = await Promise.all([
    sendWebPushNotification(userId, payload),
    sendFcmForUser(userId, payload),
  ]);

  return webResult || fcmResult;
}

async function sendFcmForUser(
  userId: string,
  payload: { title: string; message: string; icon?: string; tag?: string; data?: any }
): Promise<boolean> {
  const storedToken = await getFcmToken(userId);
  if (!storedToken) {
    recordFcm(userId, { hasToken: false, ok: false, error: 'No FCM token stored for this user - the app has not registered for push' });
    return false;
  }
  return sendFcmNotification(userId, storedToken.token, payload);
}

async function sendWebPushNotification(
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
      urgency: payload.data?.category === 'urgent' ? 'high' : payload.data?.category === 'update' ? 'low' : 'normal',
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
  const [webSubs, fcmTokens] = await Promise.all([getAllSubscriptions(), getAllFcmTokens()]);
  const userIds = Array.from(new Set([...webSubs.map((s) => s.userId), ...fcmTokens.map((t) => t.userId)]));
  return sendPushNotificationToMultipleUsers(userIds, payload);
}
