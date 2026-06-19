// agent/ast/locate.ts
// Turn a data-patchly-src pointer (line:column) into the exact JSX AST node, and
// read a node's fingerprint info. Pure, read-only over a ts-morph source file.
//
// Coordinate convention: the Vite plugin tags JSXOpeningElement loc.start —
// line is 1-based, column is 0-based — pointing at the `<` of the opening tag.
// TypeScript's getPositionOfLineAndCharacter wants both 0-based → (line - 1, column).

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

// Resolve a line:column to the nearest enclosing JSX element.
// Returns a normalized handle { node, openingTag, attributes, kind } or null.
export function locateNode(sourceFile: SourceFile, line: number, column: number): NodeHandle | null {
  let pos: number
  try {
    pos = ts.getPositionOfLineAndCharacter(sourceFile.compilerNode, line - 1, column)
  } catch {
    // line/column out of range for the (possibly drifted) file
    return null
  }

  const hit = sourceFile.getDescendantAtPos(pos)
  if (!hit) return null

  // Walk up, inclusive of the hit itself: getDescendantAtPos may land on a token
  // or attribute, and the hit may already BE the (self-closing) element.
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

// Build the normalized handle from a JsxElement / JsxSelfClosingElement node.
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

// Read fingerprint info from a handle or a raw JSX element node:
// { tagName, attrs, textSnippet }. `attrs` only includes statically-known
// string-literal values (dynamic attrs are omitted). `textSnippet` is the
// element's inner text, whitespace-collapsed, first ~40 chars.
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

  // Inner text = concatenation of JsxText descendants (skips tags/expressions).
  const textSnippet = node
    .getDescendantsOfKind(SyntaxKind.JsxText)
    .map((t) => t.getText())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)

  return { tagName, attrs, textSnippet }
}
