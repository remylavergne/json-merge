// Pure, framework-free JSON diff/merge engine.
// Everything here is deterministic and usable from a Web Worker.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }
export type JsonPath = (string | number)[]

export type DiffKind = 'added' | 'removed' | 'changed' | 'typeChanged' | 'nested'

export interface DiffNode {
  path: JsonPath
  kind: DiffKind
  valueA?: JsonValue
  valueB?: JsonValue
  children?: DiffNode[]
}

export type FilterMode = 'all' | 'added' | 'removed' | 'modified' | 'unresolved'

export function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function typeOf(v: JsonValue): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

export function deepEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false
    return true
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    for (const k of ka) {
      if (!(k in b)) return false
      if (!deepEqual(a[k], b[k])) return false
    }
    return true
  }
  return false
}

/** Recursively sort object keys alphabetically (code-point order, deterministic).
 *  Arrays keep their order — element order is semantically significant. */
export function sortKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((v) => sortKeys(v))
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const out: JsonObject = {}
    for (const k of keys) out[k] = sortKeys(value[k])
    return out
  }
  return value
}

/** Recursive structural diff of two JSON values. */
export function diff(a: JsonValue, b: JsonValue, path: JsonPath = []): DiffNode | null {
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)])
    const children: DiffNode[] = []
    for (const k of keys) {
      const childPath: JsonPath = [...path, k]
      if (!(k in a)) children.push({ path: childPath, kind: 'added', valueB: b[k] })
      else if (!(k in b)) children.push({ path: childPath, kind: 'removed', valueA: a[k] })
      else {
        const d = diff(a[k], b[k], childPath)
        if (d) children.push(d)
      }
    }
    if (children.length === 0) return null
    return { path, kind: 'nested', children }
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length)
    const children: DiffNode[] = []
    for (let i = 0; i < n; i++) {
      const childPath: JsonPath = [...path, i]
      if (i >= a.length) children.push({ path: childPath, kind: 'added', valueB: b[i] })
      else if (i >= b.length) children.push({ path: childPath, kind: 'removed', valueA: a[i] })
      else {
        const d = diff(a[i], b[i], childPath)
        if (d) children.push(d)
      }
    }
    if (children.length === 0) return null
    return { path, kind: 'nested', children }
  }

  if (deepEqual(a, b)) return null
  return {
    path,
    kind: typeOf(a) !== typeOf(b) ? 'typeChanged' : 'changed',
    valueA: a,
    valueB: b,
  }
}

/** Flatten a diff tree into its leaf nodes (added/removed/changed/typeChanged). */
export function collectLeaves(node: DiffNode | null): DiffNode[] {
  if (!node) return []
  if (node.kind === 'nested') {
    const out: DiffNode[] = []
    for (const c of node.children ?? []) out.push(...collectLeaves(c))
    return out
  }
  return [node]
}

export function pathKey(path: JsonPath): string {
  return JSON.stringify(path)
}

export function pathLabel(path: JsonPath): string {
  let s = ''
  for (const seg of path) {
    if (typeof seg === 'number') s += `[${seg}]`
    else s += s ? `.${seg}` : seg
  }
  return s
}

export function getAt(root: JsonValue | null | undefined, path: JsonPath): JsonValue | undefined {
  let cur: JsonValue | null | undefined = root
  for (const seg of path) {
    if (cur === null || cur === undefined) return undefined
    cur = (cur as JsonObject)[seg as string]
  }
  return cur
}

/** Immutably set a value at a path (clones only the spine). */
export function setAt(root: JsonValue, path: JsonPath, value: JsonValue): JsonValue {
  if (path.length === 0) return value
  return setAtRec(root, path, value, 0)
}

function setAtRec(node: JsonValue, path: JsonPath, value: JsonValue, i: number): JsonValue {
  const seg = path[i]
  if (i === path.length - 1) {
    if (Array.isArray(node)) {
      const c = node.slice()
      c[seg as number] = value
      return c
    }
    const c: JsonObject = { ...(node as JsonObject) }
    c[seg as string] = value
    return c
  }
  if (Array.isArray(node)) {
    const c = node.slice()
    c[seg as number] = setAtRec(node[seg as number], path, value, i + 1)
    return c
  }
  const c: JsonObject = { ...(node as JsonObject) }
  c[seg as string] = setAtRec((node as JsonObject)[seg as string], path, value, i + 1)
  return c
}

/** Immutably remove a value at a path (object key deleted, array element spliced). */
export function removeAt(root: JsonValue, path: JsonPath): JsonValue {
  if (path.length === 0) return null
  return removeAtRec(root, path, 0)
}

function removeAtRec(node: JsonValue, path: JsonPath, i: number): JsonValue {
  const seg = path[i]
  if (i === path.length - 1) {
    if (Array.isArray(node)) {
      const c = node.slice()
      c.splice(seg as number, 1)
      return c
    }
    const c: JsonObject = { ...(node as JsonObject) }
    delete c[seg as string]
    return c
  }
  if (Array.isArray(node)) {
    const c = node.slice()
    c[seg as number] = removeAtRec(node[seg as number], path, i + 1)
    return c
  }
  const c: JsonObject = { ...(node as JsonObject) }
  c[seg as string] = removeAtRec((node as JsonObject)[seg as string], path, i + 1)
  return c
}

