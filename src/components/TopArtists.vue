<template>
  <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
    <h2 class="text-lg font-semibold mb-3">Top artistas</h2>
    <ul class="space-y-2 text-sm">
      <li
        v-for="(item, i) in topArtists"
        :key="item.artist"
        class="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2"
      >
        <span>{{ i + 1 }}. {{ item.artist }}</span>
        <span class="text-emerald-300">{{ item.count }}</span>
      </li>
      <li v-if="!topArtists.length" class="text-slate-400">Sin datos disponibles</li>
    </ul>
  </div>
</template>

<script setup>
import { useAnalytics } from '@/composables/useAnalytics'

const { topArtists } = useAnalytics()
</script>
