package com.skippify.app;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Batería de pruebas del motor de macros en segundo plano.
 *
 * Corre con javac/java a secas: ni Android, ni emulador, ni dependencias. Lo que
 * no se puede comprobar así —que el servicio siga vivo a las tres de la mañana
 * en un Xiaomi— se comprueba en el móvil; todo lo demás se comprueba aquí.
 */
public final class PruebasMacros {

    static int fallos = 0;
    static int total = 0;

    public static void main(String[] args) throws Exception {
        seleccion();
        peticiones();
        deduplicado();
        forzado();
        errores();
        estadisticas();
        urisNoValidas();
        sesion();
        reintentoPor401();
        httpDeVerdad();

        System.out.println();
        if (fallos > 0) {
            System.out.println("Fallos: " + fallos + " de " + total);
            System.exit(1);
        }
        System.out.println("Macros en segundo plano: " + total + " comprobaciones, todo correcto.");
    }

    // ── Andamiaje ────────────────────────────────────────────────────────────

    static void titulo(String s) {
        System.out.println();
        System.out.println(s);
    }

    static void check(String etiqueta, Object real, Object esperado) {
        total++;
        boolean ok = esperado == null ? real == null : esperado.equals(real);
        System.out.println("  " + (ok ? "✓" : "✗") + " " + etiqueta
                + (ok ? "" : "\n      esperado: " + esperado + "\n      recibido: " + real));
        if (!ok) fallos++;
    }

    static void contiene(String etiqueta, String real, String fragmento) {
        total++;
        boolean ok = real != null && real.contains(fragmento);
        System.out.println("  " + (ok ? "✓" : "✗") + " " + etiqueta
                + (ok ? "" : "\n      debía contener: " + fragmento + "\n      recibido: " + real));
        if (!ok) fallos++;
    }

    /** Almacén en memoria. */
    static final class Memoria implements MacroRunner.Store {
        final Map<String, String> m = new HashMap<String, String>();
        public String get(String k) { return m.get(k); }
        public void put(String k, String v) { m.put(k, v); }
    }

    /** Reloj manipulable. */
    static final class Reloj implements MacroRunner.Clock {
        long t = 1_700_000_000_000L;
        public long now() { return t; }
        void avanzar(long ms) { t += ms; }
    }

    /** Http que anota lo que se le pide y responde lo que se le diga. */
    static final class HttpFalso implements MacroRunner.Http {
        final List<String> llamadas = new ArrayList<String>();
        int status = 200;
        String body = "{}";

        public MacroRunner.Response send(String method, String url, String jsonBody) {
            llamadas.add(method + " " + url + (jsonBody == null ? "" : " :: " + jsonBody));
            return new MacroRunner.Response(status, body);
        }
    }

    static MacroRunner.Macro macro(String id, String source, String action,
                                   String target, String playlistId) {
        return new MacroRunner.Macro(id, id, true, source, action, target, playlistId);
    }

    static MacroRunner.Track pista() {
        return new MacroRunner.Track("spotify:track:abc123", "Les Mentimos", "Cami Sanabria");
    }

    static List<MacroRunner.Macro> lista(MacroRunner.Macro... ms) {
        return Arrays.asList(ms);
    }

    // ── A · qué macros asume el segundo plano ────────────────────────────────

