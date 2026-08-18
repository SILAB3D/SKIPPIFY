<template>
  <div class="sk-stagger space-y-5">
    <div data-tour="now-playing">
      <NowPlaying :state="nowPlaying" />
    </div>

    <KpiCards />
    <PlaysChart />
    <AdvancedKpiCards />
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
