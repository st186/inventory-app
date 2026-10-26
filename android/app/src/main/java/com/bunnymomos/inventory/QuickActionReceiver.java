package com.bunnymomos.inventory;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Handles the Approve/Reject tap from an actionable notification (see
 * QuickActionMessagingService). Runs the network call on a background thread via
 * goAsync() - BroadcastReceiver.onReceive() must return immediately, and a blocking
 * network call would otherwise be killed by the OS before it completes.
 */
public class QuickActionReceiver extends BroadcastReceiver {

    private static final String TAG = "QuickActionReceiver";
    private static final String ENDPOINT = "https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/quick-action";
    // Public anon key required by the Supabase gateway on every function call - this is
    // not a secret credential, it's the same publishable key baked into the web/app
    // bundle (src/utils/supabase/info.tsx). The actual authorization for this specific
    // action comes from the single-use token in the request body, not this header.
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE";
    private static final String RESULT_CHANNEL_ID = "bhandar_actionable";

    @Override
    public void onReceive(Context context, Intent intent) {
        String token = intent.getStringExtra("token");
        int notifId = intent.getIntExtra("notifId", 0);
        String actionType = "approve";
        String rawAction = intent.getAction();
        if (rawAction != null) {
            if (rawAction.endsWith("REJECT")) actionType = "reject";
            else if (rawAction.endsWith("DELIVER")) actionType = "deliver";
        }
        if (token == null) return;

        final String finalActionType = actionType;
        final PendingResult pendingResult = goAsync();
        final Context appContext = context.getApplicationContext();
        new Thread(() -> {
            try {
                runQuickAction(appContext, token, notifId, finalActionType);
            } finally {
                pendingResult.finish();
            }
        }).start();
    }

    private void runQuickAction(Context context, String token, int notifId, String actionType) {
        boolean succeeded = false;
        try {
            URL url = new URL(ENDPOINT);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + SUPABASE_ANON_KEY);
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);

            String body = "{\"token\":\"" + token.replace("\"", "\\\"") + "\"}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }

            int status = conn.getResponseCode();
            succeeded = status == 200;
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "Quick action request failed", e);
        }

        NotificationManagerCompat.from(context).cancel(notifId);
        showResultNotification(context, notifId, actionType, succeeded);
    }

    private void showResultNotification(Context context, int notifId, String actionType, boolean succeeded) {
        createChannelIfNeeded(context);

        String successTitle;
        switch (actionType) {
            case "reject": successTitle = "Rejected"; break;
            case "deliver": successTitle = "Marked Delivered"; break;
            default: successTitle = "Approved"; break;
        }
        String title = succeeded ? successTitle : "Action failed";
        String body = succeeded
            ? "Done."
            : "Couldn't complete this action. Open the app to try again.";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, RESULT_CHANNEL_ID)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setTimeoutAfter(10000);

        NotificationManagerCompat.from(context).notify(notifId, builder.build());
    }

    private void createChannelIfNeeded(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(RESULT_CHANNEL_ID, "Approvals", NotificationManager.IMPORTANCE_HIGH);
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
