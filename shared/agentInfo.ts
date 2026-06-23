// shared/agentInfo.ts
// Single source of truth for how the agent is discovered. Imported by the agent,
// the MCP server, AND the extension bundle — so it MUST stay browser-safe
// (no `fs`/`path`/node imports). The agent and MCP resolve the absolute lockfile
// path themselves from LOCKFILE_REL.

/** Preferred WebSocket port. The agent tries this first, then scans upward. */
export const DEFAULT_PORT = 7842

/** How many ports above DEFAULT_PORT the agent (and extension) will try. */
export const PORT_SCAN_RANGE = 10

/** Lockfile location, relative to the project root. Holds { port, projectRoot, pid }. */
export const LOCKFILE_REL = '.patchly/agent.json'

/** Shape written to <projectRoot>/.patchly/agent.json by the running agent. */
export interface AgentLockfile {
  port: number
  projectRoot: string
  pid: number
  startedAt: string
}
