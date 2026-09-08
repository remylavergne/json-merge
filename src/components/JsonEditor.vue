<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { monaco } from '../lib/monaco'

export interface Highlight {
  line: number
  className: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    readOnly?: boolean
    highlights?: Highlight[]
    minimap?: boolean
    activeLine?: number | null
  }>(),
  {
    readOnly: false,
    highlights: () => [],
    minimap: false,
    activeLine: null,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'ready', editor: monaco.editor.IStandaloneCodeEditor): void
}>()

const container = ref<HTMLElement | null>(null)
let activeDecoration: string[] = []
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let decorations: string[] = []
let internal = false

onMounted(() => {
  if (!container.value) return
  editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: 'json',
    readOnly: props.readOnly,
    theme: 'vs',
    minimap: { enabled: props.minimap },
    fontSize: 13,
    lineNumbers: 'on',
    folding: true,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    renderLineHighlight: 'all',
    wordWrap: 'off',
    tabSize: 2,
    insertSpaces: true,
    stickyScroll: { enabled: false },
    padding: { top: 8, bottom: 8 },
    fixedOverflowWidgets: true,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  })
  editor.onDidChangeModelContent(() => {
    if (internal) {
      internal = false
      return
    }
    if (editor) emit('update:modelValue', editor.getValue())
  })
  applyHighlights()
  applyActiveLine()
  emit('ready', editor)
})

watch(
  () => props.modelValue,
  (v) => {
    if (!editor) return
    if (editor.getValue() === v) return
    internal = true
    editor.setValue(v)
  },
)

watch(
  () => props.highlights,
  () => applyHighlights(),
  { deep: true },
)
watch(() => props.activeLine, () => applyActiveLine())

watch(
  () => props.readOnly,
  (ro) => editor?.updateOptions({ readOnly: ro }),
)

function applyHighlights() {
  if (!editor) return
  const next = (props.highlights ?? []).map((h) => ({
    range: new monaco.Range(h.line, 1, h.line, 1),
    options: { isWholeLine: true, className: h.className },
  }))
  decorations = editor.deltaDecorations(decorations, next)
}
function applyActiveLine() {
  if (!editor) return
  const line = props.activeLine
  const next =
    line != null
      ? [{ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, className: 'diff-line-active' } }]
      : []
  activeDecoration = editor.deltaDecorations(activeDecoration, next)
}

function revealLine(line: number) {
  editor?.revealLineInCenter(line)
}

function focus() {
  editor?.focus()
}

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})

defineExpose({ revealLine, focus, getEditor: () => editor })
</script>

<template>
  <div ref="container" class="h-full w-full"></div>
</template>
