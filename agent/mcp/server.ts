// agent/mcp/server.ts
// Thin stdio MCP server that proxies to the already-running patchly agent.
// Does NOT re-implement any AST/editing logic — it connects as a WebSocket
// client to ws://localhost:7842 and relays requests.
//
// Usage: npm run mcp  (or: tsx agent/mcp/server.ts)
// .mcp.json entry: { "command": "npm", "args": ["run", "mcp"] }

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import WebSocket from 'ws'
import { z } from 'zod'
import { MSG } from '../../shared/protocol.js'
import type { SelectionItem, ClassInfo } from '../../shared/protocol.js'

const WS_PORT = 7842
const WS_URL = `ws://localhost:${WS_PORT}`
const REQUEST_TIMEOUT_MS = 10_000
const NOT_FOUND_MSG =
  'Patchly agent not found — run `npx patchly` in your project first.'

// ─── WebSocket agent client ───────────────────────────────────────────────────

type Resolver = (msg: Record<string, unknown>) => void

class PatchlyAgentClient {
  private ws: WebSocket | null = null
  // Keyed by sessionId. Each request echoes its sessionId in the reply so we
  // can safely multiplex concurrent tool calls without type-matching races.
  private pending = new Map<string, Resolver>()
  private connectPromise: Promise<void> | null = null

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL)
      const timer = setTimeout(() => {
        ws.terminate()
        reject(new Error(NOT_FOUND_MSG))
      }, 5_000)

      ws.once('open', () => {
        clearTimeout(timer)
        this.ws = ws
        resolve()
      })

      ws.once('error', (err) => {
        clearTimeout(timer)
        reject(new Error(`${NOT_FOUND_MSG} (${err.message})`))
      })

      ws.on('message', (raw) => {
        let msg: Record<string, unknown>
        try { msg = JSON.parse(raw.toString()) } catch { return }

        const sid = msg.sessionId as string | undefined
        if (sid && this.pending.has(sid)) {
          const resolver = this.pending.get(sid)!
          this.pending.delete(sid)
          resolver(msg)
          return
        }

        // EDIT_ERROR without a matching sessionId: resolve all pending so
        // nothing hangs (e.g. agent crashed between request and response).
        if (msg.type === MSG.EDIT_ERROR) {
          for (const [key, res] of this.pending) {
            this.pending.delete(key)
            res(msg)
          }
        }
      })

      ws.on('close', () => {
        this.ws = null
        this.connectPromise = null
        // Reject any in-flight requests.
        for (const [key, res] of this.pending) {
          this.pending.delete(key)
          res({ type: 'DISCONNECTED', message: 'Patchly agent disconnected.' })
        }
      })
    })
    return this.connectPromise
  }

  /**
   * Send a message and await the reply that carries the same sessionId.
   * `payload` must include a `sessionId` field we can match on.
   */
  request(
    payload: Record<string, unknown> & { sessionId: string },
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to Patchly agent.'))
        return
      }
      const { sessionId } = payload
      const timer = setTimeout(() => {
        this.pending.delete(sessionId)
        reject(new Error(`Patchly agent timed out (session ${sessionId}).`))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(sessionId, (msg) => {
        clearTimeout(timer)
        resolve(msg)
      })

      this.ws.send(JSON.stringify(payload))
    })
  }

  close(): void {
    this.ws?.close()
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkSid(): string {
  return Math.random().toString(36).slice(2)
}

/** Parse "file:line:col" — handles Windows drive letters like "C:\…". */
function parsePatchlySrc(src: string): { file: string; line: number; column: number } | null {
  const parts = src.split(':')
  if (parts.length < 3) return null
  const column = parseInt(parts[parts.length - 1], 10)
  const line = parseInt(parts[parts.length - 2], 10)
  const file = parts.slice(0, parts.length - 2).join(':')
  if (isNaN(line) || isNaN(column)) return null
  return { file, line, column }
}

// ─── zod schemas for EditOperation (mirrors shared/operations.ts) ─────────────

const EditTargetSchema = z.object({
  file: z.string().describe('Relative path to the source file, e.g. "src/components/Hero.tsx"'),
  line: z.number().int().positive().describe('1-based line number'),
  column: z.number().int().nonnegative().describe('Column from data-patchly-src'),
  tagName: z.string().describe('Lowercase tag name, e.g. "button"'),
  componentName: z.string().optional(),
  identifyingAttrs: z.record(z.string(), z.string()).optional(),
  textSnippet: z.string().optional(),
})

const EditOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('setClassName'), target: EditTargetSchema, add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }),
  z.object({ op: z.literal('setAttribute'), target: EditTargetSchema, name: z.string(), value: z.string().nullable() }),
  z.object({ op: z.literal('setText'), target: EditTargetSchema, text: z.string() }),
  z.object({ op: z.literal('setInlineStyle'), target: EditTargetSchema, styles: z.record(z.string(), z.string()) }),
  z.object({ op: z.literal('wrapElement'), target: EditTargetSchema, wrapperTag: z.string(), wrapperClassName: z.string().optional() }),
  z.object({ op: z.literal('insertChild'), target: EditTargetSchema, position: z.union([z.literal('first'), z.literal('last'), z.number().int().nonnegative()]), jsx: z.string() }),
  z.object({ op: z.literal('replaceElement'), target: EditTargetSchema, jsx: z.string() }),
  z.object({ op: z.literal('removeElement'), target: EditTargetSchema }),
])

