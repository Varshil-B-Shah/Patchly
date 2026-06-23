// agent/server.ts
import { WebSocketServer } from 'ws'
import { MSG } from '../shared/protocol.js'
import type { BatchEditEntry, ThemeTokens, ClassInfo, SelectionItem } from '../shared/protocol.js'
import type { EditOperation } from '../shared/operations.js'
import { resolveSource, type ResolvedSource } from './sourceMapper.js'
import { getEditInstruction, getBatchEditInstruction, type BatchItem } from './llm.js'
import { undoEdit } from './fileEditor.js'
import { applyEditOperations } from './ast/applyEdit.js'
import { inspectElement } from './ast/inspect.js'
import { loadThemeTokens, isTailwindConfigured } from './contextBuilder.js'
import type { ResolvedConfig } from './config.js'

// Theme is loaded once on first connection and cached for the lifetime of the
// server process. The project's tailwind.config rarely changes during a session.
let cachedTheme: ThemeTokens | null = null
let cachedTailwindConfigured: boolean | null = null

// Latest browser selection, pushed by the extension on every selection change.
// Process-lifetime cache (like the theme above), read by the MCP bridge via
// GET_SELECTION. Kept entirely out of editHistory — it's transient UI state.
let latestSelection: SelectionItem[] = []

interface ApplyGroup {
  filePath: string
  operations: EditOperation[]
  explanation: string
  lineNumber: number
}

interface EditHistoryEntry {
  absolutePath: string
  snapshot: string
  filePath: string
  lineNumber: number
  explanation: string
}

type PendingEdit =
  | { batch: true; groups: ApplyGroup[] }
  | { batch?: false; operations: EditOperation[]; explanation: string; lineNumber: number }

const pendingEdits = new Map<string, PendingEdit>() // sessionId → pending edit
// editId → snapshot entry. One per applied edit so the extension's history
// sidebar can undo any of them individually. Note: undoing an older edit when a
// newer edit touched the same file restores the older snapshot wholesale
// (last-write-wins) — acceptable for v2, no per-hunk stacking.
const editHistory = new Map<string, EditHistoryEntry>()

