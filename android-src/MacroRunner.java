package com.skippify.app;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;

/**
 * Núcleo de la ejecución de macros en segundo plano.
 *
 * Deliberadamente sin una sola importación de Android: todo lo que necesita del
 * exterior —red, persistencia y reloj— entra por las tres interfaces de abajo.
 * Así esta clase, que es donde vive la lógica que puede equivocarse, se compila
 * y se prueba con javac a secas contra un Spotify de mentira, sin emulador.
 *
 * Sólo atiende las macros cuyo origen es «la canción que suena ahora»: son las
 * únicas que pierden sentido si no se ejecutan en el momento, y son las que el
 * servicio puede disparar por evento en cuanto cambia la canción. El resto de
 * orígenes siguen corriendo en la app, que es donde está el motor completo.
 */
public final class MacroRunner {

    // ── Contratos con el exterior ────────────────────────────────────────────

    /** Una petición HTTP ya autenticada. `jsonBody` puede ser null. */
    public interface Http {
        Response send(String method, String url, String jsonBody);
    }

    /** Almacén de clave/valor. En Android, SharedPreferences. */
    public interface Store {
        String get(String key);
        void put(String key, String value);
    }

    public interface Clock {
        long now();
    }

    public static final class Response {
        public final int status;
        public final String body;

        public Response(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }

    // ── Datos ────────────────────────────────────────────────────────────────

    public static final class Track {
        public final String uri;
        public final String name;
        public final String artists;

        public Track(String uri, String name, String artists) {
            this.uri = uri;
            this.name = name;
            this.artists = artists;
        }
    }

    public static final class Macro {
        public final String id;
        public final String name;
        public final boolean enabled;
        public final String source;
        public final String action;
        public final String target;            // null cuando la acción no lo usa
        public final String targetPlaylistId;  // null salvo destinos de playlist

        public Macro(String id, String name, boolean enabled, String source,
                     String action, String target, String targetPlaylistId) {
            this.id = id;
            this.name = name;
            this.enabled = enabled;
            this.source = source;
            this.action = action;
            this.target = target;
            this.targetPlaylistId = targetPlaylistId;
        }
    }

    public static final int APLICADA = 0;
    public static final int OMITIDA  = 1;
    public static final int ERROR    = 2;

    public static final class Outcome {
        public final String macroId;
        public final int status;
        public final String message;

        Outcome(String macroId, int status, String message) {
            this.macroId = macroId;
            this.status = status;
            this.message = message;
        }

        @Override
        public String toString() {
            String s = status == APLICADA ? "APLICADA" : (status == OMITIDA ? "OMITIDA" : "ERROR");
            return macroId + " " + s + " " + message;
        }
    }

    // ── Constantes ───────────────────────────────────────────────────────────

    public static final String API = "https://api.spotify.com/v1";

    public static final String SOURCE_CURRENT_TRACK = "current_track";

    /**
     * Spotify vuelve a publicar la misma canción muchas veces (carátula, cambio
     * de pausa, reanudar tras un anuncio). El listener ya filtra buena parte,
     * pero una canción que se repite al rato es un caso real, así que la guarda
     * es por ventana de tiempo y no «para siempre».
     */
    static final long VENTANA_REPETIDO_MS = 10L * 60L * 1000L;

    private MacroRunner() { }

    // ── Selección ────────────────────────────────────────────────────────────

    /**
     * ¿Puede el servicio ejecutar esta macro por su cuenta?
     *
     * Se es conservador a propósito: lo que no encaje aquí sigue funcionando
     * exactamente igual que hasta ahora desde la app, y es preferible eso a que
     * el segundo plano haga algo a medias con la biblioteca de nadie.
     */
    public static boolean esDeSegundoPlano(Macro m) {
        if (m == null || !m.enabled) return false;
        if (!SOURCE_CURRENT_TRACK.equals(m.source)) return false;

        if ("queue".equals(m.action)) return true;

        if ("copy".equals(m.action)) {
            if ("liked".equals(m.target) || "queue".equals(m.target)) return true;
            // Una playlist nueva sólo vale una vez ya creada: crearla es un paso
            // con estado que se deja a la app para no duplicar playlists vacías.
            return esPlaylist(m.target) && noVacio(m.targetPlaylistId);
        }

        if ("remove".equals(m.action)) {
            if ("liked".equals(m.target)) return true;
            return esPlaylist(m.target) && noVacio(m.targetPlaylistId);
        }

        // «Mover» exige una playlist de origen, así que nunca se da con esta
        // fuente; queda fuera igualmente por si el catálogo cambia.
        return false;
    }

