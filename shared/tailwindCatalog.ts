import type { ThemeTokens } from './protocol.js'

const SPACING = [
  '0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8',
  '9', '10', '11', '12', '14', '16', '20', '24', '28', '32', '36', '40', '44',
  '48', '52', '56', '60', '64', '72', '80', '96',
]
const SPACING_AUTO = [...SPACING, 'auto']
const FRACTIONS = [
  '1/2', '1/3', '2/3', '1/4', '2/4', '3/4', '1/5', '2/5', '3/5', '4/5',
  '1/6', '5/6', '1/12', '11/12',
]
const SIZE = [...SPACING, ...FRACTIONS, 'auto', 'full', 'screen', 'min', 'max', 'fit']

const PALETTE = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
  'purple', 'fuchsia', 'pink', 'rose',
]
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
const SPECIAL_COLORS = ['white', 'black', 'transparent', 'current', 'inherit']


function cross(prefixes: string[], values: string[]): string[] {
  const out: string[] = []
  for (const p of prefixes) for (const v of values) out.push(`${p}-${v}`)
  return out
}

function colorUtilities(prefix: string): string[] {
  const out: string[] = []
  for (const c of SPECIAL_COLORS) out.push(`${prefix}-${c}`)
  for (const name of PALETTE) for (const s of SHADES) out.push(`${prefix}-${name}-${s}`)
  return out
}


