package com.bunnymomos.inventory;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.util.HashMap;
import java.util.Map;

/**
 * The loud "ride request" alert a rider gets when production calls them in.
 *
 * The horn and vibration are NOT left to a notification channel (Android silences those under
 * silent mode, Do Not Disturb, "alerting" downgrades and OEM rules, which is exactly how the
 * first version ended up showing a silent notification). Instead RiderCallService plays the horn
 * itself on the ALARM stream and vibrates, as a foreground service, until the rider silences it
 * from the app or about a minute passes. The notification only carries the text and the
 * full-screen intent that wakes the screen like an incoming call.
 *
 * If the service cannot start for any reason, it falls back to a channel notification with the
 * same sound so the rider is never left with nothing.
 */
public final class RiderCallAlert {

    // Channel settings are immutable once created, so any change to sound/importance needs a new id.
    public static final String FALLBACK_CHANNEL_ID = "bhandar_rider_call_v1";   // has the horn as its sound
    public static final String RING_CHANNEL_ID = "bhandar_rider_ring_v2";       // silent: the service plays the sound
    public static final int NOTIFICATION_ID = 771001;
    static final long RING_FOR_MS = 60_000L;

    private static final String PREFS = "rider_call_alert";
    private static final String TAG = "RiderCallAlert";
    static final long[] VIBRATION = new long[] {0, 700, 300, 700, 300, 700, 300, 1200};

    private RiderCallAlert() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Diagnostics the rider screen shows: when the last alert reached this phone, was posted, or failed. */
    public static long lastReceivedAt(Context context) { return prefs(context).getLong("received", 0L); }
    public static long lastPostedAt(Context context) { return prefs(context).getLong("posted", 0L); }
    public static String lastError(Context context) { return prefs(context).getString("error", ""); }
    public static String lastPath(Context context) { return prefs(context).getString("path", ""); }

    static void markPosted(Context context, String path) {
        prefs(context).edit().putLong("posted", System.currentTimeMillis()).putString("path", path).apply();
    }

    static void markError(Context context, String error) {
        prefs(context).edit().putString("error", error).apply();
    }

    static Uri hornUri(Context context) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName() + "/" + R.raw.rider_horn);
    }

    static AudioAttributes alarmAttributes() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    }

    private static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        if (manager.getNotificationChannel(RING_CHANNEL_ID) == null) {
            NotificationChannel ring = new NotificationChannel(RING_CHANNEL_ID, "Ride requests", NotificationManager.IMPORTANCE_HIGH);
            ring.setDescription("Shows the ride request on screen while the horn rings");
            ring.setSound(null, null);          // RiderCallService plays the horn itself
            ring.enableVibration(false);        // ...and vibrates itself
            ring.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(ring);
        }
        if (manager.getNotificationChannel(FALLBACK_CHANNEL_ID) == null) {
            NotificationChannel loud = new NotificationChannel(FALLBACK_CHANNEL_ID, "Ride requests (backup)", NotificationManager.IMPORTANCE_HIGH);
            loud.setDescription("Backup alert used only if the ringing service cannot start");
            loud.setSound(hornUri(context), alarmAttributes());
            loud.enableVibration(true);
            loud.setVibrationPattern(VIBRATION);
            loud.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            try {
                loud.setBypassDnd(true);        // only effective once Do Not Disturb access is granted
            } catch (Exception ignored) {
            }
            manager.createNotificationChannel(loud);
        }
    }

    /** Public so the settings card can make sure the channels exist before reading their state. */
    public static void ensureChannel(Context context) {
        createChannels(context);
    }

    /** Makes sure the alarm stream is audible - riders often leave it near zero. */
    static void raiseAlarmVolume(Context context) {
        try {
            AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) return;
            int max = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            int wanted = (int) Math.ceil(max * 0.85);
            if (audio.getStreamVolume(AudioManager.STREAM_ALARM) < wanted) {
                audio.setStreamVolume(AudioManager.STREAM_ALARM, wanted, 0);
            }
        } catch (Exception ignored) {
            // Some devices refuse volume changes in Do Not Disturb - the alert still rings.
        }
    }

    private static PendingIntent openIntent(Context context, Map<String, String> data, boolean silenceOnOpen, int requestCode) {
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("type", "rider_called");
        // A deliberate tap on the notification answers the request; the automatic full-screen
        // launch must NOT silence it (the rider hasn't touched anything yet).
        open.putExtra("silence_ride_alert", silenceOnOpen);
        if (data != null) {
            for (Map.Entry<String, String> entry : data.entrySet()) {
                if (!"type".equals(entry.getKey())) open.putExtra(entry.getKey(), entry.getValue());
            }
        }
        return PendingIntent.getActivity(context, requestCode, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** The on-screen part of the alert; used by the ringing service as its foreground notification. */
    static Notification buildRingNotification(Context context, Map<String, String> data, String title, String body) {
        createChannels(context);
        PendingIntent fullScreen = openIntent(context, data, false, NOTIFICATION_ID);
        PendingIntent tap = openIntent(context, data, true, NOTIFICATION_ID + 1);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, RING_CHANNEL_ID)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(title != null ? title : "Ride request")
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setContentIntent(tap)
            .setFullScreenIntent(fullScreen, true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        return builder.build();
    }

    /** Never throws: on any failure it records why (and returns false) so the caller can fall back. */
    public static boolean show(Context context, Map<String, String> data, String title, String body) {
        prefs(context).edit().putLong("received", System.currentTimeMillis()).putString("error", "").putString("path", "").apply();
        try {
            if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
                markError(context, "Notifications are turned off for this app");
                return false;
            }
            createChannels(context);

            // Preferred path: a foreground service that rings and vibrates on its own.
            try {
                Intent service = new Intent(context, RiderCallService.class);
                service.putExtra("title", title);
                service.putExtra("body", body);
                service.putExtra("data", data != null ? new HashMap<>(data) : new HashMap<String, String>());
                ContextCompat.startForegroundService(context, service);
                return true;       // the service records "posted" once its notification is up
            } catch (Throwable t) {
                Log.e(TAG, "Ringing service could not start - using the backup notification", t);
                markError(context, "Ringing service could not start: " + t);
            }

            // Backup path: a channel notification whose own sound is the horn.
            raiseAlarmVolume(context);
            PendingIntent fullScreen = openIntent(context, data, false, NOTIFICATION_ID);
            PendingIntent tap = openIntent(context, data, true, NOTIFICATION_ID + 1);
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, FALLBACK_CHANNEL_ID)
                .setSmallIcon(context.getApplicationInfo().icon)
                .setContentTitle(title != null ? title : "Ride request")
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setTimeoutAfter(RING_FOR_MS)
                .setContentIntent(tap)
                .setFullScreenIntent(fullScreen, true);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                builder.setSound(hornUri(context), AudioManager.STREAM_ALARM).setVibrate(VIBRATION);
            }
            Notification notification = builder.build();
            notification.flags |= Notification.FLAG_INSISTENT;
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification);
            markPosted(context, "backup-notification");
            return true;
        } catch (Throwable t) {
            Log.e(TAG, "Could not show ride alert", t);
            markError(context, String.valueOf(t));
            return false;
        }
    }

    /** Stops the horn/vibration and removes the alert. */
    public static void cancel(Context context) {
        try {
            context.stopService(new Intent(context, RiderCallService.class));
        } catch (Throwable ignored) {
        }
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
    }

    public static boolean isRinging() {
        return RiderCallService.isRunning();
    }
}