    static void seleccion() {
        titulo("Qué macros puede ejecutar el servicio por su cuenta");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;

        check("encolar la que suena", MacroRunner.esDeSegundoPlano(macro("a", C, "queue", null, null)), true);
        check("copiar a Tus me gusta", MacroRunner.esDeSegundoPlano(macro("b", C, "copy", "liked", null)), true);
        check("copiar a una playlist con id", MacroRunner.esDeSegundoPlano(macro("c", C, "copy", "playlist", "PL1")), true);
        check("copiar a la cola", MacroRunner.esDeSegundoPlano(macro("d", C, "copy", "queue", null)), true);
        check("quitar de Tus me gusta", MacroRunner.esDeSegundoPlano(macro("e", C, "remove", "liked", null)), true);
        check("quitar de una playlist con id", MacroRunner.esDeSegundoPlano(macro("f", C, "remove", "playlist", "PL1")), true);

        check("playlist nueva sin crear queda para la app",
                MacroRunner.esDeSegundoPlano(macro("g", C, "copy", "new_playlist", null)), false);
        check("playlist nueva ya creada sí vale",
                MacroRunner.esDeSegundoPlano(macro("h", C, "copy", "new_playlist", "PL9")), true);
        check("copiar a playlist sin id no vale",
                MacroRunner.esDeSegundoPlano(macro("i", C, "copy", "playlist", null)), false);
        check("mover queda fuera",
                MacroRunner.esDeSegundoPlano(macro("j", C, "move", "playlist", "PL1")), false);
        check("otros orígenes quedan fuera",
                MacroRunner.esDeSegundoPlano(macro("k", "playlist_new", "copy", "liked", null)), false);
        check("una macro pausada no corre",
                MacroRunner.esDeSegundoPlano(new MacroRunner.Macro("l", "l", false, C, "queue", null, null)), false);
        check("null no revienta", MacroRunner.esDeSegundoPlano(null), false);

        List<MacroRunner.Macro> mezcla = lista(
                macro("uno", C, "queue", null, null),
                macro("dos", "playlist_all", "copy", "liked", null),
                macro("tres", C, "copy", "liked", null));
        check("filtrar deja sólo las que corresponden", MacroRunner.filtrar(mezcla).size(), 2);
    }

    // ── B · qué peticiones salen exactamente ─────────────────────────────────

    static void peticiones() {
        titulo("Peticiones que se envían a Spotify");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;
        String URI = "spotify:track:abc123";
        String ENC = "spotify%3Atrack%3Aabc123";

        HttpFalso h = new HttpFalso();
        MacroRunner.run(pista(), lista(macro("q", C, "queue", null, null)), h, new Memoria(), new Reloj());
        check("encolar: una sola petición", h.llamadas.size(), 1);
        check("encolar: método y ruta", h.llamadas.get(0),
                "POST " + MacroRunner.API + "/me/player/queue?uri=" + ENC);

        h = new HttpFalso();
        MacroRunner.run(pista(), lista(macro("l", C, "copy", "liked", null)), h, new Memoria(), new Reloj());
        check("me gusta: alta por query", h.llamadas.get(0),
                "PUT " + MacroRunner.API + "/me/library?uris=" + ENC);

        h = new HttpFalso();
        MacroRunner.run(pista(), lista(macro("p", C, "copy", "playlist", "PL1")), h, new Memoria(), new Reloj());
        check("playlist: alta con cuerpo uris", h.llamadas.get(0),
                "POST " + MacroRunner.API + "/playlists/PL1/items :: {\"uris\":[\"" + URI + "\"]}");

        h = new HttpFalso();
        MacroRunner.run(pista(), lista(macro("rl", C, "remove", "liked", null)), h, new Memoria(), new Reloj());
        check("me gusta: baja por query", h.llamadas.get(0),
                "DELETE " + MacroRunner.API + "/me/library?uris=" + ENC);

        h = new HttpFalso();
        MacroRunner.run(pista(), lista(macro("rp", C, "remove", "playlist", "PL1")), h, new Memoria(), new Reloj());
        check("playlist: baja con cuerpo items", h.llamadas.get(0),
                "DELETE " + MacroRunner.API + "/playlists/PL1/items :: {\"items\":[{\"uri\":\"" + URI + "\"}]}");

        h = new HttpFalso();
        MacroRunner.run(pista(), lista(
                macro("m1", C, "queue", null, null),
                macro("m2", C, "copy", "liked", null),
                macro("m3", "top_tracks", "copy", "liked", null)), h, new Memoria(), new Reloj());
        check("varias macros: sólo las que corresponden", h.llamadas.size(), 2);

        check("las comillas del JSON se escapan",
                MacroRunner.jsonString("di \"hola\"\\fin"), "\"di \\\"hola\\\"\\\\fin\"");
    }

