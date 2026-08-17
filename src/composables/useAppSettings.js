/**
 * useAppSettings — preferencias de la propia interfaz (no del motor nativo).
 *
 * Vive aparte de `useFeatures` a propósito: aquello se sincroniza con Android en
 * cada cambio, y estas opciones son puramente de presentación. Mezclarlas
 * provocaría viajes al puente nativo por cambiar, por ejemplo, la visibilidad de
 * una pestaña.
 */
import { reactive, watch } from 'vue'

const STORAGE_KEY = 'skippify-app-settings'

const DEFAULTS = {
  /** Pestaña «Calibración» visible en la navegación. */
  showCalibration: false,
  /** Pestaña «Macros» visible en la navegación. */
  showMacros: true
}

function load () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULTS,
      showCalibration: typeof parsed?.showCalibration === 'boolean'
        ? parsed.showCalibration
        : DEFAULTS.showCalibration,
      showMacros: typeof parsed?.showMacros === 'boolean'
        ? parsed.showMacros
        : DEFAULTS.showMacros
    }
  } catch {
    return { ...DEFAULTS }
  }
}

const state = reactive(load())

watch(
  () => ({ ...state }),
  (val) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)) } catch { /* ignored */ }
  },
  { deep: true }
)

export function useAppSettings () {
  return { state }
}