export async function startServer(port: number, config: ResolvedConfig): Promise<WebSocketServer> {
  const wss = new WebSocketServer({ port })

  // Resolve only once the port is actually bound; reject on bind failure (e.g.
  // EADDRINUSE) so the caller can try the next port in the scan range.
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => { wss.off('listening', onListening); reject(err) }
    const onListening = () => { wss.off('error', onError); resolve() }
    wss.once('error', onError)
    wss.once('listening', onListening)
  })

  wss.on('connection', (ws) => {
    console.log('Extension connected')

    if (!cachedTheme) cachedTheme = loadThemeTokens(config.projectRoot)
    if (cachedTailwindConfigured === null) cachedTailwindConfigured = isTailwindConfigured(config.projectRoot)

    ws.send(JSON.stringify({
      type: MSG.STATUS,
      connected: true,
      projectRoot: config.projectRoot,
      theme: cachedTheme,
      tailwindConfigured: cachedTailwindConfigured,
    }))

    ws.on('message', async (data) => {
      let msg: any
      try {
        msg = JSON.parse(data.toString())
      } catch {
        console.error('Invalid JSON from extension')
        return
      }

      console.log('Received:', msg.type)

      if (msg.type === MSG.PING) {
        ws.send(JSON.stringify({ type: MSG.PONG }))
      }

      // ── MCP bridge: cache the browser selection / answer selection queries ──
      if (msg.type === MSG.SELECTION_UPDATE) {
        latestSelection = Array.isArray(msg.selection) ? (msg.selection as SelectionItem[]) : []
        return
      }

      if (msg.type === MSG.GET_SELECTION) {
        ws.send(JSON.stringify({ type: MSG.SELECTION, sessionId: msg.sessionId, selection: latestSelection }))
        return
      }

      if (msg.type === MSG.EDIT_REQUEST) {
        const { patchlySrc, elementHtml, elementClasses, prompt, sessionId, screenshot_base64, targets } = msg

        // ── Multi-select fan-out ────────────────────────────────────────────
        // Targets are grouped by file and each file is sent to the LLM exactly
        // ONCE (with all its targets), which returns one coherent operations[]
        // for that file. This avoids the per-op drift of stitching together
        // independent single-target responses, and sends each file once instead
        // of once per target (big token saving for same-file selections).
        if (Array.isArray(targets) && targets.length > 1) {
          const sendProgress = (stage: string, text?: string) =>
            ws.send(JSON.stringify({ type: MSG.PROGRESS, sessionId, stage, ...(text ? { text } : {}) }))

          console.log(`Batch edit request: "${prompt}" on ${targets.length} targets`)
          sendProgress('analyzing')

          // Resolve every target (cheap, local) and group by file.
          const fileGroups = new Map<string, { sourceResult: ResolvedSource; items: BatchItem[] }>()
          const failed: BatchEditEntry[] = []
          for (const t of targets) {
            const sr = resolveSource(t.patchlySrc, config.projectRoot)
            if (!sr.success) {
              failed.push({ ok: false, filePath: t.patchlySrc, code: sr.code, message: sr.message })
              continue
            }
            const g = fileGroups.get(sr.relativePath) || { sourceResult: sr, items: [] }
            g.items.push({ lineNumber: sr.lineNumber, colNumber: sr.colNumber, elementHtml: t.elementHtml, elementClasses: t.elementClasses })
            fileGroups.set(sr.relativePath, g)
          }

          const edits: BatchEditEntry[] = []
          const applyGroups: ApplyGroup[] = []
          let fileIdx = 0
          const fileCount = fileGroups.size

          for (const [relativePath, g] of fileGroups) {
            fileIdx++
            const label = `Editing file ${fileIdx} of ${fileCount}…`
            sendProgress('generating', label)

            const llm = await getBatchEditInstruction({
              sourceResult: g.sourceResult,
              items: g.items,
              prompt,
              config,
              onProgress: (p) => sendProgress('generating', p.text || label),
            })

            console.log(`  file [${relativePath}] ${g.items.length} target(s):`,
              llm.ok ? `ok — ${llm.operations.length} op(s): ${llm.operations.map((o) => o.op).join(', ')}` : `FAIL ${llm.code} — ${'message' in llm ? llm.message : llm.explanation}`)

            if (!llm.ok) {
              // Treat "model declined" the same as any other per-file failure.
              edits.push({ ok: false, filePath: relativePath, code: llm.code, message: 'message' in llm ? llm.message : undefined })
              continue
            }

            // Pin file + apply bottom-to-top so a line-shifting op can't
            // invalidate the line numbers of not-yet-applied ops above it.
            const operations = llm.operations
              .map((op) => ({ ...op, target: { ...op.target, file: relativePath } }) as EditOperation)
              .sort((a, b) => (b.target?.line || 0) - (a.target?.line || 0))

            sendProgress('building')
            const preview = await applyEditOperations({ projectRoot: config.projectRoot, operations, dryRun: true })
            console.log(`  group [${relativePath}] preview:`, preview.ok ? 'ok' : `FAIL ${preview.code} — ${preview.message}`)

            if (!preview.ok) {
              edits.push({ ok: false, filePath: relativePath, code: preview.code, message: preview.message })
            } else {
              const lineNumber = g.items[0].lineNumber
              edits.push({ ok: true, filePath: relativePath, lineNumber, explanation: llm.explanation, confidence: llm.confidence, diff: preview.diff, targetCount: g.items.length })
              applyGroups.push({ filePath: relativePath, operations, explanation: llm.explanation, lineNumber })
            }
          }

          for (const f of failed) edits.push(f)

          pendingEdits.set(sessionId, { batch: true, groups: applyGroups })
          ws.send(JSON.stringify({ type: MSG.PREVIEW_BATCH, sessionId, edits }))
          return
        }

        console.log(`Edit request: "${prompt}" on ${patchlySrc}`)

        const sourceResult = resolveSource(patchlySrc, config.projectRoot)

        if (!sourceResult.success) {
          ws.send(JSON.stringify({
            type: MSG.EDIT_ERROR,
            sessionId,
            code: sourceResult.code,
            message: sourceResult.message,
          }))
          return
        }

        console.log('Source resolved:', sourceResult.absolutePath, 'line', sourceResult.lineNumber)
        console.log('Target line:', sourceResult.targetLine)
        console.log('Source resolved. Calling LLM...')

        const sendProgress = (stage: string, text?: string) => {
          ws.send(JSON.stringify({ type: MSG.PROGRESS, sessionId, stage, ...(text ? { text } : {}) }))
        }

        sendProgress('analyzing')

        const onProgress = (p: { stage?: string; text?: string }) => sendProgress(p.stage || 'generating', p.text)

        sendProgress('generating')
        let llmResult = await getEditInstruction({
          sourceResult,
          elementHtml,
          elementClasses,
          prompt,
          config,
          screenshot_base64,
          onProgress,
        })

        if (!llmResult.ok && llmResult.code === 'JSON_PARSE_FAILED') {
          console.log('LLM returned invalid JSON, retrying with stricter prompt...')
          sendProgress('generating')
          llmResult = await getEditInstruction({
            sourceResult,
            elementHtml,
            elementClasses,
            prompt: prompt + ' — respond with ONLY the JSON object, nothing else',
            config,
            screenshot_base64,
            onProgress,
          })
        }

        if (!llmResult.ok) {
          console.log('LLM error:', llmResult.code, '—', 'message' in llmResult ? llmResult.message : undefined)

          if (llmResult.code === 'LLM_CANNOT_EDIT') {
            ws.send(JSON.stringify({
              type: MSG.INFO,
              sessionId,
              message: llmResult.message,
            }))
            return
          }

          // The change belongs to an imported child component — offer to retry
          // against that file instead of failing.
          if (llmResult.code === 'REDIRECT_SUGGESTED') {
            console.log('Redirect suggested:', llmResult.suggestions.map((s) => s.file).join(', '))
            ws.send(JSON.stringify({
              type: MSG.REDIRECT,
              sessionId,
              prompt,
              suggestions: llmResult.suggestions,
            }))
            return
          }

          ws.send(JSON.stringify({
            type: MSG.EDIT_ERROR,
            sessionId,
            code: llmResult.code,
            message: llmResult.message,
          }))
          return
        }

        console.log('LLM response:', llmResult.explanation)
        console.log('  operations:', llmResult.operations.map((o) => o.op).join(', '))

        // The edit always lives in the selected element's file — pin every op's
        // target file to the resolved source so an LLM path slip can't misfire.
        const operations = llmResult.operations.map((op) => ({
          ...op,
          target: { ...op.target, file: sourceResult.relativePath },
        }) as EditOperation)

        sendProgress('building')

        // Dry-run the pipeline to produce a preview diff without writing.
        const preview = await applyEditOperations({
          projectRoot: config.projectRoot,
          operations,
          dryRun: true,
        })

        if (!preview.ok) {
          console.log('Edit preview failed:', preview.code, '—', preview.message)
          ws.send(JSON.stringify({
            type: MSG.EDIT_ERROR,
            sessionId,
            code: preview.code,
            message: preview.message,
          }))
          return
        }

        pendingEdits.set(sessionId, {
          operations,
          explanation: llmResult.explanation,
          lineNumber: sourceResult.lineNumber,
        })

        ws.send(JSON.stringify({
          type: MSG.PREVIEW,
          sessionId,
          explanation: llmResult.explanation,
          confidence: llmResult.confidence,
          diff: preview.diff,
          filePath: sourceResult.relativePath,
          lineNumber: sourceResult.lineNumber,
        }))
      }

      if (msg.type === MSG.CONFIRM) {
        const { sessionId } = msg
        const pending = pendingEdits.get(sessionId)

        if (!pending) {
          ws.send(JSON.stringify({
            type: MSG.EDIT_ERROR,
            sessionId,
            code: 'NO_PENDING_EDIT',
            message: 'No pending edit found for this session. It may have expired.',
          }))
          return
        }

        // Batch confirm: apply each file group; emit EDIT_DONE per success (a
        // history row each) and EDIT_ERROR per group that fails to write.
        if (pending.batch) {
          pendingEdits.delete(sessionId)
          for (const g of pending.groups) {
            const r = await applyEditOperations({ projectRoot: config.projectRoot, operations: g.operations })
            if (!r.ok) {
              ws.send(JSON.stringify({ type: MSG.EDIT_ERROR, sessionId, code: r.code, message: `${g.filePath}: ${r.message}` }))
              continue
            }
            const editId = Math.random().toString(36).slice(2)
            editHistory.set(editId, {
              absolutePath: r.absolutePath, snapshot: r.snapshot,
              filePath: r.filePath, lineNumber: g.lineNumber, explanation: g.explanation,
            })
            ws.send(JSON.stringify({
              type: MSG.EDIT_DONE, sessionId, editId,
              filePath: r.filePath, lineNumber: g.lineNumber, explanation: g.explanation,
            }))
          }
          return
        }

        const editResult = await applyEditOperations({
          projectRoot: config.projectRoot,
          operations: pending.operations,
        })

        pendingEdits.delete(sessionId)

        if (!editResult.ok) {
          ws.send(JSON.stringify({
            type: MSG.EDIT_ERROR,
            sessionId,
            code: editResult.code,
            message: editResult.message,
          }))
          return
        }

        const editId = Math.random().toString(36).slice(2)
        editHistory.set(editId, {
          absolutePath: editResult.absolutePath,
          snapshot: editResult.snapshot,
          filePath: editResult.filePath,
          lineNumber: pending.lineNumber,
          explanation: pending.explanation,
        })

        ws.send(JSON.stringify({
          type: MSG.EDIT_DONE,
          sessionId,
          editId,
          filePath: editResult.filePath,
          lineNumber: pending.lineNumber,
          explanation: pending.explanation,
        }))
      }

      if (msg.type === MSG.REJECT) {
        pendingEdits.delete(msg.sessionId)
      }

      // ── Direct class panel: inspect element className(s) from source ────────
      if (msg.type === MSG.INSPECT) {
        const { sessionId, patchlySources } = msg as { sessionId: string; patchlySources: string[] }
        const sources = Array.isArray(patchlySources) ? patchlySources : []

        const elements: ClassInfo[] = []
        let lastError: { code: string; message: string } | null = null

        for (const patchlySrc of sources) {
          const sourceResult = resolveSource(patchlySrc, config.projectRoot)
          if (!sourceResult.success) {
            lastError = { code: sourceResult.code, message: sourceResult.message }
            continue
          }
          const target = {
            file: sourceResult.relativePath,
            line: sourceResult.lineNumber,
            column: sourceResult.colNumber,
            tagName: '', // inspectElement reads it from the AST
          }
          const result = inspectElement(config.projectRoot, target, patchlySrc)
          if (!result.ok) {
            lastError = { code: result.code, message: result.message }
            continue
          }
          elements.push(result.info)
        }

        // Only fail outright if NOTHING could be inspected.
        if (elements.length === 0) {
          const err = lastError ?? { code: 'NO_SOURCE_ATTR', message: 'Nothing to inspect.' }
          ws.send(JSON.stringify({ type: MSG.EDIT_ERROR, sessionId, code: err.code, message: err.message }))
          return
        }

        ws.send(JSON.stringify({ type: MSG.ELEMENT_INFO, sessionId, elements }))
        return
      }

      // ── Direct class panel: apply pre-built ops (no LLM, no preview) ────────
      // STATELESS: does NOT record into editHistory and does NOT emit EDIT_DONE —
      // the class panel keeps its own undo/redo. Supports ops across multiple files.
      if (msg.type === MSG.APPLY_OPS) {
        const { sessionId, operations, dryRun } = msg as { sessionId: string; operations: EditOperation[]; explanation: string; dryRun?: boolean }

        if (!Array.isArray(operations) || operations.length === 0) {
          ws.send(JSON.stringify({ type: MSG.EDIT_ERROR, sessionId, code: 'NO_OPERATIONS', message: 'No operations provided.' }))
          return
        }

        // Pin each op's file via source-mapper (per-op, so a spoofed path can't
        // escape and multi-file selections resolve correctly), then group by file.
        const opsByFile = new Map<string, EditOperation[]>()
        for (const op of operations) {
          const t = op.target
          const patchlySrc = `${t.file}:${t.line}:${t.column}`
          const sourceResult = resolveSource(patchlySrc, config.projectRoot)
          if (!sourceResult.success) {
            ws.send(JSON.stringify({ type: MSG.EDIT_ERROR, sessionId, code: sourceResult.code, message: sourceResult.message }))
            return
          }
          const pinned = { ...op, target: { ...t, file: sourceResult.relativePath } } as EditOperation
          const group = opsByFile.get(sourceResult.relativePath) ?? []
          group.push(pinned)
          opsByFile.set(sourceResult.relativePath, group)
        }

        // Apply (or dry-run) each file's ops in one pass. First failure stops.
        let combinedDiff = ''
        for (const fileOps of opsByFile.values()) {
          const editResult = await applyEditOperations({ projectRoot: config.projectRoot, operations: fileOps, dryRun: !!dryRun })
          if (!editResult.ok) {
            ws.send(JSON.stringify({ type: MSG.EDIT_ERROR, sessionId, code: editResult.code, message: editResult.message }))
            return
          }
          combinedDiff += editResult.diff  // always collect; MCP uses it to show what changed
        }

        ws.send(JSON.stringify({ type: MSG.OPS_APPLIED, sessionId, ok: true, diff: combinedDiff }))
        return
      }

      if (msg.type === MSG.UNDO) {
        // Resolve the target edit: explicit editId, else the most recent entry.
        let editId = msg.editId
        if (!editId) {
          const ids = [...editHistory.keys()]
          editId = ids[ids.length - 1]
        }

        const entry = editId ? editHistory.get(editId) : null

        if (!entry) {
          ws.send(JSON.stringify({
            type: MSG.EDIT_ERROR,
            code: 'NOTHING_TO_UNDO',
            message: 'Nothing to undo.',
          }))
          return
        }

        const undoResult = undoEdit({ absolutePath: entry.absolutePath, previousContent: entry.snapshot })

        if (!undoResult.success) {
          ws.send(JSON.stringify({
            type: MSG.EDIT_ERROR,
            code: undoResult.code,
            message: undoResult.message,
          }))
          return
        }

        editHistory.delete(editId)

        ws.send(JSON.stringify({ type: MSG.UNDO_DONE, editId }))
      }
    })

    ws.on('close', () => {
      console.log('Extension disconnected')
    })
  })

  return wss
}