    // ── C · no actuar dos veces sobre la misma canción ───────────────────────

    static void deduplicado() {
        titulo("No repetir sobre la misma canción");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;
        HttpFalso h = new HttpFalso();
        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        List<MacroRunner.Macro> ms = lista(macro("q", C, "queue", null, null));

        List<MacroRunner.Outcome> r1 = MacroRunner.run(pista(), ms, h, store, reloj);
        check("primera vez: se aplica", r1.get(0).status, MacroRunner.APLICADA);

        List<MacroRunner.Outcome> r2 = MacroRunner.run(pista(), ms, h, store, reloj);
        check("repetición inmediata: se omite", r2.get(0).status, MacroRunner.OMITIDA);
        check("y no sale ninguna petición nueva", h.llamadas.size(), 1);

        reloj.avanzar(MacroRunner.VENTANA_REPETIDO_MS - 1000L);
        MacroRunner.run(pista(), ms, h, store, reloj);
        check("justo antes de la ventana sigue omitida", h.llamadas.size(), 1);

        reloj.avanzar(2000L);
        List<MacroRunner.Outcome> r4 = MacroRunner.run(pista(), ms, h, store, reloj);
        check("pasada la ventana vuelve a aplicarse", r4.get(0).status, MacroRunner.APLICADA);
        check("y sale la segunda petición", h.llamadas.size(), 2);

        MacroRunner.Track otra = new MacroRunner.Track("spotify:track:zzz999", "Otra", "Alguien");
        MacroRunner.run(otra, ms, h, store, reloj);
        check("una canción distinta se procesa al momento", h.llamadas.size(), 3);

        // Cada macro lleva su propia cuenta: que una haya visto la canción no
        // puede silenciar a la de al lado.
        HttpFalso h2 = new HttpFalso();
        Memoria s2 = new Memoria();
        Reloj c2 = new Reloj();
        MacroRunner.run(pista(), lista(macro("uno", C, "queue", null, null)), h2, s2, c2);
        MacroRunner.run(pista(), lista(macro("dos", C, "copy", "liked", null)), h2, s2, c2);
        check("el deduplicado es por macro, no global", h2.llamadas.size(), 2);
    }

    static void forzado() {
        titulo("«Ejecutar» a mano se salta la ventana");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;
        HttpFalso h = new HttpFalso();
        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        List<MacroRunner.Macro> ms = lista(macro("q", C, "queue", null, null));

        MacroRunner.run(pista(), ms, h, store, reloj);
        check("automática: se aplica", h.llamadas.size(), 1);
        MacroRunner.run(pista(), ms, h, store, reloj);
        check("automática repetida: se omite", h.llamadas.size(), 1);

        List<MacroRunner.Outcome> r = MacroRunner.run(pista(), ms, h, store, reloj, true);
        check("forzada: se aplica igualmente", r.get(0).status, MacroRunner.APLICADA);
        check("y sale la petición", h.llamadas.size(), 2);

        MacroRunner.run(pista(), ms, h, store, reloj);
        check("tras forzar, la ventana se reinicia", h.llamadas.size(), 2);
    }

    // ── D · traducción de los errores de Spotify ─────────────────────────────

