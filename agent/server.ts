import { WebSocketServer, WebSocket } from 'ws'
import { MSG } from '../shared/protocol.js'
import type { BatchEditEntry, ThemeTokens, ClassInfo, SelectionItem } from '../shared/protocol.js'
import { CommentStore, type CommentStoreInterface } from './comments/store.js'
import { CloudCommentClient } from './comments/cloudClient.js'
import type { EditOperation } from '../shared/operations.js'
import { resolveSource, type ResolvedSource } from './sourceMapper.js'
import { getEditInstruction, getBatchEditInstruction, type BatchItem } from './llm.js'
import { undoEdit } from './fileEditor.js'
import { applyEditOperations } from './ast/applyEdit.js'
import { inspectElement } from './ast/inspect.js'
import { loadThemeTokens, isTailwindConfigured } from './contextBuilder.js'
import type { ResolvedConfig } from './config.js'

const STRUCTURAL_OPS = new Set(['wrapElement', 'insertChild', 'replaceElement', 'removeElement'])

let cachedTheme: ThemeTokens | null = null
let cachedTailwindConfigured: boolean | null = null

let latestSelection: SelectionItem[] = []
let latestSelectionId = ''

const recentSelections = new Map<string, SelectionItem[]>()
const MAX_RECENT_SELECTIONS = 10

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

const pendingEdits = new Map<string, PendingEdit>() 

const editHistory = new Map<string, EditHistoryEntry>()

