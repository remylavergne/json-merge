<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, shallowRef, watch } from 'vue'
import { CircleAlert, CheckCircle2, Info, CircleDot } from 'lucide-vue-next'
import { useSessionStore } from './store/session'
import { pathKey } from './lib/engine'
import { monaco } from './lib/monaco'
import Toolbar from './components/Toolbar.vue'
import Sidebar from './components/Sidebar.vue'
import SelectionBar from './components/SelectionBar.vue'
import JsonEditor from './components/JsonEditor.vue'
import type { Highlight } from './components/JsonEditor.vue'
import EditValueDialog from './components/EditValueDialog.vue'
import EmptyState from './components/EmptyState.vue'

const store = useSessionStore()

const edA = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)
const edB = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)
const edF = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)
let syncGuard = false
function wireSync() {
  const editors = [edA.value, edB.value, edF.value]
  if (editors.some((e) => !e)) return
  for (const src of editors) {
    src!.onDidScrollChange(() => {
      if (syncGuard) return
      syncGuard = true
      try {
        for (const t of editors) {
          if (t && t !== src) {
            t.setScrollTop(src!.getScrollTop())
            t.setScrollLeft(src!.getScrollLeft())
          }
        }
      } finally {
        syncGuard = false
      }
    })
  }
}

// ---- Editor line highlights (Git-diff palette) ----
function pushSpan(out: Highlight[], start: number | undefined, end: number | undefined, className: string) {
  if (start == null) return
  const last = end ?? start
  for (let l = start; l <= last; l++) out.push({ line: l, className })
}

const aHighlights = computed<Highlight[]>(() => {
  const out: Highlight[] = []
  for (const d of store.leaves) {
    if (d.kind === 'added') continue
    pushSpan(
      out,
      store.aMap.get(pathKey(d.path)),
      store.aEnds.get(pathKey(d.path)),
      d.kind === 'removed' ? 'diff-line-removed' : 'diff-line-changed',
    )
  }
  return out
})

const bHighlights = computed<Highlight[]>(() => {
  const out: Highlight[] = []
  for (const d of store.leaves) {
    if (d.kind === 'removed') continue
    pushSpan(
      out,
      store.bMap.get(pathKey(d.path)),
      store.bEnds.get(pathKey(d.path)),
      d.kind === 'added' ? 'diff-line-added' : 'diff-line-changed',
    )
  }
  return out
})
const finalHighlights = computed<Highlight[]>(() => {
  const out: Highlight[] = []
  for (const d of store.leaves) {
    const start = store.finalMap.get(pathKey(d.path))
    if (start == null) continue
    const resolved = store.resolved.has(pathKey(d.path))
    pushSpan(out, start, store.finalEnds.get(pathKey(d.path)), resolved ? 'diff-line-resolved' : 'diff-line-changed')
  }
  return out
})

const finalActiveLine = computed<number | null>(() => {
  const p = store.activePath
  if (!p) return null
  return store.finalMap.get(p) ?? null
})

// ---- Reveal active diff across editors ----
watch(
  () => store.activePath,
  (p) => {
    if (!p) return
    const lf = store.finalMap.get(p)
    const la = store.aMap.get(p)
    const lb = store.bMap.get(p)
    if (lf != null) edF.value?.revealLineInCenter(lf, monaco.editor.ScrollType.Immediate)
    else if (la != null) edA.value?.revealLineInCenter(la, monaco.editor.ScrollType.Immediate)
    else if (lb != null) edB.value?.revealLineInCenter(lb, monaco.editor.ScrollType.Immediate)
  },
)

function onReadyA(ed: monaco.editor.IStandaloneCodeEditor) {
  edA.value = ed
  wireSync()
}
function onReadyB(ed: monaco.editor.IStandaloneCodeEditor) {
  edB.value = ed
  wireSync()
}
function onReadyF(ed: monaco.editor.IStandaloneCodeEditor) {
  edF.value = ed
  wireSync()
}

