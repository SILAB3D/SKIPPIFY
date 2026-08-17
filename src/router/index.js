import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import ModesView from '@/views/ModesView.vue'
import SettingsView from '@/views/SettingsView.vue'
import FeaturesView from '@/views/FeaturesView.vue'
import StatsView from '@/views/StatsView.vue'
import LeagueView from '@/views/LeagueView.vue'
import CalibrationView from '@/views/CalibrationView.vue'
import MacrosView from '@/views/MacrosView.vue'

const routes = [
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
    path: '/modes',
    name: 'modes',
    component: ModesView,
    meta: {
      title: 'Modos',
      description: 'Selecciona cómo quieres escuchar: descubrir, escuchar sin filtros o personalizar el comportamiento.'
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
      description: 'Activa funciones avanzadas como salto de duplicadas y silencio de anuncios según tus preferencias.'
    }
  },
  {
    path: '/league',
    name: 'league',
    component: LeagueView,
    meta: {
      title: 'Liga',
      description: 'Compite con tu grupo de amigos y consulta resultados semanales.'
    }
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
      title: 'Calibración',
      description: 'Pon a punto un saltado de duplicadas fino, sin errores ni interferencias.'
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

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
