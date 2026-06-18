#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const CONFIG_FILE = '.patchlyrc.json'

type Framework = 'nextjs' | 'react-vite' | 'vue-vite' | 'unknown'

function detectFramework(projectRoot: string): Framework {
  const pkgPath = path.resolve(projectRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) return 'unknown'

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies }

  if (deps['next']) return 'nextjs'
  if (deps['vite'] && deps['react']) return 'react-vite'
  if (deps['vite'] && deps['vue']) return 'vue-vite'
  return 'unknown'
}

function detectDevPort(projectRoot: string): number {
  const framework = detectFramework(projectRoot)
  return framework === 'nextjs' ? 3000 : 5173
}

function hasPatchlyPlugin(projectRoot: string): boolean {
  for (const fileName of ['vite.config.js', 'vite.config.ts']) {
    const configPath = path.resolve(projectRoot, fileName)
    if (!fs.existsSync(configPath)) continue
    const content = fs.readFileSync(configPath, 'utf8')
    if (content.includes('patchlyPlugin')) return true
  }
  return false
}

function updateGitignore(projectRoot: string): void {
  const gitignorePath = path.resolve(projectRoot, '.gitignore')
  if (!fs.existsSync(gitignorePath)) return

  let content = fs.readFileSync(gitignorePath, 'utf8')
  if (content.includes('.patchlyrc.json')) return

  content += `${content.endsWith('\n') ? '' : '\n'}.patchlyrc.json\n`
  fs.writeFileSync(gitignorePath, content)
  console.log('Updated .gitignore')
}

async function init(): Promise<void> {
  const projectRoot = process.cwd()
  const configPath = path.resolve(projectRoot, CONFIG_FILE)

  if (fs.existsSync(configPath)) {
    console.log(`${CONFIG_FILE} already exists. Delete it and re-run to reset.`)
    return
  }

  const framework = detectFramework(projectRoot)
  const devPort = detectDevPort(projectRoot)

  const config = {
    projectRoot,
    devServerPort: devPort,
    framework,
    azureEndpoint: '',
    azureApiKey: '',
    model: 'gpt-4o',
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  updateGitignore(projectRoot)

  console.log('\nPatchly initialized!\n')
  console.log(`Created ${CONFIG_FILE}`)
  console.log(`Detected framework: ${framework}`)
  console.log(`Detected dev port: ${devPort}`)
  console.log('\n------------------------------------')

  if (hasPatchlyPlugin(projectRoot)) {
    console.log('patchlyPlugin() is already configured in vite.config.js')
  } else {
    console.log('Next step: add Patchly to your vite.config.js\n')
    console.log(`  import { patchlyPlugin } from 'patchly/vite'`)
    console.log('\n  export default defineConfig({')
    console.log('    plugins: [patchlyPlugin(), react()],  // patchlyPlugin FIRST')
    console.log('  })')
  }

  console.log('------------------------------------\n')
  console.log(`Now fill in your Azure OpenAI credentials in ${CONFIG_FILE}`)
  console.log('Or set env vars: PATCHLY_AZURE_ENDPOINT and PATCHLY_AZURE_KEY\n')
  console.log('Then run: npx patchly')
}

init()
