import prettier from 'prettier'
import type { SourceFile } from 'ts-morph'

export async function formatEdited(sourceFile: SourceFile, snapshot: string, filePath: string): Promise<string> {
  const newText = sourceFile.getFullText()

  try {
    const config = await prettier.resolveConfig(filePath)
    const options: prettier.Options = { ...config, filepath: filePath }

    const formattedSnapshot = await prettier.format(snapshot, options)
    if (formattedSnapshot === snapshot) {
      return await prettier.format(newText, options)
    }
  } catch {
    
  }
  
  return newText
}
