// agent/server.js
import { WebSocketServer } from 'ws'
import { MSG } from '../shared/protocol.js'
import { resolveSource } from './sourceMapper.js'

export async function startServer(port, config) {
  const wss = new WebSocketServer({ port })

  wss.on('connection', (ws) => {
    console.log('Extension connected')

    ws.send(JSON.stringify({
      type: MSG.STATUS,
      connected: true,
      projectRoot: config.projectRoot,
    }))

    ws.on('message', (data) => {
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

        // Phase 3: confirm source resolved — Phase 4 continues from here with LLM call
        ws.send(JSON.stringify({
          type: MSG.STATUS,
          phase3debug: true,
          resolvedPath: sourceResult.absolutePath,
          resolvedLine: sourceResult.lineNumber,
          targetLine: sourceResult.targetLine,
        }))
      }
    })

    ws.on('close', () => {
      console.log('Extension disconnected')
    })
  })

  return wss
}
