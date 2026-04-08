/**
 * useFeatures — persists user-configurable feature toggles in localStorage.
 * Add new features here; the FeaturesView renders them automatically.
 */
import { reactive, watch } from 'vue'

const STORAGE_KEY = 'skippify-features'
const CUSTOM_SKIP_CONFIG_KEY = 'skippify-features-custom-skip'

const FEATURE_DEFAULTS = {
  listeningMode: 'custom',
  skipDuplicates: true,
  skipDuplicatesInterval: '1w',
  silenceAds: false,
  silenceAdsKeywords: ['publicidad', 'anuncio', 'anuncios']
}

const CUSTOM_SKIP_DEFAULTS = {
  skipDuplicates: true,
  skipDuplicatesInterval: '1w'
}

function load () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...FEATURE_DEFAULTS }
    const parsed = JSON.parse(raw)
    const next = { ...FEATURE_DEFAULTS, ...parsed }
    // Backward compatibility: migrate legacy `skipAds` to `silenceAds`.
    if (typeof next.silenceAds !== 'boolean' && typeof parsed?.skipAds === 'boolean') {
      next.silenceAds = !!parsed.skipAds
    }
    if (!Array.isArray(next.silenceAdsKeywords)) {
      next.silenceAdsKeywords = [...FEATURE_DEFAULTS.silenceAdsKeywords]
    }
    next.silenceAdsKeywords = next.silenceAdsKeywords
      .map(v => (v || '').toString().trim().toLowerCase())
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
    for (const kw of FEATURE_DEFAULTS.silenceAdsKeywords) {
      if (!next.silenceAdsKeywords.includes(kw)) next.silenceAdsKeywords.push(kw)
    }
    return next
  } catch {
    return { ...FEATURE_DEFAULTS }
  }
}

