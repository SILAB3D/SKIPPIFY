/**
 * Tabla de rutas de la aplicación.
 *
 * Vive separada de `index.js` porque `createWebHashHistory()` toca
 * `window.location` al construirse: el render de comprobación en Node
 * (scripts/smoke-ssr.mjs) necesita las rutas sin crear ese router.
 */
import DashboardView from '@/views/DashboardView.vue'
import SettingsView from '@/views/SettingsView.vue'
import FeaturesView from '@/views/FeaturesView.vue'
import StatsView from '@/views/StatsView.vue'
import LeagueView from '@/views/LeagueView.vue'
import CalibrationView from '@/views/CalibrationView.vue'
import MacrosView from '@/views/MacrosView.vue'

export const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: DashboardView,
    meta: {
      title: 'Inicio',
      description: 'Vista general en tiempo real de tu actividad y estado de reproducción.'
    }
  },
  {
    path: '/stats',
    name: 'stats',
    component: StatsView,
    meta: {
      title: 'Estadísticas',
      description: 'Analiza tus reproducciones, artistas y géneros con mayor detalle.'
    }
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView,
    meta: {
      title: 'Configuración',
      description: 'Gestiona permisos, respaldos y parámetros clave de funcionamiento de la app.'
    }
  },
  {
    path: '/features',
    name: 'features',
    component: FeaturesView,
    meta: {
      title: 'Funciones',
      description: 'Modo de escucha y salto de duplicadas, más el silenciado de anuncios, en una sola pantalla.'
    }
  },
  {
    // «Modos» se fusionó con «Funciones»: el modo de escucha manda sobre el
    // salto de duplicadas y no tenía sentido leerlo en otra pestaña.
    path: '/modes',
    redirect: '/features'
  },
  {
    path: '/friendly-wrapped',
    name: 'friendly-wrapped',
    component: LeagueView,
    meta: {
      title: 'Friendly-Wrapped',
      description: 'Comparte tu resumen de escucha con tus grupos de amigos y consulta el ranking semanal.'
    }
  },
  {
    // La pestaña se llamaba «Liga» hasta la v3.4.
    path: '/league',
    redirect: '/friendly-wrapped'
  },
  {
    path: '/macros',
    name: 'macros',
    component: MacrosView,
    meta: {
      title: 'Macros',
      description: 'Automatiza tu biblioteca encadenando origen, acción y destino.'
    }
  },
  {
    path: '/calibration',
    name: 'calibration',
    component: CalibrationView,
    meta: {
      title: 'Calibración de salto',
      description: 'Ejecuta el asistente guiado o ajusta a mano cada parámetro del motor de duplicadas.'
    }
  },
  {
    // La pestaña se llamaba «Desarrollo»: un acceso directo guardado o la ruta
    // recordada por la WebView seguiría apuntando aquí.
    path: '/dev',
    redirect: '/calibration'
  },
  {
    // Un hash antiguo o desconocido (p. ej. #/claude, guardado por la WebView)
    // dejaba la pantalla en blanco al no coincidir con ninguna ruta.
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]
