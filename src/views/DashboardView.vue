<template>
  <div class="sk-stagger space-y-5">
    <div data-tour="now-playing">
      <NowPlaying :state="nowPlaying" />
    </div>

    <KpiCards />
    <DuplicateKpiCards />
    <PlaysChart />
    <SessionKpiCards />
    <RecentPlays />
  </div>
</template>

<script setup>
import NowPlaying from '@/components/NowPlaying.vue'
import KpiCards from '@/components/KpiCards.vue'
import DuplicateKpiCards from '@/components/DuplicateKpiCards.vue'
import SessionKpiCards from '@/components/SessionKpiCards.vue'
import PlaysChart from '@/components/PlaysChart.vue'
import RecentPlays from '@/components/RecentPlays.vue'

defineProps({
  nowPlaying: { type: Object, default: () => ({ mode: 'stopped' }) }
})
</script>
