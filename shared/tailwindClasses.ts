import { twMerge } from 'tailwind-merge'

export interface ClassEdit {
  add: string[]
  remove: string[]
}

export function computeClassAdd(current: string[], cls: string): ClassEdit {
  const merged = twMerge([...current, cls].join(' ')).split(/\s+/).filter(Boolean)
  return {
    add: merged.includes(cls) ? [cls] : [],
    remove: current.filter((c) => !merged.includes(c)),
  }
}

export function computeClassRemove(cls: string): ClassEdit {
  return { add: [], remove: [cls] }
}

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
