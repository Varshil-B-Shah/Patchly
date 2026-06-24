// agent/comments/store.ts
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { ReviewComment } from '../../shared/comments.js'

// TODO(PhaseB): swap JSON file read/write for a remote API call — see CloudCommentClient.

export interface CommentStoreInterface {
  add(data: Omit<ReviewComment, 'id' | 'createdAt' | 'status'>): Promise<ReviewComment>
  list(status?: 'open' | 'resolved' | 'all'): Promise<ReviewComment[]>
  get(id: string): Promise<ReviewComment | undefined>
  resolve(id: string, resolvedBy: 'dev' | 'agent'): Promise<ReviewComment | undefined>
  delete(id: string): Promise<boolean>
  clearResolved(): Promise<number>
}

export class CommentStore implements CommentStoreInterface {
  private readonly filePath: string

  constructor(projectRoot: string) {
    this.filePath = path.join(projectRoot, '.patchly', 'comments.json')
  }

  private read(): ReviewComment[] {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as ReviewComment[]) : []
    } catch {
      return [] // missing or corrupt file — tolerate gracefully
    }
  }

  private write(comments: ReviewComment[]): void {
    const dir = path.dirname(this.filePath)
    fs.mkdirSync(dir, { recursive: true })
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(comments, null, 2), 'utf-8')
    fs.renameSync(tmp, this.filePath) // atomic on POSIX; best-effort on Windows
  }

  async add(data: Omit<ReviewComment, 'id' | 'createdAt' | 'status'>): Promise<ReviewComment> {
    const comment: ReviewComment = {
      ...data,
      id: crypto.randomUUID(),
      status: 'open',
      createdAt: new Date().toISOString(),
    }
    const comments = this.read()
    comments.push(comment)
    this.write(comments)
    return comment
  }

  async list(status?: 'open' | 'resolved' | 'all'): Promise<ReviewComment[]> {
    const all = this.read()
    if (!status || status === 'all') return all
    return all.filter((c) => c.status === status)
  }

  async get(id: string): Promise<ReviewComment | undefined> {
    return this.read().find((c) => c.id === id)
  }

  async resolve(id: string, resolvedBy: 'dev' | 'agent'): Promise<ReviewComment | undefined> {
    const comments = this.read()
    const idx = comments.findIndex((c) => c.id === id)
    if (idx === -1) return undefined
    comments[idx] = {
      ...comments[idx],
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy,
    }
    this.write(comments)
    return comments[idx]
  }

  async delete(id: string): Promise<boolean> {
    const comments = this.read()
    const idx = comments.findIndex((c) => c.id === id)
    if (idx === -1) return false
    comments.splice(idx, 1)
    this.write(comments)
    return true
  }

  async clearResolved(): Promise<number> {
    const comments = this.read()
    const remaining = comments.filter((c) => c.status !== 'resolved')
    const count = comments.length - remaining.length
    if (count > 0) this.write(remaining)
    return count
  }
}
