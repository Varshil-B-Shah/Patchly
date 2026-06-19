// agent/ast/inspect.ts
// Read an element's className straight from source — used by the direct class panel.
// No mutation; returns a typed breakdown the extension renders as toggle rows.

import path from 'path'
import { SyntaxKind, type JsxAttribute, type JsxExpression, type StringLiteral } from 'ts-morph'
import { getSourceFile } from './project.js'
import { locateNode } from './locate.js'
import { getOpening, tokenizeClasses } from './operations/_util.js'
import type { EditTarget } from '../../shared/operations.js'
import type { ClassInfo } from '../../shared/protocol.js'

export type InspectResult =
  | { ok: true; info: ClassInfo }
  | { ok: false; code: string; message: string }

/**
 * Load the element at `target` from source and classify its className attribute.
 * - 'static'  — string literal; safe to edit via setClassName
 * - 'dynamic' — clsx/ternary/template-with-subs; panel shows locked chips
 * - 'none'    — no className attr; adds are still allowed (executor creates it)
 *
 * `patchlySrc` is echoed back verbatim so the panel can key results to the exact
 * pointers it sent (multi-select). Synchronous — no LLM, no network, no writes.
 */
export function inspectElement(projectRoot: string, target: EditTarget, patchlySrc: string): InspectResult {
  const { file, line, column } = target
  const absolutePath = path.resolve(projectRoot, file)

  const sourceFile = getSourceFile(projectRoot, absolutePath)
  if (!sourceFile) {
    return { ok: false, code: 'FILE_NOT_FOUND', message: `Could not load ${file}.` }
  }

  // Inspect is read-only — use locateNode directly, no drift guard needed.
  const handle = locateNode(sourceFile, line, column)
  if (!handle) {
    return { ok: false, code: 'TARGET_DRIFTED', message: 'Could not locate element at the given source position — please re-select.' }
  }

  const opening = getOpening(handle.node)
  const tagName = opening.getTagNameNode().getText()
  const base = { patchlySrc, tagName, filePath: file, lineNumber: line, column }

  const attr = opening.getAttribute('className') ?? opening.getAttribute('class')

  if (!attr || attr.getKind() !== SyntaxKind.JsxAttribute) {
    return { ok: true, info: { ...base, classNameKind: 'none', classes: [] } }
  }

  const initializer = (attr as JsxAttribute).getInitializer()

  // className="static-string"
  if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
    return {
      ok: true,
      info: { ...base, classNameKind: 'static', classes: tokenizeClasses((initializer as StringLiteral).getLiteralValue()) },
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
        info: { ...base, classNameKind: 'static', classes: tokenizeClasses((expr as StringLiteral).getLiteralValue()) },
      }
    }

    // clsx(), ternary, template with subs, identifier, etc.
    const dynamicText = expr ? expr.getText().slice(0, 60) + (expr.getText().length > 60 ? '…' : '') : '…'
    return { ok: true, info: { ...base, classNameKind: 'dynamic', classes: [], dynamicText } }
  }

  // Bare attribute like className (boolean), or other unusual forms — lock it.
  const dynamicText = initializer ? initializer.getText().slice(0, 60) : '…'
  return { ok: true, info: { ...base, classNameKind: 'dynamic', classes: [], dynamicText } }
}
