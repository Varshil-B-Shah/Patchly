// agent/comments/__tests__/store.test.ts
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { CommentStore } from '../store.js'
import { parsePatchlySrc } from '../../../shared/comments.js'

function mkTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'patchly-test-'))
}

describe('CommentStore', () => {
  let tmpDir: string
  let store: CommentStore

  beforeEach(() => {
    tmpDir = mkTmpDir()
    store = new CommentStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('add → list → resolve → list again', async () => {
    const c = await store.add({
      kind: 'element',
      patchlySrc: 'src/Button.tsx:10:2',
      tag: 'button',
      pageUrl: 'http://localhost:3000/',
      note: 'make this the brand color',
    })
    assert.ok(c.id, 'should have an id')
    assert.equal(c.status, 'open')
    assert.ok(c.createdAt)

    const open = await store.list('open')
    assert.equal(open.length, 1)
    assert.equal(open[0].id, c.id)

    const resolved = await store.resolve(c.id, 'dev')
    assert.ok(resolved)
    assert.equal(resolved!.status, 'resolved')
    assert.equal(resolved!.resolvedBy, 'dev')
    assert.ok(resolved!.resolvedAt)

    assert.equal((await store.list('open')).length, 0)
    assert.equal((await store.list('resolved')).length, 1)
    assert.equal((await store.list('all')).length, 1)
  })

  test('missing file returns empty list', async () => {
    assert.deepEqual(await store.list(), [])
  })

  test('corrupt JSON returns empty list', async () => {
    const dir = path.join(tmpDir, '.patchly')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'comments.json'), 'NOT JSON', 'utf-8')
    assert.deepEqual(await store.list(), [])
  })

  test('non-array JSON returns empty list', async () => {
    const dir = path.join(tmpDir, '.patchly')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'comments.json'), '{"bad":"data"}', 'utf-8')
    assert.deepEqual(await store.list(), [])
  })

  test('atomic write: tmp file is cleaned up', async () => {
    await store.add({ kind: 'area', rect: { x: 0, y: 0, w: 100, h: 50 }, pageUrl: 'http://localhost/', note: 'area note' })
    const tmp = path.join(tmpDir, '.patchly', 'comments.json.tmp')
    assert.ok(!fs.existsSync(tmp), 'tmp file should not remain after write')
  })

  test('delete removes comment', async () => {
    const c = await store.add({ kind: 'element', patchlySrc: 'src/A.tsx:1:1', tag: 'div', pageUrl: 'http://localhost/', note: 'x' })
    assert.ok(await store.delete(c.id))
    assert.equal((await store.list()).length, 0)
    assert.ok(!await store.delete(c.id), 'deleting again returns false')
  })

  test('clearResolved removes only resolved comments', async () => {
    const a = await store.add({ kind: 'element', patchlySrc: 'src/A.tsx:1:1', tag: 'div', pageUrl: 'http://localhost/', note: 'x' })
    const b = await store.add({ kind: 'element', patchlySrc: 'src/B.tsx:1:1', tag: 'div', pageUrl: 'http://localhost/', note: 'y' })
    await store.resolve(a.id, 'agent')
    const cleared = await store.clearResolved()
    assert.equal(cleared, 1)
    const remaining = await store.list()
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].id, b.id)
  })

  test('resolve non-existent id returns undefined', async () => {
    assert.equal(await store.resolve('no-such-id', 'agent'), undefined)
  })

  test('get by id', async () => {
    const c = await store.add({ kind: 'element', patchlySrc: 'src/X.tsx:5:2', tag: 'span', pageUrl: 'http://localhost/', note: 'test' })
    assert.deepEqual((await store.get(c.id))?.id, c.id)
    assert.equal(await store.get('missing'), undefined)
  })
})

describe('parsePatchlySrc', () => {
  test('valid format', () => {
    assert.deepEqual(parsePatchlySrc('src/components/Hero.tsx:42:4'), { file: 'src/components/Hero.tsx', line: 42, column: 4 })
  })
  test('invalid format returns null', () => {
    assert.equal(parsePatchlySrc('src/Foo.tsx'), null)
    assert.equal(parsePatchlySrc(''), null)
  })
})