    static void errores() {
        titulo("Errores de Spotify traducidos");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;

        contiene("403 sobre playlist",
                fallo(403, macro("p", C, "copy", "playlist", "PL1")), "no es tuya ni colaborativa");
        contiene("403 encolando habla de Premium",
                fallo(403, macro("q", C, "queue", null, null)), "Premium");
        contiene("404 encolando: no hay dispositivo",
                fallo(404, macro("q", C, "queue", null, null)), "dispositivo activo");
        contiene("429: cupo agotado",
                fallo(429, macro("l", C, "copy", "liked", null)), "Cupo de peticiones");
        contiene("401: sesión caducada",
                fallo(401, macro("l", C, "copy", "liked", null)), "caducado");
        contiene("500: es cosa de Spotify",
                fallo(503, macro("l", C, "copy", "liked", null)), "fallando por su lado");
        contiene("sin red",
                fallo(0, macro("l", C, "copy", "liked", null)), "Sin conexión");
        contiene("un código raro se dice tal cual",
                fallo(418, macro("l", C, "copy", "liked", null)), "418");
        check("una respuesta 2xx no es error", MacroRunner.revisar(new MacroRunner.Response(204, null), "player"), null);
    }

    static String fallo(int status, MacroRunner.Macro m) {
        HttpFalso h = new HttpFalso();
        h.status = status;
        List<MacroRunner.Outcome> r = MacroRunner.run(pista(), lista(m), h, new Memoria(), new Reloj());
        return r.isEmpty() ? null : r.get(0).message;
    }

    // ── E · lo que la app leerá después ──────────────────────────────────────

    static void estadisticas() {
        titulo("Estadísticas que verá la app");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;
        HttpFalso h = new HttpFalso();
        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        MacroRunner.Macro m = macro("q", C, "queue", null, null);

        MacroRunner.run(pista(), lista(m), h, store, reloj);
        check("una ejecución contada", MacroRunner.runs(m, store), 1L);
        check("una canción aplicada", MacroRunner.applied(m, store), 1L);
        contiene("el resultado dice que fue en segundo plano",
                MacroRunner.lastResult(m, store), "En segundo plano");
        check("queda la marca de tiempo", MacroRunner.lastRunAt(m, store), reloj.t);

        reloj.avanzar(MacroRunner.VENTANA_REPETIDO_MS + 1000L);
        h.status = 403;
        MacroRunner.run(pista(), lista(m), h, store, reloj);
        check("la ejecución fallida también cuenta", MacroRunner.runs(m, store), 2L);
        check("pero no suma canción aplicada", MacroRunner.applied(m, store), 1L);
        contiene("y el motivo queda escrito", MacroRunner.lastResult(m, store), "Error:");
    }

    // ── F · lo que no es una canción del catálogo ────────────────────────────

    static void urisNoValidas() {
        titulo("Lo que no se toca");
        String C = MacroRunner.SOURCE_CURRENT_TRACK;
        List<MacroRunner.Macro> ms = lista(macro("q", C, "queue", null, null));

        for (String uri : new String[] { null, "", "spotify:episode:xyz", "spotify:local:a:b:c", "spotify:track:" }) {
            HttpFalso h = new HttpFalso();
            MacroRunner.run(new MacroRunner.Track(uri, "x", "y"), ms, h, new Memoria(), new Reloj());
            check("no se actúa sobre " + (uri == null ? "null" : "«" + uri + "»"), h.llamadas.size(), 0);
        }

        HttpFalso h = new HttpFalso();
        MacroRunner.run(null, ms, h, new Memoria(), new Reloj());
        check("sin canción no pasa nada", h.llamadas.size(), 0);
    }

    // ── G · la sesión y su refresco ──────────────────────────────────────────

    /** RawHttp de mentira, para la sesión. */
    static final class RawFalso implements SpotifyBackend.RawHttp {
        final List<String> llamadas = new ArrayList<String>();
        int status = 200;
        String body = "{\"access_token\":\"NUEVO\",\"expires_in\":3600}";

        public MacroRunner.Response send(String method, String url, String body_,
                                         String contentType, String bearer) {
            llamadas.add(method + " " + url + " bearer=" + bearer
                    + (body_ == null ? "" : " :: " + body_));
            return new MacroRunner.Response(status, body);
        }
    }

