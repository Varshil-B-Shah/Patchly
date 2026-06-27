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

export function inspectElement(projectRoot: string, target: EditTarget, patchlySrc: string): InspectResult {
  const { file, line, column } = target
  const absolutePath = path.resolve(projectRoot, file)

  const sourceFile = getSourceFile(projectRoot, absolutePath)
  if (!sourceFile) {
    return { ok: false, code: 'FILE_NOT_FOUND', message: `Could not load ${file}.` }
  }

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

  if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
    return {
      ok: true,
      info: { ...base, classNameKind: 'static', classes: tokenizeClasses((initializer as StringLiteral).getLiteralValue()) },
    }
  }

  if (initializer && initializer.getKind() === SyntaxKind.JsxExpression) {
    const expr = (initializer as JsxExpression).getExpression()
    const exprKind = expr?.getKind()

    if (exprKind === SyntaxKind.StringLiteral || exprKind === SyntaxKind.NoSubstitutionTemplateLiteral) {
      return {
        ok: true,
        info: { ...base, classNameKind: 'static', classes: tokenizeClasses((expr as StringLiteral).getLiteralValue()) },
      }
    }

    const dynamicText = expr ? expr.getText().slice(0, 60) + (expr.getText().length > 60 ? '…' : '') : '…'
    return { ok: true, info: { ...base, classNameKind: 'dynamic', classes: [], dynamicText } }
  }

  const dynamicText = initializer ? initializer.getText().slice(0, 60) : '…'
  return { ok: true, info: { ...base, classNameKind: 'dynamic', classes: [], dynamicText } }
}
