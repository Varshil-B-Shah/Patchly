// lib/models/ReviewLink.ts
import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose'
import crypto from 'crypto'

const ReviewLinkSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  token: { type: String, required: true, unique: true, default: () => crypto.randomUUID() },
  label: { type: String, required: true },
  createdBy: { type: String, required: true },        // NextAuth user.id
  createdAt: { type: Date, default: () => new Date() },
  expiresAt: { type: Date },                          // optional, checked on every comment write
  revokedAt: { type: Date },                          // set to revoke; checked on every comment write
})

ReviewLinkSchema.index({ projectId: 1 })    // token unique index is declared on the field

export type ReviewLinkDoc = InferSchemaType<typeof ReviewLinkSchema> & { _id: Types.ObjectId }

export const ReviewLink: Model<ReviewLinkDoc> =
  (models.ReviewLink as Model<ReviewLinkDoc>) ?? model<ReviewLinkDoc>('ReviewLink', ReviewLinkSchema)
