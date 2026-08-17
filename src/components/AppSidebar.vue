<template>
  <!-- Mobile backdrop -->
  <Transition name="backdrop">
    <div
      v-if="open"
      class="fixed inset-0 bg-black/60 z-30 md:hidden"
      @click="$emit('update:open', false)"
    />
  </Transition>

  <!-- ── Escritorio ─────────────────────────────────────────────────────────-->
  <aside
    :class="[
      'flex flex-col bg-slate-950 border-r border-slate-800/60',
      'transition-[width] duration-300 ease-in-out overflow-hidden',
      'hidden md:flex',
      collapsed ? 'md:w-16' : 'md:w-60',
    ]"
  >
    <div
      class="flex items-center gap-3 border-b border-slate-800/60 h-16 px-3 flex-shrink-0"
      :class="collapsed ? 'justify-center' : 'px-4'"
    >
      <div class="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 shadow-md shadow-emerald-500/10">
        <svg xmlns="http://www.w3.org/2000/svg" class="text-emerald-400" viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px">
          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
        </svg>
      </div>
      <Transition name="label">
        <div v-if="!collapsed" class="overflow-hidden whitespace-nowrap">
          <p class="text-sm font-bold tracking-wide text-white leading-none">Skippify</p>
          <p class="text-[10px] text-slate-500 leading-none mt-0.5">Funcionalidades premium para tu Spotify</p>
        </div>
      </Transition>
    </div>

    <nav data-tour="sidebar-nav" class="flex-1 py-3 flex flex-col gap-1 px-2 overflow-y-auto">
      <p
        v-if="!collapsed"
        class="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600 whitespace-nowrap overflow-hidden"
      >Navegación</p>

      <router-link
        v-for="item in mainItems"
        :key="item.to"
        :to="item.to"
        custom
        v-slot="{ isActive, navigate }"
      >
        <button
          :data-tour="item.tour"
          :title="collapsed ? item.label : ''"
          class="group relative flex items-center gap-3 rounded-xl transition-all duration-150 w-full"
          :class="[
            collapsed ? 'justify-center px-0 py-3.5' : 'px-3.5 py-3.5',
            item.highlight ? permissionsButtonClasses(isActive) : standardButtonClasses(isActive)
          ]"
          @click="navigate()"
        >
          <span
            class="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            :class="item.highlight ? permissionsIconClasses(isActive) : standardIconClasses(isActive)"
          >
            <NavIcon :name="item.icon" />
          </span>
          <Transition name="label">
            <div v-if="!collapsed" class="text-left overflow-hidden whitespace-nowrap">
              <p class="text-base font-semibold leading-none">{{ item.label }}</p>
              <p class="text-[10px] mt-0.5 text-slate-500">{{ item.hint }}</p>
            </div>
          </Transition>
          <span
            v-if="collapsed"
            class="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-xl"
          >{{ item.label }}</span>
        </button>
      </router-link>
    </nav>

    <div class="border-t border-slate-800/60 p-2 flex-shrink-0" :class="collapsed ? 'flex justify-center' : 'flex justify-end'">
      <button
        @click="collapsed = !collapsed"
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-all"
        :title="collapsed ? 'Expandir menú' : 'Contraer menú'"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform duration-300"
          :class="collapsed ? 'rotate-0' : 'rotate-180'"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        >
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  </aside>

  <!-- ── Móvil ──────────────────────────────────────────────────────────────-->
  <aside
    :class="[
      'fixed inset-y-0 left-0 z-40 w-72 flex flex-col bg-slate-950 border-r border-slate-800/60',
      'transition-transform duration-300 ease-in-out md:hidden',
      open ? 'translate-x-0' : '-translate-x-full'
    ]"
  >
    <div class="relative border-b border-slate-800/60 px-4 py-4 flex-shrink-0">
      <button
        class="absolute right-3 top-3 rounded-lg bg-slate-800 border border-slate-700 p-1.5 text-slate-400 hover:text-white transition-colors"
        @click="$emit('update:open', false)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <div class="flex items-start gap-3 pr-10">
        <div class="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30">
          <svg xmlns="http://www.w3.org/2000/svg" class="text-emerald-400" viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-base font-extrabold tracking-wide text-white leading-none">Skippify</p>
          <p class="text-xs text-slate-400 leading-relaxed mt-1">Funcionalidades premium para tu Spotify</p>
        </div>
      </div>
    </div>

    <nav data-tour="sidebar-nav" class="flex-1 py-3 flex flex-col gap-1 px-2 overflow-y-auto">
      <p class="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Navegación</p>

      <router-link
        v-for="item in mobileItems"
        :key="item.to"
        :to="item.to"
        custom
        v-slot="{ isActive, navigate }"
      >
        <button
          :data-tour="item.tour"
          class="group flex items-center gap-3 px-3.5 py-3.5 rounded-xl w-full transition-all duration-150 border"
          :class="item.highlight ? permissionsButtonClasses(isActive) : standardButtonClasses(isActive)"
          @click="navigate(); $emit('update:open', false)"
        >
          <span
            class="flex h-8 w-8 items-center justify-center rounded-lg"
            :class="item.highlight ? permissionsIconClasses(isActive) : standardIconClasses(isActive)"
          >
            <NavIcon :name="item.icon" />
          </span>
          <div class="text-left">
            <p class="text-base font-semibold leading-none">{{ item.label }}</p>
            <p class="text-[10px] mt-0.5 text-slate-500">{{ item.hint }}</p>
          </div>
        </button>
      </router-link>

      <div class="mt-auto pt-2 border-t border-slate-800/60">
        <router-link to="/settings" custom v-slot="{ isActive, navigate }">
          <button
            data-tour="settings-nav"
            class="group flex items-center gap-3 px-3.5 py-3.5 rounded-xl w-full transition-all duration-150 border"
            :class="permissionsButtonClasses(isActive)"
            @click="navigate(); $emit('update:open', false)"
          >
            <span class="flex h-8 w-8 items-center justify-center rounded-lg" :class="permissionsIconClasses(isActive)">
              <NavIcon name="shield" />
            </span>
            <div class="text-left">
              <p class="text-base font-semibold leading-none">Configuración</p>
              <p class="text-[10px] mt-0.5 text-slate-500">Permisos y respaldos</p>
            </div>
          </button>
        </router-link>
      </div>
    </nav>

    <div class="border-t border-slate-800/60 px-5 py-4">
      <p class="text-[10px] text-slate-600 text-center">Skippify &copy; 2026 · {{ APP_SIGNATURE }}</p>
    </div>
  </aside>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import { useNotifListener } from '@/composables/useNotifListener'
