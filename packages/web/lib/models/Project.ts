// lib/models/Project.ts
import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'
import crypto from 'crypto'

const MemberSchema = new Schema(
  {
    userId: { type: String, required: true },
    role: { type: String, enum: ['owner', 'member'], required: true },
  },
  { _id: false },
)

const ProjectSchema = new Schema({
  name: { type: String, required: true },
  ownerId: { type: String, required: true },          // NextAuth session user.id (GitHub)
  members: { type: [MemberSchema], default: [] },     // team — owner included; empty on legacy docs
  inviteToken: { type: String },                      // present = invite link active; regenerable
  domains: { type: [String], default: [] },           // ["localhost:3000", "myapp.vercel.app"]
  devToken: { type: String, required: true, unique: true, default: () => crypto.randomUUID() },
  createdAt: { type: Date, default: () => new Date() },
})

ProjectSchema.index({ domains: 1 })          // devToken unique index is declared on the field

export type ProjectDoc = InferSchemaType<typeof ProjectSchema> & { _id: import('mongoose').Types.ObjectId }

export const Project: Model<ProjectDoc> =
  (models.Project as Model<ProjectDoc>) ?? model<ProjectDoc>('Project', ProjectSchema)
