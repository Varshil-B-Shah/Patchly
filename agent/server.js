// agent/server.js
import path from 'path'
import { WebSocketServer } from 'ws'
import { MSG } from '../shared/protocol.js'
import { resolveSource } from './sourceMapper.js'
import { getEditInstruction } from './llm.js'
import { applyEdit, undoEdit } from './fileEditor.js'

const pendingEdits = new Map()  // sessionId → { absolutePath, find, replace }
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

      if (msg.type === MSG.SETTINGS) {
        if (msg.azureEndpoint) config.azureEndpoint = msg.azureEndpoint
        if (msg.azureApiKey) config.azureApiKey = msg.azureApiKey
        if (msg.model) config.model = msg.model
        console.log('Settings updated from extension')
      }

      if (msg.type === MSG.EDIT_REQUEST) {
        const { patchlySrc, elementHtml, elementClasses, prompt, sessionId } = msg

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
        })

        if (!llmResult.success && llmResult.code === 'JSON_PARSE_FAILED') {
          console.log('LLM returned invalid JSON, retrying with stricter prompt...')
          llmResult = await getEditInstruction({
            sourceResult,
            elementHtml,
            elementClasses,
            prompt: prompt + ' — respond with ONLY the JSON object, nothing else',
            config,
          })
        }

        if (!llmResult.success) {
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
        console.log('  find:', llmResult.find.slice(0, 80))
        console.log('  replace:', llmResult.replace.slice(0, 80))

        pendingEdits.set(sessionId, {
          absolutePath: sourceResult.absolutePath,
          find: llmResult.find,
          replace: llmResult.replace,
        })

        ws.send(JSON.stringify({
          type: MSG.PREVIEW,
          sessionId,
          explanation: llmResult.explanation,
          find: llmResult.find,
          replace: llmResult.replace,
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

        const editResult = applyEdit({
          absolutePath: pending.absolutePath,
          find: pending.find,
          replace: pending.replace,
          projectRoot: config.projectRoot,
        })

        pendingEdits.delete(sessionId)

        if (!editResult.success) {
          ws.send(JSON.stringify({
            type: MSG.EDIT_ERROR,
            sessionId,
            code: editResult.code,
            message: editResult.message,
          }))
          return
        }

        lastEdit = { absolutePath: editResult.absolutePath, previousContent: editResult.previousContent }

        ws.send(JSON.stringify({
          type: MSG.EDIT_DONE,
          sessionId,
          filePath: path.relative(config.projectRoot, editResult.absolutePath),
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
