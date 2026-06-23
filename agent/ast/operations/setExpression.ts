// agent/ast/operations/setExpression.ts
// Set a JSX attribute to an arbitrary JS expression, e.g.
//   disabled={loading || !hasPermission}
//   style={isActive ? { color: 'red' } : { color: 'gray' }}
//   className={cn('btn', { 'btn-active': isActive })}
// The expression string is the raw JS that goes INSIDE the braces.
// Validated via ts-morph before the file is mutated.

import { SyntaxKind, type JsxAttribute, type Project } from 'ts-morph'
import { getOpening, validateJsxSnippet } from './_util.js'
import type { JsxNode, OpResult } from '../types.js'
import type { SetExpressionOp } from '../../../shared/operations.js'

export function setExpression(
  node: JsxNode,
  op: SetExpressionOp,
  project?: Project,
): OpResult {
  const { attribute, expression } = op

  if (!expression.trim()) {
    return { ok: false, code: 'LLM_BAD_OUTPUT', message: '`expression` must not be empty.' }
  }

  if (!project) {
    return { ok: false, code: 'LLM_BAD_OUTPUT', message: 'setExpression requires a ts-morph Project instance.' }
  }

  if (!validateJsxSnippet(project, expression, 'element')) {
    return {
      ok: false,
      code: 'WOULD_BREAK_SYNTAX',
      message: `setExpression: not valid JavaScript: ${expression.slice(0, 120)}`,
    }
  }

  const opening = getOpening(node)
  const existing = opening.getAttribute(attribute)

  if (existing) {
    if (existing.getKind() !== SyntaxKind.JsxAttribute) {
      return {
        ok: false,
        code: 'UNSUPPORTED_TARGET',
        message: `Cannot replace spread attribute "${attribute}".`,
      }
    }
    ;(existing as JsxAttribute).setInitializer(`{${expression}}`)
  } else {
    opening.addAttribute({ name: attribute, initializer: `{${expression}}` })
  }

  return { ok: true }
}
