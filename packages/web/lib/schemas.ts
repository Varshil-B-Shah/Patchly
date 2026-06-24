// lib/schemas.ts
// zod request validators. Note text is bounded but stored verbatim — never eval'd.

import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  domains: z.array(z.string().min(1).max(253)).default([]),
})

export const patchDomainsSchema = z.object({
  domains: z.array(z.string().min(1).max(253)),
})

export const createLinkSchema = z.object({
  label: z.string().min(1).max(200),
  expiresAt: z.string().datetime().optional(),
})

const fingerprintSchema = z.object({
  tagName: z.string(),
  identifyingAttrs: z.record(z.string(), z.string()).optional(),
  textSnippet: z.string().optional(),
})

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
})

export const createCommentSchema = z.object({
  projectId: z.string().min(1),
  kind: z.enum(['element', 'area']),
  patchlySrc: z.string().optional(),
  tag: z.string().optional(),
  componentName: z.string().nullable().optional(),
  fingerprint: fingerprintSchema.optional(),
  rect: rectSchema.optional(),
  pageUrl: z.string().min(1),
  note: z.string().min(1).max(5000), // UNTRUSTED — stored verbatim, never eval'd
  authorDisplayName: z.string().min(1).max(120),
  reviewerId: z.string().max(200).optional(),
  screenshotUploadKey: z.string().optional(), // ignored in Step 1 (TODO Step 2)
})

export const resolveCommentSchema = z.object({
  resolvedBy: z.enum(['dev', 'agent']),
})