// ─── MCP server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'patchly', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

const agent = new PatchlyAgentClient()

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'patchly_current_selection',
      description:
        'Returns the element(s) the user currently has selected in the browser (via the Patchly Chrome extension). ' +
        'Includes the source file/line, tag name, and source-accurate className breakdown ' +
        '(classNameKind: static | dynamic | none, plus the class token list). ' +
        'Call this first before patchly_apply — you get everything you need to make an edit in one shot.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'patchly_inspect',
      description:
        'Reads the className of a specific element straight from source (not the live DOM). ' +
        'Useful for inspecting an element you know the patchlySrc for but have not selected. ' +
        'patchly_current_selection already runs inspect automatically for selected elements.',
      inputSchema: {
        type: 'object',
        properties: {
          patchlySrc: {
            type: 'string',
            description: 'The data-patchly-src pointer, format "file:line:col".',
          },
        },
        required: ['patchlySrc'],
      },
    },
    {
      name: 'patchly_apply',
      description:
        'Applies one EditOperation to the source file and hot-reloads the page via HMR. ' +
        'Always returns the unified diff of what changed. ' +
        'If operation.target is omitted, the current browser selection is used automatically — ' +
        'so after patchly_current_selection you can apply without repeating the target. ' +
        'Set dryRun:true to validate and preview the diff without writing to disk.',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'object',
            description:
              'An EditOperation. op must be one of: setClassName, setAttribute, setText, ' +
              'setInlineStyle, wrapElement, insertChild, replaceElement, removeElement. ' +
              'target (file/line/column/tagName) is optional — omit to use the current selection.',
          },
          dryRun: {
            type: 'boolean',
            description: 'Preview the diff without writing to disk.',
          },
        },
        required: ['operation'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    await agent.connect()
  } catch (err: unknown) {
    return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
  }

  // ── patchly_current_selection ─────────────────────────────────────────────
  if (name === 'patchly_current_selection') {
    // 1. Get the cached selection.
    const sid1 = mkSid()
    let selResponse: Record<string, unknown>
    try {
      selResponse = await agent.request({ type: MSG.GET_SELECTION, sessionId: sid1 })
    } catch (err: unknown) {
      return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
    }

    const selection = (selResponse.selection ?? []) as SelectionItem[]
    if (selection.length === 0) {
      return {
        content: [{ type: 'text', text: 'No element selected. Click an element in the browser with the Patchly extension active.' }],
      }
    }

    // 2. Auto-inspect all selected sources to get source-accurate class data.
    const sid2 = mkSid()
    let infoResponse: Record<string, unknown>
    try {
      infoResponse = await agent.request({
        type: MSG.INSPECT,
        sessionId: sid2,
        patchlySources: selection.map((s) => s.patchlySrc),
      })
    } catch {
      infoResponse = { elements: [] }
    }

    const classInfos = (infoResponse.elements ?? []) as ClassInfo[]
    const classInfoBySrc = new Map(classInfos.map((ci) => [ci.patchlySrc, ci]))

    const items = selection.map((s) => {
      const parsed = parsePatchlySrc(s.patchlySrc)
      const info = classInfoBySrc.get(s.patchlySrc)
      return {
        patchlySrc: s.patchlySrc,
        file: parsed?.file ?? s.patchlySrc,
        line: parsed?.line ?? null,
        column: parsed?.column ?? null,
        tag: s.tag,
        // Source-accurate class data (from AST, not DOM):
        classNameKind: info?.classNameKind ?? 'unknown',
        classes: info?.classes ?? s.classes.split(/\s+/).filter(Boolean),
        ...(info?.dynamicText ? { dynamicText: info.dynamicText } : {}),
      }
    })

    return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] }
  }

  // ── patchly_inspect ───────────────────────────────────────────────────────
  if (name === 'patchly_inspect') {
    const patchlySrc = (args as Record<string, unknown>)?.patchlySrc as string | undefined
    if (!patchlySrc) {
      return { content: [{ type: 'text', text: 'patchlySrc is required.' }], isError: true }
    }

    const sessionId = mkSid()
    let response: Record<string, unknown>
    try {
      response = await agent.request({ type: MSG.INSPECT, sessionId, patchlySources: [patchlySrc] })
    } catch (err: unknown) {
      return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
    }

    if (response.type === MSG.EDIT_ERROR) {
      return { content: [{ type: 'text', text: `Inspect failed: ${response.message}` }], isError: true }
    }
    return { content: [{ type: 'text', text: JSON.stringify(response.elements, null, 2) }] }
  }

  // ── patchly_apply ─────────────────────────────────────────────────────────
  if (name === 'patchly_apply') {
    const rawArgs = args as Record<string, unknown>
    const dryRun = rawArgs?.dryRun === true
    let rawOp = rawArgs?.operation as Record<string, unknown>

    if (!rawOp) {
      return { content: [{ type: 'text', text: 'operation is required.' }], isError: true }
    }

    // Auto-fill target from current selection if omitted.
    if (!rawOp.target) {
      const sid = mkSid()
      let selResponse: Record<string, unknown>
      try {
        selResponse = await agent.request({ type: MSG.GET_SELECTION, sessionId: sid })
      } catch (err: unknown) {
        return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
      }

      const selection = (selResponse.selection ?? []) as SelectionItem[]
      if (selection.length === 0) {
        return {
          content: [{ type: 'text', text: 'No element selected and no target provided. Select an element in the browser first.' }],
          isError: true,
        }
      }

      const sel = selection[0]
      const parsed = parsePatchlySrc(sel.patchlySrc)
      if (!parsed) {
        return { content: [{ type: 'text', text: `Could not parse patchlySrc: ${sel.patchlySrc}` }], isError: true }
      }
      rawOp = { ...rawOp, target: { file: parsed.file, line: parsed.line, column: parsed.column, tagName: sel.tag } }
    }

    const parsed = EditOperationSchema.safeParse(rawOp)
    if (!parsed.success) {
      return {
        content: [{ type: 'text', text: `Invalid operation: ${parsed.error.message}` }],
        isError: true,
      }
    }

    const sessionId = mkSid()
    let response: Record<string, unknown>
    try {
      response = await agent.request({
        type: MSG.APPLY_OPS,
        sessionId,
        operations: [parsed.data],
        explanation: `MCP: ${parsed.data.op}`,
        dryRun,
      })
    } catch (err: unknown) {
      return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
    }

    if (response.type === MSG.EDIT_ERROR) {
      return { content: [{ type: 'text', text: `Apply failed: ${response.message}` }], isError: true }
    }

    const diffBlock = response.diff
      ? `\n\n\`\`\`diff\n${response.diff}\n\`\`\``
      : ''

    if (dryRun) {
      return {
        content: [{ type: 'text', text: `Dry run — no changes written.${diffBlock || ' (no diff)'}` }],
      }
    }
    return {
      content: [{ type: 'text', text: `Applied \`${parsed.data.op}\` successfully.${diffBlock}` }],
    }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
})

// ─── Start ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('Patchly MCP server running on stdio\n')
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`)
  process.exit(1)
})
