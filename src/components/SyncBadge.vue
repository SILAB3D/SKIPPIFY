<template>
  <div
    class="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
    :class="isError
      ? 'bg-rose-500/10 border border-rose-400/20 text-rose-300'
      : 'bg-emerald-500/10 border border-emerald-400/20 text-emerald-300'"
  >
    <span
      class="w-2.5 h-2.5 rounded-full"
      :class="isError ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse'"
    />
    <span>{{ text }}</span>
  </div>
</template>

<script setup>
defineProps({
  text: { type: String, default: 'Conectando...' },
  isError: { type: Boolean, default: false }
})
</script>
