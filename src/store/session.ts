import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import {
  type JsonValue,
  type DiffNode,
  type JsonPath,
  type FilterMode,
  collectLeaves,
  pathKey,
  pathLabel,
  getAt,
  setAt,
  removeAt,
  stringifyWithIndex,
  sortKeys,
  countKeys,
  collectKeyPaths,
  filterTree,
  previewValue,
} from '../lib/engine'
import { normalizeJson, computeDiff } from '../lib/engineClient'
import { saveSession, loadSession } from '../lib/db'
import { SAMPLE } from '../lib/samples'

export interface SourceDoc {
  id: string
  name: string
  origin: 'file' | 'url' | 'paste'
  rawText: string
  original: JsonValue | null
  normalized: JsonValue | null
  error: string | null
}

interface Snapshot {
  final: JsonValue | null
  resolved: string[]
}

interface EditDialogState {
  open: boolean
  path: string
  label: string
  initial: string
}

interface Notice {
  message: string
  type: 'error' | 'info' | 'success'
}

interface SerializedSession {
  version: number
  sources: { name: string; origin: 'file' | 'url' | 'paste'; rawText: string }[]
  final: JsonValue | null
  resolved: string[]
  indent: 2 | 4
  filter: FilterMode
}

export type ResolveAction = 'A' | 'B' | 'delete' | 'keep' | 'edit'

const SESSION_KEY = 'default'
const HISTORY_LIMIT = 200

