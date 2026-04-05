<template>
  <section class="rounded-2xl border border-slate-800 bg-slate-900 p-5 mt-6">
    <h2 class="text-lg font-semibold mb-3">Top géneros</h2>
    <ul class="space-y-2 text-sm">
      <li
        v-for="(item, i) in genres.top"
        :key="item.genre"
        class="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2"
      >
        <span>{{ i + 1 }}. {{ item.genre }}</span>
        <span class="text-emerald-300">{{ item.listens }}</span>
      </li>
      <li v-if="!genres.top.length" class="text-slate-400">Sin géneros registrados</li>
    </ul>
  </section>
</template>

<script setup>
import { useAnalytics } from '@/composables/useAnalytics'

const { genres } = useAnalytics()
</script>
