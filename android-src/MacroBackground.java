package com.skippify.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * La capa de Android del motor de macros en segundo plano.
 *
 * Aquí vive lo específico de la plataforma —SharedPreferences, org.json y el
 * hilo en el que se sale a la red— y nada más. Toda la lógica que decide qué
 * hacer está en {@link MacroRunner} y {@link SpotifyBackend}, que se prueban
 * aparte con javac sin necesidad de un móvil.
 *
 * Sólo se ejecutan macros cuyo origen es «la canción que suena ahora», y se
 * disparan por evento: el listener de notificaciones ya avisa de cada cambio de
 * canción, así que no hace falta ningún temporizador. La canción concreta se
 * pregunta a Spotify (la notificación da título y artista, no el identificador
 * que la API necesita).
 */
public final class MacroBackground {

    private static final String TAG = "SkippifyMacros";

    /** Fichero propio: no se mezcla con las preferencias del motor de saltos. */
    private static final String PREFS = "skippify_macros_bg";

    private static final String K_MACROS = "macros.json";

    /**
     * Un solo hilo: los cambios de canción llegan en ráfaga y dos ejecuciones a
     * la vez sobre las mismas macros se pisarían el deduplicado.
     */
    private static final ExecutorService POOL = Executors.newSingleThreadExecutor();

    private MacroBackground() { }

    // ── Piezas de la plataforma ──────────────────────────────────────────────

    static final MacroRunner.Clock RELOJ = new MacroRunner.Clock() {
        public long now() { return System.currentTimeMillis(); }
    };

    static MacroRunner.Store store(final Context ctx) {
        final SharedPreferences sp = ctx.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return new MacroRunner.Store() {
            public String get(String key) {
                try { return sp.getString(key, null); } catch (Throwable t) { return null; }
            }
            public void put(String key, String value) {
                try { sp.edit().putString(key, value).apply(); } catch (Throwable ignored) { }
            }
        };
    }

    /** El análisis del JSON lo hace org.json, que ya viene en Android. */
    static final SpotifyBackend.TokenParser PARSER = new SpotifyBackend.TokenParser() {
        public String[] parse(String body) {
            if (body == null) return null;
            try {
                JSONObject o = new JSONObject(body);
                return new String[] {
                        o.optString("access_token", null),
                        Long.toString(o.optLong("expires_in", 3600L)),
                        o.optString("refresh_token", null)
                };
            } catch (Throwable t) {
                return null;
            }
        }
    };

    static SpotifyBackend.Session sesion(Context ctx) {
        return new SpotifyBackend.Session(store(ctx), RELOJ,
                new SpotifyBackend.UrlRawHttp(), PARSER);
    }

    // ── Sesión de Spotify (la app la deposita aquí al iniciarla) ─────────────

    public static void guardarSesion(Context ctx, String clientId, String access,
                                     String refresh, long expiresAt, String scope) {
        sesion(ctx).guardar(clientId, access, refresh, expiresAt, scope);
    }

    public static void borrarSesion(Context ctx) {
        sesion(ctx).borrar();
    }

    /**
     * Estado de la sesión para la app. Devuelve el access token porque la app lo
     * necesita para sus propias llamadas, pero NO el refresh token: ése se queda
     * aquí, que es quien lo renueva.
     */
    public static JSONObject estadoSesion(Context ctx) {
        SpotifyBackend.Session s = sesion(ctx);
        JSONObject o = new JSONObject();
        try {
            o.put("connected", s.haySesion());
            o.put("clientId", valor(s.clientId()));
            o.put("accessToken", valor(s.accessToken()));
            o.put("expiresAt", s.expiresAt());
            o.put("scope", valor(s.scope()));
            o.put("hasRefreshToken", SpotifyBackend.noVacio(s.refreshToken()));
        } catch (Throwable ignored) { }
        return o;
    }

    /** Fuerza un refresco y devuelve el estado resultante. */
    public static JSONObject refrescarSesion(Context ctx) {
        SpotifyBackend.Session s = sesion(ctx);
        boolean ok = s.refrescar();
        JSONObject o = estadoSesion(ctx);
        try { o.put("refreshed", ok); } catch (Throwable ignored) { }
        return o;
    }

    // ── Macros (la app las sincroniza aquí cada vez que cambian) ────────────

    public static void guardarMacros(Context ctx, String json) {
        store(ctx).put(K_MACROS, json == null ? "[]" : json);
    }

