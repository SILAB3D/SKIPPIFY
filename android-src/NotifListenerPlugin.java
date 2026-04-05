package com.skippify.app;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.net.Uri;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * Capacitor plugin that bridges SpotifyNotificationListener → JavaScript.
 */
@CapacitorPlugin(name = "NotifListener")
public class NotifListenerPlugin extends Plugin
        implements SpotifyNotificationListener.TrackListener {

    private static volatile NotifListenerPlugin sInstance;
    private static volatile String sPendingOpenRoute = "";

    /** Singleton accessor for MainActivity.onResume(). */
    public static NotifListenerPlugin getInstance() {
        return sInstance;
    }

    @Override
    public void load() {
        sInstance = this;
        SpotifyNotificationListener.setListener(this);
        captureOpenRouteFromIntent();

        // On first load, request POST_NOTIFICATIONS if needed (Android 13+)
        requestPostNotificationsIfNeeded();
    }

    // ── TrackListener callback (called from service thread) ───────────────────
    @Override
    public void onTrack(String track, String artist, String album, long durationMs, boolean isPlaying) {
        JSObject data = new JSObject();
        data.put("track",     track);
        data.put("artist",    artist);

        String event;
        if (TextUtils.isEmpty(track) && TextUtils.isEmpty(artist)) {
            event = "stopped";
        } else {
            event = isPlaying ? "playing" : "paused";
        }
        data.put("event", event);

        if (!TextUtils.isEmpty(album)) {
            data.put("album", album);
        }
        if (durationMs > 0) {
            data.put("duration_ms", durationMs);
        }
        data.put("is_playing", isPlaying);
        data.put("played_at", SpotifyNotificationListener.toIso8601(System.currentTimeMillis()));
        data.put("source",    "notification");
        notifyListeners("spotifyTrack", data, true);
    }

    /**
     * Called by MainActivity.onResume() so we can re-check permission
     * status after the user returns from system settings.
     */
    public void onActivityResumed() {
        captureOpenRouteFromIntent();

        boolean enabled = isNotificationListenerEnabled();
        JSObject data = new JSObject();
        data.put("enabled", enabled);
        notifyListeners("permissionChanged", data, true);
        emitFeatureConfigChanged();

        String route = consumePendingOpenRouteValue();
        if (!route.isEmpty()) {
            emitOpenRoute(route);
        }
    }

    public static void notifyFeatureConfigChanged() {
        NotifListenerPlugin instance = sInstance;
        if (instance != null) {
            try {
                instance.emitFeatureConfigChanged();
            } catch (Throwable ignored) {
            }
        }
    }

    // ── Plugin methods callable from JS ───────────────────────────────────────

    /** Returns { enabled: boolean } – whether notification listener access is granted. */
    @PluginMethod
    public void isEnabled(PluginCall call) {
        boolean enabled = isNotificationListenerEnabled();
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }

    /** Opens the system Notification Access settings screen. */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        openNotificationListenerSettings();
        call.resolve();
    }

    /**
     * Shows a native Android dialog explaining why the permission is needed,
     * then opens system settings if user accepts.
     */
    @PluginMethod
    public void promptPermission(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            new AlertDialog.Builder(getActivity())
                .setTitle("Acceso a notificaciones")
                .setMessage(
                    "Skippify necesita acceso a las notificaciones de tu dispositivo " +
                    "para detectar automáticamente las canciones que escuchas en Spotify.\n\n" +
                    "En la siguiente pantalla, busca \"Skippify\" y activa el permiso."
                )
                .setPositiveButton("Activar", (dialog, which) -> {
                    openNotificationListenerSettings();
                    call.resolve(new JSObject().put("opened", true));
                })
                .setNegativeButton("Ahora no", (dialog, which) -> {
                    call.resolve(new JSObject().put("opened", false));
                })
                .setCancelable(false)
                .show();
        });
    }

    /**
     * Ensures POST_NOTIFICATIONS runtime permission (Android 13+)
     * and notification listener access are both handled.
     */
    @PluginMethod
    public void ensureAllPermissions(PluginCall call) {
        // 1. POST_NOTIFICATIONS (Android 13+)
        requestPostNotificationsIfNeeded();

        // 2. Notification listener access
        boolean listenerEnabled = isNotificationListenerEnabled();
        boolean batteryOptimizationIgnored = isBatteryOptimizationIgnored();

        JSObject result = new JSObject();
        result.put("listenerEnabled", listenerEnabled);
        result.put("postNotificationsGranted", isPostNotificationsGranted());
        result.put("batteryOptimizationIgnored", batteryOptimizationIgnored);
        call.resolve(result);
    }

    /** Opens battery optimization exclusion flow for this app (Android 6+). */
    @PluginMethod
    public void requestIgnoreBatteryOptimization(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!isBatteryOptimizationIgnored()) {
                    intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                } else {
                    intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                }
            } else {
                intent = new Intent(Settings.ACTION_SETTINGS);
            }

            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (Throwable ignored) {
            call.resolve(new JSObject().put("opened", false));
        }
    }

    /**
     * Drains any Spotify play/pause/stopped events captured while the WebView was
     * paused or the JS layer was not running.
     */
    @PluginMethod
    public void drainBackgroundEvents(PluginCall call) {
        JSArray out = new JSArray();

        synchronized (SpotifyNotificationListener.sEventFileLock) {
            try {
                File dir = getContext().getFilesDir();
                if (dir != null) {
                    File f = new File(dir, SpotifyNotificationListener.EVENT_LOG_FILE);
                    if (f.exists() && f.isFile()) {
                        int maxLines = 5000;
                        int linesRead = 0;

                        try (BufferedReader reader = new BufferedReader(
                                new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8)
                        )) {
                            String line;
                            while ((line = reader.readLine()) != null) {
                                if (++linesRead > maxLines) break;
                                line = line.trim();
                                if (line.isEmpty()) continue;

                                try {
                                    JSONObject o = new JSONObject(line);
                                    JSObject evt = new JSObject();
                                    if (o.has("played_at")) evt.put("played_at", o.optString("played_at", ""));
                                    if (o.has("event")) evt.put("event", o.optString("event", ""));
                                    if (o.has("track")) evt.put("track", o.optString("track", ""));
                                    if (o.has("artist")) evt.put("artist", o.optString("artist", ""));
                                    if (o.has("album")) evt.put("album", o.optString("album", ""));
                                    if (o.has("duration_ms")) evt.put("duration_ms", o.optLong("duration_ms", 0L));
                                    if (o.has("is_playing")) evt.put("is_playing", o.optBoolean("is_playing", false));
                                    if (o.has("source")) evt.put("source", o.optString("source", ""));
                                    out.put(evt);
                                } catch (Throwable ignored) {
                                }
                            }
                        }
                        //noinspection ResultOfMethodCallIgnored
                        f.delete();
                    }
                }
            } catch (Throwable ignored) {
            }
        }

        JSObject result = new JSObject();
        result.put("events", out);
        call.resolve(result);
    }

    /**
     * Skips the current Spotify track via MediaSession transport controls.
     * Used by the "Saltar duplicadas" feature in JS.
     */
    @PluginMethod
    public void skipTrack(PluginCall call) {
        SpotifyNotificationListener.skipCurrentTrack();
        call.resolve();
    }

    @PluginMethod
    public void consumePendingOpenRoute(PluginCall call) {
        JSObject result = new JSObject();
        result.put("route", consumePendingOpenRouteValue());
        call.resolve(result);
    }

    @PluginMethod
    public void getFeatureConfig(PluginCall call) {
        call.resolve(buildFeatureConfig());
    }

    @PluginMethod
    public void setFeatureConfig(PluginCall call) {
        String listeningMode = call.getString("listeningMode", "custom");
        boolean skipDuplicates = call.getBoolean("skipDuplicates", true);
        String skipDuplicatesInterval = call.getString("skipDuplicatesInterval", "1w");
        boolean silenceAds = call.getBoolean("silenceAds", false);
        boolean customSkipDuplicates = call.getBoolean("customSkipDuplicates", skipDuplicates);
        String customSkipDuplicatesInterval = call.getString("customSkipDuplicatesInterval", skipDuplicatesInterval);

        SpotifyNotificationListener.syncFeatureConfig(
            getContext(),
            listeningMode,
            skipDuplicates,
            skipDuplicatesInterval,
            silenceAds,
            customSkipDuplicates,
            customSkipDuplicatesInterval
        );

        emitFeatureConfigChanged();
        call.resolve(buildFeatureConfig());
    }

    /**
     * Persists skip-duplicates settings so native background listener can
     * evaluate duplicates even when JS/WebView is not active.
     */
    @PluginMethod
    public void setSkipConfig(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        String interval = call.getString("interval", "1w");
        SpotifyNotificationListener.configureSkipDuplicates(getContext(), enabled, interval);
        emitFeatureConfigChanged();
        call.resolve();
    }

    /**
     * Persists "silence ads" setting so native listener can mute/unmute
     * media volume when Spotify notifications indicate ads.
     */
    @PluginMethod
    public void setAdsMuteConfig(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        SpotifyNotificationListener.configureSilenceAds(getContext(), enabled);
        emitFeatureConfigChanged();
        call.resolve();
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private JSObject buildFeatureConfig() {
        JSObject result = new JSObject();
        result.put("listeningMode", SpotifyNotificationListener.getListeningMode(getContext()));
        result.put("skipDuplicates", SpotifyNotificationListener.isSkipDuplicatesEnabled(getContext()));
        result.put("skipDuplicatesInterval", SpotifyNotificationListener.getSkipDuplicatesInterval(getContext()));
        result.put("customSkipDuplicates", SpotifyNotificationListener.getCustomSkipDuplicates(getContext()));
        result.put("customSkipDuplicatesInterval", SpotifyNotificationListener.getCustomSkipDuplicatesInterval(getContext()));
        result.put("silenceAds", SpotifyNotificationListener.isSilenceAdsEnabled(getContext()));
        return result;
    }

    private void emitFeatureConfigChanged() {
        notifyListeners("featureConfigChanged", buildFeatureConfig(), true);
    }

    private void emitOpenRoute(String route) {
        JSObject payload = new JSObject();
        payload.put("route", route == null ? "" : route);
        notifyListeners("openRoute", payload, true);
    }

    private void captureOpenRouteFromIntent() {
        try {
            Intent intent = getActivity() != null ? getActivity().getIntent() : null;
            if (intent == null) return;

            String route = intent.getStringExtra(SkippifyForegroundService.EXTRA_OPEN_ROUTE);
            if (route == null || route.trim().isEmpty()) return;

            sPendingOpenRoute = route.trim();
            intent.removeExtra(SkippifyForegroundService.EXTRA_OPEN_ROUTE);
        } catch (Throwable ignored) {
        }
    }

    private String consumePendingOpenRouteValue() {
        String route = sPendingOpenRoute == null ? "" : sPendingOpenRoute.trim();
        sPendingOpenRoute = "";
        return route;
    }

    private boolean isNotificationListenerEnabled() {
        String flat = Settings.Secure.getString(
                getContext().getContentResolver(), "enabled_notification_listeners");
        return !TextUtils.isEmpty(flat) && flat.contains(getContext().getPackageName());
    }

    private void openNotificationListenerSettings() {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private boolean isPostNotificationsGranted() {
        if (Build.VERSION.SDK_INT < 33) return true; // Not needed below Android 13
        return ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean isBatteryOptimizationIgnored() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Throwable ignored) {
            return false;
        }
    }

    private void requestPostNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (isPostNotificationsGranted()) return;
        try {
            ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[] { Manifest.permission.POST_NOTIFICATIONS },
                    9001
            );
        } catch (Throwable ignored) {
        }
    }
}
