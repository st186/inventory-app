package com.bunnymomos.inventory;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge between the rider screen and the phone settings the loud ride-request alert depends
 * on (see RiderCallAlert). Android makes the user grant these themselves, so this reports what
 * is still missing and opens the right settings page for each.
 */
@CapacitorPlugin(name = "RiderAlert")
public class RiderAlertPlugin extends Plugin {

    private Context ctx() {
        return getContext();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context context = ctx();
        NotificationManager manager = context.getSystemService(NotificationManager.class);

        boolean notifications = NotificationManagerCompat.from(context).areNotificationsEnabled();
        RiderCallAlert.ensureChannel(context);
        boolean channelOn = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = manager.getNotificationChannel(RiderCallAlert.RING_CHANNEL_ID);
            channelOn = channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        // Full-screen notifications are a runtime grant from Android 14 on; earlier versions allow them.
        boolean fullScreen = true;
        if (Build.VERSION.SDK_INT >= 34 && manager != null) {
            fullScreen = manager.canUseFullScreenIntent();
        }
        boolean dnd = manager != null && manager.isNotificationPolicyAccessGranted();
        boolean battery = true;
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (power != null) {
            battery = power.isIgnoringBatteryOptimizations(context.getPackageName());
        }

        JSObject result = new JSObject();
        result.put("notifications", notifications && channelOn);
        result.put("fullScreen", fullScreen);
        result.put("doNotDisturb", dnd);
        result.put("battery", battery);
        result.put("lastReceivedAt", RiderCallAlert.lastReceivedAt(context));
        result.put("lastPostedAt", RiderCallAlert.lastPostedAt(context));
        result.put("lastError", RiderCallAlert.lastError(context));
        result.put("lastPath", RiderCallAlert.lastPath(context));
        result.put("ringing", RiderCallAlert.isRinging());
        call.resolve(result);
    }

    private void launch(PluginCall call, Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, ctx().getPackageName());
        launch(call, intent);
    }

    @PluginMethod
    public void openFullScreenSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 34) {
            intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + ctx().getPackageName()));
        } else {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx().getPackageName());
        }
        launch(call, intent);
    }

    @PluginMethod
    public void openDoNotDisturbSettings(PluginCall call) {
        launch(call, new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx().getPackageName()));
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            launch(call, new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }

    /** Plays the exact alert a real ride request produces, so the rider can check the sound. */
    @PluginMethod
    public void test(PluginCall call) {
        boolean posted = RiderCallAlert.show(ctx(), null, "Test ride request", "This is how a new ride call will sound. Open the app to stop it.");
        JSObject result = new JSObject();
        result.put("posted", posted);
        result.put("error", RiderCallAlert.lastError(ctx()));
        call.resolve(result);
    }

    /** Whether the horn is sounding right now (the rider screen shows a Silence button while it is). */
    @PluginMethod
    public void isRinging(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ringing", RiderCallAlert.isRinging());
        call.resolve(result);
    }

    /** Silences the alert - the rider tapped Silence, or the ride moved on. */
    @PluginMethod
    public void stop(PluginCall call) {
        RiderCallAlert.cancel(ctx());
        call.resolve();
    }
}