    public static List<Macro> filtrar(List<Macro> macros) {
        List<Macro> out = new ArrayList<Macro>();
        if (macros == null) return out;
        for (int i = 0; i < macros.size(); i++) {
            Macro m = macros.get(i);
            if (esDeSegundoPlano(m)) out.add(m);
        }
        return out;
    }

    // ── Ejecución ────────────────────────────────────────────────────────────

    /**
     * Ejecuta contra `track` todas las macros que correspondan.
     * Devuelve un resultado por macro considerada, en orden.
     */
    public static List<Outcome> run(Track track, List<Macro> macros,
                                    Http http, Store store, Clock clock) {
        return run(track, macros, http, store, clock, false);
    }

    /**
     * @param forzar salta la ventana de repetición. Lo usa el botón «Ejecutar»
     *               de la app: si alguien lo pulsa a propósito, espera que pase
     *               algo aunque la canción se acabara de procesar sola.
     */
    public static List<Outcome> run(Track track, List<Macro> macros,
                                    Http http, Store store, Clock clock, boolean forzar) {
        List<Outcome> out = new ArrayList<Outcome>();
        if (track == null || !esPistaDelCatalogo(track.uri)) return out;

        List<Macro> aplicables = filtrar(macros);
        for (int i = 0; i < aplicables.size(); i++) {
            Macro m = aplicables.get(i);

            if (!forzar && yaProcesada(m, track.uri, store, clock)) {
                out.add(new Outcome(m.id, OMITIDA, "Ya procesada hace poco."));
                continue;
            }

            String error = aplicar(m, track, http);
            marcarProcesada(m, track.uri, store, clock);

            if (error == null) {
                anotar(m, store, clock, true, "En segundo plano: " + descripcionCorta(m, track));
                out.add(new Outcome(m.id, APLICADA, descripcionCorta(m, track)));
            } else {
                anotar(m, store, clock, false, "Error: " + error);
                out.add(new Outcome(m.id, ERROR, error));
            }
        }
        return out;
    }

    /** Devuelve null si fue bien, o el motivo en castellano si falló. */
    private static String aplicar(Macro m, Track t, Http http) {
        String uri = t.uri;

        if ("queue".equals(m.action) || "queue".equals(m.target)) {
            return revisar(http.send("POST", API + "/me/player/queue?uri=" + enc(uri), null), "player");
        }

        if ("copy".equals(m.action)) {
            if ("liked".equals(m.target)) {
                return revisar(http.send("PUT", API + "/me/library?uris=" + enc(uri), null), "library");
            }
            return revisar(
                    http.send("POST", API + "/playlists/" + m.targetPlaylistId + "/items",
                            "{\"uris\":[" + jsonString(uri) + "]}"),
                    "playlist");
        }

        if ("remove".equals(m.action)) {
            if ("liked".equals(m.target)) {
                return revisar(http.send("DELETE", API + "/me/library?uris=" + enc(uri), null), "library");
            }
            return revisar(
                    http.send("DELETE", API + "/playlists/" + m.targetPlaylistId + "/items",
                            "{\"items\":[{\"uri\":" + jsonString(uri) + "}]}"),
                    "playlist");
        }

        return "Esta macro no se puede ejecutar en segundo plano.";
    }

    // ── Traducción de la respuesta ───────────────────────────────────────────

    /**
     * Traduce el código de Spotify a algo que se pueda leer en la pestaña de
     * macros. Mantiene los mismos mensajes que la versión de JavaScript para
     * que el usuario no vea dos vocabularios distintos según dónde corriera.
     */
    static String revisar(Response r, String ambito) {
        if (r == null) return "No hubo respuesta de Spotify.";
        int s = r.status;
        if (s >= 200 && s < 300) return null;

        if (s == 401) return "Tu sesión de Spotify ha caducado. Vuelve a conectar la cuenta.";

        if (s == 403) {
            if ("player".equals(ambito)) {
                return "Spotify ha rechazado la orden de reproducción. Suele ser una cuenta sin Premium.";
            }
            if ("playlist".equals(ambito)) {
                return "Spotify no te deja modificar esa playlist: no es tuya ni colaborativa.";
            }
            return "Spotify ha respondido «Forbidden».";
        }

        if (s == 404) {
            if ("player".equals(ambito)) {
                return "No hay ningún dispositivo activo en el que encolar.";
            }
            return "Spotify no encuentra eso que la macro intenta usar; puede que se haya borrado.";
        }

        if (s == 429) {
            return "Cupo de peticiones agotado. Se reintentará en la siguiente canción.";
        }

        if (s >= 500) {
            return "Spotify está fallando por su lado (error " + s + ").";
        }

        if (s == 0) return "Sin conexión con Spotify.";

        return "Spotify respondió " + s + ".";
    }

