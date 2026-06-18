// agent/ast/format.js
// Format an edited source file. Preferred path: Prettier with the project's own
// resolved config — but only when the file was ALREADY formatter-clean, so we
// never reflow unrelated lines. Otherwise fall back to ts-morph's gentle TS
// formatter (fixes indentation of inserted nodes without rewriting the file).

import prettier from 'prettier'

export async function formatEdited(sourceFile, snapshot, filePath) {
  const newText = sourceFile.getFullText()

  try {
    const config = await prettier.resolveConfig(filePath)
    const options = { ...config, filepath: filePath }

    // Was the original file already Prettier-clean? Only then is whole-file
    // Prettier safe (it won't touch lines we didn't edit).
    const formattedSnapshot = await prettier.format(snapshot, options)
    if (formattedSnapshot === snapshot) {
      return await prettier.format(newText, options)
    }
  } catch {
    // fall through
  }

  // Not Prettier-clean (or Prettier failed): keep ts-morph's surgical output
  // as-is. A whole-file reformat (Prettier or ts-morph formatText) would reflow
  // unrelated lines on a file that isn't already formatter-clean.
  return newText
}
