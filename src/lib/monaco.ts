import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
// JSON language service only (highlighting, validation, folding, symbols) —
// avoids pulling every other language into the bundle.
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

;(self as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new JsonWorker()
    return new EditorWorker()
  },
}

export { monaco }