function buildBase(): string[] {
  const out: string[] = []

  // Spacing: padding / margin (margin allows negative + auto)
  out.push(...cross(['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'ps', 'pe'], SPACING))
  out.push(...cross(['m', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me'], SPACING_AUTO))
  out.push(...cross(['-m', '-mx', '-my', '-mt', '-mr', '-mb', '-ml'], SPACING))
  out.push(...cross(['gap', 'gap-x', 'gap-y', 'space-x', 'space-y'], SPACING))

  // Sizing
  out.push(...cross(['w', 'min-w', 'max-w'], SIZE))
  out.push(...cross(['h', 'min-h', 'max-h'], SIZE))
  out.push('max-w-xs', 'max-w-sm', 'max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl',
    'max-w-3xl', 'max-w-4xl', 'max-w-5xl', 'max-w-6xl', 'max-w-7xl', 'max-w-prose', 'max-w-none')

  // Display
  out.push('block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'inline-grid',
    'hidden', 'table', 'contents', 'flow-root', 'list-item')

  // Flexbox / grid
  out.push('flex-row', 'flex-row-reverse', 'flex-col', 'flex-col-reverse',
    'flex-wrap', 'flex-wrap-reverse', 'flex-nowrap',
    'flex-1', 'flex-auto', 'flex-initial', 'flex-none',
    'grow', 'grow-0', 'shrink', 'shrink-0')
  out.push('items-start', 'items-end', 'items-center', 'items-baseline', 'items-stretch')
  out.push('justify-start', 'justify-end', 'justify-center', 'justify-between',
    'justify-around', 'justify-evenly', 'justify-stretch')
  out.push('justify-items-start', 'justify-items-end', 'justify-items-center', 'justify-items-stretch')
  out.push('justify-self-auto', 'justify-self-start', 'justify-self-end', 'justify-self-center', 'justify-self-stretch')
  out.push('content-start', 'content-end', 'content-center', 'content-between',
    'content-around', 'content-evenly', 'content-baseline', 'content-stretch')
  out.push('self-auto', 'self-start', 'self-end', 'self-center', 'self-baseline', 'self-stretch')
  out.push(...cross(['grid-cols'], ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'none']))
  out.push(...cross(['grid-rows'], ['1', '2', '3', '4', '5', '6', 'none']))
  out.push(...cross(['col-span'], ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'full', 'auto']))
  out.push(...cross(['row-span'], ['1', '2', '3', '4', '5', '6', 'full', 'auto']))
  out.push('order-first', 'order-last', 'order-none', ...cross(['order'], ['1', '2', '3', '4', '5', '6']))

  // Position
  out.push('static', 'fixed', 'absolute', 'relative', 'sticky')
  out.push(...cross(['top', 'right', 'bottom', 'left', 'inset', 'inset-x', 'inset-y'], SPACING_AUTO))
  out.push(...cross(['z'], ['0', '10', '20', '30', '40', '50', 'auto']))

  // Typography
  out.push('text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl',
    'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl', 'text-8xl', 'text-9xl')
  out.push('font-thin', 'font-extralight', 'font-light', 'font-normal', 'font-medium',
    'font-semibold', 'font-bold', 'font-extrabold', 'font-black')
  out.push('font-sans', 'font-serif', 'font-mono')
  out.push('italic', 'not-italic', 'underline', 'overline', 'line-through', 'no-underline',
    'uppercase', 'lowercase', 'capitalize', 'normal-case', 'truncate', 'text-ellipsis', 'text-clip')
  out.push('text-left', 'text-center', 'text-right', 'text-justify', 'text-start', 'text-end')
  out.push(...cross(['leading'], ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose', '3', '4', '5', '6', '7', '8', '9', '10']))
  out.push(...cross(['tracking'], ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']))
  out.push(...cross(['whitespace'], ['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap', 'break-spaces']))
  out.push('break-normal', 'break-words', 'break-all', 'break-keep')

  // Colors
  out.push(...colorUtilities('text'))
  out.push(...colorUtilities('bg'))
  out.push(...colorUtilities('border'))
  out.push(...colorUtilities('ring'))
  out.push(...colorUtilities('divide'))
  out.push(...colorUtilities('placeholder'))

  // Borders / radius
  out.push('rounded-none', 'rounded-sm', 'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl',
    'rounded-2xl', 'rounded-3xl', 'rounded-full')
  out.push(...cross(['rounded-t', 'rounded-r', 'rounded-b', 'rounded-l', 'rounded-tl', 'rounded-tr', 'rounded-br', 'rounded-bl'],
    ['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full']))
  out.push('border', 'border-0', 'border-2', 'border-4', 'border-8',
    'border-t', 'border-r', 'border-b', 'border-l', 'border-x', 'border-y')
  out.push('border-solid', 'border-dashed', 'border-dotted', 'border-double', 'border-hidden', 'border-none')

  // Effects
  out.push('shadow-sm', 'shadow', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl', 'shadow-inner', 'shadow-none')
  out.push(...cross(['opacity'], ['0', '5', '10', '20', '25', '30', '40', '50', '60', '70', '75', '80', '90', '95', '100']))
  out.push(...cross(['ring'], ['0', '1', '2', '4', '8', 'inset']))

  // Layout misc
  out.push('overflow-auto', 'overflow-hidden', 'overflow-visible', 'overflow-scroll',
    'overflow-x-auto', 'overflow-y-auto', 'overflow-x-hidden', 'overflow-y-hidden')
  out.push('object-contain', 'object-cover', 'object-fill', 'object-none', 'object-scale-down')
  out.push('cursor-auto', 'cursor-default', 'cursor-pointer', 'cursor-wait', 'cursor-text',
    'cursor-move', 'cursor-not-allowed', 'cursor-grab', 'cursor-grabbing')
  out.push('select-none', 'select-text', 'select-all', 'select-auto')
  out.push('pointer-events-none', 'pointer-events-auto')

  // Transitions / transforms
  out.push('transition', 'transition-none', 'transition-all', 'transition-colors',
    'transition-opacity', 'transition-shadow', 'transition-transform')
  out.push(...cross(['duration'], ['75', '100', '150', '200', '300', '500', '700', '1000']))
  out.push('ease-linear', 'ease-in', 'ease-out', 'ease-in-out')
  out.push(...cross(['scale'], ['0', '50', '75', '90', '95', '100', '105', '110', '125', '150']))
  out.push(...cross(['rotate'], ['0', '1', '2', '3', '6', '12', '45', '90', '180']))

  // Dedupe, preserve first-seen order.
  return [...new Set(out)]
}

export const BASE_CLASSES: string[] = buildBase()

export const VARIANTS = [
  'hover', 'focus', 'focus-visible', 'focus-within', 'active', 'disabled', 'visited',
  'group-hover', 'peer-hover', 'first', 'last', 'odd', 'even',
  'sm', 'md', 'lg', 'xl', '2xl', 'dark', 'motion-safe', 'motion-reduce',
] as const

// Theme integration 

function themeClasses(theme: ThemeTokens | undefined): string[] {
  if (!theme?.colors?.length) return []
  const out: string[] = []
  for (const c of theme.colors) {
    out.push(`bg-${c.name}`, `text-${c.name}`, `border-${c.name}`, `ring-${c.name}`)
  }
  return out
}


function splitVariants(query: string): { variantPrefix: string; base: string } {
  const parts = query.split(':')
  const base = parts.pop() ?? ''
  const variantPrefix = parts.length ? parts.join(':') + ':' : ''
  return { variantPrefix, base }
}

export function searchClasses(query: string, theme?: ThemeTokens, limit = 50): string[] {
  const q = (query ?? '').trim().toLowerCase()
  if (!q) return defaultSuggestions(theme)

  const { variantPrefix, base } = splitVariants(q)
  const pool = [...themeClasses(theme), ...BASE_CLASSES]

  if (!base) {
    return defaultSuggestions(theme).map((c) => variantPrefix + c).slice(0, limit)
  }

  const prefixHits: string[] = []
  const subHits: string[] = []
  const seen = new Set<string>()
  for (const cls of pool) {
    if (seen.has(cls)) continue
    const idx = cls.indexOf(base)
    if (idx === -1) continue
    seen.add(cls)
    if (idx === 0) prefixHits.push(cls)
    else subHits.push(cls)
  }
  prefixHits.sort()
  subHits.sort()

  return [...prefixHits, ...subHits].slice(0, limit).map((c) => variantPrefix + c)
}

export function defaultSuggestions(theme?: ThemeTokens): string[] {
  const base = [
    'flex', 'items-center', 'justify-center', 'justify-between', 'gap-2', 'gap-4',
    'p-2', 'p-4', 'px-4', 'py-2', 'm-2', 'mx-auto',
    'rounded', 'rounded-lg', 'rounded-full', 'border', 'shadow', 'shadow-md',
    'text-sm', 'text-base', 'text-lg', 'font-medium', 'font-semibold', 'font-bold',
    'w-full', 'h-full', 'hidden',
  ]
  return [...themeClasses(theme).filter((c) => c.startsWith('bg-')), ...base]
}
