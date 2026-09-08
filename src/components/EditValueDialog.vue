<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, Check } from 'lucide-vue-next'
import { useSessionStore } from '../store/session'
import JsonEditor from './JsonEditor.vue'

const store = useSessionStore()
const text = ref('null')
const error = ref('')

watch(
  () => store.editDialog.open,
  (open) => {
    if (open) {
      text.value = store.editDialog.initial
      error.value = ''
    }
  },
)

function save() {
  if (store.confirmEdit(text.value)) {
    error.value = ''
  } else {
    error.value = 'JSON invalide — vérifiez la syntaxe (chaînes entre guillemets, etc.).'
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="store.editDialog.open" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/30" @click="store.closeEdit()"></div>
      <div class="relative flex w-[520px] max-w-[92vw] flex-col rounded-lg border border-zinc-200 bg-white shadow-xl">
        <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5">
          <div class="min-w-0">
            <h2 class="text-sm font-semibold text-zinc-800">Éditer la valeur</h2>
            <p class="truncate font-mono text-[11px] text-zinc-500">{{ store.editDialog.label }}</p>
          </div>
          <button class="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" @click="store.closeEdit()">
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="p-4">
          <p class="mb-2 text-xs text-zinc-500">
            Saisissez une valeur JSON valide — le type (<code class="rounded bg-zinc-100 px-1">string</code>,
            <code class="rounded bg-zinc-100 px-1">number</code>,
            <code class="rounded bg-zinc-100 px-1">boolean</code>,
            <code class="rounded bg-zinc-100 px-1">object</code>,
            <code class="rounded bg-zinc-100 px-1">array</code>,
            <code class="rounded bg-zinc-100 px-1">null</code>) sera préservé.
          </p>
          <div class="h-44 overflow-hidden rounded-md border border-zinc-300">
            <JsonEditor v-model="text" />
          </div>
          <p v-if="error" class="mt-2 text-xs font-medium text-red-600">{{ error }}</p>
        </div>

        <div class="flex justify-end gap-2 border-t border-zinc-200 px-4 py-2.5">
          <button class="btn-secondary" @click="store.closeEdit()">Annuler</button>
          <button class="btn-primary" @click="save"><Check class="mr-1 h-4 w-4" />Appliquer</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.btn-primary {
  @apply inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700;
}
.btn-secondary {
  @apply inline-flex items-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50;
}
</style>
