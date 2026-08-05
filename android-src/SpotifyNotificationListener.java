package com.skippify.app;

import android.app.Notification;
import android.content.ComponentName;
import android.content.ContentValues;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.database.Cursor;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.TimeZone;
import java.util.Arrays;

import androidx.annotation.Nullable;

/**
 * Listens to Android system notifications from Spotify (com.spotify.music)
 * and forwards extracted metadata to any registered TrackListener.
 *
 * Notes:
 * - Spotify uses media-style notifications. The most reliable source is the
 *   MediaSession metadata attached to the Notification.
 * - Extras keys (android.title/text) vary across Android/Spotify versions,
 *   so we keep a robust fallback parser.
 */
public class SpotifyNotificationListener extends NotificationListenerService {

    private static final String PREFS_NAME = "skippify-native-features";
    private static final String PREF_SKIP_DUPLICATES = "skipDuplicates";
    private static final String PREF_SKIP_INTERVAL = "skipDuplicatesInterval";
    private static final String PREF_SILENCE_ADS = "silenceAds";
    private static final String PREF_SKIP_ADS_LEGACY = "skipAds";
    private static final String PREF_SILENCE_ADS_KEYWORDS = "silenceAdsKeywords";
    private static final String PREF_LISTENING_MODE = "listeningMode";
    private static final String PREF_CUSTOM_SKIP_DUPLICATES = "customSkipDuplicates";
    private static final String PREF_CUSTOM_SKIP_INTERVAL = "customSkipDuplicatesInterval";
    private static final String PREF_ADS_MUTED = "adsMuted";
    private static final String PREF_ADS_PRE_VOLUME = "adsPreVolume";

    private static final String MODE_DISCOVERY = "discovery";
    private static final String MODE_CASUAL = "casual";
    private static final String MODE_CUSTOM = "custom";
    private static final List<String> DEFAULT_AD_KEYWORDS = Arrays.asList("publicidad", "anuncio", "anuncios");

    private static final long SAME_TRACK_SKIP_GUARD_MS = 12000L;
    private static final long RESUME_POSITION_GUARD_MS = 7000L;
    private static final long TRACK_CHANGE_EARLY_WINDOW_MS = 5000L;
    // Ventana desde el arranque de una reproducción en la que todavía tiene
    // sentido decidir si es duplicada. Pasada la ventana la canción se queda.
    private static final long DUPLICATE_DECISION_WINDOW_MS = 15000L;
    // Margen de seguridad por debajo del inicio de la sesión: cualquier registro
    // posterior a ese instante pertenece a la reproducción EN CURSO y por tanto
    // no puede usarse como "escucha previa".
    private static final long CURRENT_SESSION_GUARD_MS = 2500L;
    // Cuánto tiene que sonar una canción para que cuente como "ya escuchada".
    // Equivale a REGISTER_DUPLICATE_PROGRESS_RATIO del lado JS.
    private static final double MIN_SESSION_PLAY_RATIO = 0.25;
    private static final long MIN_SESSION_PLAY_MS = 20000L;
    private static final long MAX_SESSION_PLAY_MS = 90000L;
    private static final long SECOND_SKIP_RETRY_DELAY_MS = 200L;
    private static final long SECOND_SKIP_RETRY_GUARD_MS = 2500L;
    // PauseToSkip: isolated constants to make rollback easy if needed.
    private static final boolean PAUSE_TO_SKIP_ENABLED = true;
    private static final long PAUSE_TO_SKIP_PROGRESS_MAX_MS = 12000L;
    private static final long PAUSE_TO_SKIP_RESUME_DELAY_MS = 120L;
    private static final long PAUSE_TO_SKIP_RESUME_AFTER_SKIP_DELAY_MS = 450L;
    private static final long PAUSE_TO_SKIP_FAILSAFE_RESUME_DELAY_MS = 1800L;
    private static volatile String sLastAutoSkipKey = "";
    private static volatile long sLastAutoSkipAtMs = 0L;
    private static volatile String sLastRetrySkipKey = "";
    private static volatile long sLastRetrySkipAtMs = 0L;
    private static volatile boolean sAdsMuted = false;
    private static volatile int sPreAdsVolume = -1;
    // PauseToSkip: pending resume state.
    private static volatile String sPauseToSkipPendingResumeKey = "";
    private static volatile long sPauseToSkipPendingResumeUntilUptimeMs = 0L;

    // ── Sesión de reproducción ────────────────────────────────────────────────
    // Una "sesión" es una canción concreta sonando una vez. Es la pieza central
    // contra los saltos indiscriminados: la decisión de duplicada se toma UNA
    // sola vez por sesión y el historial que genera la propia sesión jamás se
    // cuenta como escucha previa de sí misma.
    private static final Object sPlaySessionLock = new Object();
    private static String sPlaySessionKey = "";
    private static long sPlaySessionStartedAtEpochMs = 0L;
    private static boolean sPlaySessionEvaluated = true;
    private static boolean sPlaySessionCommitted = true;
    private static long sPlaySessionPlayedMs = 0L;
    private static long sPlaySessionPlayingSinceUptimeMs = 0L;
    private static Snapshot sPlaySessionSnapshot;
    private static String sPlaySessionSource = "";

    public interface TrackListener {
        void onTrack(String track, String artist, @Nullable String album, long durationMs, boolean isPlaying);
    }

    private static volatile TrackListener sListener;
    static volatile SpotifyNotificationListener sServiceInstance;

    private static final String SPOTIFY_PKG = "com.spotify.music";

    /** Skips the current Spotify track via MediaSession transport controls. */
    static void skipCurrentTrack() {
        SpotifyNotificationListener svc = sServiceInstance;
        if (svc == null || svc.mController == null) return;
        String expectedTrackKey = svc.currentTrackKey();
        long issuedAtMs = SystemClock.uptimeMillis();
        svc.skipToNextOnce();
        Snapshot snap = sLastSnapshot;
        if (snap != null) {
            Log.i(TAG, "Skip command issued key=" + expectedTrackKey
                    + " latencyMs=" + (issuedAtMs - snap.capturedAtUptimeMs));
        }
        svc.scheduleSecondSkipIfNeeded(expectedTrackKey);
    }

    private void skipToNextOnce() {
        try {
            if (mController == null) return;
            mController.getTransportControls().skipToNext();
        } catch (Throwable ignored) {
        }
    }

    private String currentTrackKey() {
        Snapshot snap = sLastSnapshot;
        if (snap == null) return "";
        String track = canonicalTrackTitle(snap.track);
        String artist = primaryArtistKey(snap.artist);
        if (track.isEmpty() || artist.isEmpty()) return "";
        return track + "|" + artist;
    }

    private void scheduleSecondSkipIfNeeded(@Nullable String expectedTrackKey) {
        String key = safeTrim(expectedTrackKey);
        if (key.isEmpty()) return;

        Handler handler = new Handler(Looper.getMainLooper());
        handler.postDelayed(() -> {
            SpotifyNotificationListener svc = sServiceInstance;
            if (svc == null || svc.mController == null) return;

            String currentKey = svc.currentTrackKey();
            if (!key.equals(currentKey)) return;

            long now = SystemClock.uptimeMillis();
            if (key.equals(sLastRetrySkipKey) && (now - sLastRetrySkipAtMs) < SECOND_SKIP_RETRY_GUARD_MS) {
                return;
            }

            sLastRetrySkipKey = key;
            sLastRetrySkipAtMs = now;
            svc.skipToNextOnce();
            Log.i(TAG, "Second skip retry fired for key=" + key);
        }, SECOND_SKIP_RETRY_DELAY_MS);
    }

    // volatile: se leen/escriben desde hilos binder (onNotificationPosted) y desde
    // el hilo principal (callbacks del MediaController y handlers de PauseToSkip).
    private volatile MediaSession.Token mLastToken;
    private volatile MediaController mController;
    private final MediaController.Callback mControllerCallback = new MediaController.Callback() {
        @Override
        public void onPlaybackStateChanged(PlaybackState state) {
            emitFromController();
        }

        @Override
        public void onMetadataChanged(MediaMetadata metadata) {
            emitFromController();
        }
    };

    private static final class Snapshot {
        final String track;
        final String artist;
        final String album;
        final long durationMs;
        final boolean isPlaying;
        final long capturedAtUptimeMs;
        final long capturedAtEpochMs;

        Snapshot(String track, String artist, @Nullable String album, long durationMs, boolean isPlaying, long capturedAtUptimeMs, long capturedAtEpochMs) {
            this.track = track;
            this.artist = artist;
            this.album = album;
            this.durationMs = durationMs;
            this.isPlaying = isPlaying;
            this.capturedAtUptimeMs = capturedAtUptimeMs;
            this.capturedAtEpochMs = capturedAtEpochMs;
        }

        String key() {
            return (track + "|" + artist + "|" + (album == null ? "" : album) + "|" + durationMs + "|" + (isPlaying ? "1" : "0")).trim();
        }
    }

    private static volatile Snapshot sLastSnapshot;
    private static volatile String sLastEmittedKey;
    private static volatile long sLastEmittedUptimeMs;

    // Persist raw play/pause/stopped events so they can be replayed later even
    // if the WebView/JS layer is not running (background).
    static final String EVENT_LOG_FILE = "skippify-spotify-events.ndjson";
    static final String DUP_HISTORY_FILE = "skippify-spotify-dup-history.ndjson";
    private static final String DUP_HISTORY_DB_NAME = "skippify-duplicate-history.db";
    private static final String DUP_HISTORY_TABLE = "duplicate_plays";
    private static final String TAG = "SkippifyDupDb";
    private static final long EVENT_LOG_MAX_BYTES = 2L * 1024L * 1024L; // 2MB
    private static final long DUP_HISTORY_MAX_BYTES = 6L * 1024L * 1024L; // 6MB
    private static final long DUP_DB_RETRY_BACKOFF_MS = 10_000L;
    private static final int RECENT_PLAY_CACHE_MAX = 6000;
    static final Object sEventFileLock = new Object();
    private static final Object sDuplicateDbLock = new Object();
    private static volatile DuplicateHistoryDbHelper sDuplicateHistoryDbHelper;
    private static volatile boolean sDuplicateHistoryDbReady = false;
    private static volatile long sDuplicateHistoryDbLastFailureAtMs = 0L;
    private static volatile boolean sDuplicatePrewarmStarted = false;

    private static final List<RecentPlay> sRecentPlays = new ArrayList<>();
    private static volatile boolean sRecentPlaysLoaded = false;

