// scripts/build-ext.mjs
// Bundles all four extension entry points with esbuild (IIFE, no ES modules
// so Chrome can load content scripts), then assembles extension/dist/ as a
// self-contained, load-unpacked directory.

import * as esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

const EXT_DIR = 'extension'
const OUT_DIR = path.join(EXT_DIR, 'dist')
const watch = process.argv.includes('--watch')

fs.mkdirSync(path.join(OUT_DIR, 'popup'), { recursive: true })
if (fs.existsSync(path.join(EXT_DIR, 'assets'))) {
  fs.mkdirSync(path.join(OUT_DIR, 'assets'), { recursive: true })
}

const buildOptions = {
  entryPoints: {
    background:    path.join(EXT_DIR, 'background.ts'),
    content:       path.join(EXT_DIR, 'content.ts'),
    overlay:       path.join(EXT_DIR, 'overlay.ts'),
    'popup/popup': path.join(EXT_DIR, 'popup', 'popup.ts'),
  },
  bundle: true,
  format: /** @type {const} */ ('iife'),
  target: 'chrome110',
  outdir: OUT_DIR,
  sourcemap: false,
  logLevel: 'info',
}

function copyStatics() {
  fs.copyFileSync(path.join(EXT_DIR, 'overlay.css'), path.join(OUT_DIR, 'overlay.css'))
  fs.copyFileSync(path.join(EXT_DIR, 'popup', 'popup.html'), path.join(OUT_DIR, 'popup', 'popup.html'))

  // Deep-copy assets/ if present
  const assetsDir = path.join(EXT_DIR, 'assets')
  if (fs.existsSync(assetsDir)) copyDir(assetsDir, path.join(OUT_DIR, 'assets'))

  // Write a dist-local manifest.json with paths relative to dist/
  const src = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'))
  src.background.service_worker = 'background.js'
  src.content_scripts[0].js = ['content.js', 'overlay.js']
  src.content_scripts[0].css = ['overlay.css']
  src.action.default_popup = 'popup/popup.html'
  fs.writeFileSync(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(src, null, 2),
  )

  console.log('[build-ext] Static assets copied.')
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry)
    const d = path.join(dest, entry)
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d)
  }
}

if (watch) {
  const ctx = await esbuild.context(buildOptions)
  copyStatics()
  await ctx.watch()
  console.log('[build-ext] Watching for changes…')
} else {
  await esbuild.build(buildOptions)
  copyStatics()
  console.log('[build-ext] Done. Load extension/dist/ as an unpacked extension.')
}
