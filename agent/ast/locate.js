// agent/ast/locate.js
// Turn a data-patchly-src pointer (line:column) into the exact JSX AST node, and
// read a node's fingerprint info. Pure, read-only over a ts-morph source file.
//
// Coordinate convention: the Vite plugin tags JSXOpeningElement loc.start —
// line is 1-based, column is 0-based — pointing at the `<` of the opening tag.
// TypeScript's getPositionOfLineAndCharacter wants both 0-based → (line - 1, column).

import { ts, SyntaxKind } from 'ts-morph'

// Resolve a line:column to the nearest enclosing JSX element.
// Returns a normalized handle { node, openingTag, attributes, kind } or null.
export function locateNode(sourceFile, line, column) {
  let pos
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
  let cur = hit
  while (cur) {
    const kind = cur.getKind()
    if (kind === SyntaxKind.JsxElement || kind === SyntaxKind.JsxSelfClosingElement) {
      return toHandle(cur)
    }
    cur = cur.getParent()
  }

  return null
}

// Build the normalized handle from a JsxElement / JsxSelfClosingElement node.
function toHandle(node) {
  const selfClosing = node.getKind() === SyntaxKind.JsxSelfClosingElement
  const openingTag = selfClosing ? node : node.getOpeningElement()
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
export function getElementInfo(handleOrNode) {
  const handle = handleOrNode.openingTag ? handleOrNode : toHandle(handleOrNode)
  const { node, openingTag, attributes } = handle

  const tagName = openingTag.getTagNameNode().getText()

  const attrs = {}
  for (const attr of attributes) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue
    const name = attr.getNameNode().getText()
    const initializer = attr.getInitializer()
    if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
      attrs[name] = initializer.getLiteralValue()
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
