import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import ModesView from '@/views/ModesView.vue'
import SettingsView from '@/views/SettingsView.vue'
import FeaturesView from '@/views/FeaturesView.vue'
import StatsView from '@/views/StatsView.vue'
import LeagueView from '@/views/LeagueView.vue'

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: DashboardView,
    meta: {
      title: 'Dashboard',
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
      title: 'Permisos',
      description: 'Gestiona y activa permisos del sistema para garantizar una detección estable y continua.'
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
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
