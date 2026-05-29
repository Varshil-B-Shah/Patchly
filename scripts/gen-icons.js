// scripts/gen-icons.js
// One-time script to generate placeholder PNG icons.
// Run: node scripts/gen-icons.js
// Pure Node.js — no extra dependencies.

import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'extension', 'assets', 'icons')
mkdirSync(outDir, { recursive: true })

// Indigo #4f46e5 → R=79, G=70, B=229
const R = 79, G = 70, B = 229

// CRC32 implementation (required by PNG spec for chunk integrity)
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcInput = Buffer.concat([typeBytes, data])
  const crcVal = Buffer.alloc(4)
  crcVal.writeUInt32BE(crc32(crcInput))
  return Buffer.concat([len, typeBytes, data, crcVal])
}

function makePNG(size) {
  // IHDR: width, height, 8-bit depth, RGB color type (2), no compression/filter/interlace
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // color type: RGB

  // Raw image data: one filter byte (0=None) + RGB pixels per scanline
  const scanline = Buffer.alloc(1 + size * 3)
  scanline[0] = 0  // filter type None
  for (let x = 0; x < size; x++) {
    scanline[1 + x * 3]     = R
    scanline[1 + x * 3 + 1] = G
    scanline[1 + x * 3 + 2] = B
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => scanline))
  const idat = deflateSync(raw)

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

for (const size of [16, 48, 128]) {
  const outPath = path.join(outDir, `icon${size}.png`)
  writeFileSync(outPath, makePNG(size))
  console.log(`Generated ${outPath}`)
}
