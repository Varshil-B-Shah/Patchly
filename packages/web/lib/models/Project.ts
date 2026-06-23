// lib/models/Project.ts
import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'
import crypto from 'crypto'

const ProjectSchema = new Schema({
  name: { type: String, required: true },
  ownerId: { type: String, required: true },          // NextAuth session user.id (GitHub)
  domains: { type: [String], default: [] },           // ["localhost:3000", "myapp.vercel.app"]
  devToken: { type: String, required: true, unique: true, default: () => crypto.randomUUID() },
  createdAt: { type: Date, default: () => new Date() },
})

ProjectSchema.index({ devToken: 1 }, { unique: true })
ProjectSchema.index({ domains: 1 })

export type ProjectDoc = InferSchemaType<typeof ProjectSchema> & { _id: import('mongoose').Types.ObjectId }

export const Project: Model<ProjectDoc> =
  (models.Project as Model<ProjectDoc>) ?? model<ProjectDoc>('Project', ProjectSchema)