    // ── Deduplicado y estadísticas ───────────────────────────────────────────

    static boolean yaProcesada(Macro m, String uri, Store store, Clock clock) {
        String ultimaUri = store.get(clave(m, "uri"));
        if (ultimaUri == null || !ultimaUri.equals(uri)) return false;
        long cuando = leerLong(store.get(clave(m, "at")));
        return cuando > 0 && (clock.now() - cuando) < VENTANA_REPETIDO_MS;
    }

    static void marcarProcesada(Macro m, String uri, Store store, Clock clock) {
        store.put(clave(m, "uri"), uri);
        store.put(clave(m, "at"), Long.toString(clock.now()));
    }

    static void anotar(Macro m, Store store, Clock clock, boolean aplicada, String mensaje) {
        long runs = leerLong(store.get(clave(m, "runs"))) + 1L;
        long applied = leerLong(store.get(clave(m, "applied"))) + (aplicada ? 1L : 0L);
        store.put(clave(m, "runs"), Long.toString(runs));
        store.put(clave(m, "applied"), Long.toString(applied));
        store.put(clave(m, "result"), mensaje);
        store.put(clave(m, "lastRunAt"), Long.toString(clock.now()));
    }

    /** Estadísticas acumuladas de una macro, para devolvérselas a la app. */
    public static long runs(Macro m, Store store) { return leerLong(store.get(clave(m, "runs"))); }
    public static long applied(Macro m, Store store) { return leerLong(store.get(clave(m, "applied"))); }
    public static String lastResult(Macro m, Store store) { return store.get(clave(m, "result")); }
    public static long lastRunAt(Macro m, Store store) { return leerLong(store.get(clave(m, "lastRunAt"))); }

    static String clave(Macro m, String campo) {
        return "macro." + m.id + "." + campo;
    }

    // ── Utilidades ───────────────────────────────────────────────────────────

    static boolean esPistaDelCatalogo(String uri) {
        return uri != null && uri.startsWith("spotify:track:") && uri.length() > "spotify:track:".length();
    }

    static boolean esPlaylist(String target) {
        return "playlist".equals(target) || "new_playlist".equals(target);
    }

    static boolean noVacio(String s) {
        return s != null && s.trim().length() > 0;
    }

    static long leerLong(String s) {
        if (s == null) return 0L;
        try {
            return Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    /** Codifica para query. URLEncoder usa «+» para el espacio; aquí no vale. */
    static String enc(String s) {
        if (s == null) return "";
        try {
            return URLEncoder.encode(s, "UTF-8").replace("+", "%20");
        } catch (UnsupportedEncodingException e) {
            return s;
        }
    }

    /** Cadena JSON con comillas incluidas. */
    static String jsonString(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder(s.length() + 2);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') {
                sb.append('\\').append(c);
            } else if (c == '\n') {
                sb.append("\\n");
            } else if (c == '\r') {
                sb.append("\\r");
            } else if (c == '\t') {
                sb.append("\\t");
            } else if (c < 0x20) {
                sb.append(String.format("\\u%04x", (int) c));
            } else {
                sb.append(c);
            }
        }
        sb.append('"');
        return sb.toString();
    }

    static String descripcionCorta(Macro m, Track t) {
        String cancion = noVacio(t.name) ? t.name : "la canción actual";
        if ("queue".equals(m.action) || "queue".equals(m.target)) return "«" + cancion + "» a la cola";
        if ("copy".equals(m.action)) {
            return "liked".equals(m.target)
                    ? "«" + cancion + "» a Tus me gusta"
                    : "«" + cancion + "» a la playlist";
        }
        if ("remove".equals(m.action)) {
            return "liked".equals(m.target)
                    ? "«" + cancion + "» quitada de Tus me gusta"
                    : "«" + cancion + "» quitada de la playlist";
        }
        return cancion;
    }
}
