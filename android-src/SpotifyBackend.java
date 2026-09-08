package com.skippify.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * Todo lo que el segundo plano necesita para hablar con Spotify: la petición
 * cruda, la sesión (con su refresco) y la capa que pone el token y reintenta.
 *
 * Igual que {@link MacroRunner}, sin importaciones de Android — HttpURLConnection
 * es Java estándar y existe igual en el móvil. Eso permite probar de verdad
 * contra un servidor local en lugar de dar la red por buena.
 *
 * El único trozo que no vive aquí es el análisis del JSON: en Android lo hace
 * org.json, que ya viene en la plataforma, y entra por {@link TokenParser}. La
 * lógica de cuándo refrescar y qué guardar sí es de esta clase, que es donde
 * están los errores que duelen: un refresco mal hecho deja las macros mudas una
 * hora después sin que nadie se entere.
 */
public final class SpotifyBackend {

    public static final String TOKEN_URL = "https://accounts.spotify.com/api/token";

    private SpotifyBackend() { }

    // ── Petición cruda ───────────────────────────────────────────────────────

    public interface RawHttp {
        MacroRunner.Response send(String method, String url, String body,
                                  String contentType, String bearer);
    }

    /** Implementación real sobre HttpURLConnection. */
    public static final class UrlRawHttp implements RawHttp {
        private final int connectTimeoutMs;
        private final int readTimeoutMs;

        public UrlRawHttp() {
            this(10000, 15000);
        }

        public UrlRawHttp(int connectTimeoutMs, int readTimeoutMs) {
            this.connectTimeoutMs = connectTimeoutMs;
            this.readTimeoutMs = readTimeoutMs;
        }

        @Override
        public MacroRunner.Response send(String method, String url, String body,
                                         String contentType, String bearer) {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestMethod(method);
                conn.setConnectTimeout(connectTimeoutMs);
                conn.setReadTimeout(readTimeoutMs);
                conn.setInstanceFollowRedirects(true);
                if (bearer != null && bearer.length() > 0) {
                    conn.setRequestProperty("Authorization", "Bearer " + bearer);
                }
                conn.setRequestProperty("Accept", "application/json");

                if (body != null) {
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type",
                            contentType != null ? contentType : "application/json");
                    byte[] bytes = body.getBytes("UTF-8");
                    conn.setFixedLengthStreamingMode(bytes.length);
                    OutputStream os = conn.getOutputStream();
                    try {
                        os.write(bytes);
                        os.flush();
                    } finally {
                        cerrar(os);
                    }
                }

