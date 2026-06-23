#!/usr/bin/env node
// agent/index.ts

import fs from 'fs'
import path from 'path'
import type { ResolvedConfig } from './config.js'
import { DEFAULT_PORT, PORT_SCAN_RANGE, LOCKFILE_REL, type AgentLockfile } from '../shared/agentInfo.js'

/** Write <projectRoot>/.patchly/agent.json so the MCP server can discover us. */
function writeLockfile(projectRoot: string, port: number): string {
  const lockPath = path.resolve(projectRoot, LOCKFILE_REL)
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  const data: AgentLockfile = { port, projectRoot, pid: process.pid, startedAt: new Date().toISOString() }
  fs.writeFileSync(lockPath, JSON.stringify(data, null, 2))
  return lockPath
}

function removeLockfile(lockPath: string): void {
  try { fs.rmSync(lockPath, { force: true }) } catch { /* best-effort */ }
}

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

  // Try DEFAULT_PORT first, then scan upward so a second project doesn't fail to
  // start when 7842 is already taken by another running agent.
  let boundPort: number | null = null
  for (let p = DEFAULT_PORT; p <= DEFAULT_PORT + PORT_SCAN_RANGE; p++) {
    try {
      await startServer(p, resolvedConfig)
      boundPort = p
      break
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'EADDRINUSE') continue
      throw err
    }
  }

  if (boundPort === null) {
    console.error(`No free port found in ${DEFAULT_PORT}–${DEFAULT_PORT + PORT_SCAN_RANGE}.`)
    process.exit(1)
  }

  const lockPath = writeLockfile(config.projectRoot, boundPort)
  const cleanup = () => { removeLockfile(lockPath); process.exit(0) }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  console.log(`Patchly agent running on ws://localhost:${boundPort}`)
  console.log(`   Project root: ${config.projectRoot}`)
  console.log(`   Lockfile: ${lockPath}`)
  console.log(`   Open your localhost app and activate Patchly with Alt+Shift+P`)
}

if (process.argv[2] === 'init') {
  import('../bin/init.js')
} else if (process.argv[2] === 'mcp') {
  import('./mcp/server.js')
} else {
  main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
