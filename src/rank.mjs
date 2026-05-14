const DAY_SECONDS = 86400
const RESET_DAY = 7
const RESET_UTC_OFFSET_MINUTES = 8 * 60
const QUOTA_PER_USD = 500000
const MAX_REFERENCE_USD = 1520
const MAX_REFERENCE_STARS = 200
const QUOTA_PER_STAR = (MAX_REFERENCE_USD * QUOTA_PER_USD) / MAX_REFERENCE_STARS
const PERIOD_DAYS = new Map([
  ['day', 1],
  ['week', 7],
])
const PRE_KING_TIERS = [
  { code: 'bronze', name: '倔强青铜', divisions: ['III', 'II', 'I'], starsPerDivision: 3 },
  { code: 'silver', name: '秩序白银', divisions: ['III', 'II', 'I'], starsPerDivision: 3 },
  { code: 'gold', name: '荣耀黄金', divisions: ['IV', 'III', 'II', 'I'], starsPerDivision: 4 },
  { code: 'platinum', name: '尊贵铂金', divisions: ['IV', 'III', 'II', 'I'], starsPerDivision: 4 },
  { code: 'diamond', name: '永恒钻石', divisions: ['V', 'IV', 'III', 'II', 'I'], starsPerDivision: 5 },
  { code: 'star', name: '至尊星耀', divisions: ['V', 'IV', 'III', 'II', 'I'], starsPerDivision: 5 },
]
const KING_TIERS = [
  { code: 'strongest-king', name: '最强王者', minStars: 0 },
  { code: 'extraordinary-king', name: '非凡王者', minStars: 10 },
  { code: 'peerless-king', name: '无双王者', minStars: 25 },
  { code: 'ultimate-king', name: '绝世王者', minStars: 35 },
  { code: 'sacred-king', name: '至圣王者', minStars: 50 },
  { code: 'glory-king', name: '荣耀王者', minStars: 75 },
  { code: 'legend-king', name: '传奇王者', minStars: 100 },
]

export function getPeriodRange(period = 'day', now = Math.floor(Date.now() / 1000), options = {}) {
  const normalized =
    period === 'all' || period === 'month' || PERIOD_DAYS.has(period) ? period : 'day'
  const end = normalizeTimestamp(now)
  if (normalized === 'all') {
    return { start: 0, end, period: normalized }
  }
  if (normalized === 'month') {
    return {
      start: getSeasonMonthStart(end, options),
      end,
      period: normalized,
    }
  }
  if (normalized === 'week') {
    return { start: getLocalWeekStart(end, options), end, period: normalized }
  }

  return {
    start: getLocalDayStart(end, options),
    end,
    period: normalized,
  }
}

export function aggregateUserRank(rows, options = {}) {
  const limit = normalizeLimit(options.limit, options.maxLimit)
  const totals = new Map()
  let rowIndex = 0

  // 核心流程：接口返回的是“用户 + 时间桶”数据，必须按用户 ID 合并，避免用户改名后拆成多行。
  for (const row of Array.isArray(rows) ? rows : []) {
    const username = getUsername(row)
    const identity = getUserIdentity(row, username)
    const current = totals.get(identity.key) || {
      username,
      quota: 0,
      count: 0,
      token_used: 0,
      _usernameFreshness: -Infinity,
    }
    if (identity.userId !== undefined) {
      current.user_id = identity.userId
    }

    current.quota += Number(row?.quota) || 0
    current.count += Number(row?.count) || 0
    current.token_used += Number(row?.token_used) || 0

    const usernameFreshness = getUsernameFreshness(row, rowIndex)
    if (usernameFreshness >= current._usernameFreshness) {
      current.username = username
      current._usernameFreshness = usernameFreshness
    }

    totals.set(identity.key, current)
    rowIndex += 1
  }

  const sorted = Array.from(totals.values()).sort((a, b) => b.quota - a.quota)
  const totalQuota = sorted.reduce((sum, row) => sum + row.quota, 0)
  const totalCount = sorted.reduce((sum, row) => sum + row.count, 0)
  const totalTokens = sorted.reduce((sum, row) => sum + row.token_used, 0)

  return {
    rankRows: sorted.slice(0, limit).map(({ _usernameFreshness, ...row }, index) => ({
      rank: index + 1,
      ...row,
    })),
    totalQuota,
    totalCount,
    totalTokens,
    userCount: sorted.length,
  }
}

export function presentRankRows(rankRows, options = {}) {
  const tierQuotaByUserId = options.tierQuotaByUserId
  return rankRows.map((row) => {
    const username = getUsername(row)
    const identity = getUserIdentity(row, username)
    const tierQuota =
      tierQuotaByUserId instanceof Map && tierQuotaByUserId.has(identity.key)
        ? tierQuotaByUserId.get(identity.key)
        : row?.quota

    return {
      ...row,
      name: username,
      tier: calculateUserTier(tierQuota),
    }
  })
}