function loadCustomSkipConfig (fallbackState) {
  try {
    const raw = localStorage.getItem(CUSTOM_SKIP_CONFIG_KEY)
    if (!raw) {
      return {
        skipDuplicates: !!fallbackState?.skipDuplicates,
        skipDuplicatesInterval: fallbackState?.skipDuplicatesInterval || '1w'
      }
    }
    return { ...CUSTOM_SKIP_DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return {
      skipDuplicates: !!fallbackState?.skipDuplicates,
      skipDuplicatesInterval: fallbackState?.skipDuplicatesInterval || '1w'
    }
  }
}

const loadedState = load()
const state = reactive(loadedState)
const customSkipConfig = reactive(loadCustomSkipConfig(loadedState))
let nativeSyncReady = false
let applyingNativeConfig = false

const VALID_LISTENING_MODES = ['discovery', 'casual', 'custom']

function sanitizeListeningMode (mode) {
  return VALID_LISTENING_MODES.includes(mode) ? mode : 'custom'
}

function applyListeningModePreset (mode) {
  if (mode === 'discovery') {
    state.skipDuplicates = true
    state.skipDuplicatesInterval = '1y'
    return
  }

  if (mode === 'casual') {
    state.skipDuplicates = false
    return
  }

  state.skipDuplicates = !!customSkipConfig.skipDuplicates
  state.skipDuplicatesInterval = customSkipConfig.skipDuplicatesInterval || '1w'
}

function setListeningMode (mode) {
  if (!VALID_LISTENING_MODES.includes(mode)) return
  if (state.listeningMode === 'custom') {
    customSkipConfig.skipDuplicates = !!state.skipDuplicates
    customSkipConfig.skipDuplicatesInterval = state.skipDuplicatesInterval || '1w'
  }
  state.listeningMode = mode
  applyListeningModePreset(mode)
}

function isSkipDuplicatesLocked () {
  return state.listeningMode === 'discovery' || state.listeningMode === 'casual'
}

function getSkipDuplicatesLockReason () {
  if (state.listeningMode === 'discovery') {
    return 'El modo Descubrimiento fija esta función en 1 año mientras esté activo.'
  }
  if (state.listeningMode === 'casual') {
    return 'El modo Casual desactiva esta función mientras esté activo.'
  }
  return ''
}

applyListeningModePreset(state.listeningMode)

function getPlugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

function applyNativeFeatureConfig (config = {}) {
  applyingNativeConfig = true

  state.listeningMode = sanitizeListeningMode(config.listeningMode)
  state.skipDuplicates = typeof config.skipDuplicates === 'boolean'
    ? config.skipDuplicates
    : FEATURE_DEFAULTS.skipDuplicates
  state.skipDuplicatesInterval = (config.skipDuplicatesInterval || FEATURE_DEFAULTS.skipDuplicatesInterval).toString()
  state.silenceAds = typeof config.silenceAds === 'boolean'
    ? config.silenceAds
    : FEATURE_DEFAULTS.silenceAds
  state.silenceAdsKeywords = Array.isArray(config.silenceAdsKeywords)
    ? config.silenceAdsKeywords
      .map(v => (v || '').toString().trim().toLowerCase())
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
    : [...FEATURE_DEFAULTS.silenceAdsKeywords]
  for (const kw of FEATURE_DEFAULTS.silenceAdsKeywords) {
    if (!state.silenceAdsKeywords.includes(kw)) state.silenceAdsKeywords.push(kw)
  }

  customSkipConfig.skipDuplicates = typeof config.customSkipDuplicates === 'boolean'
    ? config.customSkipDuplicates
    : CUSTOM_SKIP_DEFAULTS.skipDuplicates
  customSkipConfig.skipDuplicatesInterval = (config.customSkipDuplicatesInterval || CUSTOM_SKIP_DEFAULTS.skipDuplicatesInterval).toString()

  applyingNativeConfig = false
}

async function syncNativeFeatureConfig () {
  if (!nativeSyncReady) return

  const NL = getPlugin()
  try {
    if (NL?.setFeatureConfig) {
      await NL.setFeatureConfig({
        listeningMode: state.listeningMode,
        skipDuplicates: !!state.skipDuplicates,
        skipDuplicatesInterval: (state.skipDuplicatesInterval || '1w').toString(),
        silenceAds: !!state.silenceAds,
        silenceAdsKeywords: Array.isArray(state.silenceAdsKeywords) ? [...state.silenceAdsKeywords] : [...FEATURE_DEFAULTS.silenceAdsKeywords],
        customSkipDuplicates: !!customSkipConfig.skipDuplicates,
        customSkipDuplicatesInterval: (customSkipConfig.skipDuplicatesInterval || '1w').toString()
      })
      return
    }

    if (NL?.setSkipConfig) {
      await NL.setSkipConfig({
        enabled: !!state.skipDuplicates,
        interval: (state.skipDuplicatesInterval || '1w').toString()
      })
    }
    if (NL?.setAdsMuteConfig) {
      await NL.setAdsMuteConfig({
        enabled: !!state.silenceAds
      })
    }
    if (NL?.setAdsMuteKeywords) {
      await NL.setAdsMuteKeywords({
        keywords: Array.isArray(state.silenceAdsKeywords) ? [...state.silenceAdsKeywords] : [...FEATURE_DEFAULTS.silenceAdsKeywords]
      })
    }
  } catch { /* ignored */ }
}

async function initializeNativeFeatures () {
  const NL = getPlugin()

  if (!NL) {
    nativeSyncReady = true
    return
  }

  try {
    if (NL.getFeatureConfig) {
      const config = await NL.getFeatureConfig()
      applyNativeFeatureConfig(config)
    }
  } catch { /* ignored */ }

  nativeSyncReady = true
  await syncNativeFeatureConfig()
}

watch(
  () => ({ ...state }),
  (val) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)) } catch { /* ignored */ }
    if (!applyingNativeConfig) {
      syncNativeFeatureConfig()
    }
  },
  { deep: true }
)

watch(
  () => ({ ...customSkipConfig }),
  (val) => {
    try { localStorage.setItem(CUSTOM_SKIP_CONFIG_KEY, JSON.stringify(val)) } catch { /* ignored */ }
    if (!applyingNativeConfig && state.listeningMode === 'custom') {
      syncNativeFeatureConfig()
    }
  },
  { deep: true }
)

watch(
  () => [state.skipDuplicates, state.skipDuplicatesInterval, state.listeningMode],
  ([skipDuplicates, skipDuplicatesInterval, listeningMode]) => {
    if (listeningMode !== 'custom') return
    customSkipConfig.skipDuplicates = !!skipDuplicates
    customSkipConfig.skipDuplicatesInterval = skipDuplicatesInterval || '1w'
  }
)

export function useFeatures () {
  return {
    state,
    setListeningMode,
    initializeNativeFeatures,
    applyNativeFeatureConfig,
    isSkipDuplicatesLocked,
    getSkipDuplicatesLockReason
  }
}
