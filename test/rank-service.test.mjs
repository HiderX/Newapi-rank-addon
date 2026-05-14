import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRankService } from '../src/rank-service.mjs'
import { createSqliteStore } from '../src/storage.mjs'

const QUOTA_PER_USD = 500000
const NOW = Date.UTC(2026, 4, 14, 7, 20, 0) / 1000

test('rank service caches period payloads and avoids repeated upstream requests', async () => {
  const { service, calls, store } = await createTestService({ now: NOW })

  const first = await service.getRankPayload({ period: 'day', pageSize: 100 })
  const callsAfterFirst = calls.length
  const second = await service.getRankPayload({ period: 'day', pageSize: 100 })
  const forced = await service.getRankPayload({ period: 'day', pageSize: 100, force: true })

  assert.equal(first.cache.status, 'miss')
  assert.equal(second.cache.status, 'hit')
  assert.equal(forced.cache.status, 'refresh')
  assert.equal(callsAfterFirst > 0, true)
  assert.equal(calls.length, callsAfterFirst + 3)
  assert.deepEqual(
    second.rank_rows.map((row) => row.name),
    ['alice', 'bob']
  )
  store.close()
})

test('rank service bundle returns all periods from cache after first load', async () => {
  const { service, calls, store } = await createTestService({ now: NOW })

  const first = await service.getRankBundle({ pageSize: 100 })
  const callsAfterFirst = calls.length
  const second = await service.getRankBundle({ pageSize: 100 })

  assert.deepEqual(Object.keys(first.periods), ['day', 'week', 'month', 'all'])
  assert.equal(first.periods.day.cache.status, 'miss')
  assert.equal(second.periods.day.cache.status, 'hit')
  assert.equal(calls.length, callsAfterFirst)
  store.close()
})

test('rank service bundle shares duplicate upstream range requests on cold cache', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-service-bundle-share-'))
  const store = createSqliteStore({ sqlitePath: path.join(dir, 'rank.sqlite') })
  const calls = []
  const service = createRankService({
    config: testConfig(),
    store,
    fetchUserData: async (params) => {
      calls.push(new URLSearchParams(params))
      await new Promise((resolve) => setTimeout(resolve, 5))
      const start = Number(params.get('start_timestamp'))
      const end = Number(params.get('end_timestamp'))
      return {
        ok: true,
        status: 200,
        rows: allRows().filter((row) => row.created_at >= start && row.created_at <= end),
      }
    },
    nowSeconds: () => NOW,
  })

  await service.getRankBundle({ pageSize: 100, force: true })
  const rangeCounts = calls.reduce((counts, params) => {
    const key = `${params.get('start_timestamp')}:${params.get('end_timestamp')}`
    counts.set(key, (counts.get(key) || 0) + 1)
    return counts
  }, new Map())

  assert.deepEqual([...rangeCounts.values()].filter((count) => count > 1), [])
  store.close()
})

test('rank service bundle isolates thrown period failures', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-service-bundle-throw-'))
  const store = createSqliteStore({ sqlitePath: path.join(dir, 'rank.sqlite') })
  const service = createRankService({
    config: testConfig(),
    store,
    fetchUserData: async (params) => {
      const start = Number(params.get('start_timestamp'))
      const end = Number(params.get('end_timestamp'))
      if (start === 0 && end === NOW) {
        throw new Error('all period failed')
      }
      return {
        ok: true,
        status: 200,
        rows: allRows().filter((row) => row.created_at >= start && row.created_at <= end),
      }
    },
    nowSeconds: () => NOW,
  })

  const bundle = await service.getRankBundle({ pageSize: 100, force: true })

  assert.equal(bundle.periods.day.ok, undefined)
  assert.equal(bundle.periods.all.ok, false)
  assert.equal(bundle.periods.all.message, 'all period failed')
  store.close()
})


test('rank service honors endTimestamp for historical windows', async () => {
  const { service, calls, store } = await createTestService({ now: NOW })
  const historicalEnd = Date.UTC(2026, 3, 20, 12, 0, 0) / 1000
  const expectedShanghaiDayStart = Date.UTC(2026, 3, 19, 16, 0, 0) / 1000

  await service.getRankPayload({
    period: 'day',
    pageSize: 100,
    endTimestamp: historicalEnd,
  })

  assert.equal(calls[0].get('start_timestamp'), String(expectedShanghaiDayStart))
  assert.equal(calls[0].get('end_timestamp'), String(historicalEnd))
  store.close()
})

test('rank service persists inheritance stars and reuses them after store reopen', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-service-persist-'))
  const sqlitePath = path.join(dir, 'rank.sqlite')
  const calls = []
  let store = createSqliteStore({ sqlitePath })
  let service = createRankService({
    config: testConfig(),
    store,
    fetchUserData: createFetchUserData(calls),
    nowSeconds: () => NOW,
  })

  await service.getRankPayload({ period: 'day', pageSize: 100 })
  const callsAfterFirst = calls.length
  store.close()

  store = createSqliteStore({ sqlitePath })
  service = createRankService({
    config: testConfig(),
    store,
    fetchUserData: createFetchUserData(calls),
    nowSeconds: () => NOW + 120,
  })
  await service.getRankPayload({ period: 'week', pageSize: 100 })

  const historyCallsAfterReopen = calls
    .slice(callsAfterFirst)
    .filter((params) => params.get('start_timestamp') === '0')

  assert.equal(historyCallsAfterReopen.length, 0)
  store.close()
})

