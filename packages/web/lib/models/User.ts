// lib/models/User.ts
// Minimal user directory — upserted on every dashboard visit. _id IS the GitHub
// numeric id (string), so upserts and membership lookups are trivial. Used to
// render member names + avatars; auth itself stays JWT (no DB adapter).
import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

const UserSchema = new Schema(
  {
    _id: { type: String }, // GitHub numeric id as string
    username: { type: String }, // GitHub login
    name: { type: String },
    image: { type: String },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
)

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: string }

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) ?? model<UserDoc>('User', UserSchema)
