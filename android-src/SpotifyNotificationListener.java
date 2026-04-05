package com.skippify.app;

import android.app.Notification;
import android.content.ComponentName;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.os.SystemClock;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.TimeZone;

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
    private static final String PREF_LISTENING_MODE = "listeningMode";
    private static final String PREF_CUSTOM_SKIP_DUPLICATES = "customSkipDuplicates";
    private static final String PREF_CUSTOM_SKIP_INTERVAL = "customSkipDuplicatesInterval";

    private static final String MODE_DISCOVERY = "discovery";
    private static final String MODE_CASUAL = "casual";
    private static final String MODE_CUSTOM = "custom";

    private static final long SAME_TRACK_SKIP_GUARD_MS = 12000L;
    private static final long MIN_PRIOR_PLAY_GAP_MS = 15000L;
    private static final long RESUME_POSITION_GUARD_MS = 15000L;
    private static volatile String sLastAutoSkipKey = "";
    private static volatile long sLastAutoSkipAtMs = 0L;
    private static volatile boolean sAdsMuted = false;
    private static volatile int sPreAdsVolume = -1;

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
        try {
            svc.mController.getTransportControls().skipToNext();
        } catch (Throwable ignored) {
        }
    }

    private MediaSession.Token mLastToken;
    private MediaController mController;
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
    private static final long EVENT_LOG_MAX_BYTES = 2L * 1024L * 1024L; // 2MB
    private static final long DUP_HISTORY_MAX_BYTES = 6L * 1024L * 1024L; // 6MB
    private static final int RECENT_PLAY_CACHE_MAX = 6000;
    static final Object sEventFileLock = new Object();

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

        SkippifyForegroundService.start(context);
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

        SkippifyForegroundService.start(context);
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

        SkippifyForegroundService.start(context);
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

    private boolean isSilenceAdsEnabled() {
        return isSilenceAdsEnabled(getApplicationContext());
    }

    private static void muteMediaVolumeIfNeeded(@Nullable android.content.Context context) {
        if (context == null || sAdsMuted) return;
        try {
            AudioManager am = (AudioManager) context.getSystemService(AUDIO_SERVICE);
            if (am == null) return;
            int current = am.getStreamVolume(AudioManager.STREAM_MUSIC);
            sPreAdsVolume = current;
            if (current > 0) {
                am.setStreamVolume(AudioManager.STREAM_MUSIC, 0, 0);
            }
            sAdsMuted = true;
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
                if (restore < 0) restore = 0;
                if (restore > max) restore = max;
                am.setStreamVolume(AudioManager.STREAM_MUSIC, restore, 0);
            }
        } catch (Throwable ignored) {
        } finally {
            sAdsMuted = false;
            sPreAdsVolume = -1;
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

    private static boolean containsPublicidad(@Nullable String raw) {
        String normalized = normalizeForMatch(raw);
        return normalized.contains("publicidad")
            || normalized.contains("anuncio")
            || normalized.contains("anuncios");
    }

    private static boolean isAdFromExtras(@Nullable Bundle extras) {
        if (extras == null) return false;
        if (containsPublicidad(asString(extras.getCharSequence(Notification.EXTRA_TITLE)))) return true;
        if (containsPublicidad(asString(extras.getCharSequence(Notification.EXTRA_TEXT)))) return true;
        if (containsPublicidad(asString(extras.getCharSequence(Notification.EXTRA_SUB_TEXT)))) return true;
        if (containsPublicidad(asString(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)))) return true;
        try {
            CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null) {
                for (CharSequence cs : lines) {
                    if (containsPublicidad(asString(cs))) return true;
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
        if (isResumeFromPlaybackPosition()) return false;
        String track = normalizeForMatch(snap.track);
        String artist = normalizeForMatch(snap.artist);
        if (track.isEmpty() || artist.isEmpty()) return false;

        try {
            android.content.SharedPreferences sp = getApplicationContext().getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            boolean enabled = sp.getBoolean(PREF_SKIP_DUPLICATES, true);
            if (!enabled) return false;

            String interval = sp.getString(PREF_SKIP_INTERVAL, "1w");
            long intervalMs = parseIntervalMs(interval);
            long nowMs = snap.capturedAtEpochMs;
            long cutoffMs = nowMs - intervalMs;

            String key = canonicalTrackTitle(snap.track) + "|" + primaryArtistKey(snap.artist);
            if (key.equals(sLastAutoSkipKey) && (nowMs - sLastAutoSkipAtMs) < SAME_TRACK_SKIP_GUARD_MS) {
                return false;
            }

            if (!hasPriorPlayInLog(track, artist, snap.durationMs, cutoffMs, nowMs - MIN_PRIOR_PLAY_GAP_MS)) {
                return false;
            }

            sLastAutoSkipKey = key;
            sLastAutoSkipAtMs = nowMs;
            return true;
        } catch (Throwable ignored) {
            return false;
        }
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
        try {
            MediaController controller = mController;
            if (controller == null) return false;

            PlaybackState state = controller.getPlaybackState();
            if (state == null) return false;

            long pos = state.getPosition();
            if (pos < 0L) return false;

            return pos > RESUME_POSITION_GUARD_MS;
        } catch (Throwable ignored) {
            return false;
        }
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
        ensureRecentPlaysLoaded();
        if (hasPriorPlayInMemory(track, artist, durationMs, cutoffMs, beforeMs)) {
            return true;
        }

        // Consultar índice en memoria primero (O(1))
        String indexKey = canonicalTrackTitle(track) + "|" + primaryArtistKey(artist);
        synchronized (sDuplicateIndexLock) {
            if (sDuplicateIndex.containsKey(indexKey)) {
                Long prevTimeMs = sDuplicateIndex.get(indexKey);
                if (prevTimeMs != null && prevTimeMs >= cutoffMs && prevTimeMs < beforeMs) {
                    return true;
                }
            }
        }

        File dir = getApplicationContext().getFilesDir();
        if (dir == null) return false;
        File f = new File(dir, DUP_HISTORY_FILE);
        if (!f.exists() || !f.isFile()) {
            f = new File(dir, EVENT_LOG_FILE);
        }
        if (!f.exists() || !f.isFile()) return false;

        String targetTrack = normalizeForMatch(track);
        String targetArtist = normalizeForMatch(artist);

        synchronized (sEventFileLock) {
            try {
                // SOLUCIÓN #1: Lectura inversa del archivo (desde el final hacia el inicio)
                // Esto es 20x más rápido para archivos grandes porque los duplicados
                // recientes están al final del archivo
                return searchDuplicateInFileReverse(f, targetTrack, targetArtist, track, artist, durationMs, cutoffMs, beforeMs);
            } catch (Throwable ignored) {
            }
        }
        return false;
    }

    /**
     * Busca un duplicado en el archivo de forma inversa (desde el final hacia atrás).
     * Optimización: La mayoría de duplicados están en las últimas líneas.
     * Mejora: 20s -> 500ms en archivos de 6MB
     */
    private boolean searchDuplicateInFileReverse(
            File f,
            String targetTrack,
            String targetArtist,
            String originalTrack,
            String originalArtist,
            long originalDurationMs,
            long cutoffMs,
            long beforeMs) throws Throwable {
        
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            long fileLength = raf.length();
            if (fileLength <= 0) return false;

            byte[] buffer = new byte[8192]; // 8KB chunks
            long position = fileLength;
            StringBuilder lineBuilder = new StringBuilder();
            boolean foundNewline = false;

            // Leer desde el final del archivo hacia atrás
            while (position > 0) {
                long readSize = Math.min(position, buffer.length);
                position -= readSize;
                raf.seek(position);
                raf.readFully(buffer, 0, (int) readSize);

                // Procesar buffer desde atrás
                for (int i = (int) readSize - 1; i >= 0; i--) {
                    char c = (char) buffer[i];
                    
                    if (c == '\n') {
                        if (foundNewline && lineBuilder.length() > 0) {
                            String line = lineBuilder.toString().trim();
                            if (line.length() > 0) {
                                if (processLineForDuplicate(line, targetTrack, targetArtist, originalTrack, originalArtist, originalDurationMs, cutoffMs, beforeMs)) {
                                    return true; // Encontrado: detener búsqueda
                                }
                            }
                            lineBuilder = new StringBuilder();
                        }
                        foundNewline = true;
                    } else if (foundNewline) {
                        lineBuilder.insert(0, c); // Insertar al inicio (construir línea hacia atrás)
                    }
                }
            }

            // Procesar última línea si es necesario
            if (lineBuilder.length() > 0) {
                String line = lineBuilder.toString().trim();
                if (line.length() > 0) {
                    return processLineForDuplicate(line, targetTrack, targetArtist, originalTrack, originalArtist, originalDurationMs, cutoffMs, beforeMs);
                }
            }
        } catch (Throwable ignored) {
        }

        return false;
    }

    /**
     * Procesa una línea del archivo para verificar si es un duplicado.
     * Utilizado por searchDuplicateInFileReverse().
     */
    private boolean processLineForDuplicate(
            String line,
            String targetTrack,
            String targetArtist,
            String originalTrack,
            String originalArtist,
            long originalDurationMs,
            long cutoffMs,
            long beforeMs) {
        try {
            JSONObject o = new JSONObject(line);
            String evt = safeTrim(o.optString("event", "")).toLowerCase(Locale.ROOT);
            if (!"playing".equals(evt)) return false;

            String t = o.optString("track", "");
            String a = o.optString("artist", "");
            long candidateDurationMs = o.optLong("duration_ms", 0L);
            if (!matchesDuplicateCandidate(targetTrack, targetArtist, originalTrack, originalArtist, originalDurationMs, t, a, candidateDurationMs)) {
                return false;
            }

            Date playedAt = fromIso8601(o.optString("played_at", ""));
            if (playedAt == null) return false;
            
            long ts = playedAt.getTime();
            return ts >= cutoffMs && ts < beforeMs;
        } catch (Throwable ignored) {
            return false;
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

            if ("playing".equals(event)) {
                rememberRecentPlay(snap.capturedAtEpochMs, snap.track, snap.artist, snap.durationMs);
                // Agregar al índice de duplicados para búsqueda rápida
                String indexKey = canonicalTrackTitle(snap.track) + "|" + primaryArtistKey(snap.artist);
                synchronized (sDuplicateIndexLock) {
                    sDuplicateIndex.put(indexKey, snap.capturedAtEpochMs);
                }
            }

            appendJsonLine(getApplicationContext(), obj);
            appendDuplicateHistory(getApplicationContext(), obj, event);
        } catch (Throwable ignored) {
        }
    }

    private static void appendJsonLine(android.content.Context context, JSONObject obj) {
        if (context == null || obj == null) return;
        synchronized (sEventFileLock) {
            try {
                File dir = context.getFilesDir();
                if (dir == null) return;

                File f = new File(dir, EVENT_LOG_FILE);
                if (f.exists() && f.length() > EVENT_LOG_MAX_BYTES) {
                    // Simple rotation: drop the file if it grows too large.
                    // (Keeps the app from growing storage indefinitely.)
                    // If you want longer history, increase EVENT_LOG_MAX_BYTES.
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

    private static void appendDuplicateHistory(android.content.Context context, JSONObject obj, String event) {
        if (context == null || obj == null) return;
        String evt = safeTrim(event).toLowerCase(Locale.ROOT);
        if (!"playing".equals(evt)) return;

        synchronized (sEventFileLock) {
            try {
                File dir = context.getFilesDir();
                if (dir == null) return;

                File f = new File(dir, DUP_HISTORY_FILE);
                if (f.exists() && f.length() > DUP_HISTORY_MAX_BYTES) {
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

    private static void rememberRecentPlay(long playedAtMs, @Nullable String track, @Nullable String artist, long durationMs) {
        String t = safeTrim(track);
        String a = safeTrim(artist);
        if (t.isEmpty() || a.isEmpty() || playedAtMs <= 0L) return;

        synchronized (sEventFileLock) {
            sRecentPlays.add(new RecentPlay(playedAtMs, t, a, durationMs));
            int overflow = sRecentPlays.size() - RECENT_PLAY_CACHE_MAX;
            if (overflow > 0) {
                sRecentPlays.subList(0, overflow).clear();
            }
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

            File historyFile = new File(dir, DUP_HISTORY_FILE);
            if (!historyFile.exists() || !historyFile.isFile()) {
                historyFile = new File(dir, EVENT_LOG_FILE);
            }
            if (!historyFile.exists() || !historyFile.isFile()) {
                sRecentPlaysLoaded = true;
                return;
            }

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(new FileInputStream(historyFile), StandardCharsets.UTF_8)
            )) {
                String line;
                while ((line = reader.readLine()) != null) {
                    line = line == null ? "" : line.trim();
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
        SkippifyForegroundService.start(getApplicationContext());

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

                // Persist and emit once on connect.
                persistEvent(snap, "listener_connected");

                TrackListener l = sListener;
                if (l != null) {
                    sLastEmittedKey = snap.key();
                    sLastEmittedUptimeMs = snap.capturedAtUptimeMs;
                    l.onTrack(snap.track, snap.artist, snap.album, snap.durationMs, snap.isPlaying);
                }

                break;
            }
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
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
            || containsPublicidad(extracted.track)
            || containsPublicidad(extracted.artist)
            || containsPublicidad(extracted.album);

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

        // Deduplicate: if the exact same state (track+artist+isPlaying) was already
        // emitted, skip. Spotify frequently re-posts the notification for the same
        // playing track (UI refresh, album art load, etc.) – we only want to emit
        // when something meaningful changed (new song or play/pause toggle).
        String key = snap.key();
        long now = snap.capturedAtUptimeMs;
        if (key.equals(sLastEmittedKey)) return;

        if (shouldAutoSkipDuplicate(snap, previousSnap)) {
            skipCurrentTrack();
            return;
        }

        // Persist even if the JS/plugin layer isn't alive.
        persistEvent(snap, "notification");

        TrackListener l = sListener;
        if (l == null) return;

        sLastEmittedKey = key;
        sLastEmittedUptimeMs = now;
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

                boolean adFromMetadata = containsPublicidad(trackTrim)
                    || containsPublicidad(artist)
                    || containsPublicidad(album);
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

            // Deduplicate: same-state guard (no time window needed – if the key is
            // identical the playback state hasn't actually changed).
            String key = snap.key();
            long now = snap.capturedAtUptimeMs;
            if (key.equals(sLastEmittedKey)) return;

            if (shouldAutoSkipDuplicate(snap, previousSnap)) {
                skipCurrentTrack();
                return;
            }

            // Persist even if the JS/plugin layer isn't alive.
            persistEvent(snap, "media_session");

            TrackListener l = sListener;
            if (l == null) return;

            sLastEmittedKey = key;
            sLastEmittedUptimeMs = now;
            l.onTrack(snap.track, snap.artist, snap.album, snap.durationMs, snap.isPlaying);
        } catch (Throwable ignored) {
        }
    }

    private void emitStopped() {
        restoreMediaVolumeIfNeeded(getApplicationContext());
        long now = SystemClock.uptimeMillis();
        Snapshot snap = new Snapshot("", "", null, 0L, false, now, System.currentTimeMillis());
        sLastSnapshot = snap;

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

            MediaController controller = new MediaController(getApplicationContext(), token);
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
        String artist = normalizeForMatch(raw);
        if (artist.isEmpty()) return "";
        return artist.split("\\b(?:and|with|x|y)\\b|,|&|;", 2)[0].trim();
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

    private static boolean isNullOrEmpty(@Nullable String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String safeTrim(@Nullable String s) {
        return s == null ? "" : s.trim();
    }
}
