// agent/ast/operations/setClassName.ts
// Add/remove className tokens surgically. Never mangles dynamic classNames.

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

  // No className attribute yet — create one if there's anything to add.
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

  // className="..."
  if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
    const lit = initializer as StringLiteral
    const merged = mergeClasses(tokenizeClasses(lit.getLiteralValue()), add, remove)
    lit.setLiteralValue(merged.join(' '))
    return { ok: true }
  }

  // className={ ... } — only safe if statically a plain string.
  if (initializer && initializer.getKind() === SyntaxKind.JsxExpression) {
    const expr = (initializer as JsxExpression).getExpression()
    const exprKind = expr && expr.getKind()
    if (
      exprKind === SyntaxKind.StringLiteral ||
      exprKind === SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      const merged = mergeClasses(tokenizeClasses((expr as StringLiteral).getLiteralValue()), add, remove)
      // Keep the expression-wrapped form: className={"..."}
      expr!.replaceWithText(quoteAttr(merged.join(' ')))
      return { ok: true }
    }
  }

  // clsx(...), ternaries, variables, templates with substitutions, etc.
  return {
    ok: false,
    code: 'DYNAMIC_CLASSNAME',
    message: 'The className is computed dynamically — Patchly will not edit it automatically.',
  }
}
