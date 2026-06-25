// next-plugin/loader.ts
// A webpack/Turbopack source loader that injects data-patchly-src into JSX,
// reusing the shared Babel transform. Both engines call loaders the same way.

import { instrumentJsx } from '../instrument/index.js'

interface LoaderContext {
  resourcePath: string
  callback: (err: unknown, code?: string, map?: unknown) => void
}

export default function patchlyLoader(this: LoaderContext, source: string): void {
  try {
    // process.cwd() is the Next project root — Next always runs from there.
    const result = instrumentJsx(source, this.resourcePath, process.cwd())
    this.callback(null, result ? result.code : source, result?.map)
  } catch {
    // Never break the build over instrumentation — pass through untouched.
    this.callback(null, source)
  }
}
