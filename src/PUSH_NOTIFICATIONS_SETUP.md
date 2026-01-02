# Push Notifications Setup for Bhandar-IMS

This guide will help you set up push notifications for your Bhandar-IMS application on mobile Chrome and other modern browsers.

## Prerequisites

- Modern browser that supports Push API and Service Workers (Chrome, Firefox, Edge, Safari 16+)
- HTTPS connection (required for Service Workers)
- Supabase project with environment variables access

## Step 1: Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required for Web Push notifications. You need to generate a public/private key pair.

### Option A: Using web-push CLI (Recommended)

1. Install web-push globally:
```bash
npm install -g web-push
```

2. Generate VAPID keys:
```bash
web-push generate-vapid-keys
```

3. You'll get output like:
```
=======================================
Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib27SDbQjfTbkAoesLXdIwRsHK0L3V1VZuPPBzdQ...

Private Key:
p6YH7LLXxv...
=======================================
```

### Option B: Using Online Generator

Visit: https://web-push-codelab.glitch.me/

Click "Generate Keys" and copy both the public and private keys.

### Option C: Using Node.js Script

Create a file called `generate-vapid-keys.js`:

```javascript
const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);
```

Run it:
```bash
npm install web-push
node generate-vapid-keys.js
```

## Step 2: Configure Environment Variables in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Edge Functions** → **Secrets**
3. Add the following environment variables:

```
VAPID_PUBLIC_KEY=<your-public-key>
VAPID_PRIVATE_KEY=<your-private-key>
VAPID_SUBJECT=mailto:your-email@example.com
```

Replace:
- `<your-public-key>` with the public key you generated
- `<your-private-key>` with the private key you generated
- `your-email@example.com` with your contact email or your website URL (e.g., `https://yourdomain.com`)

## Step 3: Deploy the Server

After setting the environment variables, redeploy your Supabase Edge Function:

```bash
# If using Supabase CLI
supabase functions deploy make-server-c2dd9b9d
```

Or simply restart your edge function from the Supabase dashboard.

## Step 4: Test Push Notifications

1. Open your Bhandar-IMS app in Chrome on mobile or desktop
2. Log in with any user account
3. When prompted, click **Allow** to enable notifications
4. Check the browser console - you should see:
   ```
   ✅ Push notifications enabled for user: <your-user-id>
   ```

## How It Works

### For Users

1. **First Time**: When a user logs in, the app will request permission to send notifications
2. **Permission Granted**: The browser subscribes to push notifications and sends the subscription to the server
3. **Receiving Notifications**: When important events happen (sales approval, production requests, etc.), users will receive push notifications even when the app is closed

### For Developers

The push notification system consists of:

1. **Service Worker** (`/public/sw.js`): Runs in the background and handles incoming push notifications
2. **Frontend Integration** (`/utils/pushNotifications.ts`): Manages subscription and user permissions
3. **Backend API** (`/supabase/functions/server/pushNotifications.tsx`): Sends push notifications to subscribed users
4. **Storage**: Subscriptions are stored in the KV store with key `push_subscription:<userId>`

## Sending Push Notifications

### From Backend Code

```typescript
import * as push from './pushNotifications.tsx';

// Send to a single user
await push.sendPushNotification('user-id', {
  title: 'New Sales Request',
  message: 'You have a pending sales approval request',
  icon: '/icon-192x192.png',
  tag: 'sales-approval',
  data: { requestId: '12345', type: 'sales' }
});

// Send to multiple users
await push.sendPushNotificationToMultipleUsers(
  ['user1', 'user2', 'user3'],
  {
    title: 'System Update',
    message: 'New features available!'
  }
);
```

### From API Endpoint

```javascript
fetch('https://your-project.supabase.co/functions/v1/make-server-c2dd9b9d/push/send', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <access-token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 'user-id',
    title: 'Notification Title',
    message: 'Notification message',
    icon: '/icon-192x192.png',
    data: { customData: 'value' }
  })
});
```

## Browser Support

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | ✅ Yes | ✅ Yes |
| Firefox | ✅ Yes | ✅ Yes |
| Edge | ✅ Yes | ✅ Yes |
| Safari | ✅ 16+ | ✅ 16.4+ |
| Opera | ✅ Yes | ✅ Yes |

## Troubleshooting

### "Push notifications not configured" in console

**Solution**: Make sure you've set the VAPID environment variables in Supabase and redeployed the edge function.

### "Permission denied"

**Solution**: User needs to manually allow notifications. On mobile Chrome:
1. Tap the lock icon in the address bar
2. Tap "Permissions"
3. Enable "Notifications"

### Notifications not appearing

**Solution**:
1. Check if browser notifications are enabled at the system level (e.g., in Android Settings → Apps → Chrome → Notifications)
2. Verify the service worker is registered by checking `chrome://serviceworker-internals` (desktop) or browser DevTools
3. Check browser console for errors

### Service Worker not registering

**Solution**: Service workers require HTTPS. Make sure your app is served over HTTPS.

## Production Checklist

- [ ] Generate VAPID keys
- [ ] Add VAPID keys to Supabase environment variables
- [ ] Redeploy edge functions
- [ ] Test notifications on mobile and desktop
- [ ] Add app icons (`/icon-192x192.png`, `/badge-72x72.png`)
- [ ] Customize notification messages for different events
- [ ] Test notification click behavior
- [ ] Verify unsubscribe functionality works

## Privacy & Compliance

- Users must explicitly grant permission for push notifications
- Subscriptions are tied to the browser/device
- Users can revoke permission at any time through browser settings
- Push subscriptions are stored securely in your KV database
- No sensitive data should be sent in notification payloads

## Next Steps

Once push notifications are working, you can:

1. **Integrate with existing notification system**: Update the `Notifications` component to send push notifications when creating new in-app notifications
2. **Add notification preferences**: Let users choose which types of notifications they want to receive
3. **Add rich notifications**: Include images, action buttons, and interactive elements
4. **Add notification analytics**: Track delivery rates and user engagement

## Support

For issues or questions, refer to:
- [Web Push Protocol](https://datatracker.ietf.org/doc/html/rfc8030)
- [MDN Web Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
