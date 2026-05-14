import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const LAST_BACKUP_META_KEY = 'webdav.last_backup_at'

export async function runWebDavBackup(options = {}) {
  const store = options.store
  const webdavOptions = options.webdavOptions || {}
  const nowSeconds = options.nowSeconds || (() => Math.floor(Date.now() / 1000))
  const fetchImpl = options.fetchImpl || fetch
  const tempDir = options.tempDir || tmpdir()

  if (!webdavOptions.enabled) return { skipped: true, reason: 'disabled' }
  if (!webdavOptions.baseUrl) return { skipped: true, reason: 'missing_base_url' }
  if (!store) return { skipped: true, reason: 'missing_store' }

  const now = nowSeconds()
  const lastBackupAt = Number(store.getMeta(LAST_BACKUP_META_KEY)) || 0
  const backupIntervalSeconds = normalizePositiveInt(webdavOptions.backupIntervalSeconds, 21600)
  if (lastBackupAt > 0 && now - lastBackupAt < backupIntervalSeconds) {
    return { skipped: true, reason: 'interval' }
  }

  const fileName = `rank-addon-${formatBackupTimestamp(now)}.sqlite`
  const snapshotPath = path.join(tempDir, fileName)
  await store.snapshotTo(snapshotPath)

  try {
    await ensureRemoteFolder(webdavOptions, fetchImpl)
    const body = await readFile(snapshotPath)
    const uploadUrl = buildRemoteUrl(webdavOptions.baseUrl, webdavOptions.targetFolder, fileName)
    await requestWebDav(fetchImpl, uploadUrl, {
      method: 'PUT',
      headers: buildAuthHeaders(webdavOptions),
      body,
      timeoutSeconds: webdavOptions.timeoutSeconds,
      okStatuses: [200, 201, 204],
    })
    await pruneRemoteBackups(webdavOptions, fetchImpl)
    store.setMeta(LAST_BACKUP_META_KEY, String(now))
    return { uploaded: true, fileName }
  } finally {
    await rm(snapshotPath, { force: true })
  }
}

export function startWebDavBackupSchedule(options = {}) {
  const webdavOptions = options.webdavOptions || {}
  if (!webdavOptions.enabled) return { stop() {} }

  const intervalSeconds = normalizePositiveInt(webdavOptions.backupIntervalSeconds, 21600)
  const run = () => {
    runWebDavBackup(options).catch((error) => {
      console.error(error instanceof Error ? error.message : error)
    })
  }
  const timer = setInterval(run, intervalSeconds * 1000)
  run()
  return {
    stop() {
      clearInterval(timer)
    },
  }
}

async function ensureRemoteFolder(webdavOptions, fetchImpl) {
  const segments = normalizeTargetFolder(webdavOptions.targetFolder)
  for (let index = 0; index < segments.length; index += 1) {
    const folder = segments.slice(0, index + 1).join('/')
    const url = buildRemoteUrl(webdavOptions.baseUrl, folder, '')
    await requestWebDav(fetchImpl, url, {
      method: 'MKCOL',
      headers: buildAuthHeaders(webdavOptions),
      timeoutSeconds: webdavOptions.timeoutSeconds,
      okStatuses: [200, 201, 204, 405],
    })
  }
}

async function pruneRemoteBackups(webdavOptions, fetchImpl) {
  const retention = normalizeNonNegativeInt(webdavOptions.retention, 20)
  if (retention <= 0) return

  const folderUrl = buildRemoteUrl(webdavOptions.baseUrl, webdavOptions.targetFolder, '')
  const response = await requestWebDav(fetchImpl, folderUrl, {
    method: 'PROPFIND',
    headers: {
      ...buildAuthHeaders(webdavOptions),
      Depth: '1',
    },
    timeoutSeconds: webdavOptions.timeoutSeconds,
    okStatuses: [200, 207],
  })
  const text = typeof response.text === 'function' ? await response.text() : ''
  const backups = extractBackupFileNames(text).sort()
  const deleteNames = backups.slice(0, Math.max(0, backups.length - retention))
  await Promise.all(
    deleteNames.map((fileName) =>
      requestWebDav(fetchImpl, buildRemoteUrl(webdavOptions.baseUrl, webdavOptions.targetFolder, fileName), {
        method: 'DELETE',
        headers: buildAuthHeaders(webdavOptions),
        timeoutSeconds: webdavOptions.timeoutSeconds,
        okStatuses: [200, 202, 204, 404],
      })
    )
  )
}

async function requestWebDav(fetchImpl, url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    normalizePositiveInt(options.timeoutSeconds, 30) * 1000
  )
  try {
    const response = await fetchImpl(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    })
    const okStatuses = options.okStatuses || [200, 201, 204]
    if (!okStatuses.includes(response.status)) {
      const text = typeof response.text === 'function' ? await response.text() : ''
      throw new Error(`WebDAV ${options.method} ${url} failed: ${response.status} ${text}`)
    }
    return response
  } finally {
    clearTimeout(timeout)
  }
}

function buildRemoteUrl(baseUrl, targetFolder, fileName) {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  const folder = normalizeTargetFolder(targetFolder).map(encodeURIComponent).join('/')
  const encodedFileName = fileName ? encodeURIComponent(fileName) : ''
  const suffix = [folder, encodedFileName].filter(Boolean).join('/')
  return `${base}/${suffix}${fileName ? '' : '/'}`
}

function normalizeTargetFolder(targetFolder) {
  return String(targetFolder || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function buildAuthHeaders(webdavOptions) {
  const headers = {}
  if (webdavOptions.username || webdavOptions.password) {
    const token = Buffer.from(`${webdavOptions.username || ''}:${webdavOptions.password || ''}`).toString(
      'base64'
    )
    headers.Authorization = `Basic ${token}`
  }
  return headers
}

function extractBackupFileNames(responseText) {
  const names = new Set()
  const hrefPattern = /<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/gi
  let match = hrefPattern.exec(responseText)
  while (match) {
    const decoded = decodeURIComponent(match[1])
    const fileName = decoded.split('/').filter(Boolean).at(-1) || ''
    if (/^rank-addon-\d{8}-\d{6}\.sqlite$/.test(fileName)) {
      names.add(fileName)
    }
    match = hrefPattern.exec(responseText)
  }
  return [...names]
}

function formatBackupTimestamp(timestamp) {
  const date = new Date(timestamp * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('')
}

function normalizePositiveInt(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.floor(number)
}

function normalizeNonNegativeInt(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return fallback
  return Math.floor(number)
}