    /** Analizador de tokens de juguete: sirve para las respuestas de la prueba. */
    static final SpotifyBackend.TokenParser PARSER = new SpotifyBackend.TokenParser() {
        public String[] parse(String body) {
            if (body == null) return null;
            return new String[] {
                    entre(body, "\"access_token\":\"", "\""),
                    entre(body, "\"expires_in\":", ",}"),
                    entre(body, "\"refresh_token\":\"", "\"")
            };
        }
    };

    static String entre(String s, String desde, String hasta) {
        int i = s.indexOf(desde);
        if (i < 0) return null;
        i += desde.length();
        int j = i;
        while (j < s.length() && hasta.indexOf(s.charAt(j)) < 0) j++;
        return s.substring(i, j);
    }

    static void sesion() {
        titulo("Sesión de Spotify en el móvil");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();
        RawFalso raw = new RawFalso();
        SpotifyBackend.Session s = new SpotifyBackend.Session(store, reloj, raw, PARSER);

        check("sin nada guardado no hay sesión", s.haySesion(), false);

        s.guardar("CLIENT", "VIEJO", "REFRESCO", reloj.now() + 3600_000L, "scope1");
        check("hay sesión tras guardarla", s.haySesion(), true);
        check("token válido: se usa sin refrescar", s.bearer(), "VIEJO");
        check("y no se ha llamado a Spotify", raw.llamadas.size(), 0);

        reloj.avanzar(3600_000L);
        check("caducado: refresca y devuelve el nuevo", s.bearer(), "NUEVO");
        check("se llamó una vez al endpoint de token", raw.llamadas.size(), 1);
        contiene("con grant_type de refresco", raw.llamadas.get(0), "grant_type=refresh_token");
        contiene("y el client_id", raw.llamadas.get(0), "client_id=CLIENT");
        contiene("contra la URL correcta", raw.llamadas.get(0), SpotifyBackend.TOKEN_URL);
        check("la nueva caducidad se guarda", s.expiresAt(), reloj.now() + 3600_000L);
        check("el refresh token se conserva", s.refreshToken(), "REFRESCO");

        // Una respuesta sin refresh_token no debe borrar el que ya había.
        Memoria st2 = new Memoria();
        Reloj rl2 = new Reloj();
        RawFalso raw2 = new RawFalso();
        SpotifyBackend.Session s2 = new SpotifyBackend.Session(st2, rl2, raw2, PARSER);
        s2.guardar("C", "A", "R-ORIGINAL", 0L, null);
        s2.refrescar();
        check("un refresco sin refresh_token nuevo no borra el viejo", s2.refreshToken(), "R-ORIGINAL");

        // Rotación: si Spotify manda uno nuevo, se guarda.
        raw2.body = "{\"access_token\":\"A2\",\"expires_in\":100,\"refresh_token\":\"R-NUEVO\"}";
        s2.refrescar();
        check("si Spotify rota el refresh token, se guarda el nuevo", s2.refreshToken(), "R-NUEVO");

        // invalid_grant sí cierra la sesión.
        Memoria st3 = new Memoria();
        RawFalso raw3 = new RawFalso();
        raw3.status = 400;
        raw3.body = "{\"error\":\"invalid_grant\"}";
        SpotifyBackend.Session s3 = new SpotifyBackend.Session(st3, new Reloj(), raw3, PARSER);
        s3.guardar("C", "A", "R", 0L, null);
        check("invalid_grant: el refresco falla", s3.refrescar(), false);
        check("y la sesión se cierra", s3.haySesion(), false);

        // Un fallo pasajero NO cierra la sesión.
        Memoria st4 = new Memoria();
        RawFalso raw4 = new RawFalso();
        raw4.status = 429;
        raw4.body = "{\"error\":\"too many requests\"}";
        SpotifyBackend.Session s4 = new SpotifyBackend.Session(st4, new Reloj(), raw4, PARSER);
        s4.guardar("C", "A", "R", 0L, null);
        check("429: el refresco falla", s4.refrescar(), false);
        check("pero la sesión se mantiene", s4.haySesion(), true);

        RawFalso raw5 = new RawFalso();
        raw5.status = 503;
        Memoria st5 = new Memoria();
        SpotifyBackend.Session s5 = new SpotifyBackend.Session(st5, new Reloj(), raw5, PARSER);
        s5.guardar("C", "A", "R", 0L, null);
        s5.refrescar();
        check("un 5xx tampoco cierra la sesión", s5.haySesion(), true);

        // Sin refresh token no hay nada que hacer.
        Memoria st6 = new Memoria();
        SpotifyBackend.Session s6 = new SpotifyBackend.Session(st6, new Reloj(), new RawFalso(), PARSER);
        s6.guardar("C", "A", null, 0L, null);
        check("sin refresh token no se intenta refrescar", s6.refrescar(), false);
    }

