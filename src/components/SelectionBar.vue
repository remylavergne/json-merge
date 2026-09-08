<script setup lang="ts">
import { computed } from 'vue'
import { ChevronUp, ChevronDown, Trash2, Check, Pencil, X } from 'lucide-vue-next'
import { useSessionStore } from '../store/session'
import { pathLabel } from '../lib/engine'

const store = useSessionStore()

const isLeaf = computed(() => store.activeNode?.kind !== 'nested')
const label = computed(() =>
  store.activeNode ? pathLabel(store.activeNode.path) : '',
)
</script>

<template>
  <div
    v-if="store.activeNode"
    class="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs"
  >
    <button class="icon-btn" title="Différence précédente" @click="store.prevDiff()">
      <ChevronUp class="h-4 w-4" />
    </button>
    <button class="icon-btn" title="Différence suivante" @click="store.nextDiff()">
      <ChevronDown class="h-4 w-4" />
    </button>

    <span class="truncate font-mono text-xs text-zinc-700" :title="label">{{ label }}</span>

    <div class="ml-auto flex items-center gap-1">
      <button
        class="resolve-btn resolve-a"
        title="Prendre A"
        @click="store.resolveActive('A')"
      >A</button>
      <button
        class="resolve-btn resolve-b"
        title="Prendre B"
        @click="store.resolveActive('B')"
      >B</button>
      <button class="icon-btn text-red-600 hover:bg-red-100" title="Supprimer" @click="store.resolveActive('delete')">
        <Trash2 class="h-4 w-4" />
      </button>
      <button class="icon-btn text-emerald-600 hover:bg-emerald-100" title="Conserver" @click="store.resolveActive('keep')">
        <Check class="h-4 w-4" />
      </button>
      <button
        v-if="isLeaf"
        class="icon-btn text-zinc-600 hover:bg-zinc-200"
        title="Éditer manuellement"
        @click="store.openEdit(store.activeNode)"
      >
        <Pencil class="h-4 w-4" />
      </button>
      <button class="icon-btn" title="Fermer" @click="store.deselect()">
        <X class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.icon-btn {
  @apply inline-flex items-center justify-center rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800;
}
.resolve-btn {
  @apply inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition-colors;
}
.resolve-a {
  @apply bg-blue-100 text-blue-700 hover:bg-blue-200;
}
.resolve-b {
  @apply bg-violet-100 text-violet-700 hover:bg-violet-200;
}
</style>
