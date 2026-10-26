package com.bunnymomos.inventory;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom plugins must be registered before super.onCreate.
        registerPlugin(RiderAlertPlugin.class);
        registerPlugin(VoicePlugin.class);
        super.onCreate(savedInstanceState);
        showOverLockScreenForRideRequest(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        showOverLockScreenForRideRequest(intent);
    }

    /**
     * Launched from the rider's loud ride-request alert (a full-screen intent): wake the screen and
     * show over the lock screen like an incoming call. Only for that launch - normal app opens keep
     * behaving normally, so the app is never shown over the lock screen otherwise.
     */
    private void showOverLockScreenForRideRequest(Intent intent) {
        if (intent == null || !"rider_called".equals(intent.getStringExtra("type"))) return;
        // Tapping the notification itself answers the request, so silence the horn. The automatic
        // full-screen launch (screen off / locked) leaves it ringing until the rider taps Silence.
        if (intent.getBooleanExtra("silence_ride_alert", false)) {
            RiderCallAlert.cancel(this);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
    }
}
