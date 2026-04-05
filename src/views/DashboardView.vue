<template>
  <div>
    <div data-tour="now-playing">
      <NowPlaying :state="nowPlaying" />
    </div>
    <KpiCards />
    <AdvancedKpiCards />

    <section class="grid grid-cols-1 gap-6">
      <PlaysChart />
    </section>

    <RecentPlays />
  </div>
</template>

<script setup>
import NowPlaying from '@/components/NowPlaying.vue'
import KpiCards from '@/components/KpiCards.vue'
import AdvancedKpiCards from '@/components/AdvancedKpiCards.vue'
import PlaysChart from '@/components/PlaysChart.vue'
import RecentPlays from '@/components/RecentPlays.vue'

defineProps({
  nowPlaying: { type: Object, default: () => ({ mode: 'stopped' }) }
})
</script>