export async function startServer(port: number, config: ResolvedConfig): Promise<WebSocketServer> {
  const wss = new WebSocketServer({ port })

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => { wss.off('listening', onListening); reject(err) }
    const onListening = () => { wss.off('error', onError); resolve() }
    wss.once('error', onError)
    wss.once('listening', onListening)
  })

  const extensionClients = new Set<import('ws').WebSocket>()
  const screenshotCallbacks = new Map<string, import('ws').WebSocket>() // sessionId → requesting ws

  const cloudUrl = process.env.PATCHLY_CLOUD_API_URL
  const cloudDevToken = process.env.PATCHLY_DEV_TOKEN
  const cloudProjectId = process.env.PATCHLY_PROJECT_ID

  let currentMemberIdentity: { name: string; image?: string } | null = null

  const commentStore: CommentStoreInterface = (cloudUrl && cloudDevToken && cloudProjectId)
    ? new CloudCommentClient(cloudUrl, cloudDevToken, cloudProjectId)
    : new CommentStore(config.projectRoot)

  console.log(cloudUrl
    ? `Comment store: cloud (${cloudUrl}, project ${cloudProjectId})`
    : `Comment store: local (.patchly/comments.json)`,
  )

  function broadcast(msg: object): void {
    const payload = JSON.stringify(msg)
    for (const client of extensionClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload)
      }
    }
  }

  wss.on('connection', (ws) => {
    console.log('Client connected')

    if (!cachedTheme) cachedTheme = loadThemeTokens(config.projectRoot)
    if (cachedTailwindConfigured === null) cachedTailwindConfigured = isTailwindConfigured(config.projectRoot)

    ws.send(JSON.stringify({
      type: MSG.STATUS,
      connected: true,
      projectRoot: config.projectRoot,
      theme: cachedTheme,
      tailwindConfigured: cachedTailwindConfigured,
      cloudApiUrl: cloudUrl ?? null,
      cloudProjectId: cloudProjectId ?? null,
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
        extensionClients.add(ws)
        ws.send(JSON.stringify({ type: MSG.PONG }))
      }

      if (msg.type === MSG.SELECTION_UPDATE) {
        latestSelectionId = Math.random().toString(36).slice(2)
        latestSelection = Array.isArray(msg.selection) ? (msg.selection as SelectionItem[]) : []
        recentSelections.set(latestSelectionId, latestSelection)
        if (recentSelections.size > MAX_RECENT_SELECTIONS) {
          recentSelections.delete(recentSelections.keys().next().value as string) // evict oldest
        }
        return
      }

      if (msg.type === MSG.GET_SELECTION) {
        const { sessionId, selectionId } = msg as { sessionId: string; selectionId?: string }
        if (selectionId) {
          const pinned = recentSelections.get(selectionId)
          if (pinned) {
            ws.send(JSON.stringify({ type: MSG.SELECTION, sessionId, selectionId, selection: pinned }))
          } else {
            ws.send(JSON.stringify({ type: MSG.SELECTION, sessionId, selectionId, selection: [], stale: true }))
          }
          return
        }
        ws.send(JSON.stringify({ type: MSG.SELECTION, sessionId, selectionId: latestSelectionId, selection: latestSelection }))
        return
      }

      if (msg.type === MSG.SCREENSHOT_REQUEST) {
        const { sessionId, patchlySrc } = msg as { sessionId: string; patchlySrc?: string }
        if (extensionClients.size === 0) {
          ws.send(JSON.stringify({ type: MSG.SCREENSHOT_RESULT, sessionId, screenshot: null }))
          return
        }
        screenshotCallbacks.set(sessionId, ws)
        for (const extWs of extensionClients) {
          extWs.send(JSON.stringify({ type: MSG.SCREENSHOT_REQUEST, sessionId, patchlySrc }))
        }
        return
      }

      if (msg.type === MSG.SCREENSHOT_RESULT) {
        const { sessionId, screenshot } = msg as { sessionId: string; screenshot: string | null }
        const requester = screenshotCallbacks.get(sessionId)
        screenshotCallbacks.delete(sessionId)
        if (requester && requester.readyState === WebSocket.OPEN) {
          requester.send(JSON.stringify({ type: MSG.SCREENSHOT_RESULT, sessionId, screenshot }))
        }
        return
      }

      if (msg.type === MSG.EDIT_REQUEST) {
        const { patchlySrc, elementHtml, elementClasses, prompt, sessionId, screenshot_base64, targets } = msg

        if (Array.isArray(targets) && targets.length > 1) {
          const sendProgress = (stage: string, text?: string) =>
            ws.send(JSON.stringify({ type: MSG.PROGRESS, sessionId, stage, ...(text ? { text } : {}) }))

          console.log(`Batch edit request: "${prompt}" on ${targets.length} targets`)
          sendProgress('analyzing')

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
              edits.push({ ok: false, filePath: relativePath, code: llm.code, message: 'message' in llm ? llm.message : undefined })
              continue
            }

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

        const allowedFiles = new Set(llmResult.allowedFiles ?? [sourceResult.relativePath])
        const operations = llmResult.operations.map((op) => {
          const file = allowedFiles.has(op.target.file) ? op.target.file : sourceResult.relativePath
          const isCrossFile = file !== sourceResult.relativePath
          return {
            ...op,
            target: {
              ...op.target,
              file,
              line: isCrossFile ? -1 : op.target.line,
              column: isCrossFile ? -1 : op.target.column,
            },
          } as EditOperation
        })

        sendProgress('building')

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

        if (elements.length === 0) {
          const err = lastError ?? { code: 'NO_SOURCE_ATTR', message: 'Nothing to inspect.' }
          ws.send(JSON.stringify({ type: MSG.EDIT_ERROR, sessionId, code: err.code, message: err.message }))
          return
        }

        ws.send(JSON.stringify({ type: MSG.ELEMENT_INFO, sessionId, elements }))
        return
      }

      if (msg.type === MSG.APPLY_OPS) {
        const { sessionId, operations, dryRun, confirmed } = msg as { sessionId: string; operations: EditOperation[]; explanation: string; dryRun?: boolean; confirmed?: boolean }

        if (!Array.isArray(operations) || operations.length === 0) {
          ws.send(JSON.stringify({ type: MSG.EDIT_ERROR, sessionId, code: 'NO_OPERATIONS', message: 'No operations provided.' }))
          return
        }

        const hasStructural = operations.some((op) => STRUCTURAL_OPS.has(op.op))
        const forcedDryRun = hasStructural && !dryRun && !confirmed
        const effectiveDryRun = !!dryRun || forcedDryRun

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

        let combinedDiff = ''
        for (const fileOps of opsByFile.values()) {
          const editResult = await applyEditOperations({ projectRoot: config.projectRoot, operations: fileOps, dryRun: effectiveDryRun })
          if (!editResult.ok) {
            ws.send(JSON.stringify({ type: MSG.EDIT_ERROR, sessionId, code: editResult.code, message: editResult.message }))
            return
          }
          combinedDiff += editResult.diff
        }

        ws.send(JSON.stringify({
          type: MSG.OPS_APPLIED,
          sessionId,
          ok: true,
          diff: combinedDiff,
          ...(forcedDryRun ? { requiresConfirmation: true } : {}),
        }))
        return
      }

      if (msg.type === MSG.UNDO) {
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

      // Comment system
      if (msg.type === MSG.ADD_COMMENT) {
        try {
          const comment = await commentStore.add(msg.comment)
          broadcast({ type: MSG.COMMENT_ADDED, comment })
        } catch (err) {
          console.error('ADD_COMMENT cloud error:', err instanceof Error ? err.message : err)
        }
        return
      }

      if (msg.type === MSG.LIST_COMMENTS) {
        const { sessionId, status } = msg as { sessionId: string; status?: 'open' | 'resolved' | 'all' }
        try {
          const comments = await commentStore.list(status)
          ws.send(JSON.stringify({ type: MSG.COMMENTS, sessionId, comments }))
        } catch (err) {
          console.error('LIST_COMMENTS cloud error:', err instanceof Error ? err.message : err)
          ws.send(JSON.stringify({ type: MSG.COMMENTS, sessionId, comments: [] }))
        }
        return
      }

      if (msg.type === MSG.RESOLVE_COMMENT) {
        const { sessionId, id, resolvedBy } = msg as { sessionId?: string; id: string; resolvedBy?: 'dev' | 'agent' }
        try {
          const comment = await commentStore.resolve(id, resolvedBy ?? 'dev')
          if (!comment) return
          broadcast({ type: MSG.COMMENT_RESOLVED, id, comment })
          if (sessionId && !extensionClients.has(ws)) ws.send(JSON.stringify({ type: MSG.COMMENT_RESOLVED, sessionId, id, comment }))
        } catch (err) {
          console.error('RESOLVE_COMMENT cloud error:', err instanceof Error ? err.message : err)
        }
        return
      }

      if (msg.type === MSG.DELETE_COMMENT) {
        const { id } = msg as { id: string }
        try {
          if (!await commentStore.delete(id)) return
          broadcast({ type: MSG.COMMENT_DELETED, id })
        } catch (err) {
          console.error('DELETE_COMMENT cloud error:', err instanceof Error ? err.message : err)
        }
        return
      }

      if (msg.type === MSG.CLEAR_COMMENTS) {
        const { sessionId } = msg as { sessionId?: string }
        try {
          const count = await commentStore.clearResolved()
          broadcast({ type: MSG.COMMENTS_CLEARED, count })
          if (sessionId && !extensionClients.has(ws)) {
            ws.send(JSON.stringify({ type: MSG.COMMENTS_CLEARED, sessionId, count }))
          }
        } catch (err) {
          console.error('CLEAR_COMMENTS cloud error:', err instanceof Error ? err.message : err)
        }
        return
      }

      if (msg.type === 'PATCHLY_SET_IDENTITY') {
        const { token, identity } = msg as { token: string | null; identity?: { name: string; image?: string } | null }
        if (commentStore instanceof CloudCommentClient) {
          commentStore.setMemberToken(token ?? null)
        }
        currentMemberIdentity = token && identity ? identity : null
        return
      }

      if (msg.type === MSG.ADD_REPLY) {
        const { commentId, note } = msg as { commentId: string; note: string }
        try {
          const authorDisplayName = currentMemberIdentity?.name ?? 'Dev'
          const authorAvatar = currentMemberIdentity?.image
          const updated = await commentStore.addReply(commentId, { note, authorDisplayName, authorAvatar })
          if (updated) broadcast({ type: MSG.REPLY_ADDED, comment: updated })
        } catch (err) {
          console.error('ADD_REPLY error:', err instanceof Error ? err.message : err)
        }
        return
      }
    })

    ws.on('close', () => {
      extensionClients.delete(ws)
      console.log('Client disconnected')
    })
  })

  return wss
}