    static List<MacroRunner.Macro> macros(Context ctx) {
        List<MacroRunner.Macro> out = new ArrayList<MacroRunner.Macro>();
        String json = store(ctx).get(K_MACROS);
        if (json == null || json.length() == 0) return out;
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                String id = o.optString("id", null);
                if (id == null || id.length() == 0) continue;
                out.add(new MacroRunner.Macro(
                        id,
                        o.optString("name", id),
                        o.optBoolean("enabled", true),
                        o.optString("source", ""),
                        o.optString("action", ""),
                        vacioANull(o.optString("target", null)),
                        vacioANull(o.optString("targetPlaylistId", null))
                ));
            }
        } catch (Throwable t) {
            Log.w(TAG, "no se pudieron leer las macros guardadas", t);
        }
        return out;
    }

    /** Cuáles de las guardadas puede ejecutar el servicio, para que la app lo diga. */
    public static JSONArray idsDeSegundoPlano(Context ctx) {
        JSONArray arr = new JSONArray();
        List<MacroRunner.Macro> ms = MacroRunner.filtrar(macros(ctx));
        for (int i = 0; i < ms.size(); i++) arr.put(ms.get(i).id);
        return arr;
    }

    /** Estadísticas de lo ejecutado en segundo plano, por macro. */
    public static JSONArray estadisticas(Context ctx) {
        MacroRunner.Store st = store(ctx);
        JSONArray arr = new JSONArray();
        List<MacroRunner.Macro> ms = macros(ctx);
        for (int i = 0; i < ms.size(); i++) {
            MacroRunner.Macro m = ms.get(i);
            long runs = MacroRunner.runs(m, st);
            if (runs <= 0) continue;
            try {
                JSONObject o = new JSONObject();
                o.put("id", m.id);
                o.put("runs", runs);
                o.put("applied", MacroRunner.applied(m, st));
                o.put("lastResult", valor(MacroRunner.lastResult(m, st)));
                o.put("lastRunAt", MacroRunner.lastRunAt(m, st));
                arr.put(o);
            } catch (Throwable ignored) { }
        }
        return arr;
    }

    // ── Ejecución ────────────────────────────────────────────────────────────

    /**
     * Punto de entrada desde el listener. No bloquea: el hilo que trae la
     * notificación tiene que volver enseguida o Android se queja.
     */
    public static void alCambiarDeCancion(final Context ctx, boolean sonando) {
        if (ctx == null || !sonando) return;

        final Context app = ctx.getApplicationContext();

        // Comprobaciones baratas antes de ocupar el hilo y, sobre todo, antes de
        // salir a la red: lo normal es no tener ninguna macro de este tipo.
        if (MacroRunner.filtrar(macros(app)).isEmpty()) return;
        if (!sesion(app).haySesion()) return;

        POOL.execute(new Runnable() {
            public void run() {
                try {
                    ejecutar(app, false);
                } catch (Throwable t) {
                    Log.w(TAG, "fallo ejecutando macros en segundo plano", t);
                }
            }
        });
    }

    /**
     * Ejecuta ahora mismo, saltándose la ventana de repetición. Es lo que usa el
     * botón «Ejecutar» de la app para las macros que gobierna el servicio, de
     * modo que exista un único sitio que las ejecuta y un único deduplicado.
     */
    public static JSONObject ejecutarAhora(Context ctx) {
        try {
            return ejecutar(ctx.getApplicationContext(), true);
        } catch (Throwable t) {
            JSONObject o = new JSONObject();
            try { o.put("error", String.valueOf(t.getMessage())); } catch (Throwable ignored) { }
            return o;
        }
    }

    static JSONObject ejecutar(Context app, boolean forzar) {
        JSONObject resumen = new JSONObject();
        JSONArray detalle = new JSONArray();

        SpotifyBackend.Session session = sesion(app);
        MacroRunner.Http http = new SpotifyBackend.AuthedHttp(
                new SpotifyBackend.UrlRawHttp(), session);

        MacroRunner.Track track = cancionActual(http);
        try {
            resumen.put("track", track == null ? JSONObject.NULL : track.uri);
        } catch (Throwable ignored) { }

        if (track == null) {
            try { resumen.put("detalle", detalle); } catch (Throwable ignored) { }
            return resumen;
        }

        List<MacroRunner.Outcome> res = MacroRunner.run(
                track, macros(app), http, store(app), RELOJ, forzar);

        for (int i = 0; i < res.size(); i++) {
            MacroRunner.Outcome o = res.get(i);
            try {
                JSONObject j = new JSONObject();
                j.put("id", o.macroId);
                j.put("status", o.status);
                j.put("message", valor(o.message));
                detalle.put(j);
            } catch (Throwable ignored) { }
        }
        try { resumen.put("detalle", detalle); } catch (Throwable ignored) { }

        Log.i(TAG, "macros en segundo plano: " + res.size() + " evaluadas sobre " + track.uri);
        return resumen;
    }

    /**
     * Pregunta a Spotify qué suena. La notificación trae título y artista, pero
     * la Web API necesita el URI, y adivinarlo por búsqueda daría falsos
     * positivos con las versiones en directo y los remixes.
     */
    @Nullable
    static MacroRunner.Track cancionActual(MacroRunner.Http http) {
        MacroRunner.Response r = http.send("GET",
                MacroRunner.API + "/me/player/currently-playing", null);
        if (r == null || r.status < 200 || r.status >= 300) return null;
        if (r.body == null || r.body.trim().length() == 0) return null;  // 204: nada sonando

        try {
            JSONObject o = new JSONObject(r.body);
            JSONObject item = o.optJSONObject("item");
            if (item == null) return null;

            String tipo = item.optString("type", "track");
            if (!"track".equals(tipo)) return null;          // un pódcast no se copia igual
            if (item.optBoolean("is_local", false)) return null;

            String uri = item.optString("uri", null);
            if (uri == null) return null;

            StringBuilder artistas = new StringBuilder();
            JSONArray arr = item.optJSONArray("artists");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject a = arr.optJSONObject(i);
                    if (a == null) continue;
                    String nombre = a.optString("name", "");
                    if (nombre.length() == 0) continue;
                    if (artistas.length() > 0) artistas.append(", ");
                    artistas.append(nombre);
                }
            }
            return new MacroRunner.Track(uri, item.optString("name", ""), artistas.toString());
        } catch (Throwable t) {
            Log.w(TAG, "no se pudo leer la reproducción actual", t);
            return null;
        }
    }

    // ── Utilidades ───────────────────────────────────────────────────────────

    static String valor(String s) { return s == null ? "" : s; }

    static String vacioANull(String s) {
        return (s == null || s.length() == 0 || "null".equals(s)) ? null : s;
    }
}
