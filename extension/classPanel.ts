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
// Per-section search queries. Key is 'all' (apply-to-all bar) or 'el<i>' (element i).
let queries: Record<string, string> = {}
const scopeToSrc = new Map<string, string>()

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
  queries = {}
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

export function canUndo(): boolean {
  return undoStack.length > 0
}
export function canRedo(): boolean {
  return redoStack.length > 0
}

export function undo(): void {
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

export function redo(): void {
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

// Apply-to-all (every editable target).
function addClassAll(cls: string): void {
  commit((classes) => computeClassAdd(classes, cls), `Add ${cls} to all`)
}
function removeClassAll(cls: string): void {
  commit((classes) => (classes.includes(cls) ? computeClassRemove(cls) : null), `Remove ${cls} from all`)
}

// Per-element (one target). Reuses dispatch so undo/redo + revert work unchanged.
function commitOne(src: string, mutate: (classes: string[]) => { add: string[]; remove: string[] } | null, explanation: string): void {
  const t = bySrc(src)
  if (!t || !isEditable(t)) return
  const edit = mutate(t.classes)
  const to = edit ? applyClassEdit(t.classes, edit) : [...t.classes]
  const from = [...t.classes]
  if (sameSet(from, to)) return
  const step: Step = [{ patchlySrc: src, before: from, after: to }]
  if (dispatch([{ src, from, to }], explanation)) {
    undoStack.push(step)
    redoStack = []
    renderPanel()
  }
}
function addClassOne(src: string, cls: string): void {
  commitOne(src, (classes) => computeClassAdd(classes, cls), `Add ${cls}`)
}
function removeClassOne(src: string, cls: string): void {
  commitOne(src, (classes) => (classes.includes(cls) ? computeClassRemove(cls) : null), `Remove ${cls}`)
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

function classExistsAll(cls: string): boolean {
  const ed = editableTargets()
  return ed.length > 0 && ed.every((t) => t.classes.includes(cls))
}

// Render the search-results list for one scope ('all' or 'el<i>').
function renderResultsFor(scope: string): void {
  const box = panelEl?.querySelector(`.patchly-cp-results[data-scope="${scope}"]`) as HTMLElement | null
  if (!box) return
  const q = queries[scope] ?? ''
  const list = q.trim() ? searchClasses(q, theme) : defaultSuggestions(theme)
  const src = scopeToSrc.get(scope)
  const has = (cls: string): boolean => (scope === 'all' ? classExistsAll(cls) : !!bySrc(src ?? '')?.classes.includes(cls))

  if (!list.length) {
    box.innerHTML = '<div class="patchly-cp-noresult">No matches</div>'
    return
  }
  box.innerHTML = list
    .map(
      (cls) =>
        `<button class="patchly-cp-result${has(cls) ? ' on' : ''}" data-cls="${esc(cls)}">` +
        `<span class="patchly-cp-result-name">${esc(cls)}</span>` +
        `<span class="patchly-cp-result-act">${has(cls) ? '✓' : '+'}</span></button>`,
    )
    .join('')
  box.querySelectorAll<HTMLButtonElement>('.patchly-cp-result').forEach((btn) => {
    btn.onclick = () => {
      const cls = btn.getAttribute('data-cls')!
      if (scope === 'all') has(cls) ? removeClassAll(cls) : addClassAll(cls)
      else if (src) has(cls) ? removeClassOne(src, cls) : addClassOne(src, cls)
    }
  })
}

// HTML for a search box + results container for a scope.
function searchHtml(scope: string): string {
  return (
    `<div class="patchly-cp-search">` +
    `<span class="patchly-cp-search-icon">🔍</span>` +
    `<input class="patchly-cp-search-input" data-scope="${scope}" type="text" placeholder="search e.g. items-center, hover:bg-…" autocomplete="off" />` +
    `</div>` +
    `<div class="patchly-cp-results" data-scope="${scope}"></div>`
  )
}

// HTML for a class row (devtools-style). `mixed` only applies to the apply-all union.
function classRowHtml(cls: string, scope: string, mixed = false, count = 0, total = 0): string {
  const mark = mixed ? '–' : '✓'
  return (
    `<div class="patchly-cp-row" data-scope="${scope}" data-cls="${esc(cls)}">` +
    `<button class="patchly-cp-check${mixed ? ' mixed' : ' on'}" title="Toggle">${mark}</button>` +
    `<span class="patchly-cp-clsname">${esc(cls)}</span>` +
    (mixed ? `<span class="patchly-cp-mixed">${count}/${total}</span>` : '') +
    `<button class="patchly-cp-rm" title="Remove">×</button>` +
    `</div>`
  )
}

function renderPanel(): void {
  // renderPanel runs after every stack-changing action — let the toolbar refresh.
  window.__patchlyHistoryChanged?.()
  if (!panelEl) return
  scopeToSrc.clear()

  if (!targets.length) {
    panelEl.innerHTML = '<div class="patchly-cp-empty-panel">Select an element to inspect its classes.</div>'
    return
  }

  // Block editing if Tailwind isn't in the project — classes would be written to
  // source but have no visual effect, which is confusing.
  if (window.__patchlyGetTailwindConfigured?.() === false) {
    panelEl.innerHTML = `
      <div class="patchly-cp-toolbar">
        <span class="patchly-cp-title">Inspector</span>
        <button class="patchly-cp-close" title="Close">×</button>
      </div>
      <div style="padding:16px;font-size:13px;color:#f59e0b;line-height:1.5;">
        ⚠ Tailwind CSS is not detected in this project.<br/>
        <span style="color:#a0a0c0;font-size:12px;">Install Tailwind and re-run the agent to enable class editing.</span>
      </div>
    `
    ;(panelEl.querySelector('.patchly-cp-close') as HTMLButtonElement | null)?.addEventListener('click', () => {
      window.__patchlyClassPanelClosed?.()
    })
    return
  }

  const editable = editableTargets()
  const multi = targets.length > 1
  const showApplyAll = editable.length > 1
  const titleText = multi ? `${targets.length} elements` : 'Inspector'

  // Apply-to-all bar (multi-select only)
  let applyAllHtml = ''
  if (showApplyAll) {
    const states = unionClassStates()
    const rows = states.length
      ? states.map((s) => classRowHtml(s.cls, 'all', s.count < s.total, s.count, s.total)).join('')
      : '<div class="patchly-cp-empty">No shared classes.</div>'
    applyAllHtml = `
      <div class="patchly-cp-section patchly-cp-all">
        <div class="patchly-cp-section-label">Apply to all ${editable.length} selected</div>
        <div class="patchly-cp-classlist">${rows}</div>
        ${searchHtml('all')}
      </div>`
  }

  // Per-element sections
  const sections = targets
    .map((t, i) => {
      const info = t.info
      const fileLabel = `${(info.filePath || '').split('/').pop()}:${info.lineNumber}`
      const head =
        `<div class="patchly-cp-sec-head">` +
        `<span class="patchly-cp-tag">&lt;${esc(info.tagName)}&gt;</span>` +
        `<span class="patchly-cp-loc">${esc(fileLabel)}</span></div>`

      if (info.classNameKind === 'dynamic') {
        return `<div class="patchly-cp-section">${head}` +
          `<div class="patchly-cp-dynamic">🔒 ${esc(info.dynamicText ?? 'Dynamic className')} — edit via the AI mode.</div></div>`
      }

      const scope = `el${i}`
      scopeToSrc.set(scope, t.patchlySrc)
      const rows = t.classes.length
        ? t.classes.map((cls) => classRowHtml(cls, scope)).join('')
        : '<div class="patchly-cp-empty">No classes yet — add below.</div>'
      return `<div class="patchly-cp-section" data-scope="${scope}">${head}` +
        `<div class="patchly-cp-classlist">${rows}</div>${searchHtml(scope)}</div>`
    })
    .join('')

  panelEl.innerHTML = `
    <div class="patchly-cp-toolbar">
      <span class="patchly-cp-title">${esc(titleText)}</span>
      <button class="patchly-cp-close" title="Close">×</button>
    </div>
    <div class="patchly-cp-body">
      ${applyAllHtml}
      ${sections}
    </div>
  `

  // Close
  ;(panelEl.querySelector('.patchly-cp-close') as HTMLButtonElement | null)?.addEventListener('click', () => {
    hideClassPanel()
    window.__patchlyClassPanelClosed?.()
  })

  // Class rows (scope-aware)
  panelEl.querySelectorAll<HTMLElement>('.patchly-cp-row').forEach((row) => {
    const cls = row.getAttribute('data-cls')!
    const scope = row.getAttribute('data-scope')!
    const src = scopeToSrc.get(scope)
    const removeFn = (): void => {
      if (scope === 'all') removeClassAll(cls)
      else if (src) removeClassOne(src, cls)
    }
    ;(row.querySelector('.patchly-cp-check') as HTMLButtonElement).onclick = removeFn
    ;(row.querySelector('.patchly-cp-rm') as HTMLButtonElement).onclick = removeFn
  })

  // Search inputs (scope-aware)
  panelEl.querySelectorAll<HTMLInputElement>('.patchly-cp-search-input').forEach((input) => {
    const scope = input.getAttribute('data-scope')!
    input.value = queries[scope] ?? ''
    input.addEventListener('input', () => {
      queries[scope] = input.value
      renderResultsFor(scope)
    })
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        const q = (queries[scope] ?? '').trim()
        const cls = q && (q.includes('-') || q.includes(':')) ? q : (q ? searchClasses(q, theme)[0] : '')
        if (!cls) return
        queries[scope] = ''
        if (scope === 'all') addClassAll(cls)
        else { const src = scopeToSrc.get(scope); if (src) addClassOne(src, cls) }
      }
    })
    input.addEventListener('mousedown', (e) => e.stopPropagation())
    renderResultsFor(scope)
  })

  // Per-element section hover → highlight the corresponding DOM element
  panelEl.querySelectorAll<HTMLElement>('.patchly-cp-section[data-scope]').forEach((section) => {
    const scope = section.getAttribute('data-scope')!
    const src = scopeToSrc.get(scope)
    if (!src) return
    section.addEventListener('mouseenter', () => window.__patchlyHoverBySrc?.(src))
    section.addEventListener('mouseleave', () => window.__patchlyHoverBySrc?.(null))
  })
}
