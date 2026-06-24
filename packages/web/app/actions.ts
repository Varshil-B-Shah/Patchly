'use server'
// Server actions for the dev dashboard. Each action verifies the session,
// confirms project ownership, then mutates the DB directly.

import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { ReviewLink } from '@/lib/models/ReviewLink'
import { Comment } from '@/lib/models/Comment'
import { deleteScreenshot } from '@/lib/uploadthing'
import { isMember, isOwner } from '@/lib/projectAccess'

async function requireSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Not signed in')
  return session.user.id
}

// Owner-only: invite mgmt, member removal, domains, links, devToken.
async function requireOwner(projectId: string) {
  const userId = await requireSession()
  await connectDb()
  const project = await Project.findById(projectId).lean()
  if (!project || !isOwner(project, userId)) throw new Error('Forbidden')
  return project
}

// Member (incl. owner): view + manage comments.
async function requireMember(projectId: string) {
  const userId = await requireSession()
  await connectDb()
  const project = await Project.findById(projectId).lean()
  if (!project || !isMember(project, userId)) throw new Error('Forbidden')
  return project
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function createProject(formData: FormData): Promise<void> {
  const userId = await requireSession()
  const name    = String(formData.get('name') ?? '').trim()
  const rawDoms = String(formData.get('domains') ?? '').trim()
  if (!name) return
  const domains = rawDoms ? rawDoms.split(',').map((d) => d.trim()).filter(Boolean) : []
  await connectDb()
  await Project.create({
    name,
    ownerId: userId,
    members: [{ userId, role: 'owner' }],
    domains,
  })
  revalidatePath('/dashboard')
}

// ── Team / invites ──────────────────────────────────────────────────────────────

export async function generateInvite(projectId: string): Promise<void> {
  await requireOwner(projectId)
  const token = crypto.randomUUID()
  await Project.findByIdAndUpdate(projectId, { inviteToken: token })
  // No return — the page re-reads inviteToken after revalidation and renders the URL.
  revalidatePath(`/dashboard/${projectId}`)
}

export async function disableInvite(projectId: string): Promise<void> {
  await requireOwner(projectId)
  await Project.findByIdAndUpdate(projectId, { $unset: { inviteToken: 1 } })
  revalidatePath(`/dashboard/${projectId}`)
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  const project = await requireOwner(projectId)
  // Never remove the project owner.
  if (project.ownerId === userId) return
  await Project.findByIdAndUpdate(projectId, { $pull: { members: { userId } } })
  revalidatePath(`/dashboard/${projectId}`)
}

export async function patchDomains(projectId: string, formData: FormData) {
  await requireOwner(projectId)
  const rawDoms = String(formData.get('domains') ?? '').trim()
  const domains = rawDoms ? rawDoms.split(',').map((d) => d.trim()).filter(Boolean) : []
  await Project.findByIdAndUpdate(projectId, { domains })
  revalidatePath(`/dashboard/${projectId}`)
}

// ── Review links ───────────────────────────────────────────────────────────────

export async function createLink(projectId: string, formData: FormData) {
  await requireOwner(projectId)
  const userId    = await requireSession()
  const label     = String(formData.get('label') ?? '').trim()
  const expiresAt = formData.get('expiresAt') ? new Date(String(formData.get('expiresAt'))) : undefined
  if (!label) return { error: 'Label is required' }
  const link = await ReviewLink.create({ projectId, label, createdBy: userId, expiresAt })
  // The token goes in the dev's .env (PATCHLY_REVIEW_TOKEN); the Vite plugin injects
  // the overlay. There's no /review page — clients open the tunnel URL directly.
  revalidatePath(`/dashboard/${projectId}`)
  return { token: link.token }
}

export async function revokeLink(projectId: string, linkId: string) {
  await requireOwner(projectId)
  await ReviewLink.findByIdAndUpdate(linkId, { revokedAt: new Date() })
  revalidatePath(`/dashboard/${projectId}`)
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function resolveComment(projectId: string, commentId: string) {
  await requireMember(projectId)
  const comment = await Comment.findById(commentId)
  if (!comment || String(comment.projectId) !== projectId) return
  comment.status     = 'resolved'
  comment.resolvedAt = new Date()
  comment.resolvedBy = 'dev'
  await comment.save()
  await deleteScreenshot(comment.screenshot?.key)
  revalidatePath(`/dashboard/${projectId}/comments`)
}

export async function deleteComment(projectId: string, commentId: string) {
  await requireMember(projectId)
  const comment = await Comment.findById(commentId)
  if (!comment || String(comment.projectId) !== projectId) return
  await deleteScreenshot(comment.screenshot?.key)
  await comment.deleteOne()
  revalidatePath(`/dashboard/${projectId}/comments`)
}

export async function clearResolved(projectId: string): Promise<void> {
  await requireMember(projectId)
  const docs = await Comment.find({ projectId, status: 'resolved' })
  for (const doc of docs) await deleteScreenshot(doc.screenshot?.key)
  await Comment.deleteMany({ projectId, status: 'resolved' })
  revalidatePath(`/dashboard/${projectId}/comments`)
}
