import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  cache: {
    freshSeconds: 60,
    allFreshSeconds: 300,
    staleSeconds: 600,
  },
  storage: {
    sqlitePath: './data/rank-addon.sqlite',
  },
  ui: {
    theme: 'classic',
    terminal: {
      visibleRows: 20,
    },
  },
  webdav: {
    enabled: false,
    baseUrl: '',
    username: '',
    password: '',
    targetFolder: 'newapi-rank-addon',
    backupIntervalSeconds: 21600,
    retention: 20,
    timeoutSeconds: 30,
  },
}

export async function loadConfig(options = {}) {
  const configPath = options.configPath || new URL('../config.json', import.meta.url)
  const env = options.env || process.env
  const fileConfig = await readConfigFile(configPath)
  const merged = mergeConfig(DEFAULT_CONFIG, fileConfig)
  applyEnvOverrides(merged, env)
  const configDir = getConfigDir(configPath)

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
    cacheOptions: {
      freshSeconds: normalizePositiveInt(
        merged.cache.freshSeconds,
        DEFAULT_CONFIG.cache.freshSeconds
      ),
      allFreshSeconds: normalizePositiveInt(
        merged.cache.allFreshSeconds,
        DEFAULT_CONFIG.cache.allFreshSeconds
      ),
      staleSeconds: normalizePositiveInt(
        merged.cache.staleSeconds,
        DEFAULT_CONFIG.cache.staleSeconds
      ),
    },
    storage: {
      sqlitePath: resolveMaybeRelativePath(
        merged.storage.sqlitePath || DEFAULT_CONFIG.storage.sqlitePath,
        configDir
      ),
    },
    ui: {
      theme: normalizeUiTheme(merged.ui.theme),
      terminal: {
        visibleRows: normalizePositiveInt(
          merged.ui.terminal?.visibleRows,
          DEFAULT_CONFIG.ui.terminal.visibleRows
        ),
      },
    },
    webdav: {
      enabled: normalizeBoolean(merged.webdav.enabled, DEFAULT_CONFIG.webdav.enabled),
      baseUrl: String(merged.webdav.baseUrl || ''),
      username: String(merged.webdav.username || ''),
      password: String(merged.webdav.password || ''),
      targetFolder: String(merged.webdav.targetFolder || DEFAULT_CONFIG.webdav.targetFolder),
      backupIntervalSeconds: normalizePositiveInt(
        merged.webdav.backupIntervalSeconds,
        DEFAULT_CONFIG.webdav.backupIntervalSeconds
      ),
      retention: normalizeNonNegativeInt(merged.webdav.retention, DEFAULT_CONFIG.webdav.retention),
      timeoutSeconds: normalizePositiveInt(
        merged.webdav.timeoutSeconds,
        DEFAULT_CONFIG.webdav.timeoutSeconds
      ),
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
    cache: {
      ...base.cache,
      ...(override.cache || {}),
    },
    storage: {
      ...base.storage,
      ...(override.storage || {}),
    },
    ui: {
      ...base.ui,
      ...(override.ui || {}),
      terminal: {
        ...base.ui.terminal,
        ...(override.ui?.terminal || {}),
      },
    },
    webdav: {
      ...base.webdav,
      ...(override.webdav || {}),
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
  if (env.RANK_CACHE_FRESH_SECONDS) config.cache.freshSeconds = env.RANK_CACHE_FRESH_SECONDS
  if (env.RANK_CACHE_ALL_FRESH_SECONDS) config.cache.allFreshSeconds = env.RANK_CACHE_ALL_FRESH_SECONDS
  if (env.RANK_CACHE_STALE_SECONDS) config.cache.staleSeconds = env.RANK_CACHE_STALE_SECONDS
  if (env.RANK_SQLITE_PATH) config.storage.sqlitePath = env.RANK_SQLITE_PATH
  if (env.RANK_WEBDAV_ENABLED) config.webdav.enabled = env.RANK_WEBDAV_ENABLED
  if (env.RANK_WEBDAV_BASE_URL) config.webdav.baseUrl = env.RANK_WEBDAV_BASE_URL
  if (env.RANK_WEBDAV_USERNAME) config.webdav.username = env.RANK_WEBDAV_USERNAME
  if (env.RANK_WEBDAV_PASSWORD) config.webdav.password = env.RANK_WEBDAV_PASSWORD
  if (env.RANK_WEBDAV_TARGET_FOLDER) config.webdav.targetFolder = env.RANK_WEBDAV_TARGET_FOLDER
  if (env.RANK_WEBDAV_BACKUP_INTERVAL_SECONDS) {
    config.webdav.backupIntervalSeconds = env.RANK_WEBDAV_BACKUP_INTERVAL_SECONDS
  }
  if (env.RANK_WEBDAV_RETENTION) config.webdav.retention = env.RANK_WEBDAV_RETENTION
  if (env.RANK_WEBDAV_TIMEOUT_SECONDS) config.webdav.timeoutSeconds = env.RANK_WEBDAV_TIMEOUT_SECONDS
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

function normalizeNonNegativeInt(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return fallback
  return Math.floor(number)
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function normalizeUiTheme(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'terminal' ? 'terminal' : DEFAULT_CONFIG.ui.theme
}

function getConfigDir(configPath) {
  if (configPath instanceof URL) return path.dirname(fileURLToPath(configPath))
  return path.dirname(path.resolve(String(configPath)))
}

function resolveMaybeRelativePath(filePath, baseDir) {
  const value = String(filePath)
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value)
}
