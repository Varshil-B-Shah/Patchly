// app/api/uploadthing/core.ts
// Defines the UploadThing file router. Middleware validates the reviewer's
// linkToken or the dev's devToken before allowing an upload.

import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { ReviewLink } from '@/lib/models/ReviewLink'

const f = createUploadthing()

export const ourFileRouter = {
  screenshotUploader: f({ image: { maxFileSize: '2MB', maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const authHeader = req.headers.get('authorization') ?? ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      if (!token) throw new Error('Unauthorized')

      await connectDb()

      // devToken → full access
      const project = await Project.findOne({ devToken: token }).lean()
      if (project) return { projectId: String(project._id) }

      // linkToken → write-only; reject if revoked or expired
      const link = await ReviewLink.findOne({ token }).lean()
      if (!link) throw new Error('Unauthorized')
      if (link.revokedAt) throw new Error('Link revoked')
      if (link.expiresAt && link.expiresAt < new Date()) throw new Error('Link expired')

      return { projectId: String(link.projectId) }
    })
    .onUploadComplete(async ({ file }) => {
      // Return key + url — echoed back to the uploader by the SDK.
      // The client passes the key to POST /api/comments as screenshotUploadKey.
      return { key: file.key, url: file.url }
    }),
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter
