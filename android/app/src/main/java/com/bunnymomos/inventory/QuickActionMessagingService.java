package com.bunnymomos.inventory;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * Extends Capacitor's own FCM service instead of replacing it, so the existing JS-side
 * behavior (foreground pushNotificationReceived, token refresh) keeps working via
 * super.onMessageReceived(). On top of that, this builds the displayed notification
 * itself - required because the backend now sends data-only FCM messages (no top-level
 * "notification" block), specifically so onMessageReceived always fires (including while
 * backgrounded) instead of the OS silently auto-displaying a plain notification we'd
 * have no chance to add action buttons to.
 *
 * App 1.17.0 (owner, 28 Oct 2026): one channel per kind of notification (the server's
 * notificationRules.ts), so urgent alerts can ring loud and updates stay silent, each set
 * separately in Android settings; the tray groups them by kind; a photo (a dirty area, a
 * complaint) shows inside the notification; the buttons come from the server ("actions");
 * and a notification dealt with elsewhere, or read in the app, leaves the tray.
 */
public class QuickActionMessagingService extends MessagingService {

    static final String CH_URGENT = "bm_urgent";
    static final String CH_ACTION = "bm_action";
    static final String CH_REMINDER = "bm_reminder";
    static final String CH_UPDATE = "bm_update";
    private static final String OLD_CHANNEL_ID = "bhandar_actionable"; // one channel for everything, before 1.17.0
    private static final String GROUP_PREFIX = "bm.";
    private static final String[] CATEGORIES = { "urgent", "action", "reminder", "update" };
    private static final int MAX_ACTIONS = 3;
    private static final int BRAND_COLOR = 0xFFC2410C;
    private static final int URGENT_COLOR = 0xFFB91C1C;
    private static final int MAX_IMAGE_BYTES = 4 * 1024 * 1024;
    private static final int IMAGE_WIDTH = 1080;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if (data == null) return;

        // Approved by someone else, or read in the app: take it off the tray and show nothing.
        if ("notification_resolved".equals(data.get("type"))) {
            dismiss(getApplicationContext(), data.get("notificationIds"));
            return;
        }

        String title = data.get("title");
        String body = data.get("message");
        if (isEmpty(title) && isEmpty(body)) return;

        // A ride request for a rider gets the loud horn / full-screen alert instead of a normal
        // notification - see RiderCallAlert.
        if ("rider_called".equals(data.get("type"))) {
            if (RiderCallAlert.show(getApplicationContext(), data, title, body)) return;
            // The loud alert could not be shown - fall through to a normal notification so the
            // rider is still told about the ride.
        }