export function calculateUserTier(quota) {
  const totalStars = Math.max(0, Math.floor((Number(quota) || 0) / QUOTA_PER_STAR))
  if (totalStars >= 100) {
    const kingStars = totalStars - 100
    const tier = [...KING_TIERS].reverse().find((item) => kingStars >= item.minStars)
    const label = tier.name
    return {
      code: tier.code,
      name: tier.name,
      label,
      display: formatTierDisplay(label, kingStars, true),
      stars: kingStars,
      total_stars: totalStars,
      quota_usd: (Number(quota) || 0) / QUOTA_PER_USD,
    }
  }

  let consumedStars = 0
  for (const tier of PRE_KING_TIERS) {
    const tierStars = tier.divisions.length * tier.starsPerDivision
    if (totalStars < consumedStars + tierStars) {
      const tierProgress = totalStars - consumedStars
      const divisionIndex = Math.floor(tierProgress / tier.starsPerDivision)
      const stars = tierProgress % tier.starsPerDivision
      const division = tier.divisions[divisionIndex]
      const label = `${tier.name}${division}`
      return {
        code: tier.code,
        name: tier.name,
        division,
        label,
        display: formatTierDisplay(label, stars, false),
        stars,
        total_stars: totalStars,
        quota_usd: (Number(quota) || 0) / QUOTA_PER_USD,
      }
    }
    consumedStars += tierStars
  }

  return calculateUserTier(100 * QUOTA_PER_STAR)
}

export function buildUserQuotaMap(rows) {
  const aggregate = aggregateUserRank(rows, {
    limit: Number.MAX_SAFE_INTEGER,
    maxLimit: Number.MAX_SAFE_INTEGER,
  })
  return new Map(aggregate.rankRows.map((row) => [getUserIdentity(row).key, row.quota]))
}

function getUserIdentity(row, username = getUsername(row)) {
  const userId = row?.user_id ?? row?.userId
  if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
    return {
      key: String(userId),
      userId,
    }
  }

  return {
    key: `username:${username}`,
    userId: undefined,
  }
}

function getUsername(row) {
  return String(row?.username || 'unknown')
}

function getUsernameFreshness(row, fallbackOrder) {
  const timestamp = Number(row?.created_at ?? row?.timestamp)
  return Number.isFinite(timestamp) ? timestamp : fallbackOrder
}

function normalizeLimit(limit, maxLimit = 100) {
  const value = Number(limit)
  if (!Number.isFinite(value) || value <= 0) return 10
  return Math.min(maxLimit, Math.floor(value))
}

function normalizeTimestamp(timestamp) {
  const value = Number(timestamp)
  if (!Number.isFinite(value) || value < 0) return Math.floor(Date.now() / 1000)
  return Math.floor(value)
}

function getSeasonMonthStart(timestamp, options = {}) {
  const resetDay = Number(options.resetDay || RESET_DAY)
  const offsetMinutes = Number(options.utcOffsetMinutes ?? RESET_UTC_OFFSET_MINUTES)
  const offsetSeconds = offsetMinutes * 60
  const shiftedDate = new Date((timestamp + offsetSeconds) * 1000)
  let year = shiftedDate.getUTCFullYear()
  let month = shiftedDate.getUTCMonth()
  const day = shiftedDate.getUTCDate()

  if (day < resetDay) {
    month -= 1
    if (month < 0) {
      month = 11
      year -= 1
    }
  }

  return Math.floor(Date.UTC(year, month, resetDay, 0, 0, 0) / 1000 - offsetSeconds)
}

function getLocalDayStart(timestamp, options = {}) {
  const offsetMinutes = Number(options.utcOffsetMinutes ?? RESET_UTC_OFFSET_MINUTES)
  const offsetSeconds = offsetMinutes * 60
  const localDayIndex = Math.floor((timestamp + offsetSeconds) / DAY_SECONDS)
  return localDayIndex * DAY_SECONDS - offsetSeconds
}

function getLocalWeekStart(timestamp, options = {}) {
  const dayStart = getLocalDayStart(timestamp, options)
  const offsetMinutes = Number(options.utcOffsetMinutes ?? RESET_UTC_OFFSET_MINUTES)
  const localDayStart = dayStart + offsetMinutes * 60
  const dayOfWeek = new Date(localDayStart * 1000).getUTCDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7
  return dayStart - daysSinceMonday * DAY_SECONDS
}

function formatTierDisplay(label, stars, showStars) {
  if (!showStars) return label
  return `${label}⭐${stars}`
}
