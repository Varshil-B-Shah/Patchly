export interface EditTarget {
  file: string
  line: number
  column: number
  componentName?: string
  tagName: string
  identifyingAttrs?: Record<string, string>
  textSnippet?: string
}

export interface SetClassNameOp {
  op: 'setClassName'
  target: EditTarget
  add?: string[]
  remove?: string[]
}

export interface SetAttributeOp {
  op: 'setAttribute'
  target: EditTarget
  name: string
  value: string | null
}

export interface SetTextOp {
  op: 'setText'
  target: EditTarget
  text: string
}

export interface SetInlineStyleOp {
  op: 'setInlineStyle'
  target: EditTarget
  styles: Record<string, string>
}

export interface WrapElementOp {
  op: 'wrapElement'
  target: EditTarget
  wrapperTag: string
  wrapperClassName?: string
}

export interface InsertChildOp {
  op: 'insertChild'
  target: EditTarget
  position: 'first' | 'last' | number
  jsx: string
}

export interface ReplaceElementOp {
  op: 'replaceElement'
  target: EditTarget
  jsx: string
}

export interface RemoveElementOp {
  op: 'removeElement'
  target: EditTarget
}

export interface SetExpressionOp {
  op: 'setExpression'
  target: EditTarget
  attribute: string
  expression: string
}

export type EditOperation =
  | SetClassNameOp
  | SetAttributeOp
  | SetTextOp
  | SetInlineStyleOp
  | WrapElementOp
  | InsertChildOp
  | ReplaceElementOp
  | RemoveElementOp
  | SetExpressionOp

export interface EditRequest {
  explanation: string
  operations: EditOperation[]
  confidence: number
}

export const OPS = Object.freeze({
  SET_CLASS_NAME: 'setClassName',
  SET_ATTRIBUTE: 'setAttribute',
  SET_TEXT: 'setText',
  SET_INLINE_STYLE: 'setInlineStyle',
  WRAP_ELEMENT: 'wrapElement',
  INSERT_CHILD: 'insertChild',
  REPLACE_ELEMENT: 'replaceElement',
  REMOVE_ELEMENT: 'removeElement',
  SET_EXPRESSION: 'setExpression',
} as const)

export type OpName = (typeof OPS)[keyof typeof OPS]
