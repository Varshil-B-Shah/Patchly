import {
  ts,
  SyntaxKind,
  type Node,
  type SourceFile,
  type JsxAttribute,
  type JsxElement,
  type JsxSelfClosingElement,
  type StringLiteral,
} from 'ts-morph'
import type { JsxNode, NodeHandle, ElementInfo } from './types.js'

export function locateNode(sourceFile: SourceFile, line: number, column: number): NodeHandle | null {
  let pos: number
  try {
    pos = ts.getPositionOfLineAndCharacter(sourceFile.compilerNode, line - 1, column)
  } catch {
    return null
  }

  const hit = sourceFile.getDescendantAtPos(pos)
  if (!hit) return null

  let cur: Node | undefined = hit
  while (cur) {
    const kind = cur.getKind()
    if (kind === SyntaxKind.JsxElement || kind === SyntaxKind.JsxSelfClosingElement) {
      return toHandle(cur as JsxNode)
    }
    cur = cur.getParent()
  }

  return null
}

function toHandle(node: JsxNode): NodeHandle {
  const selfClosing = node.getKind() === SyntaxKind.JsxSelfClosingElement
  const openingTag = selfClosing
    ? (node as JsxSelfClosingElement)
    : (node as JsxElement).getOpeningElement()
  return {
    node,
    openingTag,
    attributes: openingTag.getAttributes(),
    kind: selfClosing ? 'selfClosing' : 'element',
  }
}

export function getElementInfo(handleOrNode: NodeHandle | JsxNode): ElementInfo {
  const handle = 'openingTag' in handleOrNode ? handleOrNode : toHandle(handleOrNode)
  const { node, openingTag, attributes } = handle

  const tagName = openingTag.getTagNameNode().getText()

  const attrs: Record<string, string> = {}
  for (const attr of attributes) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue
    const jsxAttr = attr as JsxAttribute
    const name = jsxAttr.getNameNode().getText()
    const initializer = jsxAttr.getInitializer()
    if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
      attrs[name] = (initializer as StringLiteral).getLiteralValue()
    }
  }

  const textSnippet = node
    .getDescendantsOfKind(SyntaxKind.JsxText)
    .map((t) => t.getText())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)

  return { tagName, attrs, textSnippet }
}
