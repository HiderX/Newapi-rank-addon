import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSqliteStore } from '../src/storage.mjs'

test('sqlite store persists response cache and inheritance cache across restarts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-store-'))
  const sqlitePath = path.join(dir, 'rank.sqlite')
  let store = createSqliteStore({ sqlitePath })

  store.setResponseCache('rank:day', { period: 'day', rank_rows: [{ name: 'alice' }] }, {
    createdAt: 100,
    freshSeconds: 60,
    staleSeconds: 300,
  })
  store.setInheritanceStars(1778083200, new Map([
    ['username:alice', 42],
    ['username:bob', 50],
  ]), 100)
  store.setMeta('webdav.last_backup_at', '100')
  store.close()

  store = createSqliteStore({ sqlitePath })
  assert.deepEqual(store.getResponseCache('rank:day', 120), {
    state: 'fresh',
    payload: { period: 'day', rank_rows: [{ name: 'alice' }] },
  })
  assert.deepEqual(store.getResponseCache('rank:day', 200).state, 'stale')
  assert.deepEqual(store.getResponseCache('rank:day', 420).state, 'stale')
  assert.equal(store.getResponseCache('rank:day', 500), null)

  const inheritance = store.getInheritanceStars(1778083200)
  assert.equal(inheritance.exists, true)
  assert.equal(inheritance.starsByUserId.get('username:alice'), 42)
  assert.equal(inheritance.starsByUserId.get('username:bob'), 50)
  assert.equal(store.getMeta('webdav.last_backup_at'), '100')

  const snapshotPath = path.join(dir, 'snapshot.sqlite')
  await store.snapshotTo(snapshotPath)
  const snapshotStat = await stat(snapshotPath)
  assert.equal(snapshotStat.size > 0, true)
  store.close()
})

test('sqlite store treats staleSeconds as the window after fresh expiry', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-store-stale-'))
  const store = createSqliteStore({ sqlitePath: path.join(dir, 'rank.sqlite') })

  store.setResponseCache('rank:week', { period: 'week' }, {
    createdAt: 100,
    freshSeconds: 60,
    staleSeconds: 30,
  })

  assert.deepEqual(store.getResponseCache('rank:week', 150).state, 'fresh')
  assert.deepEqual(store.getResponseCache('rank:week', 170).state, 'stale')
  assert.equal(store.getResponseCache('rank:week', 191), null)
  store.close()
})
