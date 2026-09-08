// Client for the engine worker, with a synchronous fallback when workers are
// unavailable (e.g. some restrictive sandboxes).
import { sortKeys, diff as diffSync } from './engine'
import type { JsonValue, DiffNode } from './engine'

let worker: Worker | null = null
let nextId = 0
const pending = new Map<
  number,
  { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }
>()

function getWorker(): Worker | null {
  if (worker) return worker
  try {
    worker = new Worker(new URL('../worker/engine.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent<{ id: number } & Record<string, unknown>>) => {
      const { id, ok, error, ...rest } = e.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      if (ok) p.resolve(rest)
      else p.reject(new Error(String(error ?? 'worker error')))
    }
    worker.onerror = (e) => {
      for (const [, p] of pending) p.reject(new Error(e.message || 'worker error'))
      pending.clear()
      worker?.terminate()
      worker = null
    }
  } catch {
    worker = null
  }
  return worker
}

function run(type: 'normalize' | 'diff', payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const w = getWorker()
  if (!w) {
    if (type === 'normalize') {
      const original = JSON.parse(payload.text as string) as JsonValue
      return Promise.resolve({ original, normalized: sortKeys(original) })
    }
    return Promise.resolve({
      diff: diffSync(payload.a as JsonValue, payload.b as JsonValue),
    })
  }
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ id, type, ...payload })
  })
}

export function normalizeJson(
  text: string,
): Promise<{ original: JsonValue; normalized: JsonValue }> {
  return run('normalize', { text }) as Promise<{ original: JsonValue; normalized: JsonValue }>
}

export function computeDiff(
  a: JsonValue,
  b: JsonValue,
): Promise<{ diff: DiffNode | null }> {
  return run('diff', { a, b }) as Promise<{ diff: DiffNode | null }>
}
