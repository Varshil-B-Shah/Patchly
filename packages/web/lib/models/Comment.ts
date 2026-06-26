// lib/models/Comment.ts
import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose'

const FingerprintSchema = new Schema(
  {
    tagName: { type: String, required: true },
    identifyingAttrs: { type: Map, of: String },
    textSnippet: { type: String },
    domIndex: { type: Number },  // Nth instance of this data-patchly-src in DOM order
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

const ReplySchema = new Schema(
  {
    authorType: { type: String, enum: ['member', 'link-reviewer'], required: true },
    authorId: { type: String, required: true },
    authorDisplayName: { type: String, required: true },
    authorAvatar: { type: String },
    reviewerId: { type: String },
    note: { type: String, required: true },  // UNTRUSTED — never eval, never innerHTML
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
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
  pagePath: { type: String },                         // derived pathname — origin-independent matching
  note: { type: String, required: true },             // UNTRUSTED — never eval, never innerHTML
  authorType: { type: String, enum: ['member', 'link-reviewer'], required: true },
  authorId: { type: String, required: true },         // NextAuth user.id OR reviewLink._id
  authorUserId: { type: String },                     // GitHub id for authenticated members
  authorDisplayName: { type: String, required: true },// ALWAYS denormalized
  authorAvatar: { type: String },                     // GitHub avatar URL for authed members
  reviewerId: { type: String },                       // persistent UUID from client localStorage
  screenshot: { type: ScreenshotSchema },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  createdAt: { type: Date, default: () => new Date() },
  resolvedAt: { type: Date },
  resolvedBy: { type: String, enum: ['dev', 'agent'] },
  replies: { type: [ReplySchema], default: [] },
})

CommentSchema.index({ projectId: 1, status: 1 })      // hot query path
CommentSchema.index({ projectId: 1, pagePath: 1 })    // overlay reads by path

export type CommentDoc = InferSchemaType<typeof CommentSchema> & { _id: Types.ObjectId }

export const Comment: Model<CommentDoc> =
  (models.Comment as Model<CommentDoc>) ?? model<CommentDoc>('Comment', CommentSchema)
