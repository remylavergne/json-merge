/// Worker: parse + normalize (sort) JSON and compute structural diffs off the
/// main thread so large i18n files never block the UI.
import { sortKeys, diff } from '../lib/engine'
import type { JsonValue } from '../lib/engine'

interface Req {
  id: number
  type: 'normalize' | 'diff'
  text?: string
  a?: JsonValue
  b?: JsonValue
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Req>) => void) | null
  postMessage: (msg: unknown) => void
}

ctx.onmessage = (e: MessageEvent<Req>) => {
  const { id, type, text, a, b } = e.data
  try {
    if (type === 'normalize') {
      const original = JSON.parse(text ?? '') as JsonValue
      const normalized = sortKeys(original)
      ctx.postMessage({ id, ok: true, original, normalized })
    } else if (type === 'diff') {
      ctx.postMessage({ id, ok: true, diff: diff(a as JsonValue, b as JsonValue) })
    } else {
      ctx.postMessage({ id, ok: false, error: 'unknown request type' })
    }
  } catch (err) {
    ctx.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
