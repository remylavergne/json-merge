<script setup lang="ts">
import StatsPanel from './StatsPanel.vue'
import DiffNavigator from './DiffNavigator.vue'
</script>

<template>
  <aside class="flex w-80 shrink-0 flex-col border-r border-zinc-200 bg-white">
    <StatsPanel />
    <DiffNavigator />
  </aside>
</template>
