// agent/ast/operations/setInlineStyle.ts
// Merge keys into the style={{ ... }} object literal (create it if absent).
// This is the operation the future drag-drop layer calls most.

import {
  SyntaxKind,
  type JsxAttribute,
  type JsxExpression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
} from 'ts-morph'
import { getOpening, quoteAttr, propName } from './_util.js'
import type { JsxNode, OpResult } from '../types.js'
import type { SetInlineStyleOp } from '../../../shared/operations.js'

export function setInlineStyle(node: JsxNode, op: SetInlineStyleOp): OpResult {
  const styles = op.styles || {}
  const entries = Object.entries(styles)
  if (entries.length === 0) return { ok: true }

  const opening = getOpening(node)
  const attr = opening.getAttribute('style')

  // No style attribute — create style={{ ... }}.
  if (!attr) {
    const pairs = entries.map(([k, v]) => `${propName(k)}: ${quoteAttr(v)}`).join(', ')
    opening.addAttribute({ name: 'style', initializer: `{{ ${pairs} }}` })
    return { ok: true }
  }

  if (attr.getKind() !== SyntaxKind.JsxAttribute) {
    return { ok: false, code: 'DYNAMIC_STYLE', message: 'style is a spread attribute.' }
  }

  const initializer = (attr as JsxAttribute).getInitializer()
  const expr =
    initializer && initializer.getKind() === SyntaxKind.JsxExpression
      ? (initializer as JsxExpression).getExpression()
      : null

  if (!expr || expr.getKind() !== SyntaxKind.ObjectLiteralExpression) {
    return {
      ok: false,
      code: 'DYNAMIC_STYLE',
      message: 'The style value is computed dynamically — Patchly will not edit it automatically.',
    }
  }

  const objExpr = expr as ObjectLiteralExpression

  // Merge each key into the existing object literal.
  for (const [k, v] of entries) {
    const name = propName(k)
    const existing = objExpr.getProperty(name)
    if (existing && existing.getKind() === SyntaxKind.PropertyAssignment) {
      ;(existing as PropertyAssignment).setInitializer(quoteAttr(v))
    } else if (existing) {
      // shorthand / spread / accessor with this name — replace it.
      existing.replaceWithText(`${name}: ${quoteAttr(v)}`)
    } else {
      objExpr.addPropertyAssignment({ name, initializer: quoteAttr(v) })
    }
  }
  return { ok: true }
}
