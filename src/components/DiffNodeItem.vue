<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronRight, ChevronDown, Trash2, Check, Pencil } from 'lucide-vue-next'
import {
  type DiffNode,
  pathKey,
  pathLabel,
  previewValue,
  collectLeaves,
} from '../lib/engine'
import { useSessionStore } from '../store/session'

const props = defineProps<{ node: DiffNode; depth: number }>()

const store = useSessionStore()
const open = ref(props.depth < 2)

const isNested = computed(() => props.node.kind === 'nested')

const keyLabel = computed(() => {
  const seg = props.node.path[props.node.path.length - 1]
  return typeof seg === 'number' ? `[${seg}]` : (seg as string)
})

const fullPath = computed(() => pathLabel(props.node.path))

const resolved = computed(() => {
  if (!isNested.value) return store.resolved.has(pathKey(props.node.path))
  return collectLeaves(props.node).every((l) => store.resolved.has(pathKey(l.path)))
})

const active = computed(() => store.activePath === pathKey(props.node.path))

const leafCount = computed(() => collectLeaves(props.node).length)
const previewA = computed(() => previewValue(props.node.valueA))
const previewB = computed(() => previewValue(props.node.valueB))

const kindMeta: Record<string, { label: string; cls: string; text: string }> = {
  added: { label: '+', cls: 'bg-emerald-100 text-emerald-700', text: 'Ajouté' },
  removed: { label: '−', cls: 'bg-red-100 text-red-700', text: 'Supprimé' },
  changed: { label: '~', cls: 'bg-amber-100 text-amber-700', text: 'Modifié' },
  typeChanged: { label: '≠', cls: 'bg-violet-100 text-violet-700', text: 'Type modifié' },
}

function showA(node: DiffNode): boolean {
  return node.kind === 'removed' || node.kind === 'changed' || node.kind === 'typeChanged'
}
function showB(node: DiffNode): boolean {
  return node.kind === 'added' || node.kind === 'changed' || node.kind === 'typeChanged'
}
function act(action: 'A' | 'B' | 'delete' | 'keep') {
  store.resolve(props.node, action)
}
function edit() {
  store.openEdit(props.node)
}
</script>

<template>
  <div>
    <div
      class="group flex cursor-pointer items-center gap-1 border-l-2 px-2 py-1 text-xs transition-colors"
      :class="
        active
          ? 'border-blue-500 bg-blue-50'
          : resolved
            ? 'border-emerald-400 hover:bg-zinc-50'
            : 'border-transparent hover:bg-zinc-50'
      "
      @click="store.select(node)"
    >
      <button
        v-if="isNested"
        class="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-400"
        @click.stop="open = !open"
      >
        <component :is="open ? ChevronDown : ChevronRight" class="h-3.5 w-3.5" />
      </button>
      <span v-else class="h-4 w-4 shrink-0" />

      <span
        v-if="!isNested"
        class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold"
        :class="kindMeta[node.kind]?.cls"
        :title="kindMeta[node.kind]?.text"
      >
        {{ kindMeta[node.kind]?.label }}
      </span>

      <span class="truncate font-medium text-zinc-800" :title="fullPath">{{ keyLabel }}</span>

      <span v-if="isNested" class="ml-auto shrink-0 rounded-full bg-zinc-100 px-1.5 text-[10px] text-zinc-500">
        {{ leafCount }}
      </span>

      <!-- Leaf value previews -->
      <template v-else>
        <span class="ml-1 truncate font-mono text-[10px] text-red-600/80" v-if="showA(node)">
          {{ previewA }}
        </span>
        <span class="mx-0.5 shrink-0 text-zinc-400" v-if="showA(node) && showB(node)">→</span>
        <span class="truncate font-mono text-[10px] text-emerald-700/90" v-if="showB(node)">
          {{ previewB }}
        </span>
      </template>

      <!-- Actions -->
      <span class="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" @click.stop>
        <button
          v-if="showA(node)"
          class="act-btn text-blue-600 hover:bg-blue-100"
          title="Prendre la valeur A"
          @click="act('A')"
        >A</button>
        <button
          v-if="showB(node)"
          class="act-btn text-violet-600 hover:bg-violet-100"
          title="Prendre la valeur B"
          @click="act('B')"
        >B</button>
        <button
          class="act-btn text-red-600 hover:bg-red-100"
          title="Supprimer"
          @click="act('delete')"
        >
          <Trash2 class="h-3 w-3" />
        </button>
        <button
          class="act-btn text-emerald-600 hover:bg-emerald-100"
          title="Conserver la valeur actuelle"
          @click="act('keep')"
        >
          <Check class="h-3 w-3" />
        </button>
        <button
          v-if="!isNested"
          class="act-btn text-zinc-600 hover:bg-zinc-200"
          title="Éditer manuellement"
          @click="edit"
        >
          <Pencil class="h-3 w-3" />
        </button>
      </span>
    </div>

    <div v-if="isNested && open" :style="{ paddingLeft: (depth + 1) * 12 + 'px' }">
      <DiffNodeItem
        v-for="child in node.children"
        :key="pathKey(child.path)"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<style scoped>
.act-btn {
  @apply inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold transition-colors;
}
</style>
