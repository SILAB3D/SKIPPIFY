package com.skippify.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Minimal foreground service that keeps the Skippify process alive on
 * aggressive OEMs (Samsung One UI, Xiaomi MIUI, etc.) so that
 * SpotifyNotificationListener can continue recording play/pause events
 * even when the screen is locked or the app UI is not in the foreground.
 *
 * This service is started from SpotifyNotificationListener.onListenerConnected()
 * and runs with START_STICKY so Android will restart it if it is ever killed.
 */
public class SkippifyForegroundService extends Service {

    private static final int NOTIF_ID   = 0x5BFF; // arbitrary, non-zero
    private static final String CHANNEL = "skippify_bg";
    private static final String ACTION_SET_MODE = "com.skippify.app.action.SET_MODE";
    private static final String EXTRA_MODE = "mode";
    public static final String EXTRA_OPEN_ROUTE = "openRoute";

    /** Call from any context to (re)start the service. */
    public static void start(Context context) {
        if (context == null) return;
        Intent intent = new Intent(context, SkippifyForegroundService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Throwable ignored) {
        }
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        ensureChannel();

        if (intent != null && ACTION_SET_MODE.equals(intent.getAction())) {
            SpotifyNotificationListener.configureListeningMode(
                getApplicationContext(),
                intent.getStringExtra(EXTRA_MODE)
            );
            NotifListenerPlugin.notifyFeatureConfigChanged();
        }

        Notification notif = buildNotification();

        startForeground(NOTIF_ID, notif);

        // START_STICKY: if Android kills us, it will re-create and re-deliver
        // a null intent, which is fine – we'll call startForeground() again.
        return START_STICKY;
    }

    private Notification buildNotification() {
        String activeMode = SpotifyNotificationListener.getListeningMode(getApplicationContext());
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle("Skippify")
                .setContentText("Mantén esta notificación activa para sincronizar con Spotify")
                .setSubText("Modo activo: " + modeLabel(activeMode))
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .addAction(0, "Descubrimiento", buildModeActionPendingIntent("discovery", 101))
                .addAction(0, "Casual", buildModeActionPendingIntent("casual", 102))
                .addAction(0, "Personalizado", buildModeActionPendingIntent("custom", 103));

        PendingIntent contentIntent = buildOpenAppPendingIntent();
        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        return builder.build();
    }

    @Nullable
    private PendingIntent buildOpenAppPendingIntent() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) return null;

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launchIntent.putExtra(EXTRA_OPEN_ROUTE, "/modes");
        return PendingIntent.getActivity(this, 100, launchIntent, pendingIntentFlags());
    }

    private PendingIntent buildModeActionPendingIntent(String mode, int requestCode) {
        Intent intent = new Intent(this, SkippifyForegroundService.class);
        intent.setAction(ACTION_SET_MODE);
        intent.putExtra(EXTRA_MODE, mode);
        return PendingIntent.getService(this, requestCode, intent, pendingIntentFlags());
    }

    private int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }

    private String modeLabel(@Nullable String modeRaw) {
        String mode = modeRaw == null ? "" : modeRaw.trim().toLowerCase();
        if ("discovery".equals(mode)) return "Descubrimiento";
        if ("casual".equals(mode)) return "Casual";
        return "Personalizado";
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL) != null) return;

        NotificationChannel ch = new NotificationChannel(
                CHANNEL,
                "Skippify – segundo plano",
                NotificationManager.IMPORTANCE_LOW
        );
        ch.setDescription("Skippify está registrando escuchas de Spotify en segundo plano");
        ch.setShowBadge(false);
        ch.enableLights(false);
        ch.enableVibration(false);
        nm.createNotificationChannel(ch);
    }

    @Nullable
    @Override
    public IBinder onBind(@Nullable Intent intent) {
        return null;
    }
}