export interface Stringified {
  text: string
  lines: Map<string, number> // pathKey -> 1-based line of the key/value
}

/** Pretty-print JSON with configurable indent, while recording the line of every
 *  object key and array element (used to map diff paths to editor lines). */
export function stringifyWithIndex(value: JsonValue, indentSpaces = 2): Stringified {
  const lines = new Map<string, number>()
  const parts: string[] = []
  let line = 1
  const pad = ' '.repeat(indentSpaces)
  const NL = '\n'

  function emit(s: string): void {
    parts.push(s)
    let idx = s.indexOf('\n')
    while (idx !== -1) {
      line++
      idx = s.indexOf('\n', idx + 1)
    }
  }

  function write(v: JsonValue, path: JsonPath, level: number): void {
    if (v === null || typeof v !== 'object') {
      emit(JSON.stringify(v))
      return
    }
    if (Array.isArray(v)) {
      if (v.length === 0) {
        emit('[]')
        return
      }
      emit('[' + NL)
      v.forEach((item, i) => {
        lines.set(pathKey([...path, i]), line)
        emit(pad.repeat(level + 1))
        write(item, [...path, i], level + 1)
        if (i < v.length - 1) emit(',')
        emit(NL)
      })
      emit(pad.repeat(level) + ']')
      return
    }
    const keys = Object.keys(v)
    if (keys.length === 0) {
      emit('{}')
      return
    }
    emit('{' + NL)
    keys.forEach((k, idx) => {
      const childPath = [...path, k]
      lines.set(pathKey(childPath), line)
      emit(pad.repeat(level + 1) + JSON.stringify(k) + ': ')
      write(v[k], childPath, level + 1)
      if (idx < keys.length - 1) emit(',')
      emit(NL)
    })
    emit(pad.repeat(level) + '}')
  }

  write(value, [], 0)
  return { text: parts.join(''), lines }
}

/** Count all object keys recursively (for statistics). */
export function countKeys(value: JsonValue): number {
  if (Array.isArray(value)) {
    let n = 0
    for (const item of value) if (isPlainObject(item)) n += countKeys(item)
    return n
  }
  if (isPlainObject(value)) {
    let n = Object.keys(value).length
    for (const k in value) n += countKeys(value[k])
    return n
  }
  return 0
}

/** Collect every object-key path (recursively) as pathKey strings. */
export function collectKeyPaths(
  value: JsonValue,
  path: JsonPath = [],
  acc: Set<string> = new Set(),
): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectKeyPaths(v, [...path, i], acc))
    return acc
  }
  if (isPlainObject(value)) {
    for (const k of Object.keys(value)) {
      acc.add(pathKey([...path, k]))
      collectKeyPaths(value[k], [...path, k], acc)
    }
  }
  return acc
}

/** Prune a diff tree to nodes matching filter + search + resolution state. */
export function filterTree(
  node: DiffNode | null,
  filter: FilterMode,
  search: string,
  resolved: Set<string>,
): DiffNode | null {
  if (!node) return null
  if (node.kind !== 'nested') {
    return leafMatches(node, filter, search, resolved) ? node : null
  }
  const children: DiffNode[] = []
  for (const c of node.children ?? []) {
    const f = filterTree(c, filter, search, resolved)
    if (f) children.push(f)
  }
  if (children.length === 0) return null
  return { ...node, children }
}

function leafMatches(
  node: DiffNode,
  filter: FilterMode,
  search: string,
  resolved: Set<string>,
): boolean {
  if (filter === 'added' && node.kind !== 'added') return false
  if (filter === 'removed' && node.kind !== 'removed') return false
  if (filter === 'modified' && node.kind !== 'changed' && node.kind !== 'typeChanged') return false
  if (filter === 'unresolved' && resolved.has(pathKey(node.path))) return false
  if (search) {
    const hay = (
      pathLabel(node.path) +
      ' ' +
      JSON.stringify(node.valueA ?? '') +
      ' ' +
      JSON.stringify(node.valueB ?? '')
    ).toLowerCase()
    if (!hay.includes(search.toLowerCase())) return false
  }
  return true
}

/** Human-readable compact preview of a JSON value for diff rows. */
export function previewValue(v: JsonValue | undefined): string {
  if (v === undefined) return ''
  if (v === null) return 'null'
  if (typeof v === 'object') {
    if (Array.isArray(v)) return v.length === 0 ? '[]' : `[ … ] ×${v.length}`
    const n = Object.keys(v).length
    return n === 0 ? '{}' : `{ … } ×${n}`
  }
  const s = JSON.stringify(v)
  return s.length > 48 ? s.slice(0, 48) + '…' : s
}
