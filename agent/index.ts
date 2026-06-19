#!/usr/bin/env node
// agent/index.ts

import type { ResolvedConfig } from './config.js'

const PORT = 7842

async function main() {
  const { startServer } = await import('./server.js')
  const { loadConfig } = await import('./config.js')

  console.log('Patchly agent starting...')

  const config = await loadConfig()

  if (!config.projectRoot) {
    console.error('No project root found. Run `npx patchly init` first.')
    process.exit(1)
  }

  const resolvedConfig: ResolvedConfig = { ...config, projectRoot: config.projectRoot }

  await startServer(PORT, resolvedConfig)
  console.log(`Patchly agent running on ws://localhost:${PORT}`)
  console.log(`   Project root: ${config.projectRoot}`)
  console.log(`   Open your localhost app and activate Patchly with Alt+Shift+P`)
}

if (process.argv[2] === 'init') {
  import('../bin/init.js')
} else {
  main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
