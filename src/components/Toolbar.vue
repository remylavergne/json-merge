<script setup lang="ts">
import { ref } from 'vue'
import {
  FileJson,
  Link as LinkIcon,
  Undo2,
  Redo2,
  Download,
  Copy,
  Braces,
  Check,
  X,
  Loader2,
  ClipboardPaste,
} from 'lucide-vue-next'
import { useSessionStore } from '../store/session'

const store = useSessionStore()

const fileA = ref<HTMLInputElement | null>(null)
const fileB = ref<HTMLInputElement | null>(null)
const urlOpen = ref(false)
const urlValue = ref('')
const urlSlot = ref<0 | 1>(0)

function nextFreeSlot(): 0 | 1 {
  return store.sources[0]?.normalized == null ? 0 : 1
}

async function pickFile(slot: 0 | 1) {
  const fsPicker = (window as unknown as { showOpenFilePicker?: (opts?: unknown) => Promise<unknown> })
    .showOpenFilePicker
  if (typeof fsPicker === 'function') {
    try {
      const handles = (await fsPicker.call(window, {
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      })) as { getFile: () => Promise<File> }[]
      if (handles[0]) {
        const file = await handles[0].getFile()
        await loadFile(file, slot)
        return
      }
    } catch (err) {
      // AbortError (user cancelled) — fall through silently.
      if ((err as Error).name !== 'AbortError') console.warn(err)
      return
    }
  }
  // Fallback to native input
  const input = slot === 0 ? fileA.value : fileB.value
  input?.click()
}

async function onFilePicked(slot: 0 | 1, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await loadFile(file, slot)
  input.value = ''
}

async function loadFile(file: File, slot: 0 | 1) {
  const text = await file.text()
  await store.loadSource(slot, { name: file.name, origin: 'file', rawText: text })
}

function openUrlDialog() {
  urlSlot.value = nextFreeSlot()
  urlValue.value = ''
  urlOpen.value = true
}

async function loadUrl() {
  const url = urlValue.value.trim()
  if (!url) return
  urlOpen.value = false
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    const text = await res.text()
    await store.loadSource(urlSlot.value, { name: url, origin: 'url', rawText: text })
  } catch (err) {
    const isCors =
      err instanceof TypeError ||
      /Failed to fetch|NetworkError|CORS|Cross-Origin/i.test(err instanceof Error ? err.message : String(err))
    store.notify(
      isCors
        ? `Impossible de charger l'URL — la ressource est inaccessible (CORS ou réseau). Essayez de la télécharger localement.`
        : `Échec du chargement : ${err instanceof Error ? err.message : String(err)}`,
      'error',
    )
  }
}

async function onCopy() {
  const ok = await store.copyFinal()
  store.notify(ok ? 'JSON final copié dans le presse-papiers.' : 'Copie impossible dans ce navigateur.', ok ? 'success' : 'error')
}

const pasteOpen = ref(false)
const pasteValue = ref('')
const pasteSlot = ref<0 | 1>(0)

function openPasteDialog() {
  pasteSlot.value = nextFreeSlot()
  pasteValue.value = ''
  pasteOpen.value = true
}

async function pasteFromClipboard() {
  try {
    pasteValue.value = await navigator.clipboard.readText()
  } catch {
    store.notify('Impossible de lire le presse-papiers dans ce navigateur.', 'error')
  }
}

async function loadPaste() {
  const text = pasteValue.value.trim()
  if (!text) {
    store.notify(`Collez d'abord du JSON.`, 'error')
    return
  }
  pasteOpen.value = false
  await store.loadSource(pasteSlot.value, { name: 'collé', origin: 'paste', rawText: text })
  const src = store.sources[pasteSlot.value]
  if (src?.error) store.notify(`JSON invalide : ${src.error}`, 'error')
}

async function onCopySource(slot: 0 | 1) {
  const ok = await store.copySource(slot)
  store.notify(
    ok ? `JSON ${slot === 0 ? 'A' : 'B'} copié dans le presse-papiers.` : 'Copie impossible dans ce navigateur.',
    ok ? 'success' : 'error',
  )
}
</script>

