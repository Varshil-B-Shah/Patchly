// extension/classPanel.ts
// Figma-style docked inspector sidebar for direct Tailwind class editing.
// No LLM in the loop; edits go through APPLY_OPS → applyEditOperations.
//
// Bundled into overlay.js by esbuild (imported by overlay.ts). The panel keeps
// its OWN per-target class model + undo/redo stack — the agent APPLY_OPS path is
// stateless and these edits never enter the AI "Patchly edits" history.

import { computeClassAdd, computeClassRemove, applyClassEdit } from '../shared/tailwindClasses.js'
import { searchClasses, defaultSuggestions } from '../shared/tailwindCatalog.js'
import type { ClassInfo, ThemeTokens } from '../shared/protocol.js'
import type { SetClassNameOp, EditTarget } from '../shared/operations.js'

// One selected element's live model.
interface TargetState {
  patchlySrc: string
  info: ClassInfo
  classes: string[]
}

// One undo/redo step: the before/after class list of each affected target.
type Step = { patchlySrc: string; before: string[]; after: string[] }[]

// A snapshot to restore if the in-flight op fails.
interface Pending {
  sessionId: string
  models: Map<string, string[]>
  undoStack: Step[]
  redoStack: Step[]
}

// ─── State ─────────────────────────────────────────────────────────────────────
let panelEl: HTMLDivElement | null = null
let targets: TargetState[] = []
let theme: ThemeTokens = { colors: [] }
let undoStack: Step[] = []
let redoStack: Step[] = []
let pending: Pending | null = null
let pendingSessionId = ''
let query = ''

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function newId(): string {
  return Math.random().toString(36).slice(2)
}
function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}
function bySrc(src: string): TargetState | undefined {
  return targets.find((t) => t.patchlySrc === src)
}
function isEditable(t: TargetState): boolean {
  return t.info.classNameKind === 'static' || t.info.classNameKind === 'none'
}
function editableTargets(): TargetState[] {
  return targets.filter(isEditable)
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

/** Create the docked sidebar container (once). Called from overlay init(). */
export function initClassPanel(): void {
  if (document.getElementById('patchly-class-panel')) return
  panelEl = document.createElement('div')
  panelEl.id = 'patchly-class-panel'
  panelEl.style.display = 'none'
  document.body.appendChild(panelEl)
  // Don't let clicks/drags inside the panel reach the selection canvas.
  panelEl.addEventListener('mousedown', (e) => e.stopPropagation())
}

/** Populate from inspected element(s) and show the docked sidebar. */
export function showClassPanel(elements: ClassInfo[], themeTokens: ThemeTokens): void {
  theme = themeTokens ?? { colors: [] }
  targets = elements.map((info) => ({
    patchlySrc: info.patchlySrc,
    info,
    classes: info.classNameKind === 'static' ? [...info.classes] : [],
  }))
  // New selection → fresh undo/redo (v1 scope: per-selection history).
  undoStack = []
  redoStack = []
  pending = null
  query = ''
  renderPanel()
  if (panelEl) panelEl.style.display = 'flex'
}

/** Hide and clear (cancel / switch to AI tab). */
export function hideClassPanel(): void {
  if (panelEl) panelEl.style.display = 'none'
  targets = []
  undoStack = []
  redoStack = []
  pending = null
}

/** content.ts: an APPLY_OPS for this session succeeded — drop the revert snapshot. */
export function classEditApplied(sessionId: string): void {
  if (pending && pending.sessionId === sessionId) pending = null
}

/** content.ts: an APPLY_OPS for this session failed — revert the optimistic step. */
export function classEditError(sessionId: string): void {
  if (!pending || pending.sessionId !== sessionId) return
  for (const t of targets) {
    const m = pending.models.get(t.patchlySrc)
    if (m) t.classes = m
  }
  undoStack = pending.undoStack
  redoStack = pending.redoStack
  pending = null
  renderPanel()
}

// ─── Dispatch (optimistic apply + send) ──────────────────────────────────────────

function buildTarget(info: ClassInfo): EditTarget {
  return { file: info.filePath, line: info.lineNumber, column: info.column, tagName: info.tagName }
}

interface Transition { src: string; from: string[]; to: string[] }

// Apply a set of transitions optimistically, snapshot for revert, and send ops.
// Returns false if nothing actually changed.
function dispatch(transitions: Transition[], explanation: string): boolean {
  const changed = transitions.filter((t) => !sameSet(t.from, t.to))
  if (!changed.length) return false

  // Snapshot BEFORE mutating, so a failure can restore models + stacks exactly.
  const sessionId = newId()
  pendingSessionId = sessionId
  pending = {
    sessionId,
    models: new Map(targets.map((t) => [t.patchlySrc, [...t.classes]])),
    undoStack: undoStack.map((s) => s.map((e) => ({ ...e }))),
    redoStack: redoStack.map((s) => s.map((e) => ({ ...e }))),
  }

  const ops: SetClassNameOp[] = []
  for (const tr of changed) {
    const t = bySrc(tr.src)
    if (!t) continue
    t.classes = tr.to
    ops.push({
      op: 'setClassName',
      target: buildTarget(t.info),
      add: tr.to.filter((c) => !tr.from.includes(c)),
      remove: tr.from.filter((c) => !tr.to.includes(c)),
    })
  }

  window.__patchlyApplyOps?.(ops as unknown as Record<string, unknown>[], explanation, sessionId)
  return true
}

// Build + commit a fresh edit (from the user) across all editable targets.
function commit(mutate: (classes: string[]) => { add: string[]; remove: string[] } | null, explanation: string): void {
  const transitions: Transition[] = editableTargets().map((t) => {
    const edit = mutate(t.classes)
    return { src: t.patchlySrc, from: [...t.classes], to: edit ? applyClassEdit(t.classes, edit) : [...t.classes] }
  })
  const step: Step = transitions
    .filter((t) => !sameSet(t.from, t.to))
    .map((t) => ({ patchlySrc: t.src, before: t.from, after: t.to }))
  if (!step.length) return
  if (dispatch(transitions, explanation)) {
    undoStack.push(step)
    redoStack = []
    renderPanel()
  }
}

function undo(): void {
  if (!undoStack.length) return
  const step = undoStack[undoStack.length - 1]
  const transitions: Transition[] = step.map((e) => ({
    src: e.patchlySrc,
    from: [...(bySrc(e.patchlySrc)?.classes ?? e.after)],
    to: e.before,
  }))
  if (dispatch(transitions, 'Undo class change')) {
    undoStack.pop()
    redoStack.push(step)
    renderPanel()
  }
}

function redo(): void {
  if (!redoStack.length) return
  const step = redoStack[redoStack.length - 1]
  const transitions: Transition[] = step.map((e) => ({
    src: e.patchlySrc,
    from: [...(bySrc(e.patchlySrc)?.classes ?? e.before)],
    to: e.after,
  }))
  if (dispatch(transitions, 'Redo class change')) {
    redoStack.pop()
    undoStack.push(step)
    renderPanel()
  }
}

// ─── Edit intents ────────────────────────────────────────────────────────────────

function addClass(cls: string): void {
  commit((classes) => computeClassAdd(classes, cls), `Add ${cls}`)
}
function removeClass(cls: string): void {
  commit((classes) => (classes.includes(cls) ? computeClassRemove(cls) : null), `Remove ${cls}`)
}
function toggleClass(cls: string): void {
  const ed = editableTargets()
  const onAll = ed.length > 0 && ed.every((t) => t.classes.includes(cls))
  if (onAll) removeClass(cls)
  else addClass(cls)
}

// ─── Render ────────────────────────────────────────────────────────────────────

interface ClassState { cls: string; count: number; total: number }

function unionClassStates(): ClassState[] {
  const ed = editableTargets()
  const total = ed.length
  const counts = new Map<string, number>()
  const order: string[] = []
  for (const t of ed) {
    for (const c of t.classes) {
      if (!counts.has(c)) order.push(c)
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
  }
  return order.map((cls) => ({ cls, count: counts.get(cls)!, total }))
}

function renderResults(): void {
  const box = panelEl?.querySelector('.patchly-cp-results')
  if (!box) return
  const list = query.trim() ? searchClasses(query, theme) : defaultSuggestions(theme)
  const onAll = (cls: string): boolean => {
    const ed = editableTargets()
    return ed.length > 0 && ed.every((t) => t.classes.includes(cls))
  }
  if (!list.length) {
    box.innerHTML = '<div class="patchly-cp-noresult">No matches</div>'
    return
  }
  box.innerHTML = list
    .map(
      (cls) =>
        `<button class="patchly-cp-result${onAll(cls) ? ' on' : ''}" data-cls="${esc(cls)}">` +
        `<span class="patchly-cp-result-name">${esc(cls)}</span>` +
        `<span class="patchly-cp-result-act">${onAll(cls) ? '✓' : '+'}</span></button>`,
    )
    .join('')
  box.querySelectorAll<HTMLButtonElement>('.patchly-cp-result').forEach((btn) => {
    btn.onclick = () => {
      const cls = btn.getAttribute('data-cls')!
      if (onAll(cls)) removeClass(cls)
      else addClass(cls)
    }
  })
}

function renderPanel(): void {
  if (!panelEl) return

  if (!targets.length) {
    panelEl.innerHTML = '<div class="patchly-cp-empty-panel">Select an element to inspect its classes.</div>'
    return
  }

  const dynamicTargets = targets.filter((t) => t.info.classNameKind === 'dynamic')
  const multi = targets.length > 1

  // Header label
  let headerHtml: string
  if (multi) {
    headerHtml = `<span class="patchly-cp-tag">${targets.length} elements</span>`
  } else {
    const info = targets[0].info
    const fileLabel = `${(info.filePath || '').split('/').pop()}:${info.lineNumber}`
    headerHtml =
      `<span class="patchly-cp-tag">&lt;${esc(info.tagName)}&gt;</span>` +
      `<span class="patchly-cp-loc">${esc(fileLabel)}</span>`
  }

  // Dynamic note
  const dynNote = dynamicTargets.length
    ? `<div class="patchly-cp-dynamic">🔒 ${dynamicTargets.length === targets.length ? 'Dynamic className' : `${dynamicTargets.length} element(s) have a dynamic className`} — edit those via the AI tab.</div>`
    : ''

  // Current classes
  const states = unionClassStates()
  let classListHtml: string
  if (!editableTargets().length) {
    classListHtml = ''
  } else if (!states.length) {
    classListHtml = '<div class="patchly-cp-empty">No classes yet — add some below.</div>'
  } else {
    classListHtml = states
      .map((s) => {
        const mixed = s.count < s.total
        const mark = mixed ? '–' : '✓'
        return (
          `<div class="patchly-cp-row" data-cls="${esc(s.cls)}">` +
          `<button class="patchly-cp-check${mixed ? ' mixed' : ' on'}" title="Toggle">${mark}</button>` +
          `<span class="patchly-cp-clsname">${esc(s.cls)}</span>` +
          (mixed ? `<span class="patchly-cp-mixed">${s.count}/${s.total}</span>` : '') +
          `<button class="patchly-cp-rm" title="Remove">×</button>` +
          `</div>`
        )
      })
      .join('')
  }

  const canEdit = editableTargets().length > 0

  panelEl.innerHTML = `
    <div class="patchly-cp-toolbar">
      <span class="patchly-cp-title">Inspector</span>
      <button class="patchly-cp-undo" title="Undo" ${undoStack.length ? '' : 'disabled'}>↶</button>
      <button class="patchly-cp-redo" title="Redo" ${redoStack.length ? '' : 'disabled'}>↷</button>
      <button class="patchly-cp-close" title="Close">×</button>
    </div>
    <div class="patchly-cp-header">${headerHtml}</div>
    ${dynNote}
    ${canEdit ? `
      <div class="patchly-cp-section-label">Classes</div>
      <div class="patchly-cp-classlist">${classListHtml}</div>
      <div class="patchly-cp-section-label">Add a class</div>
      <div class="patchly-cp-search">
        <span class="patchly-cp-search-icon">🔍</span>
        <input class="patchly-cp-search-input" type="text" placeholder="search e.g. items-center, hover:bg-…" autocomplete="off" />
      </div>
      <div class="patchly-cp-results"></div>
    ` : ''}
  `

  // Toolbar wiring
  ;(panelEl.querySelector('.patchly-cp-undo') as HTMLButtonElement | null)?.addEventListener('click', undo)
  ;(panelEl.querySelector('.patchly-cp-redo') as HTMLButtonElement | null)?.addEventListener('click', redo)
  ;(panelEl.querySelector('.patchly-cp-close') as HTMLButtonElement | null)?.addEventListener('click', () => {
    hideClassPanel()
    window.__patchlyClassPanelClosed?.()
  })

  // Class rows
  panelEl.querySelectorAll<HTMLElement>('.patchly-cp-row').forEach((row) => {
    const cls = row.getAttribute('data-cls')!
    ;(row.querySelector('.patchly-cp-check') as HTMLButtonElement).onclick = () => toggleClass(cls)
    ;(row.querySelector('.patchly-cp-rm') as HTMLButtonElement).onclick = () => removeClass(cls)
  })

  // Search
  if (canEdit) {
    const input = panelEl.querySelector<HTMLInputElement>('.patchly-cp-search-input')
    if (input) {
      input.value = query
      input.addEventListener('input', () => {
        query = input.value
        renderResults()
      })
      input.addEventListener('keydown', (e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          const first = query.trim() ? searchClasses(query, theme)[0] : ''
          const typed = query.trim()
          // Enter applies the typed class verbatim if it looks complete, else the top hit.
          const cls = typed && (typed.includes('-') || typed.includes(':')) ? typed : first
          if (cls) {
            query = ''
            addClass(cls)
          }
        }
      })
      input.addEventListener('mousedown', (e) => e.stopPropagation())
      if (query) input.focus()
    }
    renderResults()
  }
}