// ---- Drag & drop ----
async function onDrop(e: DragEvent) {
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (files.length === 0) return
  let slot: 0 | 1 = store.sources[0]?.normalized == null ? 0 : 1
  for (const file of files) {
    if (slot > 1) break
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') continue
    const text = await file.text()
    await store.loadSource(slot, { name: file.name, origin: 'file', rawText: text })
    slot = (slot + 1) as 0 | 1
  }
}

// ---- Keyboard shortcuts ----
function onKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  const target = e.target as HTMLElement | null
  const inEditor = !!target?.closest('.monaco-editor, input, textarea, [contenteditable="true"]')

  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) store.redo()
    else store.undo()
    return
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    store.redo()
    return
  }
  if (inEditor) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    store.nextDiff()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    store.prevDiff()
  } else if (e.key === 'Escape') {
    store.deselect()
  }
}

onMounted(() => {
  void store.restore()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

const noticeIcon = computed(() =>
  store.notice?.type === 'error' ? CircleAlert : store.notice?.type === 'success' ? CheckCircle2 : Info,
)
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden" @dragover.prevent @drop.prevent="onDrop">
    <Toolbar />

    <div class="flex min-h-0 flex-1">
      <Sidebar v-if="store.hasAnySource" />

      <main class="flex min-w-0 flex-1 flex-col">
        <SelectionBar v-if="store.ready" />

        <!-- Three-pane diff/merge editor: A | Final | B -->
        <div v-if="store.ready" class="grid min-h-0 flex-1 grid-cols-3">
          <div class="flex min-w-0 flex-col border-r border-zinc-200">
            <div class="flex items-center justify-between border-b border-zinc-200 bg-zinc-100 px-3 py-1.5">
              <span class="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                <span class="inline-flex h-4 w-4 items-center justify-center rounded bg-blue-600 text-[9px] font-bold text-white">A</span>
                <span class="truncate">{{ store.sources[0]?.name }}</span>
              </span>
            </div>
            <div class="min-h-0 flex-1">
              <JsonEditor :model-value="store.aText" read-only :highlights="aHighlights" @ready="onReadyA" />
            </div>
          </div>

          <div class="flex min-w-0 flex-col border-r border-zinc-200">
            <div class="flex items-center justify-between border-b border-zinc-200 bg-emerald-50 px-3 py-1.5">
              <span class="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CircleDot class="h-3.5 w-3.5" />
                Résultat (final)
              </span>
              <span v-if="!store.finalValid" class="text-[10px] font-medium text-red-600">JSON invalide</span>
            </div>
            <div class="min-h-0 flex-1">
              <JsonEditor
                :model-value="store.finalText"
                :highlights="finalHighlights"
                :active-line="finalActiveLine"
                @update:model-value="store.onFinalTextChange"
                @ready="onReadyF"
              />
            </div>
          </div>

          <div class="flex min-w-0 flex-col">
            <div class="flex items-center justify-between border-b border-zinc-200 bg-zinc-100 px-3 py-1.5">
              <span class="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                <span class="inline-flex h-4 w-4 items-center justify-center rounded bg-violet-600 text-[9px] font-bold text-white">B</span>
                <span class="truncate">{{ store.sources[1]?.name }}</span>
              </span>
            </div>
            <div class="min-h-0 flex-1">
              <JsonEditor :model-value="store.bText" read-only :highlights="bHighlights" @ready="onReadyB" />
            </div>
          </div>
        </div>

        <EmptyState v-else />
      </main>
    </div>

    <EditValueDialog />

    <!-- Notice toast -->
    <Transition name="fade">
      <div
        v-if="store.notice"
        class="fixed bottom-4 right-4 flex max-w-md items-start gap-2 rounded-lg border bg-white px-3 py-2 text-xs shadow-lg"
        :class="store.notice.type === 'error' ? 'border-red-200' : store.notice.type === 'success' ? 'border-emerald-200' : 'border-zinc-200'"
      >
        <component :is="noticeIcon" class="mt-0.5 h-4 w-4 shrink-0" :class="store.notice.type === 'error' ? 'text-red-500' : store.notice.type === 'success' ? 'text-emerald-500' : 'text-blue-500'" />
        <span class="text-zinc-700">{{ store.notice.message }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