    // ── H · el 401 se reintenta una vez ──────────────────────────────────────

    static void reintentoPor401() {
        titulo("Un 401 se refresca y se reintenta");

        Memoria store = new Memoria();
        Reloj reloj = new Reloj();

        final int[] veces = { 0 };
        final List<String> bearers = new ArrayList<String>();
        SpotifyBackend.RawHttp raw = new SpotifyBackend.RawHttp() {
            public MacroRunner.Response send(String method, String url, String body,
                                             String contentType, String bearer) {
                if (url.equals(SpotifyBackend.TOKEN_URL)) {
                    return new MacroRunner.Response(200, "{\"access_token\":\"FRESCO\",\"expires_in\":3600}");
                }
                bearers.add(bearer);
                veces[0]++;
                return new MacroRunner.Response(veces[0] == 1 ? 401 : 200, "{}");
            }
        };

        SpotifyBackend.Session s = new SpotifyBackend.Session(store, reloj, raw, PARSER);
        s.guardar("CLIENT", "CADUCADO", "REFRESCO", reloj.now() + 3600_000L, null);
        SpotifyBackend.AuthedHttp authed = new SpotifyBackend.AuthedHttp(raw, s);

        MacroRunner.Response r = authed.send("POST", "https://api.spotify.com/v1/x", null);
        check("acaba en 200 tras el reintento", r.status, 200);
        check("se intentó dos veces", veces[0], 2);
        check("la primera con el token viejo", bearers.get(0), "CADUCADO");
        check("y la segunda con el nuevo", bearers.get(1), "FRESCO");

        // Si el refresco no sale, se devuelve el 401 sin insistir.
        Memoria st2 = new Memoria();
        final int[] veces2 = { 0 };
        SpotifyBackend.RawHttp raw2 = new SpotifyBackend.RawHttp() {
            public MacroRunner.Response send(String method, String url, String body,
                                             String contentType, String bearer) {
                if (url.equals(SpotifyBackend.TOKEN_URL)) return new MacroRunner.Response(400, "{\"error\":\"invalid_grant\"}");
                veces2[0]++;
                return new MacroRunner.Response(401, "{}");
            }
        };
        SpotifyBackend.Session s2 = new SpotifyBackend.Session(st2, new Reloj(), raw2, PARSER);
        s2.guardar("C", "A", "R", System.currentTimeMillis() + 3600_000L, null);
        MacroRunner.Response r2 = new SpotifyBackend.AuthedHttp(raw2, s2).send("POST", "https://api.spotify.com/v1/x", null);
        check("si el refresco falla se devuelve el 401", r2.status, 401);
        check("y no se insiste", veces2[0], 1);

        // Sin sesión no se sale a la red siquiera.
        Memoria st3 = new Memoria();
        RawFalso raw3 = new RawFalso();
        SpotifyBackend.Session s3 = new SpotifyBackend.Session(st3, new Reloj(), raw3, PARSER);
        MacroRunner.Response r3 = new SpotifyBackend.AuthedHttp(raw3, s3).send("POST", "https://api.spotify.com/v1/x", null);
        check("sin sesión se responde 401 sin llamar", r3.status, 401);
        check("y no hubo peticiones", raw3.llamadas.size(), 0);
    }

