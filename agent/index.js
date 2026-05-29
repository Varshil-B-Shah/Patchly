#!/usr/bin/env node
// agent/index.js

import { startServer } from './server.js'
import { loadConfig } from './config.js'

const PORT = 7842  // fixed port — extension hardcodes this too

async function main() {
  console.log('Patchly agent starting...')

  const config = await loadConfig()

  if (!config.projectRoot) {
    console.error('No project root found. Run `npx patchly init` first.')
    process.exit(1)
  }

  await startServer(PORT, config)
  console.log(`Patchly agent running on ws://localhost:${PORT}`)
  console.log(`   Project root: ${config.projectRoot}`)
  console.log(`   Open your localhost app and activate Patchly with Alt+Shift+P`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
