// agent/comments/cloudClient.ts
// Cloud proxy for the comment store — calls the Patchly web API instead of
// reading/writing a local JSON file. Activated when PATCHLY_CLOUD_API_URL,
// PATCHLY_DEV_TOKEN, and PATCHLY_PROJECT_ID are all set in the environment.
//
// SERIALIZATION BOUNDARY: toReviewComment() maps cloud API responses (which
// use authorDisplayName, ObjectId strings, ISO Date strings) to the local
// ReviewComment shape. Nothing past this function sees raw API objects.

import type { ReviewComment } from '../../shared/comments.js'
import type { CommentStoreInterface } from './store.js'

function toReviewComment(c: Record<string, unknown>): ReviewComment {
  return {
    id: c.id as string,
    kind: c.kind as 'element' | 'area',
    patchlySrc: c.patchlySrc as string | undefined,
    tag: c.tag as string | undefined,
    componentName: c.componentName as string | null | undefined,
    fingerprint: c.fingerprint as ReviewComment['fingerprint'],
    rect: c.rect as ReviewComment['rect'],
    pageUrl: c.pageUrl as string,
    note: c.note as string,
    // Cloud uses authorDisplayName; ReviewComment uses author — map here once.
    author: c.authorDisplayName as string | undefined,
    // Cloud screenshots are { url, key }; local are base64 strings — union is fine.
    screenshot: c.screenshot as ReviewComment['screenshot'],
    status: c.status as 'open' | 'resolved',
    createdAt: c.createdAt as string,
    resolvedAt: c.resolvedAt as string | undefined,
    resolvedBy: c.resolvedBy as 'dev' | 'agent' | undefined,
  }
}

export class CloudCommentClient implements CommentStoreInterface {
  constructor(
    private readonly apiUrl: string,
    private readonly devToken: string,
    private readonly projectId: string,
  ) {}

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.devToken}`,
    }
  }

  private async apiFetch(urlPath: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${this.apiUrl}${urlPath}`, {
      ...init,
      headers: { ...this.headers, ...(init?.headers as Record<string, string> ?? {}) },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Cloud API ${urlPath} → ${res.status}: ${body}`)
    }
    return res.json()
  }

  async add(data: Omit<ReviewComment, 'id' | 'createdAt' | 'status'>): Promise<ReviewComment> {
    const body = {
      projectId: this.projectId,
      kind: data.kind,
      patchlySrc: data.patchlySrc,
      tag: data.tag,
      componentName: data.componentName,
      fingerprint: data.fingerprint,
      rect: data.rect,
      pageUrl: data.pageUrl,
      note: data.note,
      // Extension comments use author; cloud API requires authorDisplayName.
      authorDisplayName: data.author ?? 'Dev',
      // Extension screenshots are base64 — not uploaded to UploadThing.
      // Phase B screenshots come from the client overlay via UploadThing only.
    }
    const doc = await this.apiFetch('/api/comments', { method: 'POST', body: JSON.stringify(body) })
    return toReviewComment(doc as Record<string, unknown>)
  }

  async list(status?: 'open' | 'resolved' | 'all'): Promise<ReviewComment[]> {
    const s = status ?? 'open'
    const docs = await this.apiFetch(
      `/api/comments?projectId=${encodeURIComponent(this.projectId)}&status=${s}`,
    )
    return (docs as Record<string, unknown>[]).map(toReviewComment)
  }

  async get(id: string): Promise<ReviewComment | undefined> {
    // No single-comment GET endpoint — fetch all and find.
    const all = await this.list('all')
    return all.find((c) => c.id === id)
  }

  async resolve(id: string, resolvedBy: 'dev' | 'agent'): Promise<ReviewComment | undefined> {
    const doc = await this.apiFetch(`/api/comments/${encodeURIComponent(id)}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({ resolvedBy }),
    })
    return toReviewComment(doc as Record<string, unknown>)
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.apiFetch(`/api/comments/${encodeURIComponent(id)}`, { method: 'DELETE' })
      return true
    } catch {
      return false
    }
  }

  async clearResolved(): Promise<number> {
    const result = await this.apiFetch(
      `/api/comments?projectId=${encodeURIComponent(this.projectId)}&status=resolved`,
      { method: 'DELETE' },
    )
    return (result as { deleted: number }).deleted
  }
}