    // ── I · la capa HTTP real, contra un servidor de verdad ──────────────────

    static void httpDeVerdad() throws Exception {
        titulo("La capa HTTP real (servidor local)");

        final List<String> recibido = new ArrayList<String>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 8907), 0);
        server.createContext("/", new com.sun.net.httpserver.HttpHandler() {
            public void handle(HttpExchange ex) throws java.io.IOException {
                String cuerpo = leer(ex.getRequestBody());
                recibido.add(ex.getRequestMethod() + " " + ex.getRequestURI()
                        + " auth=" + ex.getRequestHeaders().getFirst("Authorization")
                        + " ct=" + ex.getRequestHeaders().getFirst("Content-Type")
                        + " :: " + cuerpo);
                byte[] out;
                int code;
                if (ex.getRequestURI().getPath().startsWith("/error")) {
                    code = 403;
                    out = "{\"error\":{\"status\":403,\"message\":\"Forbidden\"}}".getBytes("UTF-8");
                } else if (ex.getRequestURI().getPath().startsWith("/vacio")) {
                    code = 204;
                    out = new byte[0];
                } else {
                    code = 200;
                    out = "{\"ok\":true}".getBytes("UTF-8");
                }
                ex.sendResponseHeaders(code, out.length == 0 ? -1 : out.length);
                if (out.length > 0) {
                    OutputStream os = ex.getResponseBody();
                    os.write(out);
                    os.close();
                } else {
                    ex.close();
                }
            }
        });
        server.start();

        try {
            SpotifyBackend.UrlRawHttp http = new SpotifyBackend.UrlRawHttp(3000, 3000);
            String base = "http://127.0.0.1:8907";

            MacroRunner.Response r1 = http.send("POST", base + "/ok?uri=x", "{\"uris\":[\"a\"]}",
                    "application/json", "TOKEN123");
            check("POST con cuerpo: status", r1.status, 200);
            check("POST con cuerpo: respuesta leída", r1.body, "{\"ok\":true}");
            contiene("llegó la autorización", recibido.get(0), "auth=Bearer TOKEN123");
            contiene("llegó el content-type", recibido.get(0), "ct=application/json");
            contiene("llegó el cuerpo", recibido.get(0), ":: {\"uris\":[\"a\"]}");

            MacroRunner.Response r2 = http.send("PUT", base + "/ok", null, null, "T2");
            check("PUT sin cuerpo: status", r2.status, 200);
            contiene("sin cuerpo no se anuncia content-type", recibido.get(1), "ct=null");

            MacroRunner.Response r3 = http.send("DELETE", base + "/error", null, null, "T3");
            check("un 403 llega como 403", r3.status, 403);
            contiene("y con su cuerpo de error", r3.body, "Forbidden");

            MacroRunner.Response r4 = http.send("POST", base + "/vacio", null, null, "T4");
            check("un 204 sin cuerpo no revienta", r4.status, 204);

            MacroRunner.Response r5 = new SpotifyBackend.UrlRawHttp(400, 400)
                    .send("GET", "http://127.0.0.1:1/nada", null, null, "T5");
            check("un destino inalcanzable se traduce a 0", r5.status, 0);
            contiene("y el motor lo llama «sin conexión»",
                    MacroRunner.revisar(r5, "library"), "Sin conexión");
        } finally {
            server.stop(0);
        }
    }

    static String leer(InputStream is) {
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            return new String(bos.toByteArray(), "UTF-8");
        } catch (Exception e) {
            return "";
        }
    }
}
