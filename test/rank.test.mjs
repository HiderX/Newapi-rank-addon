import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateUserRank,
  buildUserQuotaMap,
  calculateUserTier,
  getPeriodRange,
  presentRankRows,
} from '../src/rank.mjs'

const QUOTA_PER_USD = 500000

const rows = [
  {
    username: 'alice',
    created_at: 1778306400,
    quota: 100,
    count: 2,
    token_used: 30,
  },
  {
    username: 'bob',
    created_at: 1778306400,
    quota: 300,
    count: 1,
    token_used: 10,
  },
  {
    username: 'alice',
    created_at: 1778310000,
    quota: 250,
    count: 4,
    token_used: 60,
  },
  {
    username: 'carol',
    created_at: 1778310000,
    quota: 50,
    count: 5,
    token_used: 20,
  },
]

test('aggregateUserRank groups quota rows by username when user id is unavailable and sorts by total quota descending', () => {
  const result = aggregateUserRank(rows, { limit: 10 })

  assert.deepEqual(
    result.rankRows.map((row) => ({
      rank: row.rank,
      username: row.username,
      quota: row.quota,
      count: row.count,
      token_used: row.token_used,
    })),
    [
      { rank: 1, username: 'alice', quota: 350, count: 6, token_used: 90 },
      { rank: 2, username: 'bob', quota: 300, count: 1, token_used: 10 },
      { rank: 3, username: 'carol', quota: 50, count: 5, token_used: 20 },
    ]
  )
  assert.equal(result.totalQuota, 700)
})

test('aggregateUserRank groups renamed users by user id and shows the newest username', () => {
  const result = aggregateUserRank(
    [
      {
        user_id: 7,
        username: 'old-name',
        created_at: 1000,
        quota: 100,
        count: 1,
        token_used: 10,
      },
      {
        user_id: 8,
        username: 'other',
        created_at: 1500,
        quota: 500,
        count: 1,
        token_used: 5,
      },
      {
        user_id: 7,
        username: 'new-name',
        created_at: 2000,
        quota: 200,
        count: 2,
        token_used: 20,
      },
    ],
    { limit: 10 }
  )

  assert.deepEqual(
    result.rankRows.map((row) => ({
      rank: row.rank,
      user_id: row.user_id,
      username: row.username,
      quota: row.quota,
      count: row.count,
      token_used: row.token_used,
    })),
    [
      { rank: 1, user_id: 8, username: 'other', quota: 500, count: 1, token_used: 5 },
      { rank: 2, user_id: 7, username: 'new-name', quota: 300, count: 3, token_used: 30 },
    ]
  )
  assert.equal(result.userCount, 2)
  assert.equal(result.totalQuota, 800)
})

test('aggregateUserRank limits the returned ranking rows without changing total quota', () => {
  const result = aggregateUserRank(rows, { limit: 2 })

  assert.deepEqual(
    result.rankRows.map((row) => row.username),
    ['alice', 'bob']
  )
  assert.equal(result.totalQuota, 700)
})

test('aggregateUserRank supports page sizes up to 100 users', () => {
  const manyRows = Array.from({ length: 120 }, (_, index) => ({
    username: `user-${index + 1}`,
    quota: 120 - index,
  }))

  const result = aggregateUserRank(manyRows, { limit: 100 })

  assert.equal(result.rankRows.length, 100)
  assert.equal(result.userCount, 120)
})

test('presentRankRows keeps real usernames and adds monthly tier data', () => {
  const { rankRows } = aggregateUserRank(rows, { limit: 3 })
  const presented = presentRankRows(rankRows, {
    tierQuotaByUserId: new Map([
      ['username:alice', quotaUsd(760)],
      ['username:bob', quotaUsd(380)],
      ['username:carol', quotaUsd(0)],
    ]),
  })

  assert.deepEqual(
    presented.map((row) => ({
      rank: row.rank,
      name: row.name,
      tier: row.tier.display,
    })),
    [
      { rank: 1, name: 'alice', tier: '最强王者⭐0' },
      { rank: 2, name: 'bob', tier: '永恒钻石V' },
      { rank: 3, name: 'carol', tier: '倔强青铜III' },
    ]
  )
  assert.equal('medal' in presented[0], false)
})

test('presentRankRows matches monthly tier quota by user id after a username change', () => {
  const { rankRows } = aggregateUserRank(
    [{ user_id: 7, username: 'new-name', quota: quotaUsd(1) }],
    { limit: 10 }
  )
  const tierQuotaByUserId = buildUserQuotaMap([
    { user_id: 7, username: 'old-name', created_at: 1000, quota: quotaUsd(300) },
    { user_id: 7, username: 'new-name', created_at: 2000, quota: quotaUsd(460) },
  ])

  const presented = presentRankRows(rankRows, { tierQuotaByUserId })

  assert.equal(presented[0].name, 'new-name')
  assert.equal(presented[0].tier.display, '最强王者⭐0')
})

test('presentRankRows falls back to current row quota when monthly tier quota is missing', () => {
  const presented = presentRankRows([{ rank: 4, username: 'dave', quota: 1 }])

  assert.equal(presented[0].name, 'dave')
  assert.equal(presented[0].tier.display, '倔强青铜III')
})