                int status = conn.getResponseCode();
                InputStream is = (status >= 200 && status < 400)
                        ? conn.getInputStream()
                        : conn.getErrorStream();
                String texto = leerTodo(is);
                return new MacroRunner.Response(status, texto);
            } catch (Throwable t) {
                // Status 0 = la petición no llegó a salir o se cortó. Quien llama
                // lo traduce como «sin conexión», que es lo que le pasa al usuario.
                return new MacroRunner.Response(0, null);
            } finally {
                if (conn != null) {
                    try { conn.disconnect(); } catch (Throwable ignored) { }
                }
            }
        }
    }

    // ── Sesión ───────────────────────────────────────────────────────────────

    /** Extrae de la respuesta del token: [access_token, expires_in, refresh_token]. */
    public interface TokenParser {
        String[] parse(String body);
    }

    public static final String K_CLIENT_ID = "sp.clientId";
    public static final String K_ACCESS    = "sp.access";
    public static final String K_REFRESH   = "sp.refresh";
    public static final String K_EXPIRES   = "sp.expiresAt";
    public static final String K_SCOPE     = "sp.scope";

    /** Margen antes de la caducidad real: no se apura al segundo. */
    static final long MARGEN_MS = 60L * 1000L;

    /**
     * La sesión de Spotify del lado nativo, que es la única que existe cuando la
     * app está cerrada. Es también la dueña del refresco: si refrescaran los dos
     * lados por su cuenta, Spotify puede rotar el refresh token y dejar al otro
     * con uno muerto, cerrando la sesión sin motivo aparente.
     */
    public static final class Session {
        private final MacroRunner.Store store;
        private final MacroRunner.Clock clock;
        private final RawHttp http;
        private final TokenParser parser;

        public Session(MacroRunner.Store store, MacroRunner.Clock clock,
                       RawHttp http, TokenParser parser) {
            this.store = store;
            this.clock = clock;
            this.http = http;
            this.parser = parser;
        }

        public boolean haySesion() {
            return noVacio(store.get(K_REFRESH)) || noVacio(store.get(K_ACCESS));
        }

        public void guardar(String clientId, String access, String refresh,
                            long expiresAt, String scope) {
            if (noVacio(clientId)) store.put(K_CLIENT_ID, clientId);
            if (noVacio(access)) store.put(K_ACCESS, access);
            // El refresh sólo se pisa si viene uno nuevo: algunas respuestas no
            // lo repiten y borrarlo dejaría la sesión sin forma de renovarse.
            if (noVacio(refresh)) store.put(K_REFRESH, refresh);
            if (expiresAt > 0) store.put(K_EXPIRES, Long.toString(expiresAt));
            if (noVacio(scope)) store.put(K_SCOPE, scope);
        }

        public void borrar() {
            store.put(K_ACCESS, "");
            store.put(K_REFRESH, "");
            store.put(K_EXPIRES, "");
            store.put(K_SCOPE, "");
        }

        public String accessToken() { return store.get(K_ACCESS); }
        public String refreshToken() { return store.get(K_REFRESH); }
        public String clientId() { return store.get(K_CLIENT_ID); }
        public String scope() { return store.get(K_SCOPE); }
        public long expiresAt() { return MacroRunner.leerLong(store.get(K_EXPIRES)); }

        public boolean caducado() {
            long exp = expiresAt();
            if (exp <= 0) return true;
            return clock.now() >= (exp - MARGEN_MS);
        }

        /** Token utilizable, refrescando si hace falta. null si no se puede. */
        public String bearer() {
            if (!caducado() && noVacio(accessToken())) return accessToken();
            return refrescar() ? accessToken() : null;
        }

        /** @return true si tras esto hay un access token válido. */
        public boolean refrescar() {
            String refresh = refreshToken();
            String clientId = clientId();
            if (!noVacio(refresh) || !noVacio(clientId)) return false;

            String cuerpo = "client_id=" + enc(clientId)
                    + "&grant_type=refresh_token"
                    + "&refresh_token=" + enc(refresh);

            MacroRunner.Response r = http.send("POST", TOKEN_URL, cuerpo,
                    "application/x-www-form-urlencoded", null);

            if (r == null) return false;

            if (r.status < 200 || r.status >= 300) {
                // Sólo se tira la sesión cuando Spotify declara muerto el refresh
                // token. Un 429 o un 5xx son pasajeros: borrar por ellos obligaría
                // a volver a iniciar sesión por un tropiezo de red.
                if (r.status >= 400 && r.status < 500 && r.status != 429
                        && r.body != null && r.body.contains("invalid_grant")) {
                    borrar();
                }
                return false;
            }

            String[] datos = parser.parse(r.body);
            if (datos == null || !noVacio(datos[0])) return false;

            long segundos = MacroRunner.leerLong(datos.length > 1 ? datos[1] : null);
            if (segundos <= 0) segundos = 3600L;
            long expiraEn = clock.now() + (segundos * 1000L);

            guardar(null, datos[0], datos.length > 2 ? datos[2] : null, expiraEn, null);
            return true;
        }
    }

    // ── Capa autenticada ─────────────────────────────────────────────────────

    /**
     * Pone el token en cada petición y, ante un 401, refresca y reintenta una
     * vez. Un 401 aislado es lo normal cuando el proceso lleva horas dormido.
     */
    public static final class AuthedHttp implements MacroRunner.Http {
        private final RawHttp http;
        private final Session session;

        public AuthedHttp(RawHttp http, Session session) {
            this.http = http;
            this.session = session;
        }

        @Override
        public MacroRunner.Response send(String method, String url, String jsonBody) {
            String bearer = session.bearer();
            if (bearer == null) return new MacroRunner.Response(401, null);

            MacroRunner.Response r = http.send(method, url, jsonBody, "application/json", bearer);
            if (r != null && r.status == 401) {
                if (!session.refrescar()) return r;
                String nuevo = session.accessToken();
                if (!noVacio(nuevo)) return r;
                return http.send(method, url, jsonBody, "application/json", nuevo);
            }
            return r;
        }
    }

    // ── Utilidades ───────────────────────────────────────────────────────────

    static boolean noVacio(String s) {
        return s != null && s.trim().length() > 0;
    }

    static String enc(String s) {
        if (s == null) return "";
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            return s;
        }
    }

    static String leerTodo(InputStream is) {
        if (is == null) return null;
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            return new String(bos.toByteArray(), "UTF-8");
        } catch (IOException e) {
            return null;
        } finally {
            cerrar(is);
        }
    }

    static void cerrar(java.io.Closeable c) {
        if (c == null) return;
        try { c.close(); } catch (Throwable ignored) { }
    }
}
