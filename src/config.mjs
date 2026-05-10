import { access, readFile } from 'node:fs/promises'

const DEFAULT_CONFIG = {
  server: {
    port: 2234,
  },
  newApi: {
    baseUrl: 'http://localhost:2233',
    authorization: '',
    adminUserId: '1',
  },
  rank: {
    timezone: 'Asia/Shanghai',
    utcOffsetMinutes: 480,
    seasonResetDay: 7,
  },
}

export async function loadConfig(options = {}) {
  const configPath = options.configPath || new URL('../config.json', import.meta.url)
  const env = options.env || process.env
  const fileConfig = await readConfigFile(configPath)
  const merged = mergeConfig(DEFAULT_CONFIG, fileConfig)
  applyEnvOverrides(merged, env)

  return {
    port: normalizePositiveInt(merged.server.port, DEFAULT_CONFIG.server.port),
    upstreamBase: String(merged.newApi.baseUrl || DEFAULT_CONFIG.newApi.baseUrl),
    authorization: String(merged.newApi.authorization || ''),
    newApiUser: String(merged.newApi.adminUserId || DEFAULT_CONFIG.newApi.adminUserId),
    rankOptions: {
      timezone: String(merged.rank.timezone || DEFAULT_CONFIG.rank.timezone),
      utcOffsetMinutes: normalizeInteger(
        merged.rank.utcOffsetMinutes,
        DEFAULT_CONFIG.rank.utcOffsetMinutes
      ),
      resetDay: normalizePositiveInt(merged.rank.seasonResetDay, DEFAULT_CONFIG.rank.seasonResetDay),
    },
  }
}

async function readConfigFile(configPath) {
  try {
    await access(configPath)
  } catch {
    return {}
  }

  const raw = await readFile(configPath, 'utf8')
  if (!raw.trim()) return {}

  try {
    return JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown parse error'
    throw new Error(`Invalid config JSON at ${configPath}: ${message}`)
  }
}

function mergeConfig(base, override) {
  return {
    server: {
      ...base.server,
      ...(override.server || {}),
    },
    newApi: {
      ...base.newApi,
      ...(override.newApi || {}),
    },
    rank: {
      ...base.rank,
      ...(override.rank || {}),
    },
  }
}

function applyEnvOverrides(config, env) {
  if (env.PORT) config.server.port = env.PORT
  if (env.NEW_API_BASE) config.newApi.baseUrl = env.NEW_API_BASE
  if (env.NEW_API_AUTHORIZATION) config.newApi.authorization = env.NEW_API_AUTHORIZATION
  if (env.NEW_API_USER) config.newApi.adminUserId = env.NEW_API_USER
  if (env.RANK_TIMEZONE) config.rank.timezone = env.RANK_TIMEZONE
  if (env.RANK_UTC_OFFSET_MINUTES) config.rank.utcOffsetMinutes = env.RANK_UTC_OFFSET_MINUTES
  if (env.RANK_SEASON_RESET_DAY) config.rank.seasonResetDay = env.RANK_SEASON_RESET_DAY
}

function normalizePositiveInt(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.floor(number)
}

function normalizeInteger(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.floor(number)
}
