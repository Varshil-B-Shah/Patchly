// agent/ast/confirm.js
// Drift guard: confirm a located node is still the SAME element described by an
// EditTarget fingerprint, with a fingerprint-based fallback search. Never guesses.
// Pure, read-only over a ts-morph source file.

import { SyntaxKind } from 'ts-morph'
import { locateNode, getElementInfo } from './locate.js'

const DRIFTED_MESSAGE = 'The element moved since selection — please re-select and try again.'

// Does this node match the target's fingerprint?
// Checks tagName, identifyingAttrs (if present), and textSnippet prefix (if present).
// Returns { ok: boolean, reason?: string }.
export function confirmTarget(node, target) {
  const info = getElementInfo(node)

  if (info.tagName !== target.tagName) {
    return { ok: false, reason: `tag mismatch (found ${info.tagName}, expected ${target.tagName})` }
  }

  if (target.identifyingAttrs) {
    for (const [name, value] of Object.entries(target.identifyingAttrs)) {
      if (info.attrs[name] !== value) {
        return { ok: false, reason: `attribute ${name} mismatch` }
      }
    }
  }

  if (target.textSnippet) {
    const want = target.textSnippet.trim()
    if (!info.textSnippet.startsWith(want) && !want.startsWith(info.textSnippet)) {
      return { ok: false, reason: 'text content mismatch' }
    }
  }

  return { ok: true }
}

// Fallback: scan all JSX elements and return the one matching the fingerprint —
// but ONLY when exactly one matches. Ambiguous or no match → null (never guess).
export function findByFingerprint(sourceFile, target) {
  const candidates = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ]

  const matches = candidates.filter((node) => confirmTarget(node, target).ok)
  return matches.length === 1 ? matches[0] : null
}

// Orchestrator: locate by line:column, confirm; fall back to fingerprint search.
// Returns { ok: true, node, handle } or { ok: false, code: 'TARGET_DRIFTED', message }.
export function resolveTarget(sourceFile, target) {
  const handle = locateNode(sourceFile, target.line, target.column)

  if (handle && confirmTarget(handle.node, target).ok) {
    return { ok: true, node: handle.node, handle }
  }

  const fallback = findByFingerprint(sourceFile, target)
  if (fallback) {
    return { ok: true, node: fallback, handle: null }
  }

  return { ok: false, code: 'TARGET_DRIFTED', message: DRIFTED_MESSAGE }
}