<template>
  <header class="flex items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2 text-sm">
    <div class="flex items-center gap-1.5 font-semibold text-zinc-800">
      <Braces class="h-4 w-4 text-blue-600" />
      <span>JSON Merge</span>
    </div>

    <div class="mx-2 h-5 w-px bg-zinc-200" />

    <button class="toolbar-btn" @click="pickFile(0)">
      <FileJson class="h-4 w-4" />
      <span v-if="store.sources[0]">A : {{ store.sources[0].name }}</span>
      <span v-else>Charger A</span>
    </button>
    <button class="icon-btn" :disabled="!store.sources[0]?.normalized" title="Copier le JSON de A" @click="onCopySource(0)">
      <Copy class="h-4 w-4" />
    </button>
    <button class="toolbar-btn" @click="pickFile(1)">
      <FileJson class="h-4 w-4" />
      <span v-if="store.sources[1]">B : {{ store.sources[1].name }}</span>
      <span v-else>Charger B</span>
    </button>
    <button class="icon-btn" :disabled="!store.sources[1]?.normalized" title="Copier le JSON de B" @click="onCopySource(1)">
      <Copy class="h-4 w-4" />
    </button>
    <button class="toolbar-btn" @click="openUrlDialog">
      <LinkIcon class="h-4 w-4" />
      URL
    </button>
    <button class="toolbar-btn" @click="openPasteDialog">
      <ClipboardPaste class="h-4 w-4" />
      Coller
    </button>

    <input ref="fileA" type="file" accept=".json,application/json" class="hidden" @change="onFilePicked(0, $event)" />
    <input ref="fileB" type="file" accept=".json,application/json" class="hidden" @change="onFilePicked(1, $event)" />

    <div v-if="store.loading || store.busy" class="flex items-center gap-1.5 text-zinc-500">
      <Loader2 class="h-4 w-4 animate-spin" />
      <span class="text-xs">Traitement…</span>
    </div>

    <div class="ml-auto flex items-center gap-1.5">
      <button class="icon-btn" :disabled="!store.canUndo" title="Annuler (Ctrl+Z)" @click="store.undo()">
        <Undo2 class="h-4 w-4" />
      </button>
      <button class="icon-btn" :disabled="!store.canRedo" title="Rétablir (Ctrl+Shift+Z)" @click="store.redo()">
        <Redo2 class="h-4 w-4" />
      </button>

      <div class="mx-1 h-5 w-px bg-zinc-200" />

      <div class="flex items-center gap-1 text-xs text-zinc-500">
        <span>Indent</span>
        <button class="seg-btn" :class="{ 'seg-active': store.indent === 2 }" @click="store.setIndent(2)">2</button>
        <button class="seg-btn" :class="{ 'seg-active': store.indent === 4 }" @click="store.setIndent(4)">4</button>
      </div>

      <div class="mx-1 h-5 w-px bg-zinc-200" />

      <button class="icon-btn" :disabled="!store.ready" title="Télécharger le JSON final" @click="store.downloadFinal()">
        <Download class="h-4 w-4" />
      </button>
      <button class="icon-btn" :disabled="!store.ready" title="Copier le JSON final" @click="onCopy">
        <Copy class="h-4 w-4" />
      </button>
    </div>

    <!-- URL dialog -->
    <div v-if="urlOpen" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/30" @click="urlOpen = false"></div>
      <div class="relative w-[480px] max-w-[90vw] rounded-lg border border-zinc-200 bg-white p-4 shadow-xl">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold">Charger depuis une URL</h2>
          <button class="icon-btn" @click="urlOpen = false"><X class="h-4 w-4" /></button>
        </div>
        <div class="mb-3 flex gap-2">
          <button class="seg-btn" :class="{ 'seg-active': urlSlot === 0 }" @click="urlSlot = 0">Vers A</button>
          <button class="seg-btn" :class="{ 'seg-active': urlSlot === 1 }" @click="urlSlot = 1">Vers B</button>
        </div>
        <input
          v-model="urlValue"
          type="url"
          placeholder="https://exemple.com/traductions.json"
          class="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          @keydown.enter="loadUrl"
        />
        <div class="mt-2 text-xs text-zinc-500">
          La ressource doit autoriser l'accès cross-origin (CORS) depuis ce navigateur.
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-secondary" @click="urlOpen = false">Annuler</button>
          <button class="btn-primary" @click="loadUrl"><Check class="mr-1 h-4 w-4" />Charger</button>
        </div>
      </div>
    </div>

    <!-- Paste dialog -->
    <div v-if="pasteOpen" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/30" @click="pasteOpen = false"></div>
      <div class="relative w-[560px] max-w-[90vw] rounded-lg border border-zinc-200 bg-white p-4 shadow-xl">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold">Coller du JSON</h2>
          <button class="icon-btn" @click="pasteOpen = false"><X class="h-4 w-4" /></button>
        </div>
        <div class="mb-3 flex items-center gap-2">
          <button class="seg-btn" :class="{ 'seg-active': pasteSlot === 0 }" @click="pasteSlot = 0">Vers A</button>
          <button class="seg-btn" :class="{ 'seg-active': pasteSlot === 1 }" @click="pasteSlot = 1">Vers B</button>
          <button class="btn-secondary ml-auto" @click="pasteFromClipboard">Coller depuis le presse-papiers</button>
        </div>
        <textarea
          v-model="pasteValue"
          rows="12"
          placeholder='{"clé": "valeur"}'
          class="w-full resize-y rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        ></textarea>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-secondary" @click="pasteOpen = false">Annuler</button>
          <button class="btn-primary" @click="loadPaste"><Check class="mr-1 h-4 w-4" />Coller</button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.toolbar-btn {
  @apply inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900;
}
.icon-btn {
  @apply inline-flex items-center justify-center rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent;
}
.seg-btn {
  @apply inline-flex items-center justify-center rounded border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50;
}
.seg-active {
  @apply border-blue-600 bg-blue-600 text-white hover:bg-blue-600;
}
.btn-primary {
  @apply inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700;
}
.btn-secondary {
  @apply inline-flex items-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50;
}
</style>
