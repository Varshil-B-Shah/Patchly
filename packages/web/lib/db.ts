// lib/db.ts
// Mongoose connection singleton. Next.js dev hot-reload re-imports modules
// repeatedly, which would open a new connection each time — so we cache the
// connection (and the in-flight promise) on globalThis.

import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  // eslint-disable-next-line no-var
  var _patchlyMongoose: MongooseCache | undefined
}

const cache: MongooseCache = (globalThis._patchlyMongoose ??= { conn: null, promise: null })

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn

  if (!cache.promise) {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.')
    }
    cache.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      // Windows + Node.js 18+ sometimes fails TLS negotiation with Atlas.
      // These options force the driver to be more lenient.
      tls: true,
      tlsAllowInvalidCertificates: true,
    })
  }

  try {
    cache.conn = await cache.promise
  } catch (err) {
    cache.promise = null
    throw err
  }
  return cache.conn
}
