<script setup lang="ts">
import { ref } from 'vue'
import { Braces, FileJson, Sparkles, UploadCloud } from 'lucide-vue-next'
import { useSessionStore } from '../store/session'

const store = useSessionStore()
const inputA = ref<HTMLInputElement | null>(null)
const inputB = ref<HTMLInputElement | null>(null)
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
      }
    } catch {
      /* cancelled */
    }
    return
  }
  ;(slot === 0 ? inputA.value : inputB.value)?.click()
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
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-6 p-8">
    <div class="flex flex-col items-center gap-2 text-center">
      <div class="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600/10">
        <Braces class="h-8 w-8 text-blue-600" />
      </div>
      <h1 class="text-xl font-semibold text-zinc-800">Comparer, fusionner et éditer des JSON</h1>
      <p class="max-w-md text-sm text-zinc-500">
        Un outil de diff/merge pour vos fichiers de traduction i18n. Les sources restent
        immuables — tout se fait sur des copies en mémoire.
      </p>
    </div>

    <div class="flex flex-wrap items-center justify-center gap-3">
      <button class="btn-primary" @click="pickFile(0)"><FileJson class="mr-1.5 h-4 w-4" />Charger le fichier A</button>
      <button class="btn-primary" @click="pickFile(1)"><FileJson class="mr-1.5 h-4 w-4" />Charger le fichier B</button>
      <button class="btn-ghost" @click="store.loadSample()"><Sparkles class="mr-1.5 h-4 w-4" />Charger un exemple</button>
    </div>

    <div class="flex items-center gap-2 text-xs text-zinc-400">
      <UploadCloud class="h-4 w-4" />
      <span>ou glissez-déposez vos fichiers JSON ici (A puis B)</span>
    </div>

    <input ref="inputA" type="file" accept=".json,application/json" class="hidden" @change="onFilePicked(0, $event)" />
    <input ref="inputB" type="file" accept=".json,application/json" class="hidden" @change="onFilePicked(1, $event)" />

  </div>
</template>

<style scoped>
.btn-primary {
  @apply inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700;
}
.btn-secondary {
  @apply inline-flex items-center rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50;
}
.btn-ghost {
  @apply inline-flex items-center rounded-md px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50;
}
.seg-btn {
  @apply inline-flex items-center justify-center rounded border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50;
}
.seg-active {
  @apply border-blue-600 bg-blue-600 text-white hover:bg-blue-600;
}
</style>
