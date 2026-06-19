// agent/ast/inspect.ts
// Read an element's className straight from source — used by the direct class panel.
// No mutation; returns a typed breakdown the extension renders as chips.

import path from 'path'
import { SyntaxKind, type JsxAttribute, type JsxExpression, type StringLiteral } from 'ts-morph'
import { getSourceFile } from './project.js'
import { resolveTarget } from './confirm.js'
import { getOpening, tokenizeClasses } from './operations/_util.js'
import type { EditTarget } from '../../shared/operations.js'
import type { ElementInfoMessage } from '../../shared/protocol.js'

/** The MSG.ELEMENT_INFO-shaped payload (minus the `type` field, which the server adds). */
export type ClassInfo = Omit<ElementInfoMessage, 'type'>

export type InspectResult =
  | { ok: true; info: ClassInfo }
  | { ok: false; code: string; message: string }

/**
 * Load the element at `target` from source and classify its className attribute.
 * - 'static'  — string literal; safe to edit via setClassName
 * - 'dynamic' — clsx/ternary/template-with-subs; panel shows locked chips
 * - 'none'    — no className attr; adds are still allowed (executor creates it)
 *
 * Synchronous — no LLM, no network, no disk writes.
 */
export function inspectElement(projectRoot: string, target: EditTarget): InspectResult {
  const { file, line } = target
  const absolutePath = path.resolve(projectRoot, file)

  const sourceFile = getSourceFile(projectRoot, absolutePath)
  if (!sourceFile) {
    return { ok: false, code: 'FILE_NOT_FOUND', message: `Could not load ${file}.` }
  }

  const resolved = resolveTarget(sourceFile, target)
  if (!resolved.ok) return resolved

  const opening = getOpening(resolved.node)
  const tagName = opening.getTagNameNode().getText()
  const attr = opening.getAttribute('className') ?? opening.getAttribute('class')

  if (!attr || attr.getKind() !== SyntaxKind.JsxAttribute) {
    return {
      ok: true,
      info: { sessionId: '', tagName, classNameKind: 'none', classes: [], filePath: file, lineNumber: line, column: target.column },
    }
  }

  const initializer = (attr as JsxAttribute).getInitializer()

  // className="static-string"
  if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
    return {
      ok: true,
      info: {
        sessionId: '',
        tagName,
        classNameKind: 'static',
        classes: tokenizeClasses((initializer as StringLiteral).getLiteralValue()),
        filePath: file,
        lineNumber: line,
        column: target.column,
      },
    }
  }

  // className={...}
  if (initializer && initializer.getKind() === SyntaxKind.JsxExpression) {
    const expr = (initializer as JsxExpression).getExpression()
    const exprKind = expr?.getKind()

    // className={"static"} or className={`no-sub-template`}
    if (exprKind === SyntaxKind.StringLiteral || exprKind === SyntaxKind.NoSubstitutionTemplateLiteral) {
      return {
        ok: true,
        info: {
          sessionId: '',
          tagName,
          classNameKind: 'static',
          classes: tokenizeClasses((expr as StringLiteral).getLiteralValue()),
          filePath: file,
          lineNumber: line,
          column: target.column,
        },
      }
    }

    // clsx(), ternary, template with subs, identifier, etc.
    const dynamicText = expr ? expr.getText().slice(0, 60) + (expr.getText().length > 60 ? '…' : '') : '…'
    return {
      ok: true,
      info: { sessionId: '', tagName, classNameKind: 'dynamic', classes: [], dynamicText, filePath: file, lineNumber: line, column: target.column },
    }
  }

  // Bare attribute like className (boolean), or other unusual forms — lock it.
  const dynamicText = initializer ? initializer.getText().slice(0, 60) : '…'
  return {
    ok: true,
    info: { sessionId: '', tagName, classNameKind: 'dynamic', classes: [], dynamicText, filePath: file, lineNumber: line, column: target.column },
  }
}
