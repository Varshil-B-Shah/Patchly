// agent/server.js
import { WebSocketServer } from 'ws'
import { MSG } from '../shared/protocol.js'

export async function startServer(port, config) {
  const wss = new WebSocketServer({ port })

  wss.on('connection', (ws) => {
    console.log('Extension connected')

    // Send status immediately on connect
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

      // Phase 1: only handle ping
      if (msg.type === MSG.PING) {
        ws.send(JSON.stringify({ type: MSG.PONG }))
      }

      // EDIT_REQUEST handler added in Phase 4
    })

    ws.on('close', () => {
      console.log('Extension disconnected')
    })
  })

  return wss
}
