<script setup lang="ts">
import { useSessionStore } from '../store/session'
import { FileText, Globe, CircleAlert, ClipboardPaste } from 'lucide-vue-next'

const store = useSessionStore()

const stats = [
  { key: 'totalDiffs', label: 'Différences', cls: 'text-zinc-900' },
  { key: 'additions', label: 'Ajouts', cls: 'text-emerald-600' },
  { key: 'deletions', label: 'Suppressions', cls: 'text-red-600' },
  { key: 'modifications', label: 'Modifications', cls: 'text-amber-600' },
  { key: 'remainingCount', label: 'À résoudre', cls: 'text-blue-600' },
  { key: 'resolvedCount', label: 'Résolues', cls: 'text-emerald-600' },
] as const

function value(key: (typeof stats)[number]['key']): number {
  return store[key]
}
</script>

<template>
  <section class="border-b border-zinc-200 bg-white p-3">
    <h2 class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Statistiques</h2>

    <div class="grid grid-cols-3 gap-1.5">
      <div v-for="s in stats" :key="s.key" class="rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1.5">
        <div class="text-lg font-semibold leading-none" :class="s.cls">{{ value(s.key) }}</div>
        <div class="mt-1 text-[10px] leading-tight text-zinc-500">{{ s.label }}</div>
      </div>
    </div>

    <div class="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
      <div class="text-zinc-500">Clés A : <span class="font-medium text-zinc-700">{{ store.keyStats.totalA }}</span></div>
      <div class="text-zinc-500">Clés B : <span class="font-medium text-zinc-700">{{ store.keyStats.totalB }}</span></div>
      <div class="text-zinc-500">Communes : <span class="font-medium text-zinc-700">{{ store.keyStats.common }}</span></div>
      <div class="text-zinc-500">Seulement A : <span class="font-medium text-zinc-700">{{ store.keyStats.onlyA }}</span></div>
      <div class="text-zinc-500">Seulement B : <span class="font-medium text-zinc-700">{{ store.keyStats.onlyB }}</span></div>
    </div>

    <div class="mt-3 space-y-1.5 border-t border-zinc-100 pt-2">
      <div
        v-for="(src, i) in store.sources.filter((s) => s != null)"
        :key="src.id"
        class="flex items-center gap-1.5 text-xs"
      >
        <span
          class="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-white"
          :class="i === 0 ? 'bg-blue-600' : 'bg-violet-600'"
        >
          {{ i === 0 ? 'A' : 'B' }}
        </span>
        <span class="truncate font-medium text-zinc-700" :title="src.name">{{ src.name }}</span>
        <component :is="src.origin === 'url' ? Globe : src.origin === 'paste' ? ClipboardPaste : FileText" class="h-3 w-3 shrink-0 text-zinc-400" />
        <CircleAlert v-if="src.error" class="h-3 w-3 shrink-0 text-red-500" :title="src.error" />
      </div>
      <div v-if="store.sources.length === 0" class="text-xs text-zinc-400">Aucun fichier chargé.</div>
      <div v-else-if="store.sources.length === 1" class="text-xs text-zinc-400">Chargez un second fichier pour comparer.</div>
    </div>
  </section>
</template>