import { useAppSettings } from '@/composables/useAppSettings'

defineProps({ open: Boolean })
defineEmits(['update:open'])

const collapsed = ref(true)
const APP_VERSION = __APP_VERSION__
const APP_SIGNATURE = `Skippify ${APP_VERSION}`

const notif = useNotifListener()
const { state: appSettings } = useAppSettings()

/**
 * Trazos de cada icono. Antes cada entrada del menú llevaba su SVG escrito a
 * mano DOS veces (escritorio y móvil): al tocar la navegación era muy fácil que
 * ambas listas dejaran de coincidir.
 */
const ICON_PATHS = {
  grid: [
    ['rect', { x: 3, y: 3, width: 7, height: 7 }],
    ['rect', { x: 14, y: 3, width: 7, height: 7 }],
    ['rect', { x: 14, y: 14, width: 7, height: 7 }],
    ['rect', { x: 3, y: 14, width: 7, height: 7 }]
  ],
  shield: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }]],
  bars: [
    ['line', { x1: 4, y1: 20, x2: 20, y2: 20 }],
    ['rect', { x: 6, y: 11, width: 3, height: 6 }],
    ['rect', { x: 11, y: 8, width: 3, height: 9 }],
    ['rect', { x: 16, y: 5, width: 3, height: 12 }]
  ],
  cube: [
    ['path', { d: 'M12 3l7 4v10l-7 4-7-4V7l7-4z' }],
    ['path', { d: 'M9.5 10.5h5' }],
    ['path', { d: 'M9.5 13.5h5' }]
  ],
  layers: [
    ['path', { d: 'M12 2L2 7l10 5 10-5-10-5z' }],
    ['path', { d: 'M2 17l10 5 10-5' }],
    ['path', { d: 'M2 12l10 5 10-5' }]
  ],
  trophy: [
    ['circle', { cx: 12, cy: 8, r: 4 }],
    ['path', { d: 'M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6' }],
    ['path', { d: 'M2 12h4' }],
    ['path', { d: 'M18 12h4' }]
  ],
  bolt: [['path', { d: 'M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z' }]],
  sliders: [
    ['line', { x1: 4, y1: 21, x2: 4, y2: 14 }],
    ['line', { x1: 4, y1: 10, x2: 4, y2: 3 }],
    ['line', { x1: 12, y1: 21, x2: 12, y2: 12 }],
    ['line', { x1: 12, y1: 8, x2: 12, y2: 3 }],
    ['line', { x1: 20, y1: 21, x2: 20, y2: 16 }],
    ['line', { x1: 20, y1: 12, x2: 20, y2: 3 }],
    ['line', { x1: 1, y1: 14, x2: 7, y2: 14 }],
    ['line', { x1: 9, y1: 8, x2: 15, y2: 8 }],
    ['line', { x1: 17, y1: 16, x2: 23, y2: 16 }]
  ]
}

