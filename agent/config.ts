import fs from 'fs'
import path from 'path'

const CONFIG_FILE = '.patchlyrc.json'

export interface PatchlyConfig {
  projectRoot: string | null
  azureEndpoint?: string
  azureApiKey?: string
  model?: string
}

export type ResolvedConfig = PatchlyConfig & { projectRoot: string }

export async function loadConfig(): Promise<PatchlyConfig> {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE)

  if (!fs.existsSync(configPath)) {
    return { projectRoot: null }
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(raw) as PatchlyConfig
  } catch {
    console.error(`Could not read ${CONFIG_FILE}`)
    return { projectRoot: null }
  }
}

export async function saveConfig(data: PatchlyConfig): Promise<void> {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE)
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2))
}
