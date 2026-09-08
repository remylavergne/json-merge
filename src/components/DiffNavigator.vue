<script setup lang="ts">
import { computed } from 'vue'
import { ChevronUp, ChevronDown, Search } from 'lucide-vue-next'
import { useSessionStore, type FilterMode } from '../store/session'
import { pathKey } from '../lib/engine'
import DiffNodeItem from './DiffNodeItem.vue'

const store = useSessionStore()

const filters: { value: FilterMode; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'added', label: 'Ajouts' },
  { value: 'removed', label: 'Suppr.' },
  { value: 'modified', label: 'Modif.' },
  { value: 'unresolved', label: 'Non résolus' },
]

const children = computed(() => store.filteredTreeChildren)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="border-b border-zinc-200 p-2">
      <div class="relative">
        <Search class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          v-model="store.search"
          type="text"
          placeholder="Rechercher clé, valeur, path…"
          class="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-7 pr-2 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="f in filters"
          :key="f.value"
          class="chip"
          :class="{ 'chip-active': store.filter === f.value }"
          @click="store.filter = f.value"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-500">
      <span>
        {{ store.filteredLeaves.length }} / {{ store.totalDiffs }} diff(s) — {{ store.remainingCount }} à résoudre
      </span>
      <div class="flex gap-1">
        <button class="nav-btn" title="Différence précédente" @click="store.prevDiff()">
          <ChevronUp class="h-3.5 w-3.5" />
        </button>
        <button class="nav-btn" title="Différence suivante" @click="store.nextDiff()">
          <ChevronDown class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <div class="thin-scroll min-h-0 flex-1 overflow-y-auto py-1">
      <template v-if="children.length">
        <DiffNodeItem v-for="child in children" :key="pathKey(child.path)" :node="child" :depth="0" />
      </template>
      <div v-else class="px-3 py-8 text-center text-xs text-zinc-400">
        <template v-if="store.ready && store.totalDiffs === 0">
          Les deux fichiers sont identiques.
        </template>
        <template v-else-if="store.ready">
          Aucune différence ne correspond aux filtres.
        </template>
        <template v-else>
          Chargez deux fichiers JSON pour voir les différences.
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chip {
  @apply rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50;
}
.chip-active {
  @apply border-blue-600 bg-blue-600 text-white hover:bg-blue-600;
}
.nav-btn {
  @apply inline-flex items-center justify-center rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800;
}
</style>
