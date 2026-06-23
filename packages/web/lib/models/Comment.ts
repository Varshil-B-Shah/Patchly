// lib/models/Comment.ts
import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose'

const FingerprintSchema = new Schema(
  {
    tagName: { type: String, required: true },
    identifyingAttrs: { type: Map, of: String },
    textSnippet: { type: String },
  },
  { _id: false },
)

const RectSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
  },
  { _id: false },
)

const ScreenshotSchema = new Schema(
  {
    url: { type: String, required: true },            // UploadThing CDN URL
    key: { type: String, required: true },            // UploadThing file key — needed for deletion
  },
  { _id: false },
)

const CommentSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  kind: { type: String, enum: ['element', 'area'], required: true },
  patchlySrc: { type: String },
  tag: { type: String },
  componentName: { type: String },
  fingerprint: { type: FingerprintSchema },
  rect: { type: RectSchema },
  pageUrl: { type: String, required: true },
  note: { type: String, required: true },             // UNTRUSTED — never eval, never innerHTML
  authorType: { type: String, enum: ['member', 'link-reviewer'], required: true },
  authorId: { type: String, required: true },         // NextAuth user.id OR reviewLink._id
  authorDisplayName: { type: String, required: true },// ALWAYS denormalized
  reviewerId: { type: String },                       // persistent UUID from client localStorage
  screenshot: { type: ScreenshotSchema },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  createdAt: { type: Date, default: () => new Date() },
  resolvedAt: { type: Date },
  resolvedBy: { type: String, enum: ['dev', 'agent'] },
})

CommentSchema.index({ projectId: 1, status: 1 })      // hot query path
CommentSchema.index({ projectId: 1, pageUrl: 1 })

export type CommentDoc = InferSchemaType<typeof CommentSchema> & { _id: Types.ObjectId }

export const Comment: Model<CommentDoc> =
  (models.Comment as Model<CommentDoc>) ?? model<CommentDoc>('Comment', CommentSchema)
