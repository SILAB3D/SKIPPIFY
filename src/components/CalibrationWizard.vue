<template>
  <section class="sk-card sk-card-lit overflow-hidden">
    <!-- ── Cabecera con el progreso del asistente ─────────────────────────── -->
    <header class="border-b border-white/[0.06] p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-400/25 bg-violet-500/12 text-lg">🩺</span>
          <div>
            <h2 class="sk-title">Asistente de calibración</h2>
            <p class="sk-subtitle">Diagnostica el salto de duplicadas con una prueba controlada</p>
          </div>
        </div>
        <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="onExit">
          {{ testActive ? 'Salir del asistente' : 'Cerrar' }}
        </button>
      </div>

      <ol class="mt-5 grid grid-cols-4 gap-2">
        <li v-for="(label, i) in STEP_LABELS" :key="label" class="min-w-0">
          <div
            class="h-1 rounded-full transition-colors duration-300"
            :class="i <= stepIndex ? 'bg-gradient-to-r from-brand-400 to-teal-300' : 'bg-white/[0.08]'"
          />
          <p
            class="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-wider transition-colors"
            :class="i <= stepIndex ? 'text-brand-300' : 'text-slate-600'"
          >{{ label }}</p>
        </li>
      </ol>
    </header>

    <div class="p-5">
      <!-- ── 1. Preparación ──────────────────────────────────────────────── -->
      <template v-if="step === 'setup'">
        <p class="text-sm leading-relaxed text-slate-300">
          Para saber si un ajuste mejora algo hace falta medir siempre lo mismo. El asistente
          monta ese escenario por ti y no toca nada hasta que tú lo apruebas.
        </p>

        <ul class="mt-4 space-y-2.5">
          <li
            v-for="(item, i) in testChecklist"
            :key="item.id"
            class="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5"
          >
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-[11px] font-bold text-brand-300">{{ i + 1 }}</span>
            <p class="text-xs leading-relaxed text-slate-300">{{ item.text }}</p>
          </li>
        </ul>

        <div class="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-3.5">
          <p class="text-[11px] leading-relaxed text-sky-100/80">
            Al salir se restaurará tu intervalo y tu modo de escucha originales. Los parámetros
            del motor que hayas aprobado sí se conservan, y podrás guardarlos como preset.
          </p>
        </div>

        <button class="sk-btn sk-btn-primary mt-5 w-full" :disabled="!available" @click="startTest">
          Empezar la prueba
        </button>
        <p v-if="!available" class="mt-2 text-center text-[11px] text-amber-300">
          El motor sólo existe en la app de Android.
        </p>
      </template>

      <!-- ── 2. Síntoma y plan ───────────────────────────────────────────── -->
      <template v-else-if="step === 'diagnose'">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-slate-100">¿Qué está pasando exactamente?</h3>
          <span class="sk-chip sk-chip-accent">Prueba activa · duplicadas en 2 semanas</span>
        </div>
        <p class="sk-subtitle">Elige el síntoma que más se parezca a lo que notas al reproducir tu playlist.</p>

        <div class="mt-4 grid gap-2.5 sm:grid-cols-2">
          <button
            v-for="item in symptoms"
            :key="item.id"
            type="button"
            class="rounded-xl border p-3.5 text-left transition-all duration-150"
            :class="symptomId === item.id
              ? 'border-violet-400/50 bg-violet-500/10'
              : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.05]'"
            @click="selectSymptom(item.id)"
          >
            <p class="flex items-start gap-2 text-sm font-semibold leading-snug text-slate-100">
              <span>{{ item.icon }}</span>
              <span>{{ item.title }}</span>
            </p>
            <p class="mt-1 text-[11px] leading-relaxed text-slate-400">{{ item.detail }}</p>
          </button>
        </div>

        <!-- Plan recomendado: nunca se aplica nada sin enseñarlo antes -->
        <div v-if="symptom" class="mt-5 rounded-2xl border border-violet-400/25 bg-violet-500/[0.07] p-4">
          <p class="sk-eyebrow text-violet-300/80">
            Causa habitual{{ tier > 0 ? ` · intento ${tier + 1}` : '' }}
          </p>
          <p class="mt-1.5 text-xs leading-relaxed text-slate-300">{{ symptom.cause }}</p>

          <div class="sk-divider my-4" />

          <p class="text-sm font-semibold text-violet-100">{{ remedy.summary }}</p>
          <p class="mt-1 text-[11px] leading-relaxed text-slate-400">{{ remedy.explain }}</p>

          <p v-if="!proposedChanges.length" class="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3 text-[11px] text-slate-400">
            Tu configuración ya coincide con esta recomendación: no hay nada que cambiar.
            {{ hasStrongerRemedy ? 'Prueba el siguiente nivel con «Ya lo tengo así».' : 'Prueba con otro síntoma.' }}
          </p>

          <ul v-else class="mt-3 space-y-1.5">
            <li
              v-for="change in proposedChanges"
              :key="change.key"
              class="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-slate-950/40 px-2.5 py-2 text-[11px]"
            >
              <span class="text-slate-300">{{ change.label }}</span>
              <span class="ml-auto font-mono text-slate-500">{{ change.from }}</span>
              <span :class="change.direction === 'up' ? 'text-brand-400' : 'text-amber-400'">→</span>
              <span
                class="font-mono font-semibold"
                :class="change.direction === 'up' ? 'text-brand-300' : 'text-amber-300'"
              >{{ change.to }}</span>
            </li>
          </ul>

          <div class="mt-4 flex flex-wrap gap-2">
            <button
              class="sk-btn sk-btn-primary flex-1"
              :disabled="!proposedChanges.length"
              @click="applyRemedy"
            >
              Aplicar y probar
            </button>
            <button
              v-if="!proposedChanges.length && hasStrongerRemedy"
              class="sk-btn sk-btn-ghost"
              @click="markSameProblem"
            >
              Ya lo tengo así
            </button>
            <button class="sk-btn sk-btn-ghost" @click="selectSymptom(symptom.id)">Cancelar</button>
          </div>
        </div>
      </template>

      <!-- ── 3. Comprobación ─────────────────────────────────────────────── -->
      <template v-else-if="step === 'verify'">
        <div class="rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-4">
          <p class="text-sm font-semibold text-brand-100">Ajustes aplicados. Reproduce ahora tu playlist.</p>
          <p class="mt-1.5 text-xs leading-relaxed text-slate-300">
            Déjala sonar entera al menos una vuelta con la repetición activada y observa el
            comportamiento en los cambios de canción. Después dinos qué ha pasado.
          </p>
        </div>

        <div class="mt-4 grid gap-2.5">
          <button class="rounded-xl border border-brand-400/35 bg-brand-500/10 p-4 text-left transition-colors hover:bg-brand-500/18" @click="markSolved">
            <p class="text-sm font-semibold text-brand-100">✅ Problema solucionado</p>
            <p class="mt-1 text-[11px] text-slate-400">Guardaremos esta configuración como preset.</p>
          </button>

          <button
            class="rounded-xl border border-amber-400/30 bg-amber-500/[0.07] p-4 text-left transition-colors hover:bg-amber-500/15"
            @click="markSameProblem"
          >
            <p class="text-sm font-semibold text-amber-100">🔁 Sigue ocurriendo lo mismo</p>
            <p class="mt-1 text-[11px] text-slate-400">
              {{ hasStrongerRemedy
                ? 'Propondremos un ajuste más agresivo en la misma dirección.'
                : 'Ya no quedan niveles para este síntoma: revisaremos la recomendación de nuevo.' }}
            </p>
          </button>

          <button
            class="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-colors hover:bg-white/[0.06]"
            @click="markOtherProblem"
          >
            <p class="text-sm font-semibold text-slate-100">🔀 Ahora ocurre otro problema</p>
            <p class="mt-1 text-[11px] text-slate-400">Volveremos al listado de síntomas.</p>
          </button>
        </div>

        <p class="mt-4 text-center text-[11px] text-slate-500">
          Intentos en esta sesión: {{ attempts.length }}
        </p>
      </template>

      <!-- ── 4. Guardado del preset ──────────────────────────────────────── -->
      <template v-else-if="step === 'save'">
        <h3 class="text-sm font-semibold text-slate-100">Guardar este ajuste como preset</h3>
        <p class="sk-subtitle">
          Se guarda la configuración completa del motor junto con la fecha y el problema que
          resolvió, para que puedas volver a ella cuando quieras.
        </p>

        <div class="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p class="sk-eyebrow">Resumen</p>
          <dl class="mt-2 space-y-1.5 text-[11px]">
            <div class="flex gap-2">
              <dt class="w-28 shrink-0 text-slate-500">Problema</dt>
              <dd class="text-slate-200">{{ lastAttempt?.symptomTitle || '—' }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-28 shrink-0 text-slate-500">Solución</dt>
              <dd class="text-slate-200">{{ lastAttempt?.summary || '—' }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-28 shrink-0 text-slate-500">Intentos</dt>
              <dd class="text-slate-200">{{ attempts.length }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-28 shrink-0 text-slate-500">Fecha</dt>
              <dd class="text-slate-200">{{ nowLabel }}</dd>
            </div>
          </dl>
        </div>

        <label class="mt-4 block">
          <span class="sk-eyebrow">Nombre del preset</span>
          <input
            v-model="presetName"
            type="text"
            maxlength="48"
            :placeholder="defaultPresetName"
            class="sk-input mt-1.5"
            @keyup.enter="onSave"
          >
        </label>

        <div class="mt-4 flex flex-wrap gap-2">
          <button class="sk-btn sk-btn-primary flex-1" @click="onSave">Guardar preset</button>
          <button class="sk-btn sk-btn-ghost" @click="step = 'diagnose'">Seguir ajustando</button>
        </div>
      </template>

      <!-- ── Final ───────────────────────────────────────────────────────── -->
      <template v-else-if="step === 'done'">
        <div class="rounded-2xl border border-brand-500/25 bg-brand-500/[0.07] p-5 text-center">
          <p class="text-2xl">🎉</p>
          <p class="mt-2 text-sm font-semibold text-brand-100">Preset «{{ savedPreset?.name }}» guardado</p>
          <p class="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            {{ savedPreset?.fix?.symptomTitle || 'Ajuste manual' }} ·
            {{ formatDate(savedPreset?.savedAt) }}
          </p>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button class="sk-btn sk-btn-primary flex-1" @click="onExit">Terminar</button>
          <button class="sk-btn sk-btn-ghost" @click="step = 'diagnose'">Calibrar otro síntoma</button>
        </div>
      </template>
    </div>

    <!-- ── Presets guardados ─────────────────────────────────────────────── -->
    <div v-if="presets.length" class="border-t border-white/[0.06] p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-slate-100">Presets guardados</h3>
        <span class="sk-chip">{{ presets.length }}</span>
      </div>

      <ul class="mt-3 space-y-2">
        <li
          v-for="preset in presets"
          :key="preset.id"
          class="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-slate-200">{{ preset.name }}</p>
            <p class="mt-0.5 text-[10px] text-slate-500">
              {{ formatDate(preset.savedAt) }}
              <template v-if="preset.fix"> · arregló: {{ preset.fix.symptomTitle }} ({{ preset.fix.remedy }})</template>
            </p>
          </div>
          <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="applyPreset(preset.id)">Aplicar</button>
          <button class="sk-btn sk-btn-danger sk-btn-sm" @click="deletePreset(preset.id)">Borrar</button>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCalibrationWizard } from '@/composables/useCalibrationWizard'

const emit = defineEmits(['close'])

const STEP_LABELS = ['Preparación', 'Síntoma', 'Comprobación', 'Guardado']

const {
  available, step, stepIndex, symptomId, symptom, symptoms, remedy, tier,
  hasStrongerRemedy, proposedChanges, attempts, testActive, testChecklist,
  savedPreset, presets,
  startTest, selectSymptom, applyRemedy, markSolved, markSameProblem,
  markOtherProblem, savePreset, applyPreset, deletePreset, finish
} = useCalibrationWizard()

const presetName = ref('')

const lastAttempt = computed(() => attempts.value[attempts.value.length - 1] || null)
const nowLabel = computed(() => new Date().toLocaleString('es-ES'))
const defaultPresetName = computed(() => (
  lastAttempt.value ? `Fix · ${lastAttempt.value.symptomTitle.slice(0, 32)}` : 'Calibración'
))

function formatDate (iso) {
  const d = new Date(iso || 0)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-ES')
}

function onSave () {
  savePreset(presetName.value || defaultPresetName.value)
  presetName.value = ''
}

async function onExit () {
  // Los parámetros aprobados se conservan; el intervalo forzado para la prueba
  // vuelve al que el usuario tenía, que es lo que él espera de verdad.
  await finish({ keepEngine: true, keepFeature: false })
  emit('close')
}
</script>
