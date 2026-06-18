// agent/server.js
import { WebSocketServer } from 'ws'
import { MSG } from '../shared/protocol.js'
import { resolveSource } from './sourceMapper.js'
import { getEditInstruction } from './llm.js'
import { undoEdit } from './fileEditor.js'
import { applyEditOperations } from './ast/applyEdit.js'

const pendingEdits = new Map()  // sessionId → { operations }
// editId → { absolutePath, snapshot, filePath, lineNumber, explanation }.
// One entry per applied edit so the extension's history sidebar can undo any of
// them individually. Note: undoing an older edit when a newer edit touched the
// same file restores the older snapshot wholesale (last-write-wins) — acceptable
// for v2, no per-hunk stacking.
const editHistory = new Map()

// Resolve one target's source, call the LLM (with the JSON-retry), and pin every
// operation's file to the resolved source. Returns a uniform result used by both
// the single-edit and batch (fan-out) paths. Never throws on LLM/resolve failure.
async function computeTargetEdit({ patchlySrc, elementHtml, elementClasses, screenshot_base64, prompt, config, onProgress }) {
  const sourceResult = resolveSource(patchlySrc, config.projectRoot)
  if (!sourceResult.success) {
    return { ok: false, code: sourceResult.code, message: sourceResult.message, filePath: patchlySrc }
  }

  let llmResult = await getEditInstruction({ sourceResult, elementHtml, elementClasses, prompt, config, screenshot_base64, onProgress })

  if (!llmResult.ok && llmResult.code === 'JSON_PARSE_FAILED') {
    llmResult = await getEditInstruction({
      sourceResult, elementHtml, elementClasses,
      prompt: prompt + ' — respond with ONLY the JSON object, nothing else',
      config, screenshot_base64, onProgress,
    })
  }

  if (!llmResult.ok) {
    return { ok: false, code: llmResult.code, message: llmResult.message, filePath: sourceResult.relativePath, lineNumber: sourceResult.lineNumber }
  }

  // Pin every op's target file to the resolved source so an LLM path slip can't misfire.
  const operations = llmResult.operations.map((op) => ({
    ...op,
    target: { ...op.target, file: sourceResult.relativePath },
  }))

  return {
    ok: true,
    operations,
    explanation: llmResult.explanation,
    confidence: llmResult.confidence,
    filePath: sourceResult.relativePath,
    lineNumber: sourceResult.lineNumber,
  }
}

export async function startServer(port, config) {
  const wss = new WebSocketServer({ port })

  wss.on('connection', (ws) => {
    console.log('Extension connected')

    ws.send(JSON.stringify({
      type: MSG.STATUS,
      connected: true,
      projectRoot: config.projectRoot,
    }))

    ws.on('message', async (data) => {
      let msg
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

      if (msg.type === MSG.EDIT_REQUEST) {
        const { patchlySrc, elementHtml, elementClasses, prompt, sessionId, screenshot_base64, targets } = msg

        // ── Multi-select fan-out ────────────────────────────────────────────
        // Each target runs the same single-file pipeline; operations are then
        // grouped per file (a file is written once, atomically), so several
        // targets in the same file never drift each other's line numbers.
        if (Array.isArray(targets) && targets.length > 1) {
          const sendProgress = (stage, text) =>
            ws.send(JSON.stringify({ type: MSG.PROGRESS, sessionId, stage, ...(text ? { text } : {}) }))

          console.log(`Batch edit request: "${prompt}" on ${targets.length} targets`)
          sendProgress('analyzing')

          const results = []
          for (let i = 0; i < targets.length; i++) {
            sendProgress('generating', `Editing ${i + 1} of ${targets.length}…`)
            results.push(await computeTargetEdit({
              ...targets[i],
              prompt,
              config,
              onProgress: (p) => sendProgress('generating', p.text || `Editing ${i + 1} of ${targets.length}…`),
            }))
          }

          sendProgress('building')

          // Group successful operations by file.
          const groups = new Map()
          for (const r of results) {
            if (!r.ok) continue
            const g = groups.get(r.filePath) || { filePath: r.filePath, operations: [], explanations: [], confidences: [], lineNumber: r.lineNumber }
            g.operations.push(...r.operations)
            g.explanations.push(r.explanation)
            g.confidences.push(r.confidence)
            groups.set(r.filePath, g)
          }

          const edits = []
          const applyGroups = []
          for (const g of groups.values()) {
            // Apply bottom-to-top so a line-shifting op (wrap/insert) can't
            // invalidate the line numbers of not-yet-applied ops above it.
            g.operations.sort((a, b) => (b.target?.line || 0) - (a.target?.line || 0))
            const preview = await applyEditOperations({ projectRoot: config.projectRoot, operations: g.operations, dryRun: true })
            if (!preview.ok) {
              edits.push({ ok: false, filePath: g.filePath, code: preview.code, message: preview.message })
            } else {
              const explanation = g.explanations.join('; ')
              edits.push({ ok: true, filePath: g.filePath, lineNumber: g.lineNumber, explanation, confidence: Math.min(...g.confidences), diff: preview.diff })
              applyGroups.push({ filePath: g.filePath, operations: g.operations, explanation, lineNumber: g.lineNumber })
            }
          }

          // Surface targets that failed before grouping (resolve/LLM errors).
          for (const r of results) {
            if (!r.ok) edits.push({ ok: false, filePath: r.filePath, lineNumber: r.lineNumber, code: r.code, message: r.message })
          }

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

        const sendProgress = (stage, text) => {
          ws.send(JSON.stringify({ type: MSG.PROGRESS, sessionId, stage, ...(text ? { text } : {}) }))
        }

        sendProgress('analyzing')

        const onProgress = (p) => sendProgress(p.stage || 'generating', p.text)

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
          console.log('LLM error:', llmResult.code, '—', llmResult.message)

          if (llmResult.code === 'LLM_CANNOT_EDIT') {
            ws.send(JSON.stringify({
              type: MSG.INFO,
              sessionId,
              message: llmResult.message,
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
        console.log('  operations:', llmResult.operations.map(o => o.op).join(', '))

        // The edit always lives in the selected element's file — pin every op's
        // target file to the resolved source so an LLM path slip can't misfire.
        const operations = llmResult.operations.map(op => ({
          ...op,
          target: { ...op.target, file: sourceResult.relativePath },
        }))

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
