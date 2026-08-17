package com.skippify.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.service.notification.NotificationListenerService;
import android.content.ComponentName;

/**
 * Relanza el servicio en primer plano tras un reinicio o una actualización del
 * paquete, y atiende la alarma de vigilancia que lo reafirma periódicamente.
 *
 * La alarma llega siempre por PendingIntent EXPLÍCITO (componente fijado), así
 * que no le afectan las restricciones de broadcasts implícitos de Android 8+ y
 * no necesita declararse en el intent-filter del manifiesto.
 */
public class BootCompletedReceiver extends BroadcastReceiver {

    static final String ACTION_WATCHDOG = "com.skippify.app.action.WATCHDOG";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;

        String action = intent.getAction();
        boolean shouldStart = Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || ACTION_WATCHDOG.equals(action);

        if (!shouldStart) return;

        Context appContext = context.getApplicationContext();
        SkippifyForegroundService.start(appContext, ACTION_WATCHDOG.equals(action));

        // Algunos OEMs sueltan el NotificationListenerService bajo presión de
        // memoria y no lo vuelven a enlazar solos. Pedirlo es barato y es la
        // única forma de recuperar la detección sin que el usuario entre en los
        // ajustes del sistema.
        try {
            NotificationListenerService.requestRebind(
                    new ComponentName(appContext, SpotifyNotificationListener.class)
            );
        } catch (Throwable ignored) {
        }
    }
}
