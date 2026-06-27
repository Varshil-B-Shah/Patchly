import fs from 'fs'
import path from 'path'
import { Project, ts, type SourceFile } from 'ts-morph'

const projectCache = new Map<string, Project>()

export function getProject(projectRoot: string): Project {
  const root = path.resolve(projectRoot)

  const cached = projectCache.get(root)
  if (cached) return cached

  const tsConfigFilePath = path.join(root, 'tsconfig.json')

  let project: Project
  if (fs.existsSync(tsConfigFilePath)) {
    project = new Project({
      tsConfigFilePath,
      skipAddingFilesFromTsConfig: true,
    })
  } else {
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

export function clearProjectCache(): void {
  projectCache.clear()
}
