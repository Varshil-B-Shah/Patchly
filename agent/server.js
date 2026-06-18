// agent/server.js
import { WebSocketServer } from 'ws'
import { MSG } from '../shared/protocol.js'
import { resolveSource } from './sourceMapper.js'
import { getEditInstruction } from './llm.js'
import { undoEdit } from './fileEditor.js'
import { applyEditOperations } from './ast/applyEdit.js'

const pendingEdits = new Map()  // sessionId → { operations }
let lastEdit = null  // tracks the most recent applied edit for undo

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
        const { patchlySrc, elementHtml, elementClasses, prompt, sessionId, screenshot_base64 } = msg

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

        let llmResult = await getEditInstruction({
          sourceResult,
          elementHtml,
          elementClasses,
          prompt,
          config,
          screenshot_base64,
        })

        if (!llmResult.ok && llmResult.code === 'JSON_PARSE_FAILED') {
          console.log('LLM returned invalid JSON, retrying with stricter prompt...')
          llmResult = await getEditInstruction({
            sourceResult,
            elementHtml,
            elementClasses,
            prompt: prompt + ' — respond with ONLY the JSON object, nothing else',
            config,
            screenshot_base64,
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

        pendingEdits.set(sessionId, { operations })

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

        lastEdit = { absolutePath: editResult.absolutePath, previousContent: editResult.snapshot }

        ws.send(JSON.stringify({
          type: MSG.EDIT_DONE,
          sessionId,
          filePath: editResult.filePath,
        }))
      }

      if (msg.type === MSG.REJECT) {
        pendingEdits.delete(msg.sessionId)
      }

      if (msg.type === MSG.UNDO) {
        if (!lastEdit) {
          ws.send(JSON.stringify({
            type: MSG.EDIT_ERROR,
            code: 'NOTHING_TO_UNDO',
            message: 'Nothing to undo.',
          }))
          return
        }

        const undoResult = undoEdit({ absolutePath: lastEdit.absolutePath, previousContent: lastEdit.previousContent })
        lastEdit = null

        if (!undoResult.success) {
          ws.send(JSON.stringify({
            type: MSG.EDIT_ERROR,
            code: undoResult.code,
            message: undoResult.message,
          }))
          return
        }

        ws.send(JSON.stringify({ type: MSG.UNDO_DONE }))
      }
    })

    ws.on('close', () => {
      console.log('Extension disconnected')
    })
  })

  return wss
}