const NavIcon = (props) => h(
  'svg',
  {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'h-4 w-4',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  },
  (ICON_PATHS[props.name] || []).map(([tag, attrs]) => h(tag, attrs))
)
NavIcon.props = ['name']

const BASE_ITEMS = [
  { to: '/', label: 'Inicio', hint: 'Métricas y reproducciones', icon: 'grid', tour: 'dashboard-nav' },
  { to: '/stats', label: 'Estadísticas', hint: 'Top artistas y canciones', icon: 'bars', tour: 'stats-nav' },
  { to: '/features', label: 'Funcionalidades', hint: 'Opciones avanzadas', icon: 'layers', tour: 'features-nav' },
  { to: '/modes', label: 'Modos', hint: 'Perfil de escucha', icon: 'cube', tour: 'modes-nav' },
  { to: '/league', label: 'Liga', hint: 'Ranking entre amigos', icon: 'trophy' }
]

const OPTIONAL_ITEMS = [
  { to: '/macros', label: 'Macros', hint: 'Automatiza tu biblioteca', icon: 'bolt', flag: 'showMacros' },
  { to: '/calibration', label: 'Calibración', hint: 'Ajuste fino del saltado', icon: 'sliders', flag: 'showCalibration' }
]

const SETTINGS_ITEM = {
  to: '/settings',
  label: 'Configuración',
  hint: 'Permisos y respaldos',
  icon: 'shield',
  tour: 'settings-nav',
  highlight: true
}

const visibleOptional = computed(() => OPTIONAL_ITEMS.filter(item => appSettings[item.flag]))

// En escritorio Configuración va arriba (junto a Inicio); en móvil queda anclada
// al pie, así que su lista no la incluye.
const mainItems = computed(() => [
  BASE_ITEMS[0],
  SETTINGS_ITEM,
  ...BASE_ITEMS.slice(1),
  ...visibleOptional.value
])

const mobileItems = computed(() => [...BASE_ITEMS, ...visibleOptional.value])

const needsPermissions = computed(() => {
  if (!notif.isCapacitor.value) return false
  if (!notif.notifChecked.value) return true
  return !notif.notifEnabled.value
})

function standardButtonClasses (isActive) {
  return isActive
    ? 'bg-emerald-500/12 text-emerald-300 border border-emerald-500/25'
    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
}

function standardIconClasses (isActive) {
  return isActive
    ? 'bg-emerald-500/20 text-emerald-400'
    : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'
}

function permissionsButtonClasses (isActive) {
  if (needsPermissions.value) {
    return isActive
      ? 'bg-gradient-to-r from-rose-500/25 to-red-500/10 text-rose-100 border-rose-400/45'
      : 'text-rose-200 border-rose-500/35 bg-gradient-to-r from-rose-500/14 to-transparent hover:from-rose-500/24 hover:text-rose-100'
  }

  return isActive
    ? 'bg-gradient-to-r from-emerald-500/25 to-teal-500/10 text-emerald-100 border-emerald-400/45'
    : 'text-emerald-200 border-emerald-500/35 bg-gradient-to-r from-emerald-500/14 to-transparent hover:from-emerald-500/24 hover:text-emerald-100'
}

function permissionsIconClasses (isActive) {
  if (needsPermissions.value) {
    return isActive ? 'bg-rose-500/25 text-rose-200' : 'bg-rose-500/15 text-rose-300'
  }
  return isActive ? 'bg-emerald-500/25 text-emerald-200' : 'bg-emerald-500/15 text-emerald-300'
}
</script>

<style scoped>
.label-enter-active,
.label-leave-active {
  transition: opacity 0.15s ease, max-width 0.3s ease;
  max-width: 200px;
}
.label-enter-from,
.label-leave-to {
  opacity: 0;
  max-width: 0;
}

.backdrop-enter-active,
.backdrop-leave-active {
  transition: opacity 0.2s ease;
}
.backdrop-enter-from,
.backdrop-leave-to {
  opacity: 0;
}
</style>
