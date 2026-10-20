package com.bunnymomos.inventory;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.ServiceCompat;

import java.util.HashMap;

/**
 * Rings the rider's phone for an incoming ride request: loops the horn on the ALARM audio stream
 * and vibrates until it is silenced (RiderCallAlert.cancel) or RING_FOR_MS passes. Running it as a
 * foreground service is what lets it start from a high-priority push while the app is closed and
 * the phone is idle, and keeps it alive while it rings.
 */
public class RiderCallService extends Service {

    private static final String TAG = "RiderCallService";
    private static volatile boolean running = false;

    private MediaPlayer player;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable stopRunnable = this::stopRinging;

    public static boolean isRunning() {
        return running;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @SuppressWarnings({"unchecked", "deprecation"})
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra("title") : null;
        String body = intent != null ? intent.getStringExtra("body") : null;
        HashMap<String, String> data = null;
        if (intent != null && intent.getSerializableExtra("data") instanceof HashMap) {
            data = (HashMap<String, String>) intent.getSerializableExtra("data");
        }

        try {
            Notification notification = RiderCallAlert.buildRingNotification(this, data, title, body);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(this, RiderCallAlert.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(RiderCallAlert.NOTIFICATION_ID, notification);
            }
        } catch (Throwable t) {
            Log.e(TAG, "Could not go foreground", t);
            RiderCallAlert.markError(this, "Ringing service could not go foreground: " + t);
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        RiderCallAlert.markPosted(this, "ringing-service");

        RiderCallAlert.raiseAlarmVolume(this);
        startHorn();
        startVibration();

        handler.removeCallbacks(stopRunnable);
        handler.postDelayed(stopRunnable, RiderCallAlert.RING_FOR_MS);
        return START_NOT_STICKY;
    }

    private void startHorn() {
        releasePlayer();
        try {
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(RiderCallAlert.alarmAttributes());
            try {
                mp.setDataSource(this, RiderCallAlert.hornUri(this));
            } catch (Exception e) {
                // The bundled horn could not be read - fall back to the phone's own alarm tone.
                mp.reset();
                mp.setAudioAttributes(RiderCallAlert.alarmAttributes());
                mp.setDataSource(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM));
            }
            mp.setLooping(true);
            mp.prepare();
            mp.start();
            player = mp;
        } catch (Throwable t) {
            Log.e(TAG, "Could not play the horn", t);
            RiderCallAlert.markError(this, "Could not play the horn: " + t);
        }
    }

    private Vibrator vibrator() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager != null ? manager.getDefaultVibrator() : null;
        }
        return (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }

    @SuppressWarnings("deprecation")
    private void startVibration() {
        try {
            Vibrator v = vibrator();
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Alarm usage so it still vibrates when the phone is on silent.
                v.vibrate(VibrationEffect.createWaveform(RiderCallAlert.VIBRATION, 0), RiderCallAlert.alarmAttributes());
            } else {
                v.vibrate(RiderCallAlert.VIBRATION, 0);
            }
        } catch (Throwable t) {
            Log.e(TAG, "Could not vibrate", t);
        }
    }

    private void releasePlayer() {
        if (player != null) {
            try {
                player.stop();
            } catch (Throwable ignored) {
            }
            try {
                player.release();
            } catch (Throwable ignored) {
            }
            player = null;
        }
    }

    private void stopRinging() {
        handler.removeCallbacks(stopRunnable);
        releasePlayer();
        try {
            Vibrator v = vibrator();
            if (v != null) v.cancel();
        } catch (Throwable ignored) {
        }
        running = false;
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(stopRunnable);
        releasePlayer();
        try {
            Vibrator v = vibrator();
            if (v != null) v.cancel();
        } catch (Throwable ignored) {
        }
        running = false;
        super.onDestroy();
    }
}
