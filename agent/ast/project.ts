// agent/ast/project.ts
// Thin wrapper around ts-morph: lazily creates and caches one Project per
// projectRoot, and hands back fresh-from-disk source files on demand.
// ts-morph is the locked editing engine for Phase 6 (Babel stays only for the
// Vite source-injection plugin).

import fs from 'fs'
import path from 'path'
import { Project, ts, type SourceFile } from 'ts-morph'

// resolved projectRoot → ts-morph Project
const projectCache = new Map<string, Project>()

// Get (or lazily create) the cached Project for a projectRoot.
export function getProject(projectRoot: string): Project {
  const root = path.resolve(projectRoot)

  const cached = projectCache.get(root)
  if (cached) return cached

  const tsConfigFilePath = path.join(root, 'tsconfig.json')

  let project: Project
  if (fs.existsSync(tsConfigFilePath)) {
    // Honor the project's own compiler options, but add files on demand
    // rather than eagerly loading the whole project.
    project = new Project({
      tsConfigFilePath,
      skipAddingFilesFromTsConfig: true,
    })
  } else {
    // No tsconfig (e.g. a plain Vite/React .jsx app): sensible JSX defaults.
    project = new Project({
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        allowJs: true,
      },
    })
  }

  projectCache.set(root, project)
  return project
}

// Get a source file for editing, refreshed from disk so we never operate on a
// stale in-memory AST (Vite or the user may have changed the file). Returns
// null if the file does not exist on disk.
export function getSourceFile(projectRoot: string, absPath: string): SourceFile | null {
  const project = getProject(projectRoot)
  const resolved = path.resolve(absPath)

  const sourceFile =
    project.getSourceFile(resolved) ??
    project.addSourceFileAtPathIfExists(resolved)

  if (!sourceFile) return null

  sourceFile.refreshFromFileSystemSync()
  return sourceFile
}

// Clear the Project cache (used by tests to reset state between runs).
export function clearProjectCache(): void {
  projectCache.clear()
}