    // Índice en memoria para búsqueda rápida de duplicados (últimas 1000 canciones)
    // Estructura: "canonical_track|primary_artist" -> timestamp_ms
    private static final LinkedHashMap<String, Long> sDuplicateIndex = 
        new LinkedHashMap<String, Long>() {
            @Override
            protected boolean removeEldestEntry(java.util.Map.Entry eldest) {
                return size() > 1000; // Mantener máximo 1000 entradas
            }
        };
    private static final Object sDuplicateIndexLock = new Object();

    private static final class RecentPlay {
        final long playedAtMs;
        final String track;
        final String artist;
        final long durationMs;

        RecentPlay(long playedAtMs, String track, String artist, long durationMs) {
            this.playedAtMs = playedAtMs;
            this.track = safeTrim(track);
            this.artist = safeTrim(artist);
            this.durationMs = durationMs;
        }
    }

    private static final class DuplicateHistoryDbHelper extends SQLiteOpenHelper {
        DuplicateHistoryDbHelper(android.content.Context context) {
            super(context, DUP_HISTORY_DB_NAME, null, 1);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS " + DUP_HISTORY_TABLE + " ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    + "track_canonical TEXT NOT NULL,"
                    + "artist_primary TEXT NOT NULL,"
                    + "track_original TEXT,"
                    + "artist_original TEXT,"
                    + "duration_ms INTEGER,"
                    + "played_at_epoch INTEGER NOT NULL,"
                    + "played_at_iso TEXT,"
                    + "event TEXT,"
                    + "source TEXT"
                    + ")");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_duplicate_plays_lookup ON " + DUP_HISTORY_TABLE
                    + "(track_canonical, artist_primary, played_at_epoch DESC)");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_duplicate_plays_time ON " + DUP_HISTORY_TABLE
                    + "(played_at_epoch DESC)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            db.execSQL("DROP TABLE IF EXISTS " + DUP_HISTORY_TABLE);
            onCreate(db);
        }
    }

    private static final Object sIsoLock = new Object();
    private static final SimpleDateFormat sIso8601 = buildIso8601();

    private static SimpleDateFormat buildIso8601() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf;
    }

    static String toIso8601(long epochMs) {
        synchronized (sIsoLock) {
            return sIso8601.format(new Date(epochMs));
        }
    }

    @Nullable
    private static Date fromIso8601(@Nullable String iso) {
        if (iso == null || iso.trim().isEmpty()) return null;
        synchronized (sIsoLock) {
            try {
                return sIso8601.parse(iso.trim());
            } catch (Throwable ignored) {
                return null;
            }
        }
    }

    static void configureSkipDuplicates(android.content.Context context, boolean enabled, @Nullable String interval) {
        if (context == null) return;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String sanitizedInterval = sanitizeInterval(interval);
            android.content.SharedPreferences.Editor editor = sp.edit()
              .putBoolean(PREF_SKIP_DUPLICATES, enabled)
              .putString(PREF_SKIP_INTERVAL, sanitizedInterval);

            if (MODE_CUSTOM.equals(getListeningMode(context))) {
                editor.putBoolean(PREF_CUSTOM_SKIP_DUPLICATES, enabled);
                editor.putString(PREF_CUSTOM_SKIP_INTERVAL, sanitizedInterval);
            }

            editor.apply();
        } catch (Throwable ignored) {
        }

        // force = true: hay que refrescar la notificación persistente para que
        // muestre el modo activo recién guardado.
        SkippifyForegroundService.start(context, true);
    }

    static void configureSilenceAds(android.content.Context context, boolean enabled) {
        if (context == null) return;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            sp.edit().putBoolean(PREF_SILENCE_ADS, enabled).apply();
        } catch (Throwable ignored) {
        }

        if (!enabled) {
            restoreMediaVolumeIfNeeded(context);
        }

        // force = true: hay que refrescar la notificación persistente para que
        // muestre el modo activo recién guardado.
        SkippifyForegroundService.start(context, true);
    }

    static void configureSilenceAdsKeywords(android.content.Context context, @Nullable List<String> keywords) {
        if (context == null) return;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String serialized = serializeKeywords(keywords);
            sp.edit().putString(PREF_SILENCE_ADS_KEYWORDS, serialized).apply();
        } catch (Throwable ignored) {
        }

        // force = true: hay que refrescar la notificación persistente para que
        // muestre el modo activo recién guardado.
        SkippifyForegroundService.start(context, true);
    }

    static void configureListeningMode(android.content.Context context, @Nullable String modeRaw) {
        if (context == null) return;

        String mode = sanitizeListeningMode(modeRaw);

        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String currentMode = sanitizeListeningMode(sp.getString(PREF_LISTENING_MODE, MODE_CUSTOM));

            boolean customSkipDuplicates = sp.getBoolean(
                PREF_CUSTOM_SKIP_DUPLICATES,
                sp.getBoolean(PREF_SKIP_DUPLICATES, true)
            );
            String customSkipInterval = sanitizeInterval(
                sp.getString(PREF_CUSTOM_SKIP_INTERVAL, sp.getString(PREF_SKIP_INTERVAL, "1w"))
            );

            if (MODE_CUSTOM.equals(currentMode)) {
                customSkipDuplicates = sp.getBoolean(PREF_SKIP_DUPLICATES, true);
                customSkipInterval = sanitizeInterval(sp.getString(PREF_SKIP_INTERVAL, "1w"));
            }

            boolean silenceAds = sp.getBoolean(PREF_SILENCE_ADS, sp.getBoolean(PREF_SKIP_ADS_LEGACY, false));

            syncFeatureConfig(
                context,
                mode,
                sp.getBoolean(PREF_SKIP_DUPLICATES, true),
                sp.getString(PREF_SKIP_INTERVAL, "1w"),
                silenceAds,
                getSilenceAdsKeywords(context),
                customSkipDuplicates,
                customSkipInterval
            );
        } catch (Throwable ignored) {
        }
    }

    static void syncFeatureConfig(
            android.content.Context context,
            @Nullable String modeRaw,
            boolean skipDuplicates,
            @Nullable String skipIntervalRaw,
            boolean silenceAds,
                @Nullable List<String> silenceAdsKeywords,
            boolean customSkipDuplicates,
            @Nullable String customSkipIntervalRaw
    ) {
        if (context == null) return;

        String mode = sanitizeListeningMode(modeRaw);
        String skipInterval = sanitizeInterval(skipIntervalRaw);
        String customSkipInterval = sanitizeInterval(customSkipIntervalRaw);

        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            android.content.SharedPreferences.Editor editor = sp.edit()
                .putString(PREF_LISTENING_MODE, mode)
                .putBoolean(PREF_SILENCE_ADS, silenceAds)
                .putString(PREF_SILENCE_ADS_KEYWORDS, serializeKeywords(silenceAdsKeywords))
                .putBoolean(PREF_CUSTOM_SKIP_DUPLICATES, customSkipDuplicates)
                .putString(PREF_CUSTOM_SKIP_INTERVAL, customSkipInterval);

            if (MODE_DISCOVERY.equals(mode)) {
                editor.putBoolean(PREF_SKIP_DUPLICATES, true);
                editor.putString(PREF_SKIP_INTERVAL, "1y");
            } else if (MODE_CASUAL.equals(mode)) {
                editor.putBoolean(PREF_SKIP_DUPLICATES, false);
                editor.putString(PREF_SKIP_INTERVAL, skipInterval);
            } else {
                editor.putBoolean(PREF_SKIP_DUPLICATES, customSkipDuplicates);
                editor.putString(PREF_SKIP_INTERVAL, customSkipInterval);
            }

            editor.apply();
        } catch (Throwable ignored) {
        }

        if (!silenceAds) {
            restoreMediaVolumeIfNeeded(context);
        }

        // force = true: hay que refrescar la notificación persistente para que
        // muestre el modo activo recién guardado.
        SkippifyForegroundService.start(context, true);
    }

    static String getListeningMode(@Nullable android.content.Context context) {
        if (context == null) return MODE_CUSTOM;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return sanitizeListeningMode(sp.getString(PREF_LISTENING_MODE, MODE_CUSTOM));
        } catch (Throwable ignored) {
            return MODE_CUSTOM;
        }
    }

    static boolean isSkipDuplicatesEnabled(@Nullable android.content.Context context) {
        if (context == null) return true;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return sp.getBoolean(PREF_SKIP_DUPLICATES, true);
        } catch (Throwable ignored) {
            return true;
        }
    }

    static String getSkipDuplicatesInterval(@Nullable android.content.Context context) {
        if (context == null) return "1w";
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return sanitizeInterval(sp.getString(PREF_SKIP_INTERVAL, "1w"));
        } catch (Throwable ignored) {
            return "1w";
        }
    }

    static boolean getCustomSkipDuplicates(@Nullable android.content.Context context) {
        if (context == null) return true;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return sp.getBoolean(
                PREF_CUSTOM_SKIP_DUPLICATES,
                sp.getBoolean(PREF_SKIP_DUPLICATES, true)
            );
        } catch (Throwable ignored) {
            return true;
        }
    }

    static String getCustomSkipDuplicatesInterval(@Nullable android.content.Context context) {
        if (context == null) return "1w";
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return sanitizeInterval(
                sp.getString(PREF_CUSTOM_SKIP_INTERVAL, sp.getString(PREF_SKIP_INTERVAL, "1w"))
            );
        } catch (Throwable ignored) {
            return "1w";
        }
    }

    static boolean isSilenceAdsEnabled(@Nullable android.content.Context context) {
        if (context == null) return false;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            if (sp.contains(PREF_SILENCE_ADS)) {
                return sp.getBoolean(PREF_SILENCE_ADS, false);
            }
            return sp.getBoolean(PREF_SKIP_ADS_LEGACY, false);
        } catch (Throwable ignored) {
            return false;
        }
    }

    static List<String> getSilenceAdsKeywords(@Nullable android.content.Context context) {
        if (context == null) return new ArrayList<>(DEFAULT_AD_KEYWORDS);
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String raw = sp.getString(PREF_SILENCE_ADS_KEYWORDS, "");
            return deserializeKeywords(raw);
        } catch (Throwable ignored) {
            return new ArrayList<>(DEFAULT_AD_KEYWORDS);
        }
    }

    private boolean isSilenceAdsEnabled() {
        return isSilenceAdsEnabled(getApplicationContext());
    }

    private static void persistAdMuteState(@Nullable android.content.Context context, boolean muted, int preVolume) {
        if (context == null) return;
        try {
            context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit()
                    .putBoolean(PREF_ADS_MUTED, muted)
                    .putInt(PREF_ADS_PRE_VOLUME, preVolume)
                    .apply();
        } catch (Throwable ignored) {
        }
    }

    /**
     * Restaura el volumen si el proceso murió con un anuncio silenciado.
     * El estado se guarda en SharedPreferences porque los flags estáticos se
     * pierden al morir el proceso y el usuario se quedaba sin sonido.
     */
    static void restorePersistedAdMuteIfNeeded(@Nullable android.content.Context context) {
        if (context == null || sAdsMuted) return;
        try {
            android.content.SharedPreferences sp = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            if (!sp.getBoolean(PREF_ADS_MUTED, false)) return;

            sAdsMuted = true;
            sPreAdsVolume = sp.getInt(PREF_ADS_PRE_VOLUME, -1);
            restoreMediaVolumeIfNeeded(context);
        } catch (Throwable ignored) {
        }
    }

    private static void muteMediaVolumeIfNeeded(@Nullable android.content.Context context) {
        if (context == null || sAdsMuted) return;
        try {
            AudioManager am = (AudioManager) context.getSystemService(AUDIO_SERVICE);
            if (am == null) return;
            int current = am.getStreamVolume(AudioManager.STREAM_MUSIC);
            // No guardar 0 como "volumen previo": si dos anuncios encadenan y el
            // primero ya bajó el volumen, se perdería el nivel original.
            if (current > 0) {
                sPreAdsVolume = current;
                am.setStreamVolume(AudioManager.STREAM_MUSIC, 0, 0);
            }
            sAdsMuted = true;
            persistAdMuteState(context, true, sPreAdsVolume);
        } catch (Throwable ignored) {
        }
    }

    private static void restoreMediaVolumeIfNeeded(@Nullable android.content.Context context) {
        if (context == null || !sAdsMuted) return;
        try {
            AudioManager am = (AudioManager) context.getSystemService(AUDIO_SERVICE);
            if (am != null) {
                int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                int restore = sPreAdsVolume;
                // Si no se conoce el nivel previo, dejarlo a un tercio del máximo
                // en vez de a 0 (antes la app podía dejar el móvil mudo).
                if (restore <= 0) restore = Math.max(1, max / 3);
                if (restore > max) restore = max;
                am.setStreamVolume(AudioManager.STREAM_MUSIC, restore, 0);
            }
        } catch (Throwable ignored) {
        } finally {
            sAdsMuted = false;
            sPreAdsVolume = -1;
            persistAdMuteState(context, false, -1);
        }
    }

    private void applyAdMuteState(boolean adPlaying) {
        if (!isSilenceAdsEnabled()) {
            restoreMediaVolumeIfNeeded(getApplicationContext());
            return;
        }
        if (adPlaying) {
            muteMediaVolumeIfNeeded(getApplicationContext());
        } else {
            restoreMediaVolumeIfNeeded(getApplicationContext());
        }
    }

    private boolean containsAdKeyword(@Nullable String raw) {
        String normalized = normalizeForMatch(raw);
        if (normalized.isEmpty()) return false;

        List<String> keywords = getSilenceAdsKeywords(getApplicationContext());
        for (String kw : keywords) {
            String token = normalizeForMatch(kw);
            if (!token.isEmpty() && normalized.contains(token)) {
                return true;
            }
        }
        return false;
    }

    private boolean isAdFromExtras(@Nullable Bundle extras) {
        if (extras == null) return false;
        if (containsAdKeyword(asString(extras.getCharSequence(Notification.EXTRA_TITLE)))) return true;
        if (containsAdKeyword(asString(extras.getCharSequence(Notification.EXTRA_TEXT)))) return true;
        if (containsAdKeyword(asString(extras.getCharSequence(Notification.EXTRA_SUB_TEXT)))) return true;
        if (containsAdKeyword(asString(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)))) return true;
        try {
            CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null) {
                for (CharSequence cs : lines) {
                    if (containsAdKeyword(asString(cs))) return true;
                }
            }
        } catch (Throwable ignored) {
        }
        return false;
    }

    private boolean shouldAutoSkipDuplicate(Snapshot snap, @Nullable Snapshot previousSnap) {
        if (snap == null) return false;
        if (!snap.isPlaying) return false;
        if (isResumeFromPause(previousSnap, snap)) return false;

        String track = normalizeForMatch(snap.track);
        String artist = normalizeForMatch(snap.artist);
        if (track.isEmpty() || artist.isEmpty()) return false;

        String key = playSessionKey(snap);
        if (key.isEmpty()) return false;

        long sessionStartMs;
        synchronized (sPlaySessionLock) {
            // Sólo se decide sobre la sesión abierta, y sólo una vez. Sin esto,
            // cada refresco de estado que Spotify emite durante la canción volvía
            // a preguntar "¿es duplicada?" y acababa encontrando el registro de la
            // propia canción que estaba sonando ⇒ se saltaba a sí misma.
            if (!key.equals(sPlaySessionKey)) return false;
            if (sPlaySessionEvaluated) return false;
            sessionStartMs = sPlaySessionStartedAtEpochMs > 0L
                    ? sPlaySessionStartedAtEpochMs
                    : snap.capturedAtEpochMs;
        }

        long nowMs = snap.capturedAtEpochMs;
        if (nowMs - sessionStartMs > DUPLICATE_DECISION_WINDOW_MS) {
            markPlaySessionEvaluated(key);
            return false;
        }

        // Reproducción ya avanzada ⇒ no es el arranque de una canción, sino una
        // reanudación / reconexión del listener / reinicio del servicio.
        // No se cierra la decisión: puede que la posición aún no sea fiable.
        if (isResumeFromPlaybackPosition()) return false;

        try {
            android.content.SharedPreferences sp = getApplicationContext().getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            if (!sp.getBoolean(PREF_SKIP_DUPLICATES, true)) return false;

            long intervalMs = parseIntervalMs(sp.getString(PREF_SKIP_INTERVAL, "1w"));
            long cutoffMs = nowMs - intervalMs;
            // Límite superior de la búsqueda: todo lo registrado a partir del
            // inicio de esta reproducción pertenece a la reproducción en curso.
            long beforeMs = Math.min(nowMs, sessionStartMs) - CURRENT_SESSION_GUARD_MS;

            if (key.equals(sLastAutoSkipKey) && (nowMs - sLastAutoSkipAtMs) < SAME_TRACK_SKIP_GUARD_MS) {
                return false;
            }

            boolean hit = hasPriorPlayInLog(track, artist, snap.durationMs, cutoffMs, beforeMs);
            if (!hit && !isDuplicateHistoryReady()) {
                // Historial todavía cargando: no se cierra la decisión, se
                // reintenta en la siguiente actualización dentro de la ventana.
                return false;
            }

            markPlaySessionEvaluated(key);
            if (!hit) return false;

            sLastAutoSkipKey = key;
            sLastAutoSkipAtMs = nowMs;
            Log.i(TAG, "Auto-skip duplicate key=" + key
                    + " latencyMs=" + (SystemClock.uptimeMillis() - snap.capturedAtUptimeMs)
                    + " sessionAgeMs=" + (nowMs - sessionStartMs)
                    + " trackChanged=" + didTrackChange(previousSnap, snap)
                    + " earlyTrackChange=" + isEarlyTrackChange(previousSnap, snap));
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static boolean isDuplicateHistoryReady() {
        return sRecentPlaysLoaded || sDuplicateHistoryDbReady;
    }

    // ── Sesión de reproducción ────────────────────────────────────────────────

    /** Clave canónica de una reproducción: canción + artista principal. */
    private static String playSessionKey(@Nullable Snapshot snap) {
        if (snap == null) return "";
        String track = canonicalTrackTitle(snap.track);
        String artist = primaryArtistKey(snap.artist);
        if (track.isEmpty() || artist.isEmpty()) return "";
        return track + "|" + artist;
    }

    private static void markPlaySessionEvaluated(@Nullable String key) {
        if (key == null) return;
        synchronized (sPlaySessionLock) {
            if (key.equals(sPlaySessionKey)) sPlaySessionEvaluated = true;
        }
    }

    /** true cuando no queda ninguna decisión pendiente para esa sesión. */
    private static boolean isPlaySessionSettled(@Nullable String key) {
        synchronized (sPlaySessionLock) {
            if (key == null || !key.equals(sPlaySessionKey)) return true;
            return sPlaySessionEvaluated;
        }
    }

    /**
     * Abre una sesión nueva cuando cambia la canción y cierra la anterior.
     * Debe invocarse en TODAS las rutas de emisión, antes de decidir el salto.
     */
    private void updatePlaySession(@Nullable Snapshot snap, @Nullable String source) {
        String key = playSessionKey(snap);
        long nowUptimeMs = snap == null ? SystemClock.uptimeMillis() : snap.capturedAtUptimeMs;
        long nowEpochMs = snap == null ? System.currentTimeMillis() : snap.capturedAtEpochMs;

        synchronized (sPlaySessionLock) {
            if (key.equals(sPlaySessionKey)) {
                accumulatePlaybackLocked(snap, nowUptimeMs);
                if (snap != null && snap.isPlaying && sPlaySessionSnapshot == null) {
                    sPlaySessionSnapshot = snap;
                    sPlaySessionSource = safeTrim(source);
                }
                maybeCommitPlaySessionLocked(nowUptimeMs);
                return;
            }

            // Cambio de canción: cerrar y consolidar la sesión anterior primero.
            accumulatePlaybackLocked(null, nowUptimeMs);
            maybeCommitPlaySessionLocked(nowUptimeMs);

            sPlaySessionKey = key;
            sPlaySessionStartedAtEpochMs = key.isEmpty() ? 0L : nowEpochMs;
            sPlaySessionEvaluated = key.isEmpty();
            sPlaySessionCommitted = key.isEmpty();
            sPlaySessionPlayedMs = 0L;
            sPlaySessionPlayingSinceUptimeMs = 0L;
            sPlaySessionSnapshot = (snap != null && snap.isPlaying) ? snap : null;
            sPlaySessionSource = safeTrim(source);

            accumulatePlaybackLocked(snap, nowUptimeMs);
        }
    }

    /** Cierra la sesión abierta (parada de reproducción, listener desconectado). */
    private void closePlaySession() {
        updatePlaySession(null, null);
    }

    /** Descarta la escucha pendiente de la sesión actual (canción saltada). */
    private static void discardPlaySessionHistory() {
        synchronized (sPlaySessionLock) {
            sPlaySessionCommitted = true;
            sPlaySessionSnapshot = null;
        }
    }

    private static void accumulatePlaybackLocked(@Nullable Snapshot snap, long nowUptimeMs) {
        boolean playing = snap != null && snap.isPlaying;
        if (playing) {
            if (sPlaySessionPlayingSinceUptimeMs <= 0L) sPlaySessionPlayingSinceUptimeMs = nowUptimeMs;
            return;
        }
        if (sPlaySessionPlayingSinceUptimeMs > 0L) {
            sPlaySessionPlayedMs += Math.max(0L, nowUptimeMs - sPlaySessionPlayingSinceUptimeMs);
            sPlaySessionPlayingSinceUptimeMs = 0L;
        }
    }

    private static long playSessionPlayedMsLocked(long nowUptimeMs) {
        long total = sPlaySessionPlayedMs;
        if (sPlaySessionPlayingSinceUptimeMs > 0L) {
            total += Math.max(0L, nowUptimeMs - sPlaySessionPlayingSinceUptimeMs);
        }
        return total;
    }

    private static long requiredSessionPlayMs(long durationMs) {
        if (durationMs <= 0L) return MIN_SESSION_PLAY_MS;
        long required = (long) (durationMs * MIN_SESSION_PLAY_RATIO);
        if (required < MIN_SESSION_PLAY_MS) required = MIN_SESSION_PLAY_MS;
        if (required > MAX_SESSION_PLAY_MS) required = MAX_SESSION_PLAY_MS;
        return required;
    }

    private void maybeCommitPlaySessionLocked(long nowUptimeMs) {
        if (sPlaySessionCommitted) return;

        Snapshot pending = sPlaySessionSnapshot;
        if (pending == null) return;

        long playedMs = playSessionPlayedMsLocked(nowUptimeMs);
        if (playedMs < requiredSessionPlayMs(pending.durationMs)) return;

        sPlaySessionCommitted = true;
        commitDuplicateHistory(pending, sPlaySessionSource, playedMs);
    }

    /**
     * Anota la escucha en el historial de duplicadas. Una única vez por
     * reproducción y sólo si la canción ha sonado lo suficiente: así las
     * canciones que el usuario apenas roza (pasando queue adelante) no quedan
     * marcadas como "ya escuchadas" y no provocan saltos futuros.
     */
    private void commitDuplicateHistory(Snapshot snap, @Nullable String source, long playedMs) {
        if (snap == null) return;

        String canonicalTrack = canonicalTrackTitle(snap.track);
        String canonicalArtist = primaryArtistKey(snap.artist);
        if (canonicalTrack.isEmpty() || canonicalArtist.isEmpty()) return;

        rememberRecentPlay(snap.capturedAtEpochMs, snap.track, snap.artist, snap.durationMs);
        insertDuplicateHistoryRow(snap, "playing", source);
        appendDuplicateHistoryLine(getApplicationContext(), snap, source, playedMs);

        Log.d(TAG, "Duplicate history commit key=" + canonicalTrack + "|" + canonicalArtist
                + " playedMs=" + playedMs);
    }

    // PauseToSkip: begin
    private static final class PauseToSkipSession {
        final String key;
        final long createdAtUptimeMs;
        final boolean paused;

        PauseToSkipSession(String key, long createdAtUptimeMs, boolean paused) {
            this.key = safeTrim(key);
            this.createdAtUptimeMs = createdAtUptimeMs;
            this.paused = paused;
        }
    }

    private boolean handlePauseToSkip(@Nullable Snapshot snap, @Nullable Snapshot previousSnap) {
        if (snap == null) return false;

        PauseToSkipSession session = maybeStartPauseToSkipSession(snap, previousSnap);
        boolean isDuplicate = shouldAutoSkipDuplicate(snap, previousSnap);

        if (isDuplicate) {
            // Una canción saltada no se anota como escuchada: si no, la siguiente
            // vez que sonase seguiría contando como "ya la oíste".
            discardPlaySessionHistory();
            skipCurrentTrack();
            if (session != null && session.paused) {
                pauseToSkipScheduleResume(session.key, PAUSE_TO_SKIP_RESUME_AFTER_SKIP_DELAY_MS, "after_skip");
            }
            return true;
        }

        if (session != null && session.paused) {
            pauseToSkipScheduleResume(session.key, PAUSE_TO_SKIP_RESUME_DELAY_MS, "not_duplicate");
        }
        return false;
    }

    @Nullable
    private PauseToSkipSession maybeStartPauseToSkipSession(@Nullable Snapshot snap, @Nullable Snapshot previousSnap) {
        if (!PAUSE_TO_SKIP_ENABLED) return null;
        if (snap == null || !snap.isPlaying) return null;
        if (!isSkipDuplicatesEnabled(getApplicationContext())) return null;
        if (isResumeFromPause(previousSnap, snap)) return null;

        String key = playSessionKey(snap);
        if (key.isEmpty()) return null;
        // Si la decisión de esta reproducción ya está tomada, pausar sería una
        // interrupción gratuita del audio.
        if (isPlaySessionSettled(key)) return null;

        boolean trackChanged = didTrackChange(previousSnap, snap);
        if (!trackChanged) return null;

        long progressMs = getControllerPositionMs();
        if (progressMs >= 0L && progressMs > PAUSE_TO_SKIP_PROGRESS_MAX_MS) return null;

        if (!pauseToSkipPauseNow(key)) return null;

        pauseToSkipScheduleResume(key, PAUSE_TO_SKIP_FAILSAFE_RESUME_DELAY_MS, "failsafe");
        Log.d(TAG, "PauseToSkip pause key=" + key + " progressMs=" + progressMs);
        return new PauseToSkipSession(key, SystemClock.uptimeMillis(), true);
    }

    private long getControllerPositionMs() {
        try {
            MediaController controller = mController;
            if (controller == null) return -1L;
            PlaybackState state = controller.getPlaybackState();
            if (state == null) return -1L;

            long pos = state.getPosition();
            if (pos < 0L) return -1L;

            // getPosition() devuelve la posición del ÚLTIMO update, no la actual.
            // Sin extrapolar, una canción muy avanzada podía parecer recién
            // empezada y colarse por las guardas de reanudación.
            long updatedAtMs = state.getLastPositionUpdateTime();
            if (state.getState() == PlaybackState.STATE_PLAYING && updatedAtMs > 0L) {
                float speed = state.getPlaybackSpeed();
                if (speed <= 0f) speed = 1f;
                long elapsedMs = SystemClock.elapsedRealtime() - updatedAtMs;
                if (elapsedMs > 0L) pos += (long) (elapsedMs * speed);
            }
            return pos;
        } catch (Throwable ignored) {
            return -1L;
        }
    }

    private boolean pauseToSkipPauseNow(@Nullable String keyRaw) {
        String key = safeTrim(keyRaw);
        if (key.isEmpty()) return false;
        try {
            MediaController controller = mController;
            if (controller == null) return false;

            sPauseToSkipPendingResumeKey = key;
            sPauseToSkipPendingResumeUntilUptimeMs =
                    SystemClock.uptimeMillis() + PAUSE_TO_SKIP_FAILSAFE_RESUME_DELAY_MS;

            controller.getTransportControls().pause();
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private void pauseToSkipScheduleResume(@Nullable String keyRaw, long delayMs, @Nullable String reasonRaw) {
        String key = safeTrim(keyRaw);
        String reason = safeTrim(reasonRaw);
        if (key.isEmpty()) return;

        Handler handler = new Handler(Looper.getMainLooper());
        handler.postDelayed(() -> pauseToSkipResumeIfPending(key, reason), Math.max(0L, delayMs));
    }

    private void pauseToSkipResumeIfPending(@Nullable String keyRaw, @Nullable String reasonRaw) {
        String key = safeTrim(keyRaw);
        if (key.isEmpty()) return;

        long now = SystemClock.uptimeMillis();
        String pendingKey = safeTrim(sPauseToSkipPendingResumeKey);
        if (!key.equals(pendingKey)) return;
        if (sPauseToSkipPendingResumeUntilUptimeMs > 0L && now > sPauseToSkipPendingResumeUntilUptimeMs) {
            sPauseToSkipPendingResumeKey = "";
            sPauseToSkipPendingResumeUntilUptimeMs = 0L;
            return;
        }

        try {
            MediaController controller = mController;
            if (controller == null) return;
            controller.getTransportControls().play();
            Log.d(TAG, "PauseToSkip resume key=" + key + " reason=" + safeTrim(reasonRaw));
        } catch (Throwable ignored) {
        } finally {
            sPauseToSkipPendingResumeKey = "";
            sPauseToSkipPendingResumeUntilUptimeMs = 0L;
        }
    }
    // PauseToSkip: end

    private boolean didTrackChange(@Nullable Snapshot previousSnap, @Nullable Snapshot currentSnap) {
        if (previousSnap == null || currentSnap == null) return false;

        String prevTrack = canonicalTrackTitle(previousSnap.track);
        String prevArtist = primaryArtistKey(previousSnap.artist);
        String currentTrack = canonicalTrackTitle(currentSnap.track);
        String currentArtist = primaryArtistKey(currentSnap.artist);

        if (prevTrack.isEmpty() || prevArtist.isEmpty() || currentTrack.isEmpty() || currentArtist.isEmpty()) {
            return false;
        }

        return !(prevTrack.equals(currentTrack) && prevArtist.equals(currentArtist));
    }

    private boolean isEarlyTrackChange(@Nullable Snapshot previousSnap, @Nullable Snapshot currentSnap) {
        if (previousSnap == null || currentSnap == null) return false;
        long delta = currentSnap.capturedAtUptimeMs - previousSnap.capturedAtUptimeMs;
        return delta >= 0L && delta <= TRACK_CHANGE_EARLY_WINDOW_MS;
    }

    private boolean isResumeFromPause(@Nullable Snapshot previousSnap, Snapshot currentSnap) {
        if (previousSnap == null || currentSnap == null) return false;
        if (previousSnap.isPlaying || !currentSnap.isPlaying) return false;

        String prevTrack = canonicalTrackTitle(previousSnap.track);
        String prevArtist = primaryArtistKey(previousSnap.artist);
        String currentTrack = canonicalTrackTitle(currentSnap.track);
        String currentArtist = primaryArtistKey(currentSnap.artist);

        if (prevTrack.isEmpty() || prevArtist.isEmpty() || currentTrack.isEmpty() || currentArtist.isEmpty()) {
            return false;
        }

        return prevTrack.equals(currentTrack) && prevArtist.equals(currentArtist);
    }

    private boolean isResumeFromPlaybackPosition() {
        long pos = getControllerPositionMs();
        return pos > RESUME_POSITION_GUARD_MS;
    }

    private long parseIntervalMs(@Nullable String intervalRaw) {
        String interval = sanitizeInterval(intervalRaw);

        int n = 1;
        try {
            String num = interval.replaceAll("[^0-9]", "");
            if (!num.isEmpty()) n = Math.max(1, Integer.parseInt(num));
        } catch (Throwable ignored) {
            n = 1;
        }

        if (interval.endsWith("h")) return n * 3_600_000L;
        if (interval.endsWith("d")) return n * 86_400_000L;
        if (interval.endsWith("w")) return n * 7L * 86_400_000L;
        if (interval.endsWith("m")) return n * 30L * 86_400_000L;
        if (interval.endsWith("y")) return n * 365L * 86_400_000L;
        return 7L * 86_400_000L;
    }

    private static String sanitizeListeningMode(@Nullable String modeRaw) {
        String mode = safeTrim(modeRaw).toLowerCase(Locale.ROOT);
        if (MODE_DISCOVERY.equals(mode) || MODE_CASUAL.equals(mode) || MODE_CUSTOM.equals(mode)) {
            return mode;
        }
        return MODE_CUSTOM;
    }

    private static String sanitizeInterval(@Nullable String intervalRaw) {
        String interval = safeTrim(intervalRaw).toLowerCase(Locale.ROOT);
        return interval.isEmpty() ? "1w" : interval;
    }

    private boolean hasPriorPlayInLog(String track, String artist, long durationMs, long cutoffMs, long beforeMs) {
        long startedAtMs = SystemClock.uptimeMillis();
        String canonicalTrack = canonicalTrackTitle(track);
        String canonicalArtist = primaryArtistKey(artist);
        if (canonicalTrack.isEmpty() || canonicalArtist.isEmpty()) {
            return false;
        }

        if (hasPriorPlayInIndex(canonicalTrack, canonicalArtist, cutoffMs, beforeMs)) {
            Log.d(TAG, "Dup lookup path=index hit=true totalMs=" + (SystemClock.uptimeMillis() - startedAtMs));
            return true;
        }

        long memoryStartMs = SystemClock.uptimeMillis();
        ensureRecentPlaysLoaded();
        if (hasPriorPlayInMemory(track, artist, durationMs, cutoffMs, beforeMs)) {
            Log.d(TAG, "Dup lookup path=memory hit=true loadAndScanMs="
                    + (SystemClock.uptimeMillis() - memoryStartMs)
                    + " totalMs=" + (SystemClock.uptimeMillis() - startedAtMs));
            return true;
        }

        long dbReadyStartMs = SystemClock.uptimeMillis();
        ensureDuplicateHistoryDatabaseReady();
        long dbReadyMs = SystemClock.uptimeMillis() - dbReadyStartMs;
        if (!sDuplicateHistoryDbReady) {
            Log.d(TAG, "Dup lookup path=db_not_ready dbReadyMs=" + dbReadyMs
                    + " totalMs=" + (SystemClock.uptimeMillis() - startedAtMs));
            return false;
        }

        try {
            long dbQueryStartMs = SystemClock.uptimeMillis();
            boolean hit = hasPriorPlayInDatabase(canonicalTrack, canonicalArtist, cutoffMs, beforeMs);
            long dbQueryMs = SystemClock.uptimeMillis() - dbQueryStartMs;
            Log.d(TAG, "Dup lookup path=db hit=" + hit
                    + " dbReadyMs=" + dbReadyMs
                    + " dbQueryMs=" + dbQueryMs
                    + " totalMs=" + (SystemClock.uptimeMillis() - startedAtMs));
            return hit;
        } catch (Throwable t) {
            // Nunca romper el listener por fallos de DB: degradar a caché en memoria.
            markDuplicateDatabaseFailure(t);
        }
        return false;
    }

    private boolean hasPriorPlayInIndex(String canonicalTrack, String canonicalArtist, long cutoffMs, long beforeMs) {
        String key = canonicalTrack + "|" + canonicalArtist;
        synchronized (sDuplicateIndexLock) {
            Long playedAt = sDuplicateIndex.get(key);
            return playedAt != null && playedAt >= cutoffMs && playedAt < beforeMs;
        }
    }

    private void ensureDuplicateHistoryDatabaseReady() {
        if (sDuplicateHistoryDbReady) return;

        long lastFailureAt = sDuplicateHistoryDbLastFailureAtMs;
        if (lastFailureAt > 0L && (SystemClock.uptimeMillis() - lastFailureAt) < DUP_DB_RETRY_BACKOFF_MS) {
            return;
        }

        synchronized (sDuplicateDbLock) {
            if (sDuplicateHistoryDbReady) return;

            long lockedLastFailureAt = sDuplicateHistoryDbLastFailureAtMs;
            if (lockedLastFailureAt > 0L
                    && (SystemClock.uptimeMillis() - lockedLastFailureAt) < DUP_DB_RETRY_BACKOFF_MS) {
                return;
            }

            android.content.Context context = getApplicationContext();
            if (context == null) {
                return;
            }

            DuplicateHistoryDbHelper helper = getDuplicateHistoryDbHelper(context);
            if (helper == null) {
                return;
            }

            SQLiteDatabase db = null;
            try {
                db = helper.getWritableDatabase();
                if (db != null) {
                    helper.onCreate(db);
                    importDuplicateHistoryIfNeeded(db, context);
                    sDuplicateHistoryDbReady = true;
                    sDuplicateHistoryDbLastFailureAtMs = 0L;
                }
            } catch (Throwable t) {
                markDuplicateDatabaseFailure(t);
            }
        }
    }

    private void markDuplicateDatabaseFailure(@Nullable Throwable t) {
        sDuplicateHistoryDbReady = false;
        sDuplicateHistoryDbLastFailureAtMs = SystemClock.uptimeMillis();
        if (t != null) {
            Log.w(TAG, "Duplicate DB unavailable, using memory fallback", t);
        }
    }

    private static DuplicateHistoryDbHelper getDuplicateHistoryDbHelper(@Nullable android.content.Context context) {
        if (context == null) return null;
        synchronized (sDuplicateDbLock) {
            if (sDuplicateHistoryDbHelper == null) {
                sDuplicateHistoryDbHelper = new DuplicateHistoryDbHelper(context.getApplicationContext());
            }
            return sDuplicateHistoryDbHelper;
        }
    }

    private boolean hasPriorPlayInDatabase(String canonicalTrack, String canonicalArtist, long cutoffMs, long beforeMs) {
        android.content.Context context = getApplicationContext();
        if (context == null) return false;

        // Early exit: impossible range
        if (beforeMs <= cutoffMs) return false;

        DuplicateHistoryDbHelper helper = getDuplicateHistoryDbHelper(context);
        if (helper == null) return false;

        SQLiteDatabase db = null;
        Cursor cursor = null;
        try {
            db = helper.getReadableDatabase();
            if (db == null) return false;

            // Query: fetch the most recent play before 'beforeMs'
            cursor = db.rawQuery(
                    "SELECT played_at_epoch FROM " + DUP_HISTORY_TABLE + " WHERE track_canonical = ? AND artist_primary = ? AND played_at_epoch < ? ORDER BY played_at_epoch DESC LIMIT 1",
                    new String[] {
                            canonicalTrack,
                            canonicalArtist,
                            String.valueOf(beforeMs)
                    }
            );

            // Check if result exists and is within the cutoff window
            if (cursor != null && cursor.moveToFirst()) {
                long playedAtEpoch = cursor.getLong(0);
                return playedAtEpoch >= cutoffMs;
            }
            return false;
        } catch (Throwable t) {
            markDuplicateDatabaseFailure(t);
            return false;
        } finally {
            if (cursor != null) {
                try {
                    cursor.close();
                } catch (Throwable ignored) {
                }
            }
        }
    }

    private void importDuplicateHistoryIfNeeded(SQLiteDatabase db, android.content.Context context) {
        if (db == null || context == null) return;

        boolean hasRows = false;
        Cursor cursor = null;
        try {
            cursor = db.rawQuery("SELECT 1 FROM " + DUP_HISTORY_TABLE + " LIMIT 1", null);
            hasRows = cursor != null && cursor.moveToFirst();
        } catch (Throwable ignored) {
            hasRows = false;
        } finally {
            if (cursor != null) {
                try {
                    cursor.close();
                } catch (Throwable ignored) {
                }
            }
        }

        if (hasRows) return;

        File dir = context.getFilesDir();
        if (dir == null) return;

        synchronized (sEventFileLock) {
            try {
                db.beginTransaction();

                // Igual que en memoria: se importan ambos ficheros para no perder
                // el historial de instalaciones anteriores.
                for (String fileName : new String[] { DUP_HISTORY_FILE, EVENT_LOG_FILE }) {
                    File historyFile = new File(dir, fileName);
                    if (!historyFile.exists() || !historyFile.isFile()) continue;
                    importDuplicateHistoryFile(db, historyFile);
                }

                db.setTransactionSuccessful();
            } catch (Throwable ignored) {
            } finally {
                try {
                    db.endTransaction();
                } catch (Throwable ignored) {
                }
            }
        }
    }

    private void importDuplicateHistoryFile(SQLiteDatabase db, File historyFile) {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(new FileInputStream(historyFile), StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty()) continue;

                JSONObject o;
                try {
                    o = new JSONObject(line);
                } catch (Throwable ignored) {
                    continue;
                }

                String evt = safeTrim(o.optString("event", "")).toLowerCase(Locale.ROOT);
                if (!"playing".equals(evt)) continue;

                String originalTrack = o.optString("track", "");
                String originalArtist = o.optString("artist", "");
                String canonicalTrack = canonicalTrackTitle(originalTrack);
                String canonicalArtist = primaryArtistKey(originalArtist);
                if (canonicalTrack.isEmpty() || canonicalArtist.isEmpty()) continue;

                Date playedAt = fromIso8601(o.optString("played_at", ""));
                long playedAtMs = playedAt == null ? 0L : playedAt.getTime();
                if (playedAtMs <= 0L) continue;

                ContentValues values = new ContentValues();
                values.put("track_canonical", canonicalTrack);
                values.put("artist_primary", canonicalArtist);
                values.put("track_original", safeTrim(originalTrack));
                values.put("artist_original", safeTrim(originalArtist));
                if (o.has("duration_ms")) {
                    values.put("duration_ms", o.optLong("duration_ms", 0L));
                }
                values.put("played_at_epoch", playedAtMs);
                values.put("played_at_iso", o.optString("played_at", ""));
                values.put("event", evt);
                values.put("source", o.optString("source", "import"));

                db.insert(DUP_HISTORY_TABLE, null, values);
            }
        } catch (Throwable ignored) {
        }
    }

    private void persistEvent(Snapshot snap, String source) {
        if (snap == null) return;

        try {
            JSONObject obj = new JSONObject();
            obj.put("track", safeTrim(snap.track));
            obj.put("artist", safeTrim(snap.artist));
            if (!isNullOrEmpty(snap.album)) obj.put("album", safeTrim(snap.album));
            if (snap.durationMs > 0) obj.put("duration_ms", snap.durationMs);
            obj.put("is_playing", snap.isPlaying);

            String event;
            if (isNullOrEmpty(snap.track) && isNullOrEmpty(snap.artist)) {
                event = "stopped";
            } else {
                event = snap.isPlaying ? "playing" : "paused";
            }
            obj.put("event", event);
            obj.put("played_at", toIso8601(snap.capturedAtEpochMs));
            obj.put("source", source == null ? "notification" : source);

            // OJO: el historial de duplicadas NO se escribe aquí. Antes cada
            // refresco de notificación insertaba una fila "playing", así que a los
            // pocos segundos la canción en curso ya figuraba como escucha previa
            // de sí misma y se auto-saltaba. Ahora lo consolida
            // `commitDuplicateHistory`, una sola vez por reproducción.
            appendJsonLine(getApplicationContext(), obj);
        } catch (Throwable ignored) {
        }
    }

    private void insertDuplicateHistoryRow(Snapshot snap, String event, String source) {
        if (snap == null || !"playing".equalsIgnoreCase(safeTrim(event))) return;

        android.content.Context context = getApplicationContext();
        if (context == null) return;

        String canonicalTrack = canonicalTrackTitle(snap.track);
        String canonicalArtist = primaryArtistKey(snap.artist);
        if (canonicalTrack.isEmpty() || canonicalArtist.isEmpty()) return;

        DuplicateHistoryDbHelper helper = getDuplicateHistoryDbHelper(context);
        if (helper == null) return;

        try {
            SQLiteDatabase db = helper.getWritableDatabase();
            if (db == null) return;

            ContentValues values = new ContentValues();
            values.put("track_canonical", canonicalTrack);
            values.put("artist_primary", canonicalArtist);
            values.put("track_original", safeTrim(snap.track));
            values.put("artist_original", safeTrim(snap.artist));
            if (snap.durationMs > 0L) {
                values.put("duration_ms", snap.durationMs);
            }
            values.put("played_at_epoch", snap.capturedAtEpochMs);
            values.put("played_at_iso", toIso8601(snap.capturedAtEpochMs));
            values.put("event", "playing");
            values.put("source", safeTrim(source));

            db.insert(DUP_HISTORY_TABLE, null, values);
        } catch (Throwable t) {
            markDuplicateDatabaseFailure(t);
        }
    }

    private static void appendJsonLine(android.content.Context context, JSONObject obj) {
        // Simple rotation: drop the file if it grows too large.
        // (Keeps the app from growing storage indefinitely.)
        appendJsonLineTo(context, EVENT_LOG_FILE, EVENT_LOG_MAX_BYTES, obj);
    }

    private static void appendJsonLineTo(android.content.Context context,
                                         String fileName,
                                         long maxBytes,
                                         JSONObject obj) {
        if (context == null || obj == null) return;
        synchronized (sEventFileLock) {
            try {
                File dir = context.getFilesDir();
                if (dir == null) return;

                File f = new File(dir, fileName);
                if (f.exists() && f.length() > maxBytes) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }

                FileOutputStream fos = new FileOutputStream(f, true);
                String line = obj.toString() + "\n";
                fos.write(line.getBytes(StandardCharsets.UTF_8));
                fos.flush();
                fos.close();
            } catch (Throwable ignored) {
            }
        }
    }

    /**
     * Escribe la escucha consolidada en el historial curado de duplicadas.
     * Este fichero (a diferencia del log crudo de eventos) contiene como mucho
     * una línea por reproducción, así que sobrevive mucho más tiempo antes de
     * rotar y es la fuente fiable cuando la base de datos no está disponible.
     */
    private static void appendDuplicateHistoryLine(@Nullable android.content.Context context,
                                                   Snapshot snap,
                                                   @Nullable String source,
                                                   long playedMs) {
        if (context == null || snap == null) return;
        try {
            JSONObject obj = new JSONObject();
            obj.put("track", safeTrim(snap.track));
            obj.put("artist", safeTrim(snap.artist));
            if (!isNullOrEmpty(snap.album)) obj.put("album", safeTrim(snap.album));
            if (snap.durationMs > 0L) obj.put("duration_ms", snap.durationMs);
            if (playedMs > 0L) obj.put("ms_played", playedMs);
            obj.put("is_playing", true);
            obj.put("event", "playing");
            obj.put("played_at", toIso8601(snap.capturedAtEpochMs));
            obj.put("source", isNullOrEmpty(source) ? "notification" : safeTrim(source));

            appendJsonLineTo(context, DUP_HISTORY_FILE, DUP_HISTORY_MAX_BYTES, obj);
        } catch (Throwable ignored) {
        }
    }

    private static void rememberRecentPlay(long playedAtMs, @Nullable String track, @Nullable String artist, long durationMs) {
        String t = safeTrim(track);
        String a = safeTrim(artist);
        if (t.isEmpty() || a.isEmpty() || playedAtMs <= 0L) return;

        String indexKey = canonicalTrackTitle(t) + "|" + primaryArtistKey(a);

        synchronized (sEventFileLock) {
            sRecentPlays.add(new RecentPlay(playedAtMs, t, a, durationMs));
            int overflow = sRecentPlays.size() - RECENT_PLAY_CACHE_MAX;
            if (overflow > 0) {
                sRecentPlays.subList(0, overflow).clear();
            }
        }

        synchronized (sDuplicateIndexLock) {
            sDuplicateIndex.put(indexKey, playedAtMs);
        }
    }

    private void ensureRecentPlaysLoaded() {
        if (sRecentPlaysLoaded) return;

        synchronized (sEventFileLock) {
            if (sRecentPlaysLoaded) return;

            File dir = getApplicationContext().getFilesDir();
            if (dir == null) {
                sRecentPlaysLoaded = true;
                return;
            }

            // Se leen AMBOS ficheros: el historial curado (una línea por escucha)
            // y el log crudo, que es el único que tienen los usuarios que vienen
            // de versiones anteriores. Leer sólo uno perdía historial.
            for (String fileName : new String[] { DUP_HISTORY_FILE, EVENT_LOG_FILE }) {
                File historyFile = new File(dir, fileName);
                if (!historyFile.exists() || !historyFile.isFile()) continue;

                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(new FileInputStream(historyFile), StandardCharsets.UTF_8)
                )) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        line = line.trim();
                        if (line.isEmpty()) continue;

                        JSONObject o;
                        try {
                            o = new JSONObject(line);
                        } catch (Throwable ignored) {
                            continue;
                        }

                        String evt = safeTrim(o.optString("event", "")).toLowerCase(Locale.ROOT);
                        if (!"playing".equals(evt)) continue;

                        Date playedAt = fromIso8601(o.optString("played_at", ""));
                        if (playedAt == null) continue;

                        rememberRecentPlay(
                                playedAt.getTime(),
                                o.optString("track", ""),
                                o.optString("artist", ""),
                                o.optLong("duration_ms", 0L)
                        );
                    }
                } catch (Throwable ignored) {
                }
            }

            // `hasPriorPlayInMemory` recorre la lista de atrás hacia delante y
            // corta al salir de la ventana, así que necesita orden ascendente.
            try {
                java.util.Collections.sort(sRecentPlays, (a, b) -> Long.compare(a.playedAtMs, b.playedAtMs));
            } catch (Throwable ignored) {
            }

            sRecentPlaysLoaded = true;
        }
    }

    private boolean hasPriorPlayInMemory(String track, String artist, long durationMs, long cutoffMs, long beforeMs) {
        String targetTrack = normalizeForMatch(track);
        String targetArtist = normalizeForMatch(artist);
        if (targetTrack.isEmpty() || targetArtist.isEmpty()) return false;

        synchronized (sEventFileLock) {
            for (int i = sRecentPlays.size() - 1; i >= 0; i--) {
                RecentPlay rp = sRecentPlays.get(i);
                long ts = rp.playedAtMs;
                if (ts < cutoffMs) break;
                if (ts >= beforeMs) continue;

                if (matchesDuplicateCandidate(
                        targetTrack,
                        targetArtist,
                        track,
                        artist,
                        durationMs,
                        rp.track,
                        rp.artist,
                        rp.durationMs
                )) {
                    return true;
                }
            }
        }
        return false;
    }

    public static void setListener(TrackListener l) {
        sListener = l;

        // If service captured a track before JS/plugin was ready, replay once.
        Snapshot snap = sLastSnapshot;
        if (l != null && snap != null) {
            // Only replay if it is reasonably fresh to avoid stale UI.
            long ageMs = android.os.SystemClock.uptimeMillis() - snap.capturedAtUptimeMs;
            if (ageMs >= 0 && ageMs <= 15000) {
                l.onTrack(snap.track, snap.artist, snap.album, snap.durationMs, snap.isPlaying);
            }
        }
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        sServiceInstance = this;

        // Keep the process alive on aggressive OEMs (Samsung One UI, etc.).
        SkippifyForegroundService.start(getApplicationContext(), true);
        startDuplicateHistoryPrewarm();
        // Si el proceso murió mientras un anuncio estaba silenciado, el volumen se
        // quedaba a 0 para siempre (el flag `sAdsMuted` es estático y arranca en
        // false, así que restoreMediaVolumeIfNeeded no hacía nada).
        restorePersistedAdMuteIfNeeded(getApplicationContext());

        // When the listener (re)connects, Spotify may already be playing and the
        // notification may already exist. Query active notifications so we can
        // attach to the MediaSession and start receiving play/pause changes.
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active == null) return;

            for (StatusBarNotification sbn : active) {
                if (sbn == null) continue;
                if (!SPOTIFY_PKG.equals(sbn.getPackageName())) continue;

                Notification n = sbn.getNotification();
                if (n == null) continue;

                Bundle extras = n.extras;
                ensureMediaController(extras);

                Extracted extracted = extractMetadata(n, extras);
                if (extracted == null) continue;
                if (extracted.track.isEmpty() || extracted.track.equalsIgnoreCase("Spotify")) continue;

                Snapshot snap = new Snapshot(
                        extracted.track,
                        extracted.artist,
                        extracted.album,
                        extracted.durationMs,
                        extracted.isPlaying,
                        SystemClock.uptimeMillis(),
                        System.currentTimeMillis()
                );
                sLastSnapshot = snap;
                updatePlaySession(snap, "listener_connected");

                // Persist and emit once on connect.
                persistEvent(snap, "listener_connected");

                sLastEmittedKey = snap.key();
                sLastEmittedUptimeMs = snap.capturedAtUptimeMs;

                TrackListener l = sListener;
                if (l != null) {
                    l.onTrack(snap.track, snap.artist, snap.album, snap.durationMs, snap.isPlaying);
                }

                break;
            }
        } catch (Throwable ignored) {
        }
    }

    private void startDuplicateHistoryPrewarm() {
        if (sDuplicatePrewarmStarted) return;

        synchronized (SpotifyNotificationListener.class) {
            if (sDuplicatePrewarmStarted) return;
            sDuplicatePrewarmStarted = true;
        }

        Thread prewarmThread = new Thread(() -> {
            long startedAtMs = SystemClock.uptimeMillis();
            try {
                ensureRecentPlaysLoaded();
                ensureDuplicateHistoryDatabaseReady();
            } catch (Throwable t) {
                Log.w(TAG, "Duplicate history prewarm failed", t);
            } finally {
                Log.i(TAG, "Duplicate history prewarm finished totalMs="
                        + (SystemClock.uptimeMillis() - startedAtMs)
                        + " dbReady=" + sDuplicateHistoryDbReady);
            }
        }, "SkippifyDupPrewarm");
        prewarmThread.setDaemon(true);
        prewarmThread.start();
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        closePlaySession();
        sServiceInstance = null;
        restoreMediaVolumeIfNeeded(getApplicationContext());

        // Best-effort rebind: some devices/OEMs will disconnect listeners under
        // memory/battery pressure. requestRebind asks the system to reconnect.
        try {
            NotificationListenerService.requestRebind(
                    new ComponentName(getApplicationContext(), SpotifyNotificationListener.class)
            );
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        if (!SPOTIFY_PKG.equals(sbn.getPackageName())) return;

        // Belt-and-suspenders: ensure foreground service is alive whenever
        // a Spotify notification arrives (covers cases where the service was
        // killed and the system re-delivered the listener without re-connecting).
        SkippifyForegroundService.start(getApplicationContext());

        Notification n = sbn.getNotification();
        if (n == null) return;

        Bundle extras = n.extras;

        // Attach to MediaSession so we can receive play/pause changes even when
        // Spotify doesn't post a new notification update.
        ensureMediaController(extras);

        Extracted extracted = extractMetadata(n, extras);
        if (extracted == null) return;

        boolean adInNotification = isAdFromExtras(extras)
            || containsAdKeyword(extracted.track)
            || containsAdKeyword(extracted.artist)
            || containsAdKeyword(extracted.album);

        // Some Spotify/OEM combinations report metadata before reliable playback
        // state in this callback. If controller already reports PLAYING, treat
        // this update as playing to trigger duplicate-skip earlier.
        if (!extracted.isPlaying && isControllerPlaying()) {
            extracted = new Extracted(
                extracted.track,
                extracted.artist,
                extracted.album,
                extracted.durationMs,
                true
            );
        }

        applyAdMuteState(adInNotification && extracted.isPlaying);

        // Ignore empty or placeholder notifications
        if (extracted.track.isEmpty() || extracted.track.equalsIgnoreCase("Spotify")) return;

        Snapshot snap = new Snapshot(
                extracted.track,
                extracted.artist,
                extracted.album,
                extracted.durationMs,
                extracted.isPlaying,
            android.os.SystemClock.uptimeMillis(),
            System.currentTimeMillis()
        );

        // Cache snapshot even if listener isn't ready yet.
        Snapshot previousSnap = sLastSnapshot;
        sLastSnapshot = snap;
        updatePlaySession(snap, "notification");

        // Deduplicate: if the exact same state (track+artist+isPlaying) was already
        // emitted, skip. Spotify frequently re-posts the notification for the same
        // playing track (UI refresh, album art load, etc.) – we only want to emit
        // when something meaningful changed (new song or play/pause toggle).
        String key = snap.key();
        long now = snap.capturedAtUptimeMs;
        boolean sameState = key.equals(sLastEmittedKey);
        if (sameState && isPlaySessionSettled(playSessionKey(snap))) return;

        if (handlePauseToSkip(snap, previousSnap)) {
            return;
        }
        if (sameState) return;

        // Persist even if the JS/plugin layer isn't alive.
        persistEvent(snap, "notification");

        // El marcador se actualiza haya o no capa JS escuchando. Antes sólo se
        // hacía con listener activo, así que en segundo plano el guard de estado
        // repetido no servía de nada: cada refresco de Spotify volvía a persistir
        // y a reevaluar el salto.
        sLastEmittedKey = key;
        sLastEmittedUptimeMs = now;

        TrackListener l = sListener;
        if (l == null) return;
        l.onTrack(snap.track, snap.artist, snap.album, snap.durationMs, snap.isPlaying);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn == null) return;
        if (!SPOTIFY_PKG.equals(sbn.getPackageName())) return;

        restoreMediaVolumeIfNeeded(getApplicationContext());

        // Notification removed => treat as stop/no music.
        emitStopped();
    }

    private void ensureMediaController(@Nullable Bundle extras) {
        if (extras == null) return;
        try {
            MediaSession.Token token = extras.getParcelable(Notification.EXTRA_MEDIA_SESSION);
            if (token == null) return;

            if (mLastToken != null && mLastToken.equals(token) && mController != null) return;

            if (mController != null) {
                try {
                    mController.unregisterCallback(mControllerCallback);
                } catch (Throwable ignored) {
                }
            }

            mLastToken = token;
            mController = new MediaController(getApplicationContext(), token);
            try {
                // Must pass a Handler backed by a Looper-equipped thread.
                // onNotificationPosted runs on a binder thread (no Looper), so
                // calling registerCallback() without a Handler causes the callback
                // to never fire – meaning pause→play transitions are missed.
                mController.registerCallback(mControllerCallback, new Handler(Looper.getMainLooper()));
            } catch (Throwable ignored) {
            }

            // Emit once immediately from the controller snapshot.
            emitFromController();
        } catch (Throwable ignored) {
        }
    }

    private void emitFromController() {
        MediaController controller = mController;
        if (controller == null) return;

        try {
            MediaMetadata md = controller.getMetadata();
            PlaybackState ps = controller.getPlaybackState();

            String title = null;
            String artist = null;
            String album = null;
            long durationMs = 0L;

            if (md != null) {
                title = md.getString(MediaMetadata.METADATA_KEY_TITLE);
                artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST);
                if (isNullOrEmpty(artist)) {
                    artist = md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                }
                album = md.getString(MediaMetadata.METADATA_KEY_ALBUM);
                durationMs = md.getLong(MediaMetadata.METADATA_KEY_DURATION);
            }

            boolean isPlaying = ps != null && ps.getState() == PlaybackState.STATE_PLAYING;
            String trackTrim = safeTrim(title);
            if (trackTrim.isEmpty()) return;

            boolean adFromMetadata = containsAdKeyword(trackTrim)
                || containsAdKeyword(artist)
                || containsAdKeyword(album);
            applyAdMuteState(adFromMetadata && isPlaying);

            Extracted extracted = new Extracted(trackTrim, safeTrim(artist), album, durationMs, isPlaying);

            Snapshot snap = new Snapshot(
                    extracted.track,
                    extracted.artist,
                    extracted.album,
                    extracted.durationMs,
                    extracted.isPlaying,
                    SystemClock.uptimeMillis(),
                    System.currentTimeMillis()
            );

            Snapshot previousSnap = sLastSnapshot;
            sLastSnapshot = snap;
            updatePlaySession(snap, "media_session");

            // Deduplicate: same-state guard (no time window needed – if the key is
            // identical the playback state hasn't actually changed).
            String key = snap.key();
            long now = snap.capturedAtUptimeMs;
            boolean sameState = key.equals(sLastEmittedKey);
            if (sameState && isPlaySessionSettled(playSessionKey(snap))) return;

            if (handlePauseToSkip(snap, previousSnap)) {
                return;
            }
            if (sameState) return;

            // Persist even if the JS/plugin layer isn't alive.
            persistEvent(snap, "media_session");

            sLastEmittedKey = key;
            sLastEmittedUptimeMs = now;

            TrackListener l = sListener;
            if (l == null) return;
            l.onTrack(snap.track, snap.artist, snap.album, snap.durationMs, snap.isPlaying);
        } catch (Throwable ignored) {
        }
    }

    private void emitStopped() {
        restoreMediaVolumeIfNeeded(getApplicationContext());
        long now = SystemClock.uptimeMillis();
        Snapshot snap = new Snapshot("", "", null, 0L, false, now, System.currentTimeMillis());
        sLastSnapshot = snap;
        // Cierra la sesión abierta y consolida su escucha si llegó al umbral.
        updatePlaySession(snap, "notification");

        // Persist stop events so background playback segments can be closed.
        persistEvent(snap, "notification");

        TrackListener l = sListener;
        if (l == null) return;

        String key = "STOP";
        if (key.equals(sLastEmittedKey) && (now - sLastEmittedUptimeMs) < 2000) return;
        sLastEmittedKey = key;
        sLastEmittedUptimeMs = now;
        l.onTrack("", "", null, 0L, false);
    }

    private static final class Extracted {
        final String track;
        final String artist;
        final String album;
        final long durationMs;
        final boolean isPlaying;

        Extracted(String track, String artist, @Nullable String album, long durationMs, boolean isPlaying) {
            this.track = safeTrim(track);
            this.artist = safeTrim(artist);
            this.album = safeTrim(album);
            this.durationMs = durationMs;
            this.isPlaying = isPlaying;
        }
    }

    @Nullable
    private Extracted extractMetadata(Notification n, @Nullable Bundle extras) {
        // 1) MediaSession metadata (best)
        Extracted fromSession = extractFromMediaSession(extras);
        if (fromSession != null && !fromSession.track.isEmpty()) {
            // If session metadata is missing artist/album, try to fill from extras.
            if (fromSession.artist.isEmpty() || (fromSession.album == null || fromSession.album.isEmpty())) {
                Extracted fromExtras = extractFromExtras(n, extras);
                if (fromExtras != null) {
                    String artist = fromSession.artist.isEmpty() ? fromExtras.artist : fromSession.artist;
                    String album = (fromSession.album == null || fromSession.album.isEmpty()) ? fromExtras.album : fromSession.album;
                    return new Extracted(fromSession.track, artist, album, fromSession.durationMs, fromSession.isPlaying);
                }
            }
            return fromSession;
        }

        // 2) Notification extras fallback
        Extracted fromExtras = extractFromExtras(n, extras);
        if (fromExtras != null && !fromExtras.track.isEmpty()) return fromExtras;

        return null;
    }

    @Nullable
    private Extracted extractFromMediaSession(@Nullable Bundle extras) {
        if (extras == null) return null;

        try {
            MediaSession.Token token = extras.getParcelable(Notification.EXTRA_MEDIA_SESSION);
            if (token == null) return null;

            // Reutilizar el controller cacheado: antes se instanciaba un
            // MediaController nuevo en CADA notificación de Spotify (varias por
            // canción), con el coste de IPC que eso conlleva.
            MediaController cached = mController;
            MediaController controller = (cached != null && token.equals(mLastToken))
                    ? cached
                    : new MediaController(getApplicationContext(), token);
            MediaMetadata md = controller.getMetadata();
            PlaybackState ps = controller.getPlaybackState();

            String title = null;
            String artist = null;
            String album = null;
            long durationMs = 0L;

            if (md != null) {
                title = md.getString(MediaMetadata.METADATA_KEY_TITLE);
                artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST);
                if (isNullOrEmpty(artist)) {
                    artist = md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                }
                album = md.getString(MediaMetadata.METADATA_KEY_ALBUM);
                durationMs = md.getLong(MediaMetadata.METADATA_KEY_DURATION);
            }

            boolean isPlaying = ps != null && ps.getState() == PlaybackState.STATE_PLAYING;

            String trackTrim = safeTrim(title);
            String artistTrim = safeTrim(artist);
            if (trackTrim.isEmpty()) return null;

            // Artist can be empty for some edge cases; keep it but try fallback in extras later.
            return new Extracted(trackTrim, artistTrim, album, durationMs, isPlaying);
        } catch (Throwable ignored) {
            // Some OEMs/Spotify builds can throw unexpected exceptions here.
            return null;
        }
    }

    @Nullable
    private static Extracted extractFromExtras(Notification n, @Nullable Bundle extras) {
        if (extras == null) return null;

        String track = asString(extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = asString(extras.getCharSequence(Notification.EXTRA_TEXT));
        String subText = asString(extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
        String bigText = asString(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));

        // Some devices place useful info in textLines.
        CharSequence[] lines = null;
        try {
            lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        } catch (Throwable ignored) {
        }

        String artist = "";
        String album = "";

        // Prefer parsing the main text.
        ParsedArtistAlbum parsed = parseArtistAlbum(text);
        artist = parsed.artist;
        album = parsed.album;

        if (isNullOrEmpty(artist) && lines != null && lines.length > 0) {
            // Often first line is artist.
            ParsedArtistAlbum parsedLine = parseArtistAlbum(asString(lines[0]));
            artist = parsedLine.artist;
            if (isNullOrEmpty(album)) album = parsedLine.album;

            if (isNullOrEmpty(album) && lines.length > 1) {
                album = safeTrim(asString(lines[1]));
            }
        }

        if (isNullOrEmpty(album)) {
            // Some Spotify versions put album in subText.
            album = safeTrim(subText);
        }

        if (isNullOrEmpty(artist)) {
            // Last resort: try bigText.
            ParsedArtistAlbum parsedBig = parseArtistAlbum(bigText);
            artist = parsedBig.artist;
            if (isNullOrEmpty(album)) album = parsedBig.album;
        }

        // Without MediaSession playback state, we can't reliably infer play/pause.
        boolean isPlaying = false;

        return new Extracted(track, artist, album, 0L, isPlaying);
    }

    private static final class ParsedArtistAlbum {
        final String artist;
        final String album;

        ParsedArtistAlbum(String artist, String album) {
            this.artist = safeTrim(artist);
            this.album = safeTrim(album);
        }
    }

    private static ParsedArtistAlbum parseArtistAlbum(@Nullable String raw) {
        String text = safeTrim(raw);
        if (text.isEmpty()) return new ParsedArtistAlbum("", "");

        // Common patterns in Spotify notifications:
        // "Artist" or "Artist • Album" or "Artist · Album".
        String[] separators = new String[] { " • ", " · ", " - ", " – ", " — " };
        for (String sep : separators) {
            int idx = text.indexOf(sep);
            if (idx > 0 && idx < text.length() - sep.length()) {
                String left = text.substring(0, idx);
                String right = text.substring(idx + sep.length());
                return new ParsedArtistAlbum(left, right);
            }
        }

        return new ParsedArtistAlbum(text, "");
    }

    private static String asString(@Nullable CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }

    private boolean isControllerPlaying() {
        try {
            MediaController controller = mController;
            if (controller == null) return false;
            PlaybackState state = controller.getPlaybackState();
            return state != null && state.getState() == PlaybackState.STATE_PLAYING;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static boolean matchesDuplicateCandidate(
            String normalizedTargetTrack,
            String normalizedTargetArtist,
            String rawTargetTrack,
            String rawTargetArtist,
            long targetDurationMs,
            String candidateTrack,
            String candidateArtist,
            long candidateDurationMs
    ) {
        String normalizedCandidateTrack = normalizeForMatch(candidateTrack);
        String normalizedCandidateArtist = normalizeForMatch(candidateArtist);
        if (normalizedTargetTrack.isEmpty() || normalizedTargetArtist.isEmpty()) return false;
        if (normalizedCandidateTrack.isEmpty() || normalizedCandidateArtist.isEmpty()) return false;

        if (normalizedTargetTrack.equals(normalizedCandidateTrack)
                && normalizedTargetArtist.equals(normalizedCandidateArtist)) {
            return true;
        }

        String targetCanonicalTrack = canonicalTrackTitle(rawTargetTrack);
        String candidateCanonicalTrack = canonicalTrackTitle(candidateTrack);
        if (targetCanonicalTrack.isEmpty() || candidateCanonicalTrack.isEmpty()) return false;
        if (!targetCanonicalTrack.equals(candidateCanonicalTrack)) return false;
        if (!primaryArtistKey(rawTargetArtist).equals(primaryArtistKey(candidateArtist))) return false;

        if (targetDurationMs > 0 && candidateDurationMs > 0
                && Math.abs(targetDurationMs - candidateDurationMs) > 3000L) {
            return false;
        }

        return true;
    }

    private static String canonicalTrackTitle(@Nullable String raw) {
        String track = normalizeForMatch(raw);
        if (track.isEmpty()) return "";

        track = track
                .replaceAll("\\b(feat|featuring|ft)\\b.*$", "")
                .replaceAll("\\b(remaster|remastered)(\\s+\\d{2,4})?$", "")
                .replaceAll("\\b(live|mono|stereo|instrumental|acoustic|karaoke|commentary)$", "")
                .replaceAll("\\b(radio edit|edit|mix|version)$", "")
                .trim();

        return track.replaceAll("\\s+", " ").trim();
    }

    private static String primaryArtistKey(@Nullable String raw) {
        // BUG: antes se normalizaba primero y luego se intentaba partir por
        // ",", "&" y ";" — pero normalizeForMatch ya había convertido esos
        // caracteres en espacios, así que nunca casaban. Resultado: "Artista A,
        // Artista B" no se reducía al artista principal y la detección de
        // duplicadas fallaba cuando Spotify reportaba sólo el artista principal.
        String artist = safeTrim(raw);
        if (artist.isEmpty()) return "";

        int cut = -1;
        for (String sep : new String[] { ",", "&", ";", " feat", " ft.", " ft ", " con " }) {
            int idx = artist.toLowerCase(Locale.ROOT).indexOf(sep);
            if (idx > 0 && (cut < 0 || idx < cut)) cut = idx;
        }
        if (cut > 0) artist = artist.substring(0, cut);

        String normalized = normalizeForMatch(artist);
        if (normalized.isEmpty()) return "";

        String primary = normalized.split("\\b(?:and|with|x|y)\\b", 2)[0].trim();
        // Si el nombre EMPIEZA por uno de esos conectores ("Y La Bamba") el split
        // devolvía cadena vacía, y dos artistas distintos acababan con la misma
        // clave "" ⇒ falsos positivos al detectar duplicadas.
        return primary.isEmpty() ? normalized : primary;
    }

    private static String normalizeForMatch(@Nullable String raw) {
        String text = safeTrim(raw);
        if (text.isEmpty()) return "";

        text = Normalizer.normalize(text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{Alnum}]+", " ")
                .trim();

        return text.replaceAll("\\s+", " ");
    }

    private static List<String> deserializeKeywords(@Nullable String raw) {
        List<String> out = new ArrayList<>();
        if (raw == null || raw.trim().isEmpty()) {
            out.addAll(DEFAULT_AD_KEYWORDS);
            return out;
        }

        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                String kw = normalizeForMatch(arr.optString(i, ""));
                if (!kw.isEmpty() && !out.contains(kw)) {
                    out.add(kw);
                }
            }
        } catch (Throwable ignored) {
        }

        for (String kw : DEFAULT_AD_KEYWORDS) {
            String norm = normalizeForMatch(kw);
            if (!norm.isEmpty() && !out.contains(norm)) {
                out.add(norm);
            }
        }
        return out;
    }

    private static String serializeKeywords(@Nullable List<String> keywords) {
        JSONArray arr = new JSONArray();
        List<String> base = keywords == null ? DEFAULT_AD_KEYWORDS : keywords;
        List<String> unique = new ArrayList<>();

        for (String kw : base) {
            String norm = normalizeForMatch(kw);
            if (!norm.isEmpty() && !unique.contains(norm)) {
                unique.add(norm);
            }
        }

        for (String kw : DEFAULT_AD_KEYWORDS) {
            String norm = normalizeForMatch(kw);
            if (!norm.isEmpty() && !unique.contains(norm)) {
                unique.add(norm);
            }
        }

        for (String kw : unique) {
            arr.put(kw);
        }

        return arr.toString();
    }

    private static boolean isNullOrEmpty(@Nullable String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String safeTrim(@Nullable String s) {
        return s == null ? "" : s.trim();
    }
}
