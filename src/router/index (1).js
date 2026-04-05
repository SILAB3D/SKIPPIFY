import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import SettingsView from '@/views/SettingsView.vue'
import FeaturesView from '@/views/FeaturesView.vue'
import ClaudeView from '@/views/ClaudeView.vue'
import StatsView from '@/views/StatsView.vue'

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: DashboardView,
    meta: {
      title: 'Dashboard',
      description: 'Vista general en tiempo real de tu actividad y estado de reproduccion.'
    }
  },
  {
    path: '/stats',
    name: 'stats',
    component: StatsView,
    meta: {
      title: 'Estadisticas',
      description: 'Analiza tus reproducciones, artistas y generos con mayor detalle.'
    }
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView,
    meta: {
      title: 'Permisos',
      description: 'Gestiona los permisos necesarios para que Skippify funcione de forma estable.'
    }
  },
  {
    path: '/features',
    name: 'features',
    component: FeaturesView,
    meta: {
      title: 'Funciones',
      description: 'Activa o ajusta funcionalidades avanzadas para personalizar tu experiencia.'
    }
  },
  {
    path: '/claude',
    name: 'claude',
    component: ClaudeView,
    meta: {
      title: 'Claude',
      description: 'Asistente integrado para ayudarte con analisis y configuraciones.'
    }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
