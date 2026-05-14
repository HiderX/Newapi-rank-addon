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
const KING_INHERITANCE_KEYS = [
  { minStars: 150, key: '王者150' },
  { minStars: 125, key: '王者125' },
  { minStars: 100, key: '王者100' },
  { minStars: 75, key: '王者75' },
  { minStars: 50, key: '王者50' },
  { minStars: 40, key: '王者40' },
  { minStars: 30, key: '王者30' },
  { minStars: 20, key: '王者20' },
  { minStars: 10, key: '王者10' },
  { minStars: 0, key: '王者0' },
]
const INHERITANCE_RULES = new Map(
  [
    ['倔强青铜III', '倔强青铜III', '倔强青铜III', '倔强青铜III'],
    ['倔强青铜II', '倔强青铜II', '倔强青铜II', '倔强青铜II'],
    ['倔强青铜I', '倔强青铜I', '倔强青铜I', '倔强青铜I'],
    ['秩序白银III', '秩序白银III', '秩序白银III', '秩序白银III'],
    ['秩序白银II', '秩序白银III', '秩序白银III', '秩序白银III'],
    ['秩序白银I', '秩序白银II', '秩序白银III', '秩序白银III'],
    ['荣耀黄金IV', '秩序白银II', '秩序白银III', '秩序白银III'],
    ['荣耀黄金III', '秩序白银I', '秩序白银II', '秩序白银III'],
    ['荣耀黄金II', '荣耀黄金IV', '秩序白银II', '秩序白银III'],
    ['荣耀黄金I', '荣耀黄金III', '秩序白银I', '秩序白银II'],
    ['尊贵铂金IV', '荣耀黄金II', '荣耀黄金IV', '秩序白银II'],
    ['尊贵铂金III', '荣耀黄金II', '荣耀黄金IV', '秩序白银II'],
    ['尊贵铂金II', '荣耀黄金I', '荣耀黄金III', '秩序白银I'],
    ['尊贵铂金I', '荣耀黄金I', '荣耀黄金III', '秩序白银I'],
    ['永恒钻石V', '尊贵铂金IV', '荣耀黄金II', '荣耀黄金IV'],
    ['永恒钻石IV', '尊贵铂金IV', '荣耀黄金II', '荣耀黄金IV'],
    ['永恒钻石III', '尊贵铂金III', '荣耀黄金II', '荣耀黄金IV'],
    ['永恒钻石II', '尊贵铂金III', '荣耀黄金II', '荣耀黄金IV'],
    ['永恒钻石I', '尊贵铂金II', '荣耀黄金I', '荣耀黄金III'],
    ['至尊星耀V', '尊贵铂金II', '荣耀黄金I', '荣耀黄金III'],
    ['至尊星耀IV', '尊贵铂金I', '荣耀黄金I', '荣耀黄金III'],
    ['至尊星耀III', '尊贵铂金I', '荣耀黄金I', '荣耀黄金III'],
    ['至尊星耀II', '永恒钻石V', '尊贵铂金IV', '荣耀黄金II'],
    ['至尊星耀I', '永恒钻石V', '尊贵铂金IV', '荣耀黄金II'],
    ['王者0', '永恒钻石IV', '尊贵铂金IV', '荣耀黄金II'],
    ['王者10', '永恒钻石III', '尊贵铂金III', '荣耀黄金II'],
    ['王者20', '永恒钻石II', '尊贵铂金III', '荣耀黄金II'],
    ['王者30', '永恒钻石I', '尊贵铂金II', '荣耀黄金I'],
    ['王者40', '至尊星耀V', '尊贵铂金II', '荣耀黄金I'],
    ['王者50', '至尊星耀IV', '尊贵铂金I', '荣耀黄金I'],
    ['王者75', '至尊星耀III', '尊贵铂金I', '荣耀黄金I'],
    ['王者100', '至尊星耀II', '永恒钻石V', '尊贵铂金IV'],
    ['王者125', '至尊星耀I', '永恒钻石V', '尊贵铂金IV'],
    ['王者150', '王者1星', '永恒钻石IV', '尊贵铂金IV'],
  ].map(([before, direct, single, multi]) => [before, { direct, single, multi }])
)
const TIER_START_STARS = buildTierStartStars()

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
  const inheritedStarsByUserId = options.inheritedStarsByUserId
  return rankRows.map((row) => {
    const username = getUsername(row)
    const identity = getUserIdentity(row, username)
    const tierQuota =
      tierQuotaByUserId instanceof Map && tierQuotaByUserId.has(identity.key)
        ? tierQuotaByUserId.get(identity.key)
        : row?.quota
    const inheritedStars =
      inheritedStarsByUserId instanceof Map && inheritedStarsByUserId.has(identity.key)
        ? inheritedStarsByUserId.get(identity.key)
        : 0

    return {
      ...row,
      name: username,
      tier: calculateUserTier(tierQuota, { inheritedStars }),
    }
  })
}

