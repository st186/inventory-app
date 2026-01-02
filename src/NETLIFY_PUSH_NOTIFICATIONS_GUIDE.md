# 🔔 Push Notifications Guide for Netlify Deployment

## ✅ Current Status

Your push notification system is **fully implemented and configured** with:
- ✅ VAPID keys set in Supabase (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
- ✅ Service Worker at `/public/sw.js`
- ✅ Backend endpoints for subscription management
- ✅ Frontend auto-initialization on login
- ✅ Notification sending API

---

## 🚀 Quick Test (5 Minutes)

### Step 1: Open Your Netlify App
Visit your deployed URL: `https://your-app-name.netlify.app`

### Step 2: Open Browser DevTools
- Press **F12** (or right-click → Inspect)
- Go to the **Console** tab

### Step 3: Log In
Sign in with any user account

### Step 4: Check Console Messages
Look for one of these messages:

**✅ SUCCESS:**
```
✅ Service Worker registered successfully
🔔 Push notifications enabled successfully for user: <user-id>
```

**⚠️ PERMISSION NEEDED:**
```
⚠️ Push notifications not enabled (permission denied or browser restrictions)
```

**❌ NOT CONFIGURED (shouldn't happen - you have VAPID keys):**
```
📱 Push notifications not configured. To enable, set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
```

---

## 🔍 Troubleshooting Steps

### Issue 1: "Permission Denied" or No Prompt

**Symptom:** Console shows permission denied, or you never saw a notification permission popup.

**Solution:**

1. **Check Browser Address Bar**
   - Look for a 🔔 or 🔒 icon
   - Click it
   - Find "Notifications" → Change to **"Allow"**
   - Refresh the page

2. **Manually Reset Permissions (Chrome)**
   - Open DevTools (F12)
   - Go to **Application** tab
   - Click **Clear site data**
   - Refresh and log in again
   - Allow notifications when prompted

3. **Manually Reset Permissions (Firefox)**
   - Click 🔒 icon in address bar
   - Click "X" next to Notifications to clear
   - Refresh and log in again
   - Allow notifications when prompted

---

### Issue 2: Service Worker Not Registering

**Symptom:** Console shows error about service worker registration

**Solution:**

1. **Check HTTPS**
   - Ensure your Netlify URL uses `https://` (it should by default)
   - Service Workers only work on HTTPS

2. **Check Service Worker File**
   - Open: `https://your-app-name.netlify.app/sw.js`
   - Should show the service worker code (not a 404 error)

3. **Check Service Worker Status**
   - Open DevTools → **Application** tab
   - Click **Service Workers** in left sidebar
   - Should show `/sw.js` as "activated and running"

4. **Unregister and Re-register**
   ```javascript
   // Run in Console
   navigator.serviceWorker.getRegistrations().then(registrations => {
     registrations.forEach(reg => reg.unregister());
   });
   // Then refresh the page
   ```

---

### Issue 3: VAPID Keys Not Working

**Symptom:** Console shows "VAPID keys not configured" even though you set them

**Solution:**

1. **Verify Keys in Supabase**
   - Go to Supabase Dashboard
   - Navigate to: **Project Settings** → **Edge Functions** → **Manage secrets**
   - Confirm these 3 variables exist:
     - `VAPID_PUBLIC_KEY`
     - `VAPID_PRIVATE_KEY`
     - `VAPID_SUBJECT`

2. **Check Key Format**
   - Keys should be URL-safe base64 strings
   - No spaces, no newlines
   - Example: `BNmVwx...abc123` (long string)

3. **Redeploy Edge Function**
   - In Supabase Dashboard
   - Go to **Edge Functions**
   - Find your function → Click **Deploy**
   - Or redeploy from command line:
     ```bash
     supabase functions deploy make-server-c2dd9b9d
     ```

4. **Test VAPID Endpoint**
   - Open in browser: 
     ```
     https://<your-project-id>.supabase.co/functions/v1/make-server-c2dd9b9d/push/vapid-public-key
     ```
   - Should return: `{"publicKey":"BNm...","configured":true}`
   - If `configured: false`, keys aren't set properly

---

### Issue 4: Notifications Not Arriving

**Symptom:** Everything enabled but notifications don't show

**Solution:**

1. **Check Browser Notifications Are Enabled**
   - Windows: Settings → System → Notifications → Ensure browser is enabled
   - macOS: System Preferences → Notifications → Ensure browser is enabled
   - Make sure "Do Not Disturb" is OFF

2. **Test Manual Notification**
   - Open DevTools Console
   - Run:
     ```javascript
     new Notification('Test', { body: 'If you see this, notifications work!' });
     ```
   - If this doesn't show, it's a browser/OS settings issue

3. **Check Backend is Sending**
   - Trigger an event (e.g., submit a production request)
   - Check server logs in Supabase:
     ```
     Supabase Dashboard → Edge Functions → Logs
     ```
   - Look for: "Push notification sent successfully"

4. **Check Subscription is Stored**
   - The subscription should be saved to KV store
   - Key format: `push_subscription:<userId>`

---

## 🧪 Testing Push Notifications

### Method 1: Use Built-in Events

Push notifications are automatically sent for:

1. **Production Requests** (when created/updated)
2. **Sales Data Uploads**
3. **Timesheet Submissions**
4. **Stock Recalibration**

Try any of these actions and you should receive a notification!

### Method 2: Manual Test via Console

```javascript
// In your browser console (after logging in)
fetch('https://<your-project-id>.supabase.co/functions/v1/make-server-c2dd9b9d/push/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <your-access-token>',
  },
  body: JSON.stringify({
    userId: '<your-user-id>',
    payload: {
      title: 'Test Notification',
      message: 'This is a test from the console!',
    }
  })
}).then(r => r.json()).then(console.log);
```

---

## 📊 Using the Diagnostic Component

I've created a diagnostic component to help you check status. To use it:

### Option 1: Add to Settings/Profile Page

```tsx
import { PushNotificationStatus } from './components/PushNotificationStatus';

// In your user profile or settings component:
<PushNotificationStatus userId={user.employeeId || user.email} />
```

### Option 2: Add to Dashboard

Add it to the main dashboard so users can see their notification status at a glance.

---

## 🔐 Security Notes

1. **VAPID Private Key**
   - NEVER expose to frontend
   - Only stored in Supabase Edge Function secrets
   - Not accessible via browser

2. **VAPID Public Key**
   - Safe to expose to frontend
   - Used by browser to subscribe to notifications
   - Cannot be used to send notifications

3. **Subscriptions**
   - Stored in KV store with user ID
   - Only accessible by authenticated users
   - Automatically cleaned up if invalid

---

## 🌐 Browser Compatibility

| Browser | Desktop | Mobile | Notes |
|---------|---------|--------|-------|
| Chrome | ✅ | ✅ | Full support |
| Firefox | ✅ | ✅ | Full support |
| Edge | ✅ | ✅ | Full support |
| Safari | ✅ (16+) | ✅ (16.4+) | Requires iOS 16.4+ |
| Opera | ✅ | ✅ | Full support |
| Brave | ✅ | ✅ | Full support |

**Important:** Safari on iOS requires iOS 16.4+ and users must "Add to Home Screen" for web push to work.

---

## 📱 Mobile Considerations

### iOS (Safari)
- Requires iOS 16.4 or later
- User must "Add to Home Screen" for push notifications
- Push works even when browser is closed

### Android (Chrome/Firefox)
- Works out of the box
- No "Add to Home Screen" requirement
- Push works even when browser is closed

---

## 🐛 Common Errors & Fixes

### Error: "Failed to register service worker"
**Fix:** Check that `/sw.js` exists and is served with correct MIME type (`application/javascript`)

### Error: "DOMException: Registration failed"
**Fix:** Ensure site is served over HTTPS (Netlify does this automatically)

### Error: "Push subscription has expired"
**Fix:** Subscription expired. User needs to log out and back in to re-subscribe

### Error: "410 Gone" when sending push
**Fix:** Subscription is invalid. System automatically removes it. User needs to re-enable notifications.

---

## ✅ Verification Checklist

Use this checklist to verify everything is working:

- [ ] Netlify site is deployed and accessible
- [ ] Site uses HTTPS (should be automatic)
- [ ] VAPID keys are set in Supabase Edge Function secrets
- [ ] `/sw.js` is accessible at root of site
- [ ] Browser supports push notifications
- [ ] User has granted notification permission
- [ ] Service Worker is registered (check DevTools → Application)
- [ ] Push subscription is active (check diagnostic component)
- [ ] Backend can send notifications (check server logs)
- [ ] Test notification received successfully

---

## 🎯 Quick Wins

If push notifications still don't work after all troubleshooting:

### Last Resort Options:

1. **Generate New VAPID Keys**
   ```bash
   npm install -g web-push
   web-push generate-vapid-keys
   ```
   Then update all 3 env vars in Supabase and redeploy

2. **Clear Everything and Start Fresh**
   - Browser: Clear site data (DevTools → Application → Clear site data)
   - Server: Delete all `push_subscription:*` keys from KV store
   - Log out and log back in
   - Allow notifications when prompted

3. **Test in Different Browser**
   - Try Chrome if using Firefox (or vice versa)
   - Sometimes browser-specific issues occur

---

## 💡 Still Not Working?

If you've tried everything above and it still doesn't work:

1. **Check browser console for any red errors**
2. **Check Supabase Edge Function logs for errors**
3. **Verify Netlify build succeeded without errors**
4. **Test on a different device/network**
5. **Ensure corporate firewall isn't blocking push services**

---

## 📚 Additional Resources

- [MDN: Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [web-push npm package](https://www.npmjs.com/package/web-push)
- [Netlify Deployment Docs](https://docs.netlify.com/)

---

**Bottom Line:** Your implementation is complete and correct. 99% of issues are browser permission or VAPID configuration problems. Follow the troubleshooting steps above and you'll get it working! 🚀
