import {
  aggregateUserRank,
  buildInheritedStarsMap,
  buildUserQuotaMap,
  getPeriodRange,
  presentRankRows,
} from './rank.mjs'

const BUNDLE_PERIODS = ['day', 'week', 'month', 'all']

export function createRankService(options = {}) {
  const config = options.config || {}
  const store = options.store
  const fetchUserData = options.fetchUserData
  const nowSeconds = options.nowSeconds || (() => Math.floor(Date.now() / 1000))
  const refreshLocks = new Map()

  if (typeof fetchUserData !== 'function') {
    throw new Error('fetchUserData is required')
  }

  async function getRankPayload({
    period = 'day',
    pageSize = 100,
    force = false,
    endTimestamp,
    fetchContext = createFetchContext(),
  } = {}) {
    const hasExplicitEndTimestamp = endTimestamp !== undefined && endTimestamp !== null && endTimestamp !== ''
    const now = nowSeconds()
    const rangeEnd = normalizeTimestamp(endTimestamp, now)
    const range = getPeriodRange(period, rangeEnd, config.rankOptions)
    const cacheKey = buildCacheKey(range, pageSize, hasExplicitEndTimestamp)
    const freshSeconds = range.period === 'all'
      ? config.cacheOptions?.allFreshSeconds
      : config.cacheOptions?.freshSeconds
    const staleSeconds = config.cacheOptions?.staleSeconds

    if (!force && store) {
      const cached = store.getResponseCache(cacheKey, now)
      if (cached?.state === 'fresh') {
        return withCacheStatus(cached.payload, 'hit')
      }
      if (cached?.state === 'stale') {
        refreshInBackground(cacheKey, () =>
          refreshRankPayload({ cacheKey, range, pageSize, freshSeconds, staleSeconds, fetchContext, force })
        )
        return withCacheStatus(cached.payload, 'stale')
      }
    }

    const payload = await refreshRankPayload({
      cacheKey,
      range,
      pageSize,
      freshSeconds,
      staleSeconds,
      fetchContext,
      force,
    })
    return withCacheStatus(payload, force ? 'refresh' : 'miss')
  }

  async function getRankBundle({ pageSize = 100, force = false } = {}) {
    const fetchContext = createFetchContext()
    const periodEntries = await Promise.all(
      BUNDLE_PERIODS.map(async (period) => {
        try {
          return [period, await getRankPayload({ period, pageSize, force, fetchContext })]
        } catch (error) {
          return [period, buildPeriodErrorPayload(period, error)]
        }
      })
    )
    return {
      periods: Object.fromEntries(periodEntries),
      generated_at: nowSeconds(),
    }
  }

  async function refreshRankPayload({
    cacheKey,
    range,
    pageSize,
    freshSeconds,
    staleSeconds,
    fetchContext,
    force,
  }) {
    if (refreshLocks.has(cacheKey)) return refreshLocks.get(cacheKey)

    const refreshPromise = computeRankPayload(range, pageSize, fetchContext, { force })
      .then((payload) => {
        if (store && payload.ok !== false) {
          store.setResponseCache(cacheKey, payload, {
            createdAt: nowSeconds(),
            freshSeconds: normalizeCacheSeconds(freshSeconds, 60),
            staleSeconds: normalizeCacheSeconds(staleSeconds, 600),
          })
        }
        return payload
      })
      .finally(() => {
        refreshLocks.delete(cacheKey)
      })

    refreshLocks.set(cacheKey, refreshPromise)
    return refreshPromise
  }

  async function computeRankPayload(range, pageSize, fetchContext, options = {}) {
    const rankResult = await fetchRange(range, fetchContext)
    if (!rankResult.ok) return rankResult

    const rawRows = rankResult.rows
    const tierRange = getPeriodRange('month', range.end, config.rankOptions)
    const tierResult =
      range.period === 'month'
        ? { ok: true, rows: rawRows }
        : await fetchRange(tierRange, fetchContext)
    if (!tierResult.ok) return tierResult

    const tierRows = tierResult.rows
    const inheritedStarsResult = await getInheritedStars(tierRange.start, fetchContext, options)
    if (!inheritedStarsResult.ok) return inheritedStarsResult

    const inheritedStarsByUserId = inheritedStarsResult.starsByUserId
    const tierQuotaByUserId = buildUserQuotaMap(tierRows)
    const aggregate = aggregateUserRank(rawRows, { limit: pageSize })
    const rankRows = presentRankRows(aggregate.rankRows, { tierQuotaByUserId, inheritedStarsByUserId })

    return {
      period: range.period,
      start_timestamp: range.start,
      end_timestamp: range.end,
      page_size: pageSize,
      tier_period: tierRange.period,
      tier_start_timestamp: tierRange.start,
      tier_end_timestamp: tierRange.end,
      source_rows: rawRows.length,
      tier_source_rows: tierRows.length,
      user_count: aggregate.userCount,
      total_quota: aggregate.totalQuota,
      total_count: aggregate.totalCount,
      total_tokens: aggregate.totalTokens,
      rank_rows: rankRows,
    }
  }

  async function getInheritedStars(seasonStart, fetchContext, options = {}) {
    const cached = options.force ? null : store?.getInheritanceStars(seasonStart)
    if (cached?.exists) {
      return {
        ok: true,
        starsByUserId: cached.starsByUserId,
      }
    }

    const inheritanceResult =
      seasonStart > 0
        ? await fetchRange({ start: 0, end: seasonStart - 1 }, fetchContext)
        : { ok: true, rows: [] }
    if (!inheritanceResult.ok) return inheritanceResult

    const inheritedStarsByUserId = buildInheritedStarsMap(
      inheritanceResult.rows,
      seasonStart,
      config.rankOptions
    )
    store?.setInheritanceStars(seasonStart, inheritedStarsByUserId, nowSeconds())
    return {
      ok: true,
      starsByUserId: inheritedStarsByUserId,
    }
  }

  function refreshInBackground(cacheKey, refresh) {
    if (refreshLocks.has(cacheKey)) return
    refresh().catch((error) => {
      console.error(error instanceof Error ? error.message : error)
    })
  }

  function fetchRange(range, fetchContext) {
    const key = `${range.start}:${range.end}`
    const existing = fetchContext.get(key)
    if (existing) return existing

    // 同一次 bundle 请求内共享相同时间窗的上游请求，避免冷缓存首屏重复拉历史数据。
    const promise = fetchUserData(rangeToParams(range))
    fetchContext.set(key, promise)
    return promise
  }

  return {
    getRankPayload,
    getRankBundle,
  }
}

function createFetchContext() {
  return new Map()
}

function buildPeriodErrorPayload(period, error) {
  return {
    ok: false,
    status: 500,
    period,
    message: error instanceof Error ? error.message : 'Ranking period failed',
    rank_rows: [],
  }
}

function buildCacheKey(range, pageSize, includeEndTimestamp = false) {
  if (includeEndTimestamp) {
    return `rank:${range.period}:${range.start}:${range.end}:${pageSize}`
  }
  return `rank:${range.period}:${range.start}:${pageSize}`
}

function rangeToParams(range) {
  const params = new URLSearchParams()
  params.set('start_timestamp', String(range.start))
  params.set('end_timestamp', String(range.end))
  return params
}

function withCacheStatus(payload, status) {
  return {
    ...payload,
    cache: {
      status,
      generated_at: payload.end_timestamp,
    },
  }
}

function normalizeCacheSeconds(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.floor(number)
}

function normalizeTimestamp(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.floor(number)
}