        showNotification(data, title, body, remoteMessage.getMessageId());
    }

    private void showNotification(Map<String, String> data, String title, String body, String messageId) {
        Context context = getApplicationContext();
        ensureChannels(context);
        String category = categoryOf(data.get("category"));

        // Use the notification's own unique id (backend-generated per event) for the tray
        // notification ID, NOT `tag` - `tag` is shared by every notification of the same
        // type (e.g. every "Inventory Data Logged" push carries tag "inventory_logged"),
        // so keying the id off tag made each new push silently replace the previous
        // unseen one instead of stacking as its own tray entry. Falls back to tag, then a
        // timestamp, only for older/malformed payloads that predate notificationId.
        String notificationId = data.get("notificationId");
        String tag = data.get("tag");
        String idSource = notificationId != null ? notificationId
            : (tag != null ? tag : String.valueOf(System.currentTimeMillis()));
        int notifId = idSource.hashCode();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelFor(category))
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setShowWhen(true)
            .setColor("urgent".equals(category) ? URGENT_COLOR : BRAND_COLOR)
            .setPriority(priorityFor(category))
            .setGroup(GROUP_PREFIX + category)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN);

        // A photo: large in the expanded notification, small beside the text when collapsed.
        Bitmap photo = loadImage(data.get("imageUrl"));
        if (photo != null) {
            builder.setLargeIcon(photo)
                .setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(photo)
                    .bigLargeIcon((Bitmap) null)
                    .setSummaryText(body));
        } else {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        // Tapping the notification body still opens the app to the relevant screen,
        // exactly as before - only the display mechanism changed, not the tap behavior.
        Intent tapIntent = new Intent(context, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            tapIntent.putExtra(entry.getKey(), entry.getValue());
        }
        // Capacitor's PushNotificationsPlugin only reports a tap to JS (as
        // pushNotificationActionPerformed, which the app turns into the deep link) when the
        // launch intent carries "google.message_id" - FCM adds it to notifications it builds
        // itself, but this one is built here, so without it taps just opened the app.
        tapIntent.putExtra("google.message_id", messageId != null ? messageId : idSource);
        PendingIntent tapPendingIntent = PendingIntent.getActivity(
            context,
            notifId,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        builder.setContentIntent(tapPendingIntent);

        addActions(context, builder, data, notifId);

        NotificationManagerCompat.from(context).notify(notifId, builder.build());
        refreshSummary(context, category);
    }

    // The buttons the server sent ("actions": [{id, label, token}]); a server from before 1.17.0
    // sent only the three fixed tokens.
    private void addActions(Context context, NotificationCompat.Builder builder, Map<String, String> data, int notifId) {
        int added = 0;
        String actions = data.get("actions");
        if (!isEmpty(actions)) {
            try {
                JSONArray list = new JSONArray(actions);
                for (int i = 0; i < list.length() && added < MAX_ACTIONS; i++) {
                    JSONObject a = list.getJSONObject(i);
                    String id = a.optString("id");
                    String label = a.optString("label");
                    String token = a.optString("token");
                    if (isEmpty(id) || isEmpty(label) || isEmpty(token)) continue;
                    builder.addAction(0, label, buildActionPendingIntent(context, notifId, token, id));
                    added++;
                }
            } catch (Exception ignored) {
                added = 0;
            }
        }
        if (added > 0) return;
        if (data.get("approveToken") != null) builder.addAction(0, "Approve", buildActionPendingIntent(context, notifId, data.get("approveToken"), "approve"));
        if (data.get("rejectToken") != null) builder.addAction(0, "Reject", buildActionPendingIntent(context, notifId, data.get("rejectToken"), "reject"));
        if (data.get("deliverToken") != null) builder.addAction(0, "Delivered", buildActionPendingIntent(context, notifId, data.get("deliverToken"), "deliver"));
    }

    private PendingIntent buildActionPendingIntent(Context context, int notifId, String token, String action) {
        Intent intent = new Intent(context, QuickActionReceiver.class);
        intent.setAction("com.bunnymomos.inventory.QUICK_ACTION_" + action.toUpperCase());
        intent.putExtra("token", token);
        intent.putExtra("notifId", notifId);
        intent.putExtra("actionId", action);
        return PendingIntent.getBroadcast(
            context,
            notifId + action.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    // ---- Channels ------------------------------------------------------------------------

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel urgent = new NotificationChannel(CH_URGENT, "Urgent alerts", NotificationManager.IMPORTANCE_HIGH);
        urgent.setDescription("Machine breakdowns, dirty-place alarms, stock running out, complaints to answer");
        urgent.enableVibration(true);
        urgent.setVibrationPattern(new long[] { 0, 500, 200, 500, 200, 800 });
        urgent.enableLights(true);
        urgent.setLightColor(Color.RED);

        NotificationChannel action = new NotificationChannel(CH_ACTION, "Needs action", NotificationManager.IMPORTANCE_HIGH);
        action.setDescription("Approvals, requests and checks waiting for you");

        NotificationChannel reminder = new NotificationChannel(CH_REMINDER, "Reminders", NotificationManager.IMPORTANCE_DEFAULT);
        reminder.setDescription("Photos due, store cover and other reminders");

        NotificationChannel update = new NotificationChannel(CH_UPDATE, "Updates", NotificationManager.IMPORTANCE_LOW);
        update.setDescription("Things that happened - shown without a sound");

        // Creating an existing channel changes nothing the person set in Android settings.
        manager.createNotificationChannels(Arrays.asList(urgent, action, reminder, update));
        manager.deleteNotificationChannel(OLD_CHANNEL_ID);
    }

    private static String categoryOf(String raw) {
        for (String c : CATEGORIES) if (c.equals(raw)) return c;
        return "action"; // a server from before the categories
    }

    static String channelFor(String category) {
        switch (category) {
            case "urgent": return CH_URGENT;
            case "reminder": return CH_REMINDER;
            case "update": return CH_UPDATE;
            default: return CH_ACTION;
        }
    }

    private static int priorityFor(String category) {
        switch (category) {
            case "urgent": return NotificationCompat.PRIORITY_MAX;
            case "action": return NotificationCompat.PRIORITY_HIGH;
            case "update": return NotificationCompat.PRIORITY_LOW;
            default: return NotificationCompat.PRIORITY_DEFAULT;
        }
    }

    // ---- Grouping ------------------------------------------------------------------------

    // One summary per kind once two or more of that kind are in the tray ("3 need action", with
    // their titles); gone again when fewer than two are left.
    static void refreshSummary(Context context, String category) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        String group = GROUP_PREFIX + category;
        int summaryId = (group + ".summary").hashCode();
        List<String> titles = new ArrayList<>();
        try {
            for (StatusBarNotification sbn : manager.getActiveNotifications()) {
                Notification n = sbn.getNotification();
                if (sbn.getId() == summaryId || !group.equals(n.getGroup())) continue;
                if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) continue;
                CharSequence t = n.extras.getCharSequence(Notification.EXTRA_TITLE);
                titles.add(t != null ? t.toString() : "");
            }
        } catch (Exception ignored) {
            return;
        }
        if (titles.size() < 2) {
            NotificationManagerCompat.from(context).cancel(summaryId);
            return;
        }
        NotificationCompat.InboxStyle style = new NotificationCompat.InboxStyle();
        for (int i = 0; i < Math.min(5, titles.size()); i++) style.addLine(titles.get(i));
        if (titles.size() > 5) style.setSummaryText("+" + (titles.size() - 5) + " more");

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openIntent = PendingIntent.getActivity(context, summaryId, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification summary = new NotificationCompat.Builder(context, channelFor(category))
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(titles.size() + " " + summaryLabel(category))
            .setContentText(titles.get(0))
            .setStyle(style)
            .setColor("urgent".equals(category) ? URGENT_COLOR : BRAND_COLOR)
            .setGroup(group)
            .setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setContentIntent(openIntent)
            .build();
        NotificationManagerCompat.from(context).notify(summaryId, summary);
    }

    static void refreshAllSummaries(Context context) {
        for (String c : CATEGORIES) refreshSummary(context, c);
    }

    private static String summaryLabel(String category) {
        switch (category) {
            case "urgent": return "urgent alerts";
            case "reminder": return "reminders";
            case "update": return "updates";
            default: return "need action";
        }
    }

    // ---- Leaving the tray ----------------------------------------------------------------

    // ids: comma-separated notification ids, or "*" for all of ours (Mark all read). Ride-request
    // alerts have their own channels and are never touched.
    static void dismiss(Context context, String ids) {
        if (isEmpty(ids)) return;
        NotificationManagerCompat compat = NotificationManagerCompat.from(context);
        if ("*".equals(ids)) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager == null) return;
            try {
                for (StatusBarNotification sbn : manager.getActiveNotifications()) {
                    String group = sbn.getNotification().getGroup();
                    if (group != null && group.startsWith(GROUP_PREFIX)) compat.cancel(sbn.getId());
                }
            } catch (Exception ignored) {
                // nothing to clear
            }
        } else {
            for (String id : ids.split(",")) {
                if (!id.trim().isEmpty()) compat.cancel(id.trim().hashCode());
            }
        }
        refreshAllSummaries(context);
    }

    // ---- Photo ---------------------------------------------------------------------------

    // The photo for a notification, scaled down to about screen width. Push messages can't
    // carry it, so the server sends a link that works for a day; nothing if it can't be had
    // quickly - the notification then shows without it.
    private static Bitmap loadImage(String url) {
        if (isEmpty(url) || !url.startsWith("https://")) return null;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(8000);
            if (conn.getResponseCode() != 200) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = conn.getInputStream()) {
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    if (out.size() > MAX_IMAGE_BYTES) return null;
                }
            }
            byte[] bytes = out.toByteArray();
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth <= 0) return null;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = 1;
            while (bounds.outWidth / (opts.inSampleSize * 2) >= IMAGE_WIDTH) opts.inSampleSize *= 2;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static boolean isEmpty(String s) {
        return s == null || s.isEmpty();
    }
}