test('getPeriodRange maps rank periods to upstream timestamp windows', () => {
  const now = 1778312127

  assert.deepEqual(getPeriodRange('day', now), {
    start: Date.UTC(2026, 4, 8, 16, 0, 0) / 1000,
    end: now,
    period: 'day',
  })
  assert.deepEqual(getPeriodRange('week', now), {
    start: Date.UTC(2026, 4, 3, 16, 0, 0) / 1000,
    end: now,
    period: 'week',
  })
  assert.deepEqual(getPeriodRange('month', now), {
    start: Date.UTC(2026, 4, 6, 16, 0, 0) / 1000,
    end: now,
    period: 'month',
  })
  assert.deepEqual(getPeriodRange('all', now), {
    start: 0,
    end: now,
    period: 'all',
  })
  assert.deepEqual(getPeriodRange('bad-value', now), {
    start: Date.UTC(2026, 4, 8, 16, 0, 0) / 1000,
    end: now,
    period: 'day',
  })
})

test('getPeriodRange resets daily ranking at Asia/Shanghai midnight', () => {
  const beforeShanghaiMidnight = Date.UTC(2026, 4, 9, 15, 30, 0) / 1000
  const afterShanghaiMidnight = Date.UTC(2026, 4, 9, 16, 30, 0) / 1000

  assert.deepEqual(getPeriodRange('day', beforeShanghaiMidnight), {
    start: Date.UTC(2026, 4, 8, 16, 0, 0) / 1000,
    end: beforeShanghaiMidnight,
    period: 'day',
  })
  assert.deepEqual(getPeriodRange('day', afterShanghaiMidnight), {
    start: Date.UTC(2026, 4, 9, 16, 0, 0) / 1000,
    end: afterShanghaiMidnight,
    period: 'day',
  })
})

test('getPeriodRange resets monthly ranking on the 7th at Asia/Shanghai midnight', () => {
  const afterReset = Date.UTC(2026, 4, 10, 4, 0, 0) / 1000
  const beforeReset = Date.UTC(2026, 4, 6, 4, 0, 0) / 1000

  assert.deepEqual(getPeriodRange('month', afterReset), {
    start: Date.UTC(2026, 4, 6, 16, 0, 0) / 1000,
    end: afterReset,
    period: 'month',
  })
  assert.deepEqual(getPeriodRange('month', beforeReset), {
    start: Date.UTC(2026, 3, 6, 16, 0, 0) / 1000,
    end: beforeReset,
    period: 'month',
  })
})

test('getPeriodRange resets weekly ranking at Asia/Shanghai natural week start', () => {
  const beforeMondayMidnight = Date.UTC(2026, 4, 10, 15, 30, 0) / 1000
  const afterMondayMidnight = Date.UTC(2026, 4, 10, 16, 30, 0) / 1000

  assert.deepEqual(getPeriodRange('week', beforeMondayMidnight), {
    start: Date.UTC(2026, 4, 3, 16, 0, 0) / 1000,
    end: beforeMondayMidnight,
    period: 'week',
  })
  assert.deepEqual(getPeriodRange('week', afterMondayMidnight), {
    start: Date.UTC(2026, 4, 10, 16, 0, 0) / 1000,
    end: afterMondayMidnight,
    period: 'week',
  })
})

test('calculateUserTier maps 0 to 1520 USD into the Honor of Kings ladder', () => {
  assert.deepEqual(pickTier(calculateUserTier(quotaUsd(0))), {
    label: '倔强青铜III',
    display: '倔强青铜III',
    stars: 0,
    totalStars: 0,
  })
  assert.deepEqual(pickTier(calculateUserTier(quotaUsd(68.4))), {
    label: '秩序白银III',
    display: '秩序白银III',
    stars: 0,
    totalStars: 9,
  })
  assert.deepEqual(pickTier(calculateUserTier(quotaUsd(136.8))), {
    label: '荣耀黄金IV',
    display: '荣耀黄金IV',
    stars: 0,
    totalStars: 18,
  })
  assert.deepEqual(pickTier(calculateUserTier(quotaUsd(380))), {
    label: '永恒钻石V',
    display: '永恒钻石V',
    stars: 0,
    totalStars: 50,
  })
  assert.deepEqual(pickTier(calculateUserTier(quotaUsd(570))), {
    label: '至尊星耀V',
    display: '至尊星耀V',
    stars: 0,
    totalStars: 75,
  })
  assert.deepEqual(pickTier(calculateUserTier(quotaUsd(668.8))), {
    label: '至尊星耀III',
    display: '至尊星耀III',
    stars: 3,
    totalStars: 88,
  })
  assert.deepEqual(pickTier(calculateUserTier(quotaUsd(760))), {
    label: '最强王者',
    display: '最强王者⭐0',
    stars: 0,
    totalStars: 100,
  })
  assert.deepEqual(pickTier(calculateUserTier(quotaUsd(782.8))), {
    label: '最强王者',
    display: '最强王者⭐3',
    stars: 3,
    totalStars: 103,
  })
  assert.deepEqual(pickTier(calculateUserTier(quotaUsd(836))), {
    label: '非凡王者',
    display: '非凡王者⭐10',
    stars: 10,
    totalStars: 110,
  })
  assert.deepEqual(pickTier(calculateUserTier(quotaUsd(1330))), {
    label: '荣耀王者',
    display: '荣耀王者⭐75',
    stars: 75,
    totalStars: 175,
  })
  assert.deepEqual(pickTier(calculateUserTier(quotaUsd(1520))), {
    label: '传奇王者',
    display: '传奇王者⭐100',
    stars: 100,
    totalStars: 200,
  })
})

function quotaUsd(usd) {
  return usd * QUOTA_PER_USD
}

function pickTier(tier) {
  return {
    label: tier.label,
    display: tier.display,
    stars: tier.stars,
    totalStars: tier.total_stars,
  }
}
