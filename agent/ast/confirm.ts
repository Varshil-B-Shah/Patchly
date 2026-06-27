import { SyntaxKind, type SourceFile } from 'ts-morph'
import { locateNode, getElementInfo } from './locate.js'
import type { JsxNode, NodeHandle } from './types.js'
import type { EditTarget } from '../../shared/operations.js'

const DRIFTED_MESSAGE = 'The element moved since selection — please re-select and try again.'

type ConfirmResult = { ok: true } | { ok: false; reason: string }

type ResolveResult =
  | { ok: true; node: JsxNode; handle: NodeHandle | null }
  | { ok: false; code: 'TARGET_DRIFTED'; message: string }

export function confirmTarget(node: JsxNode, target: EditTarget, strict = true): ConfirmResult {
  const info = getElementInfo(node)

  if (info.tagName !== target.tagName) {
    return { ok: false, reason: `tag mismatch (found ${info.tagName}, expected ${target.tagName})` }
  }

  if (strict) {
    if (target.identifyingAttrs) {
      for (const [name, value] of Object.entries(target.identifyingAttrs)) {
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

export function findByFingerprint(sourceFile: SourceFile, target: EditTarget): JsxNode | null {
  const candidates: JsxNode[] = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ]

  const matches = candidates.filter((node) => confirmTarget(node, target, true).ok)
  return matches.length === 1 ? matches[0] : null
}

export function resolveTarget(sourceFile: SourceFile, target: EditTarget): ResolveResult {
  const handle = locateNode(sourceFile, target.line, target.column)

  if (handle && confirmTarget(handle.node, target, false).ok) {
    return { ok: true, node: handle.node, handle }
  }

  const fallback = findByFingerprint(sourceFile, target)
  if (fallback) {
    return { ok: true, node: fallback, handle: null }
  }

  return { ok: false, code: 'TARGET_DRIFTED', message: DRIFTED_MESSAGE }
}
