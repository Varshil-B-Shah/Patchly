// agent/config.js
import fs from 'fs'
import path from 'path'

const CONFIG_FILE = '.patchlyrc.json'

export async function loadConfig() {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE)

  if (!fs.existsSync(configPath)) {
    return { projectRoot: null }
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    console.error(`Could not read ${CONFIG_FILE}`)
    return { projectRoot: null }
  }
}

export async function saveConfig(data) {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE)
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2))
}
