// agent/mcp/server.ts
// Thin stdio MCP server that proxies to the already-running patchly agent.
// Does NOT re-implement any AST/editing logic — it connects as a WebSocket
// client to ws://localhost:7842 and relays requests.
//
// Usage: node dist/agent/mcp/server.js   (or: tsx agent/mcp/server.ts)
// Claude Code MCP config:
//   { "command": "npx", "args": ["patchly", "mcp"] }

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import WebSocket from 'ws'
import { z } from 'zod'
import { MSG } from '../../shared/protocol.js'
import type { SelectionItem } from '../../shared/protocol.js'

const WS_PORT = 7842
const WS_URL = `ws://localhost:${WS_PORT}`
const REQUEST_TIMEOUT_MS = 10_000

// ─── WebSocket agent client ───────────────────────────────────────────────────

type Resolver = (msg: Record<string, unknown>) => void

class PatchlyAgentClient {
  private ws: WebSocket | null = null
  private pending = new Map<string, Resolver>()
  private connectPromise: Promise<void> | null = null

  /** Open a WebSocket to the agent. Fails fast if the agent isn't running. */
  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL)
      const timer = setTimeout(() => {
        ws.terminate()
        reject(new Error('Patchly agent not found — run `npx patchly` in your project first.'))
      }, 5_000)

      ws.once('open', () => {
        clearTimeout(timer)
        this.ws = ws
        resolve()
      })

      ws.once('error', (err) => {
        clearTimeout(timer)
        reject(new Error(`Patchly agent not found — run \`npx patchly\` in your project first. (${err.message})`))
      })

      ws.on('message', (raw) => {
        let msg: Record<string, unknown>
        try { msg = JSON.parse(raw.toString()) } catch { return }
        // Resolve any pending request that matches this message type.
        const resolver = this.pending.get(msg.type as string)
        if (resolver) {
          this.pending.delete(msg.type as string)
          resolver(msg)
          return
        }
        // EDIT_ERROR can arrive in place of any expected reply — resolve all
        // pending requests so they don't hang, then let the caller interpret it.
        if (msg.type === MSG.EDIT_ERROR && this.pending.size > 0) {
          for (const [key, res] of this.pending) {
            this.pending.delete(key)
            res(msg)
          }
        }
      })

      ws.on('close', () => {
        this.ws = null
        this.connectPromise = null
      })
    })
    return this.connectPromise
  }

  /** Send a message and wait for a response with the given type. */
  request(payload: Record<string, unknown>, expectType: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to Patchly agent.'))
        return
      }
      const timer = setTimeout(() => {
        this.pending.delete(expectType)
        reject(new Error(`Patchly agent did not respond (timeout waiting for ${expectType}).`))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(expectType, (msg) => {
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

// ─── zod schemas for EditOperation (mirrors shared/operations.ts) ─────────────

const EditTargetSchema = z.object({
  file: z.string().describe('Relative path to the source file, e.g. "src/components/Hero.tsx"'),
  line: z.number().int().positive().describe('1-based line number from data-patchly-src'),
  column: z.number().int().nonnegative().describe('Column number from data-patchly-src'),
  tagName: z.string().describe('Lowercase tag name, e.g. "button"'),
  componentName: z.string().optional(),
  identifyingAttrs: z.record(z.string(), z.string()).optional(),
  textSnippet: z.string().optional(),
})

const SetClassNameOpSchema = z.object({
  op: z.literal('setClassName'),
  target: EditTargetSchema,
  add: z.array(z.string()).optional().describe('Class tokens to add'),
  remove: z.array(z.string()).optional().describe('Class tokens to remove'),
})

const SetAttributeOpSchema = z.object({
  op: z.literal('setAttribute'),
  target: EditTargetSchema,
  name: z.string(),
  value: z.string().nullable().describe('null to remove the attribute'),
})

const SetTextOpSchema = z.object({
  op: z.literal('setText'),
  target: EditTargetSchema,
  text: z.string(),
})

const SetInlineStyleOpSchema = z.object({
  op: z.literal('setInlineStyle'),
  target: EditTargetSchema,
  styles: z.record(z.string(), z.string()),
})

const WrapElementOpSchema = z.object({
  op: z.literal('wrapElement'),
  target: EditTargetSchema,
  wrapperTag: z.string(),
  wrapperClassName: z.string().optional(),
})

const InsertChildOpSchema = z.object({
  op: z.literal('insertChild'),
  target: EditTargetSchema,
  position: z.union([z.literal('first'), z.literal('last'), z.number().int().nonnegative()]),
  jsx: z.string(),
})

const ReplaceElementOpSchema = z.object({
  op: z.literal('replaceElement'),
  target: EditTargetSchema,
  jsx: z.string(),
})

const RemoveElementOpSchema = z.object({
  op: z.literal('removeElement'),
  target: EditTargetSchema,
})

const EditOperationSchema = z.discriminatedUnion('op', [
  SetClassNameOpSchema,
  SetAttributeOpSchema,
  SetTextOpSchema,
  SetInlineStyleOpSchema,
  WrapElementOpSchema,
  InsertChildOpSchema,
  ReplaceElementOpSchema,
  RemoveElementOpSchema,
])

// ─── Helper: parse patchlySrc "file:line:col" ────────────────────────────────

function parsePatchlySrc(src: string): { file: string; line: number; column: number } | null {
  // Format: "src/components/Hero.tsx:12:4"
  const parts = src.split(':')
  if (parts.length < 3) return null
  // On Windows paths may have a drive letter like "C:\…" — rejoin from the right.
  const column = parseInt(parts[parts.length - 1], 10)
  const line = parseInt(parts[parts.length - 2], 10)
  const file = parts.slice(0, parts.length - 2).join(':')
  if (isNaN(line) || isNaN(column)) return null
  return { file, line, column }
}

// ─── MCP server setup ─────────────────────────────────────────────────────────

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
        'Returns the element(s) the user currently has selected in the browser via the Patchly extension. ' +
        'Use this to find out what the user is pointing at before inspecting or editing.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'patchly_inspect',
      description:
        'Reads the className attribute of an element straight from source (no DOM). ' +
        'Returns whether it is static/dynamic/none and the current class tokens. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          patchlySrc: {
            type: 'string',
            description: 'The data-patchly-src pointer, e.g. "src/components/Hero.tsx:12:4". ' +
              'Use patchly_current_selection to get this value.',
          },
        },
        required: ['patchlySrc'],
      },
    },
    {
      name: 'patchly_apply',
      description:
        'Applies one EditOperation to the source file and triggers HMR. ' +
        'If operation.target is omitted, the current selection is used automatically. ' +
        'Set dryRun:true to validate and return a unified diff without writing.',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'object',
            description:
              'An EditOperation from shared/operations.ts. ' +
              'Supported ops: setClassName, setAttribute, setText, setInlineStyle, ' +
              'wrapElement, insertChild, replaceElement, removeElement. ' +
              'target is optional — omit it to use the current browser selection.',
          },
          dryRun: {
            type: 'boolean',
            description: 'When true, return the unified diff without writing to disk.',
          },
        },
        required: ['operation'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  // Ensure the agent WS is open. Every tool call re-uses the same connection.
  try {
    await agent.connect()
  } catch (err: unknown) {
    return {
      content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }],
      isError: true,
    }
  }

  // ── patchly_current_selection ─────────────────────────────────────────────
  if (name === 'patchly_current_selection') {
    let response: Record<string, unknown>
    try {
      response = await agent.request({ type: MSG.GET_SELECTION }, MSG.SELECTION)
    } catch (err: unknown) {
      return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
    }

    const selection = (response.selection ?? []) as SelectionItem[]
    if (selection.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No element selected. Click an element in the browser with the Patchly extension active.',
        }],
      }
    }

    const items = selection.map((s) => {
      const parsed = parsePatchlySrc(s.patchlySrc)
      return {
        patchlySrc: s.patchlySrc,
        file: parsed?.file ?? s.patchlySrc,
        line: parsed?.line ?? null,
        column: parsed?.column ?? null,
        tag: s.tag,
        classes: s.classes,
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

    const sessionId = Math.random().toString(36).slice(2)
    let response: Record<string, unknown>
    try {
      response = await agent.request(
        { type: MSG.INSPECT, sessionId, patchlySources: [patchlySrc] },
        MSG.ELEMENT_INFO,
      )
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

    // If target is omitted, default to the current selection (single element).
    if (!rawOp.target) {
      let selResponse: Record<string, unknown>
      try {
        selResponse = await agent.request({ type: MSG.GET_SELECTION }, MSG.SELECTION)
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

    // Validate the operation with zod.
    const parsed = EditOperationSchema.safeParse(rawOp)
    if (!parsed.success) {
      return {
        content: [{ type: 'text', text: `Invalid operation: ${parsed.error.message}` }],
        isError: true,
      }
    }

    const sessionId = Math.random().toString(36).slice(2)
    let response: Record<string, unknown>
    try {
      response = await agent.request(
        {
          type: MSG.APPLY_OPS,
          sessionId,
          operations: [parsed.data],
          explanation: `MCP apply: ${parsed.data.op}`,
          dryRun,
        },
        MSG.OPS_APPLIED,
      )
    } catch (err: unknown) {
      return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
    }

    if (response.type === MSG.EDIT_ERROR) {
      return { content: [{ type: 'text', text: `Apply failed: ${response.message}` }], isError: true }
    }

    if (dryRun) {
      return {
        content: [{
          type: 'text',
          text: response.diff ? `Dry run diff:\n\`\`\`diff\n${response.diff}\n\`\`\`` : 'No changes would be made.',
        }],
      }
    }

    return { content: [{ type: 'text', text: `Applied ${parsed.data.op} successfully.` }] }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
})

// ─── Start ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stderr only — stdout is the MCP wire protocol
  process.stderr.write('Patchly MCP server running on stdio\n')
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`)
  process.exit(1)
})
