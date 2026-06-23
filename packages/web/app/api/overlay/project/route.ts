// app/api/overlay/project/route.ts
// GET — public. The client overlay calls this with its current domain to discover
// the projectId. Returns ONLY { projectId, name } — no tokens, no member info.

import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
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
  const domain = new URL(req.url).searchParams.get('domain')
  if (!domain) return err('domain is required', 400)

  const norm = normDomain(domain)
  await connectDb()

  // Domains are stored as-entered; match case-insensitively against the normalized input.
  const project = await Project.findOne({
    domains: { $elemMatch: { $regex: `^${norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
  }).lean()

  if (!project) return err('No project for this domain', 404)
  return ok({ projectId: String(project._id), name: project.name })
}