export function calculateUserTier(quota, options = {}) {
  const earnedStars = Math.max(0, Math.floor((Number(quota) || 0) / QUOTA_PER_STAR))
  const inheritedStars = normalizeStars(options.inheritedStars)
  const totalStars = inheritedStars + earnedStars
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
      earned_stars: earnedStars,
      inherited_stars: inheritedStars,
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
        earned_stars: earnedStars,
        inherited_stars: inheritedStars,
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

export function buildInheritedStarsMap(rows, currentSeasonStart, options = {}) {
  const currentStart = normalizeTimestamp(currentSeasonStart)
  const seasonQuotaByUserId = new Map()

  // 核心流程：历史数据按用户和赛季切桶，找到每个用户最近一次有消耗的历史赛季。
  for (const row of Array.isArray(rows) ? rows : []) {
    const timestamp = Number(row?.created_at ?? row?.timestamp)
    if (!Number.isFinite(timestamp) || timestamp >= currentStart) continue
    const quota = Number(row?.quota) || 0
    if (quota <= 0) continue

    const seasonStart = getSeasonMonthStart(timestamp, options)
    if (seasonStart >= currentStart) continue

    const identity = getUserIdentity(row)
    const key = `${identity.key}:${seasonStart}`
    const current = seasonQuotaByUserId.get(key) || {
      userKey: identity.key,
      seasonStart,
      quota: 0,
    }
    current.quota += quota
    seasonQuotaByUserId.set(key, current)
  }

  const latestSeasonByUserId = new Map()
  for (const season of seasonQuotaByUserId.values()) {
    const current = latestSeasonByUserId.get(season.userKey)
    if (!current || season.seasonStart > current.seasonStart) {
      latestSeasonByUserId.set(season.userKey, season)
    }
  }

  const inheritedStarsByUserId = new Map()
  for (const season of latestSeasonByUserId.values()) {
    const beforeKey = getInheritanceBeforeKey(calculateUserTier(season.quota).total_stars)
    const mode = getInheritanceMode(season.seasonStart, currentStart, options)
    const inheritedLabel = INHERITANCE_RULES.get(beforeKey)?.[mode] || '倔强青铜III'
    inheritedStarsByUserId.set(season.userKey, tierLabelToStartStars(inheritedLabel))
  }

  return inheritedStarsByUserId
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

function getInheritanceBeforeKey(totalStars) {
  const stars = normalizeStars(totalStars)
  if (stars >= 100) {
    const kingStars = stars - 100
    return KING_INHERITANCE_KEYS.find((item) => kingStars >= item.minStars).key
  }

  let consumedStars = 0
  for (const tier of PRE_KING_TIERS) {
    for (const division of tier.divisions) {
      const nextStars = consumedStars + tier.starsPerDivision
      if (stars < nextStars) {
        return `${tier.name}${division}`
      }
      consumedStars = nextStars
    }
  }

  return '至尊星耀I'
}

function getInheritanceMode(latestSeasonStart, currentSeasonStart, options = {}) {
  let skippedSeasons = 0
  let nextSeasonStart = getNextSeasonMonthStart(latestSeasonStart, options)

  while (nextSeasonStart < currentSeasonStart) {
    skippedSeasons += 1
    nextSeasonStart = getNextSeasonMonthStart(nextSeasonStart, options)
  }

  if (skippedSeasons === 0) return 'direct'
  if (skippedSeasons === 1) return 'single'
  return 'multi'
}

function getNextSeasonMonthStart(seasonStart, options = {}) {
  const resetDay = Number(options.resetDay || RESET_DAY)
  const offsetMinutes = Number(options.utcOffsetMinutes ?? RESET_UTC_OFFSET_MINUTES)
  const offsetSeconds = offsetMinutes * 60
  const shiftedDate = new Date((seasonStart + offsetSeconds) * 1000)
  return Math.floor(
    Date.UTC(shiftedDate.getUTCFullYear(), shiftedDate.getUTCMonth() + 1, resetDay, 0, 0, 0) /
      1000 -
      offsetSeconds
  )
}

function tierLabelToStartStars(label) {
  if (TIER_START_STARS.has(label)) return TIER_START_STARS.get(label)

  const kingMatch = String(label).match(/^王者(\d+)星$/)
  if (kingMatch) return 100 + Number(kingMatch[1])

  return 0
}

function buildTierStartStars() {
  const tierStartStars = new Map()
  let consumedStars = 0
  for (const tier of PRE_KING_TIERS) {
    for (const division of tier.divisions) {
      tierStartStars.set(`${tier.name}${division}`, consumedStars)
      consumedStars += tier.starsPerDivision
    }
  }
  return tierStartStars
}

function normalizeStars(stars) {
  const value = Number(stars)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
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
