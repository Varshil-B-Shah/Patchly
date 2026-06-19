// shared/tailwindClasses.ts
// Tailwind-conflict-aware class math for the direct class panel.
//
// HARD RULE: the setClassName executor (agent/ast/operations/_util.ts mergeClasses)
// stays dumb — pure set-union + explicit removes. Conflict resolution lives HERE,
// in the caller, so the executor never has to know about Tailwind. The panel calls
// computeClassAdd/computeClassRemove to derive the precise {add, remove} for a
// SetClassNameOp, then applyClassEdit to update its own optimistic model.
//
// This module is imported by the extension (esbuild inlines it). The agent never
// imports it — the LLM path passes explicit removes of its own.

import { twMerge } from 'tailwind-merge'

export interface ClassEdit {
  add: string[]
  remove: string[]
}

/**
 * Compute the {add, remove} needed to add `cls` to `current`, resolving Tailwind
 * conflicts via tailwind-merge. Adding `px-8` when `px-4` is present yields
 * { add: ['px-8'], remove: ['px-4'] } — the conflicting member is dropped.
 *
 * `remove` contains only classes that were actually in `current`, so it maps
 * cleanly onto a SetClassNameOp the executor can apply.
 */
export function computeClassAdd(current: string[], cls: string): ClassEdit {
  const merged = twMerge([...current, cls].join(' ')).split(/\s+/).filter(Boolean)
  return {
    add: merged.includes(cls) ? [cls] : [],
    remove: current.filter((c) => !merged.includes(c)),
  }
}

/** Compute the {add, remove} to drop a single class. */
export function computeClassRemove(cls: string): ClassEdit {
  return { add: [], remove: [cls] }
}

/**
 * Apply a ClassEdit to a class list, mirroring the executor's mergeClasses:
 * remove first, then append genuinely-new classes, preserving order + dedupe.
 * Used by the panel to update its own model optimistically without re-reading
 * the (HMR-re-rendered) DOM.
 */
export function applyClassEdit(current: string[], edit: ClassEdit): string[] {
  const removeSet = new Set(edit.remove)
  const result: string[] = []
  const seen = new Set<string>()
  for (const cls of current) {
    if (removeSet.has(cls) || seen.has(cls)) continue
    result.push(cls)
    seen.add(cls)
  }
  for (const cls of edit.add) {
    if (removeSet.has(cls) || seen.has(cls)) continue
    result.push(cls)
    seen.add(cls)
  }
  return result
}