test('rank service does not cache upstream failures', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-service-error-'))
  const store = createSqliteStore({ sqlitePath: path.join(dir, 'rank.sqlite') })
  let callCount = 0
  const service = createRankService({
    config: testConfig(),
    store,
    fetchUserData: async () => {
      callCount += 1
      if (callCount === 1) {
        return { ok: false, status: 502, message: 'upstream failed', rows: [] }
      }
      return { ok: true, status: 200, rows: allRows() }
    },
    nowSeconds: () => NOW,
  })

  const failed = await service.getRankPayload({ period: 'day', pageSize: 100 })
  const recovered = await service.getRankPayload({ period: 'day', pageSize: 100 })

  assert.equal(failed.ok, false)
  assert.equal(recovered.ok, undefined)
  assert.equal(callCount > 1, true)
  store.close()
})

test('rank service propagates inheritance history failures and does not cache the rank', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-service-inheritance-error-'))
  const store = createSqliteStore({ sqlitePath: path.join(dir, 'rank.sqlite') })
  const calls = []
  const service = createRankService({
    config: testConfig(),
    store,
    fetchUserData: async (params) => {
      calls.push(new URLSearchParams(params))
      const start = Number(params.get('start_timestamp'))
      const end = Number(params.get('end_timestamp'))

      if (start === 0) {
        return { ok: false, status: 503, message: 'inheritance history failed', rows: [] }
      }

      return {
        ok: true,
        status: 200,
        rows: allRows().filter((row) => row.created_at >= start && row.created_at <= end),
      }
    },
    nowSeconds: () => NOW,
  })

  const failed = await service.getRankPayload({ period: 'day', pageSize: 100 })
  const failedAgain = await service.getRankPayload({ period: 'day', pageSize: 100 })
  const historyCalls = calls.filter((params) => params.get('start_timestamp') === '0')

  assert.equal(failed.ok, false)
  assert.equal(failed.message, 'inheritance history failed')
  assert.equal(failedAgain.ok, false)
  assert.equal(historyCalls.length, 2)
  store.close()
})

test('rank service force refresh recomputes persisted inheritance stars', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-service-force-inheritance-'))
  const store = createSqliteStore({ sqlitePath: path.join(dir, 'rank.sqlite') })
  const calls = []
  let historicalQuota = quotaUsd(570)
  const service = createRankService({
    config: testConfig(),
    store,
    fetchUserData: async (params) => {
      calls.push(new URLSearchParams(params))
      const start = Number(params.get('start_timestamp'))
      const end = Number(params.get('end_timestamp'))
      return {
        ok: true,
        status: 200,
        rows: allRows()
          .map((row) => row.created_at < Date.UTC(2026, 4, 7, 0, 0, 0) / 1000
            ? { ...row, quota: historicalQuota }
            : row)
          .filter((row) => row.created_at >= start && row.created_at <= end),
      }
    },
    nowSeconds: () => NOW,
  })

  const first = await service.getRankPayload({ period: 'day', pageSize: 100 })
  historicalQuota = quotaUsd(1520)
  const refreshed = await service.getRankPayload({ period: 'day', pageSize: 100, force: true })

  assert.notEqual(
    refreshed.rank_rows[0].tier.inherited_stars,
    first.rank_rows[0].tier.inherited_stars
  )
  assert.equal(calls.filter((params) => params.get('start_timestamp') === '0').length, 2)
  store.close()
})


async function createTestService({ now }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-service-'))
  const store = createSqliteStore({ sqlitePath: path.join(dir, 'rank.sqlite') })
  const calls = []
  const service = createRankService({
    config: testConfig(),
    store,
    fetchUserData: createFetchUserData(calls),
    nowSeconds: () => now,
  })
  return { service, calls, store }
}

function createFetchUserData(calls) {
  return async (params) => {
    calls.push(new URLSearchParams(params))
    const start = Number(params.get('start_timestamp'))
    const end = Number(params.get('end_timestamp'))
    return {
      ok: true,
      status: 200,
      rows: allRows().filter((row) => row.created_at >= start && row.created_at <= end),
    }
  }
}

function allRows() {
  return [
    {
      user_id: 0,
      username: 'alice',
      created_at: Date.UTC(2026, 3, 20, 8, 0, 0) / 1000,
      quota: quotaUsd(570),
      count: 1,
      token_used: 100,
    },
    {
      user_id: 0,
      username: 'alice',
      created_at: Date.UTC(2026, 4, 14, 2, 0, 0) / 1000,
      quota: quotaUsd(5),
      count: 2,
      token_used: 200,
    },
    {
      user_id: 0,
      username: 'bob',
      created_at: Date.UTC(2026, 4, 14, 3, 0, 0) / 1000,
      quota: quotaUsd(3),
      count: 3,
      token_used: 300,
    },
  ]
}

function testConfig() {
  return {
    rankOptions: {
      timezone: 'Asia/Shanghai',
      utcOffsetMinutes: 480,
      resetDay: 7,
    },
    cacheOptions: {
      freshSeconds: 60,
      allFreshSeconds: 300,
      staleSeconds: 600,
    },
  }
}

function quotaUsd(usd) {
  return usd * QUOTA_PER_USD
}
