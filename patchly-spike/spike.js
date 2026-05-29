import path from 'path'
import fs from 'fs'

// Simulate what the extension would send to the agent.
// Change patchlySrc to test different edge cases.
const simulatedPayload = {
  patchlySrc: 'src/components/Hero.jsx:5:4',
  projectRoot: path.resolve('./test-app'),
}

function resolveSource(patchlySrc, projectRoot) {
  const parts = patchlySrc.split(':')
  const filePath = parts[0]
  const lineNumber = parseInt(parts[1])
  const colNumber = parseInt(parts[2])

  const absolutePath = path.resolve(projectRoot, filePath)

  if (!fs.existsSync(absolutePath)) {
    return { success: false, error: `File not found: ${absolutePath}` }
  }

  const content = fs.readFileSync(absolutePath, 'utf8')
  const lines = content.split('\n')

  const start = Math.max(0, lineNumber - 4)
  const end = Math.min(lines.length - 1, lineNumber + 2)
  const context = lines.slice(start, end + 1).join('\n')

  return {
    success: true,
    absolutePath,
    lineNumber,
    colNumber,
    targetLine: lines[lineNumber - 1],
    context,
  }
}

function test(label, patchlySrc) {
  console.log(`\n--- ${label} ---`)
  console.log(`Input: ${patchlySrc}`)
  const result = resolveSource(patchlySrc, simulatedPayload.projectRoot)
  if (result.success) {
    console.log('✅ Source mapping works!')
    console.log('File:', result.absolutePath)
    console.log('Line:', result.lineNumber, '| Col:', result.colNumber)
    console.log('Target line:', result.targetLine?.trim())
    console.log('Context:\n' + result.context)
  } else {
    console.log('❌ Failed:', result.error)
  }
}

// Run all edge case tests
test('Case 1: Nested component (Hero)', 'src/components/Hero.jsx:5:4')
test('Case 2: Deeply nested (Button)', 'src/components/Button.jsx:3:4')
test('Case 3: Mapped list (App)', 'src/App.jsx:37:12')
test('Case 4: Deep path component (StatsCard)', 'src/features/dashboard/components/StatsCard.jsx:3:4')
