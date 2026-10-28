package com.bunnymomos.inventory;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Handles a button tapped on a notification (see QuickActionMessagingService): Approve,
 * Reject, Delivered, Accept, Looks OK. Runs the network call on a background thread via
 * goAsync() - BroadcastReceiver.onReceive() must return immediately, and a blocking
 * network call would otherwise be killed by the OS before it completes. The short result
 * ("Request accepted", or why it didn't work) comes from the server.
 */
public class QuickActionReceiver extends BroadcastReceiver {

    private static final String TAG = "QuickActionReceiver";
    private static final String ENDPOINT = "https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/quick-action";
    // Public anon key required by the Supabase gateway on every function call - this is
    // not a secret credential, it's the same publishable key baked into the web/app
    // bundle (src/utils/supabase/info.tsx). The actual authorization for this specific
    // action comes from the single-use token in the request body, not this header.
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE";

    @Override
    public void onReceive(Context context, Intent intent) {
        String token = intent.getStringExtra("token");
        int notifId = intent.getIntExtra("notifId", 0);
        if (token == null) return;

        final PendingResult pendingResult = goAsync();
        final Context appContext = context.getApplicationContext();
        new Thread(() -> {
            try {
                runQuickAction(appContext, token, notifId);
            } finally {
                pendingResult.finish();
            }
        }).start();
    }

    private void runQuickAction(Context context, String token, int notifId) {
        boolean succeeded = false;
        String title = null;
        String message = null;
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
            JSONObject answer = readJson(succeeded ? conn.getInputStream() : conn.getErrorStream());
            if (answer != null) {
                title = answer.optString("title", null);
                message = succeeded ? answer.optString("message", null) : answer.optString("error", null);
            }
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "Quick action request failed", e);
        }

        NotificationManagerCompat.from(context).cancel(notifId);
        showResultNotification(context, notifId, succeeded, title, message);
        QuickActionMessagingService.refreshAllSummaries(context);
    }

    private static JSONObject readJson(InputStream in) {
        if (in == null) return null;
        try (InputStream stream = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = stream.read(buf)) != -1 && out.size() < 64 * 1024) out.write(buf, 0, n);
            return new JSONObject(out.toString("UTF-8"));
        } catch (Exception e) {
            return null;
        }
    }

    private void showResultNotification(Context context, int notifId, boolean succeeded, String title, String message) {
        QuickActionMessagingService.ensureChannels(context);
        String shownTitle = succeeded ? (title != null && !title.isEmpty() ? title : "Done") : "That didn't work";
        String shownBody = succeeded
            ? (message != null && !message.isEmpty() ? message : "Done.")
            : (message != null && !message.isEmpty() ? message : "Open the app to try again.");

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, QuickActionMessagingService.CH_UPDATE)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(shownTitle)
            .setContentText(shownBody)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setTimeoutAfter(10000);

        NotificationManagerCompat.from(context).notify(notifId, builder.build());
    }
}
