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
    author: c.authorDisplayName as string | undefined,
    authorAvatar: c.authorAvatar as string | undefined,
    screenshot: c.screenshot as ReviewComment['screenshot'],
    replies: Array.isArray(c.replies)
      ? (c.replies as Record<string, unknown>[]).map((r) => ({
          id: String(r.id ?? ''),
          authorType: r.authorType as 'member' | 'link-reviewer',
          authorDisplayName: String(r.authorDisplayName ?? ''),
          authorAvatar: r.authorAvatar as string | undefined,
          note: String(r.note ?? ''),
          createdAt: String(r.createdAt ?? ''),
        }))
      : [],
    status: c.status as 'open' | 'resolved',
    createdAt: c.createdAt as string,
    resolvedAt: c.resolvedAt as string | undefined,
    resolvedBy: c.resolvedBy as 'dev' | 'agent' | undefined,
  }
}

export class CloudCommentClient implements CommentStoreInterface {
  private memberToken: string | null = null

  constructor(
    private readonly apiUrl: string,
    private readonly devToken: string,
    private readonly projectId: string,
  ) {}

  setMemberToken(token: string | null): void {
    this.memberToken = token
  }

  private headers(token = this.devToken): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }
  }

  private async apiFetch(urlPath: string, init?: RequestInit, token?: string): Promise<unknown> {
    const res = await fetch(`${this.apiUrl}${urlPath}`, {
      ...init,
      headers: { ...this.headers(token), ...(init?.headers as Record<string, string> ?? {}) },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Cloud API ${urlPath} → ${res.status}: ${body}`)
    }
    return res.json()
  }

  async add(data: Omit<ReviewComment, 'id' | 'createdAt' | 'status'>): Promise<ReviewComment> {
    const token = this.memberToken ?? this.devToken
    let screenshotUploadKey: string | undefined

    if (data.screenshot && typeof data.screenshot === 'string') {
      try {
        const buffer = Buffer.from(data.screenshot, 'base64')
        const presignRes = await fetch(
          `${this.apiUrl}/api/uploadthing?actionType=upload&slug=screenshotUploader`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'x-uploadthing-version': '7.7.4',
              'x-uploadthing-package': 'vanilla',
            },
            body: JSON.stringify({
              files: [{ name: 'screenshot.png', size: buffer.length, type: 'image/png', lastModified: Date.now() }],
              input: {},
            }),
          }
        )
        if (presignRes.ok) {
          const presignData = (await presignRes.json()) as any
          const upload = presignData && presignData.data && presignData.data[0]
          if (upload && upload.url && upload.key) {
            const uploadRes = await fetch(upload.url, {
              method: 'PUT',
              body: buffer,
            })
            if (uploadRes.ok) {
              screenshotUploadKey = upload.key
            } else {
              console.warn('[Patchly] Failed to upload screenshot payload to UploadThing')
            }
          } else {
            console.warn('[Patchly] Presigned URL response invalid structure:', presignData)
          }
        } else {
          const errText = await presignRes.text()
          console.warn('[Patchly] UploadThing presign failed:', presignRes.status, errText)
        }
      } catch (err) {
        console.error('[Patchly] Failed to upload screenshot to UploadThing:', err)
      }
    }

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
      authorDisplayName: data.author ?? 'Dev',
      ...(screenshotUploadKey ? { screenshotUploadKey } : {}),
    }
    const doc = await this.apiFetch('/api/comments', { method: 'POST', body: JSON.stringify(body) }, token)
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

  async addReply(
    commentId: string,
    data: { note: string; authorDisplayName: string; authorAvatar?: string },
  ): Promise<ReviewComment | undefined> {
    const token = this.memberToken ?? this.devToken
    const doc = await this.apiFetch(
      `/api/comments/${encodeURIComponent(commentId)}/replies`,
      { method: 'POST', body: JSON.stringify({ note: data.note, authorDisplayName: data.authorDisplayName }) },
      token,
    )
    return toReviewComment(doc as Record<string, unknown>)
  }
}
