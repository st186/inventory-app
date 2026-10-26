package com.bunnymomos.inventory;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Extends Capacitor's own FCM service instead of replacing it, so the existing JS-side
 * behavior (foreground pushNotificationReceived, token refresh) keeps working via
 * super.onMessageReceived(). On top of that, this builds the displayed notification
 * itself - required because the backend now sends data-only FCM messages (no top-level
 * "notification" block), specifically so onMessageReceived always fires (including while
 * backgrounded) instead of the OS silently auto-displaying a plain notification we'd
 * have no chance to add Approve/Reject actions to.
 */
public class QuickActionMessagingService extends MessagingService {

    private static final String CHANNEL_ID = "bhandar_actionable";
    private static final String CHANNEL_NAME = "Approvals";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if (data == null) return;

        String title = data.get("title");
        String body = data.get("message");
        if (title == null && body == null) return;

        // A ride request for a rider gets the loud horn / full-screen alert instead of a normal
        // notification - see RiderCallAlert.
        if ("rider_called".equals(data.get("type"))) {
            if (RiderCallAlert.show(getApplicationContext(), data, title, body)) return;
            // The loud alert could not be shown - fall through to a normal notification so the
            // rider is still told about the ride.
        }

        showNotification(data, title, body);
    }

    private void showNotification(Map<String, String> data, String title, String body) {
        Context context = getApplicationContext();
        createChannelIfNeeded(context);

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

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH);

        // Tapping the notification body still opens the app to the relevant screen,
        // exactly as before - only the display mechanism changed, not the tap behavior.
        Intent tapIntent = new Intent(context, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            tapIntent.putExtra(entry.getKey(), entry.getValue());
        }
        PendingIntent tapPendingIntent = PendingIntent.getActivity(
            context,
            notifId,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        builder.setContentIntent(tapPendingIntent);

        String approveToken = data.get("approveToken");
        String rejectToken = data.get("rejectToken");
        String deliverToken = data.get("deliverToken");

        if (approveToken != null) {
            builder.addAction(0, "Approve", buildActionPendingIntent(context, notifId, approveToken, "approve"));
        }
        if (rejectToken != null) {
            builder.addAction(0, "Reject", buildActionPendingIntent(context, notifId, rejectToken, "reject"));
        }
        if (deliverToken != null) {
            builder.addAction(0, "Delivered ✅", buildActionPendingIntent(context, notifId, deliverToken, "deliver"));
        }

        NotificationManagerCompat.from(context).notify(notifId, builder.build());
    }

    private PendingIntent buildActionPendingIntent(Context context, int notifId, String token, String action) {
        Intent intent = new Intent(context, QuickActionReceiver.class);
        intent.setAction("com.bunnymomos.inventory.QUICK_ACTION_" + action.toUpperCase());
        intent.putExtra("token", token);
        intent.putExtra("notifId", notifId);
        return PendingIntent.getBroadcast(
            context,
            notifId + action.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void createChannelIfNeeded(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Leave/timesheet approvals and delivery confirmations with quick actions");
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