const clone = <T>(v: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(v)
    : (JSON.parse(JSON.stringify(v)) as T)

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

let persistTimer: ReturnType<typeof setTimeout> | undefined
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let finalTimer: ReturnType<typeof setTimeout> | undefined

export const useSessionStore = defineStore('session', () => {
  // ---- State ----
  // Recursive types (SourceDoc -> JsonValue) are held in shallowRef so Pinia's
  // UnwrapRef does not recurse infinitely; the array is replaced wholesale.
  const sources = shallowRef<SourceDoc[]>([])
  const final = shallowRef<JsonValue | null>(null)
  const resolved = ref<Set<string>>(new Set())
  const rootDiff = shallowRef<DiffNode | null>(null)

  const aText = ref('')
  const bText = ref('')
  const finalText = ref('')
  const aMap = shallowRef<Map<string, number>>(new Map())
  const bMap = shallowRef<Map<string, number>>(new Map())
  const finalMap = shallowRef<Map<string, number>>(new Map())
  const finalValid = ref(true)

  const indent = ref<2 | 4>(2)
  const filter = ref<FilterMode>('all')
  const search = ref('')
  const activePath = ref<string | null>(null)
  const activeNode = shallowRef<DiffNode | null>(null)
  const activeIndex = ref(-1)
  const editingRaw = ref(false)

  // History stacks are plain arrays (only their emptiness is surfaced).
  const historyStack: Snapshot[] = []
  const futureStack: Snapshot[] = []
  const canUndo = ref(false)
  const canRedo = ref(false)

  const editDialog = ref<EditDialogState>({ open: false, path: '', label: '', initial: 'null' })
  const notice = ref<Notice | null>(null)
  const loading = ref(false)
  const busy = ref(false)

  // ---- Getters ----
  const hasAnySource = computed(() => sources.value.some((s) => s.normalized != null))
  const ready = computed(() => sources.value[0]?.normalized != null && sources.value[1]?.normalized != null)

  const leaves = computed<DiffNode[]>(() => collectLeaves(rootDiff.value))
  const filteredTreeChildren = computed<DiffNode[]>(() =>
    filterTree(rootDiff.value, filter.value, search.value, resolved.value)?.children ?? [],
  )
  const filteredLeaves = computed<DiffNode[]>(() =>
    collectLeaves(filterTree(rootDiff.value, filter.value, search.value, resolved.value)),
  )
  const totalDiffs = computed(() => leaves.value.length)
  const additions = computed(() => leaves.value.filter((d) => d.kind === 'added').length)
  const deletions = computed(() => leaves.value.filter((d) => d.kind === 'removed').length)
  const modifications = computed(
    () => leaves.value.filter((d) => d.kind === 'changed' || d.kind === 'typeChanged').length,
  )
  const resolvedCount = computed(() => {
    let n = 0
    for (const d of leaves.value) if (resolved.value.has(pathKey(d.path))) n++
    return n
  })
  const remainingCount = computed(() => totalDiffs.value - resolvedCount.value)
  const keyStats = computed(() => {
    const A = sources.value[0]?.normalized ?? null
    const B = sources.value[1]?.normalized ?? null
    const totalA = A != null ? countKeys(A) : 0
    const totalB = B != null ? countKeys(B) : 0
    const pa = A != null ? collectKeyPaths(A) : new Set<string>()
    const pb = B != null ? collectKeyPaths(B) : new Set<string>()
    let common = 0
    for (const k of pa) if (pb.has(k)) common++
    return { totalA, totalB, common, onlyA: pa.size - common, onlyB: pb.size - common }
  })

  // ---- Source loading ----
  async function loadSource(slot: number, data: { name: string; origin: 'file' | 'url' | 'paste'; rawText: string }) {
    loading.value = true
    const base: SourceDoc = {
      id: uid(),
      name: data.name,
      origin: data.origin,
      rawText: data.rawText,
      original: null,
      normalized: null,
      error: null,
    }
    replaceSource(slot, base)
    try {
      const { original, normalized } = await normalizeJson(data.rawText)
      replaceSource(slot, { ...base, original, normalized })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      replaceSource(slot, { ...base, error: msg })
    } finally {
      loading.value = false
    }
    await reinitialize()
  }

  async function loadSample() {
    await loadSource(0, {
      name: SAMPLE.nameA,
      origin: 'file',
      rawText: JSON.stringify(SAMPLE.a, null, 2),
    })
    await loadSource(1, {
      name: SAMPLE.nameB,
      origin: 'file',
      rawText: JSON.stringify(SAMPLE.b, null, 2),
    })
  }

  function replaceSource(slot: number, doc: SourceDoc) {
    const next = sources.value.slice()
    next[slot] = doc
    sources.value = next
  }

  function clearSource(slot: number) {
    if (slot >= 0 && slot < sources.value.length) {
      sources.value = sources.value.filter((_, i) => i !== slot)
    }
    void reinitialize()
  }

  // ---- (Re)compute diff and final state ----
  async function reinitialize() {
    const A = sources.value[0]?.normalized ?? null
    final.value = A != null ? clone(A) : null
    resolved.value = new Set()
    historyStack.length = 0
    futureStack.length = 0
    canUndo.value = false
    canRedo.value = false
    activePath.value = null
    activeNode.value = null
    activeIndex.value = -1
    editingRaw.value = false
    await recomputeDiff()
    refreshMaps()
    persist()
  }

  async function recomputeDiff() {
    const A = sources.value[0]?.normalized ?? null
    const B = sources.value[1]?.normalized ?? null
    if (A != null && B != null) {
      busy.value = true
      try {
        rootDiff.value = (await computeDiff(A, B)).diff
      } finally {
        busy.value = false
      }
    } else {
      rootDiff.value = null
    }
  }

  function refreshMaps() {
    const A = sources.value[0]?.normalized
    const B = sources.value[1]?.normalized
    if (A != null) {
      const s = stringifyWithIndex(A, indent.value)
      aText.value = s.text
      aMap.value = s.lines
    } else {
      aText.value = ''
      aMap.value = new Map()
    }
    if (B != null) {
      const s = stringifyWithIndex(B, indent.value)
      bText.value = s.text
      bMap.value = s.lines
    } else {
      bText.value = ''
      bMap.value = new Map()
    }
    const s =
      final.value != null ? stringifyWithIndex(final.value, indent.value) : { text: '', lines: new Map<string, number>() }
    finalText.value = s.text
    finalMap.value = s.lines
    finalValid.value = true
  }

  // ---- History ----
  function syncHistoryFlags() {
    canUndo.value = historyStack.length > 0
    canRedo.value = futureStack.length > 0
  }

  function pushSnapshot() {
    historyStack.push({ final: clone(final.value), resolved: [...resolved.value] })
    if (historyStack.length > HISTORY_LIMIT) historyStack.shift()
    futureStack.length = 0
    syncHistoryFlags()
  }

  function applySnapshot(snap: Snapshot) {
    final.value = snap.final
    resolved.value = new Set(snap.resolved)
    refreshMaps()
    persist()
  }

  function undo() {
    const snap = historyStack.pop()
    if (!snap) return
    futureStack.push({ final: clone(final.value), resolved: [...resolved.value] })
    applySnapshot(snap)
    syncHistoryFlags()
  }

  function redo() {
    const snap = futureStack.pop()
    if (!snap) return
    historyStack.push({ final: clone(final.value), resolved: [...resolved.value] })
    applySnapshot(snap)
    syncHistoryFlags()
  }

  // ---- Resolution ----
  function resolve(node: DiffNode, action: ResolveAction, manualValue?: JsonValue) {
    if (final.value == null) return
    const targets = node.kind === 'nested' ? collectLeaves(node) : [node]
    if (targets.length === 0) return
    pushSnapshot()
    let f: JsonValue = final.value as JsonValue
    for (const t of targets) {
      switch (action) {
        case 'A':
          if (t.kind === 'added') f = removeAt(f, t.path)
          else f = setAt(f, t.path, t.valueA as JsonValue)
          break
        case 'B':
          if (t.kind === 'removed') f = removeAt(f, t.path)
          else f = setAt(f, t.path, t.valueB as JsonValue)
          break
        case 'delete':
          f = removeAt(f, t.path)
          break
        case 'keep':
          break
        case 'edit':
          f = setAt(f, t.path, manualValue as JsonValue)
          break
      }
      resolved.value.add(pathKey(t.path))
    }
    final.value = f
    refreshMaps()
    persist()
  }

  function resolveActive(action: ResolveAction) {
    if (activeNode.value) resolve(activeNode.value, action)
  }

  function resolveByPath(path: JsonPath, action: ResolveAction, manualValue?: JsonValue) {
    const node = findNode(path)
    if (node) resolve(node, action, manualValue)
  }

  function findNode(path: JsonPath, node: DiffNode | null = rootDiff.value): DiffNode | null {
    if (!node) return null
    if (pathKey(node.path) === pathKey(path)) return node
    if (node.kind === 'nested') {
      for (const c of node.children ?? []) {
        const found = findNode(path, c)
        if (found) return found
      }
    }
    return null
  }

  // ---- Selection / navigation ----
  function select(node: DiffNode) {
    activeNode.value = node
    activePath.value = pathKey(node.path)
    const list = filteredLeaves.value
    activeIndex.value = list.findIndex((l) => pathKey(l.path) === pathKey(node.path))
  }

  function selectByPath(pathStr: string) {
    const path: JsonPath = JSON.parse(pathStr)
    const node = findNode(path)
    if (node) select(node)
  }

  function deselect() {
    activePath.value = null
    activeNode.value = null
    activeIndex.value = -1
  }

  function nextDiff() {
    const list = filteredLeaves.value
    if (list.length === 0) return
    activeIndex.value = (activeIndex.value + 1) % list.length
    select(list[activeIndex.value])
  }

  function prevDiff() {
    const list = filteredLeaves.value
    if (list.length === 0) return
    activeIndex.value = (activeIndex.value - 1 + list.length) % list.length
    select(list[activeIndex.value])
  }

  // ---- Manual editing of final (raw editor) ----
  function onFinalTextChange(text: string) {
    if (!editingRaw.value) {
      editingRaw.value = true
      pushSnapshot()
    }
    finalText.value = text
    clearTimeout(finalTimer)
    finalTimer = setTimeout(() => applyFinalText(), 350)
  }

  function applyFinalText() {
    try {
      const parsed = JSON.parse(finalText.value) as JsonValue
      final.value = sortKeys(parsed)
      finalValid.value = true
      editingRaw.value = false
      refreshMaps()
      persist()
    } catch {
      finalValid.value = false
    }
  }

  // ---- Edit dialog ----
  function openEdit(node: DiffNode) {
    const current = getAt(final.value, node.path)
    const seed = current !== undefined ? current : node.valueA ?? node.valueB ?? null
    editDialog.value = {
      open: true,
      path: pathKey(node.path),
      label: pathLabel(node.path),
      initial: JSON.stringify(seed, null, 2),
    }
  }

  function closeEdit() {
    editDialog.value.open = false
  }

  function confirmEdit(rawText: string): boolean {
    let value: JsonValue
    try {
      value = JSON.parse(rawText) as JsonValue
    } catch {
      return false
    }
    if (activeNode.value) resolve(activeNode.value, 'edit', value)
    editDialog.value.open = false
    return true
  }

  // ---- Output ----
  function setIndent(n: 2 | 4) {
    indent.value = n
    refreshMaps()
    persist()
  }

  function downloadFinal() {
    if (final.value == null) return
    const blob = new Blob([JSON.stringify(final.value, null, indent.value) + '\n'], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'merged.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copyFinal(): Promise<boolean> {
    if (final.value == null) return false
    try {
      await navigator.clipboard.writeText(JSON.stringify(final.value, null, indent.value))
      return true
    } catch {
      return false
    }
  }

  async function copySource(slot: number): Promise<boolean> {
    const src = sources.value[slot]
    if (!src || src.normalized == null) return false
    try {
      await navigator.clipboard.writeText(stringifyWithIndex(src.normalized, indent.value).text)
      return true
    } catch {
      return false
    }
  }

  // ---- Notices ----
  function notify(message: string, type: Notice['type'] = 'info') {
    notice.value = { message, type }
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      notice.value = null
    }, 5000)
  }

  // ---- Persistence ----
  function persist() {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      void saveSession(SESSION_KEY, serialize()).catch(() => undefined)
    }, 400)
  }

  function serialize(): SerializedSession {
    return {
      version: 1,
      sources: sources.value
        .filter((s) => s != null)
        .map((s) => ({ name: s.name, origin: s.origin, rawText: s.rawText })),
      final: final.value,
      resolved: [...resolved.value],
      indent: indent.value,
      filter: filter.value,
    }
  }

  async function restore() {
    const data = await loadSession<SerializedSession>(SESSION_KEY)
    if (!data || !data.sources || data.sources.length === 0) return
    indent.value = data.indent === 4 ? 4 : 2
    filter.value = data.filter ?? 'all'
    sources.value = data.sources.map((s) => ({
      id: uid(),
      name: s.name,
      origin: s.origin,
      rawText: s.rawText,
      original: null,
      normalized: null,
      error: null,
    }))
    const restored: SourceDoc[] = await Promise.all(
      sources.value.map(async (s): Promise<SourceDoc> => {
        try {
          const { original, normalized } = await normalizeJson(s.rawText)
          return { ...s, original, normalized }
        } catch (e) {
          return { ...s, error: e instanceof Error ? e.message : String(e) }
        }
      }),
    )
    sources.value = restored
    final.value = data.final ?? null
    resolved.value = new Set(data.resolved ?? [])
    await recomputeDiff()
    refreshMaps()
  }

  return {
    // state
    sources,
    final,
    resolved,
    rootDiff,
    aText,
    bText,
    finalText,
    aMap,
    bMap,
    finalMap,
    finalValid,
    indent,
    filter,
    search,
    activePath,
    activeNode,
    activeIndex,
    editingRaw,
    canUndo,
    canRedo,
    editDialog,
    notice,
    loading,
    busy,
    // getters
    hasAnySource,
    ready,
    leaves,
    filteredTreeChildren,
    filteredLeaves,
    totalDiffs,
    additions,
    deletions,
    modifications,
    resolvedCount,
    remainingCount,
    keyStats,
    // actions
    loadSource,
    loadSample,
    clearSource,
    reinitialize,
    recomputeDiff,
    refreshMaps,
    pushSnapshot,
    undo,
    redo,
    resolve,
    resolveActive,
    resolveByPath,
    findNode,
    select,
    selectByPath,
    deselect,
    nextDiff,
    prevDiff,
    onFinalTextChange,
    applyFinalText,
    openEdit,
    closeEdit,
    confirmEdit,
    setIndent,
    downloadFinal,
    copyFinal,
    copySource,
    notify,
    persist,
    serialize,
    restore,
  }
})

export { previewValue }
