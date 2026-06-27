import { instrumentJsx } from '../instrument/index.js'

interface LoaderContext {
  resourcePath: string
  callback: (err: unknown, code?: string, map?: unknown) => void
}

export default function patchlyLoader(this: LoaderContext, source: string): void {
  try {
    const result = instrumentJsx(source, this.resourcePath, process.cwd())
    this.callback(null, result ? result.code : source, result?.map)
  } catch {
    this.callback(null, source)
  }
}
