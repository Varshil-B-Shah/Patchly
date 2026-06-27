import {
  SyntaxKind,
  type JsxAttribute,
  type JsxExpression,
  type StringLiteral,
} from 'ts-morph'
import { getOpening, tokenizeClasses, mergeClasses, quoteAttr } from './_util.js'
import type { JsxNode, OpResult } from '../types.js'
import type { SetClassNameOp } from '../../../shared/operations.js'

export function setClassName(node: JsxNode, op: SetClassNameOp): OpResult {
  const { add = [], remove = [] } = op
  const opening = getOpening(node)
  const attr =
    opening.getAttribute('className') || opening.getAttribute('class')

  if (!attr) {
    if (add.length === 0) return { ok: true }
    const merged = mergeClasses([], add, remove)
    opening.addAttribute({ name: 'className', initializer: quoteAttr(merged.join(' ')) })
    return { ok: true }
  }

  if (attr.getKind() !== SyntaxKind.JsxAttribute) {
    return { ok: false, code: 'DYNAMIC_CLASSNAME', message: 'className is not a plain attribute.' }
  }

  const initializer = (attr as JsxAttribute).getInitializer()

  if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
    const lit = initializer as StringLiteral
    const merged = mergeClasses(tokenizeClasses(lit.getLiteralValue()), add, remove)
    lit.setLiteralValue(merged.join(' '))
    return { ok: true }
  }

  if (initializer && initializer.getKind() === SyntaxKind.JsxExpression) {
    const expr = (initializer as JsxExpression).getExpression()
    const exprKind = expr && expr.getKind()
    if (
      exprKind === SyntaxKind.StringLiteral ||
      exprKind === SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      const merged = mergeClasses(tokenizeClasses((expr as StringLiteral).getLiteralValue()), add, remove)
      expr!.replaceWithText(quoteAttr(merged.join(' ')))
      return { ok: true }
    }
  }

  return {
    ok: false,
    code: 'DYNAMIC_CLASSNAME',
    message: 'The className is computed dynamically — Patchly will not edit it automatically.',
  }
}
