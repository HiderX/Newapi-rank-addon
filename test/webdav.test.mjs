import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSqliteStore } from '../src/storage.mjs'
import { runWebDavBackup } from '../src/webdav.mjs'

test('runWebDavBackup creates missing target folders and uploads sqlite snapshot', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-webdav-'))
  const store = createSqliteStore({ sqlitePath: path.join(dir, 'rank.sqlite') })
  store.setMeta('seed', 'ok')

  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({
      url: String(url),
      method: options.method || 'GET',
      authorization: options.headers?.Authorization,
      bodyIsBuffer: Buffer.isBuffer(options.body),
    })
    return {
      ok: true,
      status: options.method === 'MKCOL' ? 201 : 201,
      text: async () => '',
    }
  }

  const result = await runWebDavBackup({
    store,
    webdavOptions: {
      enabled: true,
      baseUrl: 'https://dav.example.com/root',
      username: 'dav-user',
      password: 'dav-pass',
      targetFolder: 'newapi/rank',
      backupIntervalSeconds: 3600,
      retention: 0,
      timeoutSeconds: 30,
    },
    nowSeconds: () => 1778313600,
    tempDir: dir,
    fetchImpl,
  })

  assert.equal(result.uploaded, true)
  assert.equal(store.getMeta('webdav.last_backup_at'), '1778313600')
  assert.deepEqual(
    calls.map((call) => ({ method: call.method, url: call.url })),
    [
      { method: 'MKCOL', url: 'https://dav.example.com/root/newapi/' },
      { method: 'MKCOL', url: 'https://dav.example.com/root/newapi/rank/' },
      {
        method: 'PUT',
        url: 'https://dav.example.com/root/newapi/rank/rank-addon-20260509-080000.sqlite',
      },
    ]
  )
  assert.match(calls[0].authorization, /^Basic /)
  assert.equal(calls[2].bodyIsBuffer, true)
  store.close()
})

test('runWebDavBackup skips upload inside backup interval', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-webdav-skip-'))
  const store = createSqliteStore({ sqlitePath: path.join(dir, 'rank.sqlite') })
  store.setMeta('webdav.last_backup_at', '1778313500')
  let callCount = 0

  const result = await runWebDavBackup({
    store,
    webdavOptions: {
      enabled: true,
      baseUrl: 'https://dav.example.com/root',
      username: 'dav-user',
      password: 'dav-pass',
      targetFolder: 'newapi/rank',
      backupIntervalSeconds: 3600,
    },
    nowSeconds: () => 1778313600,
    tempDir: dir,
    fetchImpl: async () => {
      callCount += 1
      return { ok: true, status: 200, text: async () => '' }
    },
  })

  assert.deepEqual(result, { skipped: true, reason: 'interval' })
  assert.equal(callCount, 0)
  store.close()
})

test('runWebDavBackup prunes old remote backups by retention count', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-webdav-retention-'))
  const store = createSqliteStore({ sqlitePath: path.join(dir, 'rank.sqlite') })
  const calls = []

  const result = await runWebDavBackup({
    store,
    webdavOptions: {
      enabled: true,
      baseUrl: 'https://dav.example.com/root',
      username: 'dav-user',
      password: 'dav-pass',
      targetFolder: 'rank',
      backupIntervalSeconds: 3600,
      retention: 2,
      timeoutSeconds: 30,
    },
    nowSeconds: () => 1778313600,
    tempDir: dir,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || 'GET' })
      if (options.method === 'PROPFIND') {
        return {
          ok: true,
          status: 207,
          text: async () => `
            <d:multistatus>
              <d:response><d:href>/root/rank/rank-addon-20260501-000000.sqlite</d:href></d:response>
              <d:response><d:href>/root/rank/rank-addon-20260502-000000.sqlite</d:href></d:response>
              <d:response><d:href>/root/rank/rank-addon-20260509-080000.sqlite</d:href></d:response>
            </d:multistatus>
          `,
        }
      }
      return { ok: true, status: options.method === 'DELETE' ? 204 : 201, text: async () => '' }
    },
  })

  assert.equal(result.uploaded, true)
  assert.deepEqual(
    calls.filter((call) => call.method === 'DELETE'),
    [{ method: 'DELETE', url: 'https://dav.example.com/root/rank/rank-addon-20260501-000000.sqlite' }]
  )
  store.close()
})
