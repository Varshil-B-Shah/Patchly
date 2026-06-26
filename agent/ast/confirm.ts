// agent/ast/confirm.ts
// Drift guard: confirm a located node is still the SAME element described by an
// EditTarget fingerprint, with a fingerprint-based fallback search. Never guesses.
// Pure, read-only over a ts-morph source file.

import { SyntaxKind, type SourceFile } from 'ts-morph'
import { locateNode, getElementInfo } from './locate.js'
import type { JsxNode, NodeHandle } from './types.js'
import type { EditTarget } from '../../shared/operations.js'

const DRIFTED_MESSAGE = 'The element moved since selection — please re-select and try again.'

type ConfirmResult = { ok: true } | { ok: false; reason: string }

type ResolveResult =
  | { ok: true; node: JsxNode; handle: NodeHandle | null }
  | { ok: false; code: 'TARGET_DRIFTED'; message: string }

// Does this node match the target's fingerprint?
// Checks tagName, identifyingAttrs (if present), and textSnippet prefix (if present).
// `strict` = true (default) when used in the fingerprint fallback scan — all fields matter.
// `strict` = false when we already found the node by exact line:col — only tagName is
//   checked, because identifyingAttrs may reference dynamic/expression props (e.g. style={{}})
//   that getElementInfo can't see as string literals, and a stale textSnippet from the
//   rendered DOM vs the source AST can produce false mismatches.
export function confirmTarget(node: JsxNode, target: EditTarget, strict = true): ConfirmResult {
  const info = getElementInfo(node)

  if (info.tagName !== target.tagName) {
    return { ok: false, reason: `tag mismatch (found ${info.tagName}, expected ${target.tagName})` }
  }

  // Only enforce attr/text fingerprints during the fallback scan, not the direct
  // position hit — dynamic expression props (e.g. style={{}}) won't appear in
  // info.attrs, so checking them against the source AST produces false negatives.
  if (strict) {
    if (target.identifyingAttrs) {
      for (const [name, value] of Object.entries(target.identifyingAttrs)) {
        // Only reject if the attr IS present in the AST but with a different value.
        // Missing attrs (dynamic/expression props) are silently tolerated.
        if (name in info.attrs && info.attrs[name] !== value) {
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
  }

  return { ok: true }
}

// Fallback: scan all JSX elements and return the one matching the fingerprint —
// but ONLY when exactly one matches. Ambiguous or no match → null (never guess).
// Uses strict=true so all fingerprint fields are enforced during the scan.
export function findByFingerprint(sourceFile: SourceFile, target: EditTarget): JsxNode | null {
  const candidates: JsxNode[] = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ]

  const matches = candidates.filter((node) => confirmTarget(node, target, true).ok)
  return matches.length === 1 ? matches[0] : null
}

// Orchestrator: locate by line:column, confirm; fall back to fingerprint search.
// When the position hit succeeds, use strict=false — we trust the line:col and
// only verify tagName, avoiding false failures from expression-valued attrs or
// DOM-derived textSnippets that differ from AST source text.
export function resolveTarget(sourceFile: SourceFile, target: EditTarget): ResolveResult {
  const handle = locateNode(sourceFile, target.line, target.column)

  // Direct position hit: only verify tagName (non-strict). The line:col is
  // authoritative; dynamic attrs / expression props can't be read from the AST.
  if (handle && confirmTarget(handle.node, target, false).ok) {
    return { ok: true, node: handle.node, handle }
  }

  // Position miss (element moved / line shifted): fall back to fingerprint scan.
  const fallback = findByFingerprint(sourceFile, target)
  if (fallback) {
    return { ok: true, node: fallback, handle: null }
  }

  return { ok: false, code: 'TARGET_DRIFTED', message: DRIFTED_MESSAGE }
}
