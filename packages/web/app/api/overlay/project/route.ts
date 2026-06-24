// app/api/overlay/project/route.ts
// GET — public. The client overlay calls this with its current domain to discover
// the projectId. Returns ONLY { projectId, name } — no tokens, no member info.

import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { ReviewLink } from '@/lib/models/ReviewLink'
import { ok, err } from '@/lib/http'

// Normalize a domain for case-insensitive, protocol-stripped matching.
function normDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const domain = url.searchParams.get('domain')

  await connectDb()

  // Preferred: resolve via link token. Works on any domain (tunnels included) and
  // requires no pre-registered domain list. The token is already a capability.
  if (token) {
    const link = await ReviewLink.findOne({ token }).lean()
    if (!link || link.revokedAt) return err('Invalid or revoked link', 404)
    if (link.expiresAt && link.expiresAt < new Date()) return err('Link expired', 404)
    const project = await Project.findById(link.projectId).lean()
    if (!project) return err('Project not found', 404)
    return ok({ projectId: String(project._id), name: project.name })
  }

  // Fallback: domain match (manual script-tag path without a token).
  if (!domain) return err('token or domain is required', 400)

  const norm = normDomain(domain)

  // Domains are stored as-entered; match case-insensitively against the normalized input.
  const project = await Project.findOne({
    domains: { $elemMatch: { $regex: `^${norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
  }).lean()

  if (!project) return err('No project for this domain', 404)
  return ok({ projectId: String(project._id), name: project.name })
}
