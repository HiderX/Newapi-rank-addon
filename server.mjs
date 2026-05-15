import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyNewApiLogin } from './src/auth.mjs'
import { loadConfig } from './src/config.mjs'
import { createRankService } from './src/rank-service.mjs'
import { createSqliteStore } from './src/storage.mjs'
import { startWebDavBackupSchedule } from './src/webdav.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, 'public')
const config = await loadConfig({
  configPath: path.join(__dirname, 'config.json'),
})
const store = createSqliteStore({ sqlitePath: config.storage.sqlitePath })
const rankService = createRankService({
  config,
  store,
  fetchUserData,
})
startWebDavBackupSchedule({
  store,
  webdavOptions: config.webdav,
})

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
])

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    if (url.pathname === '/rank-addon/api/users/bundle') {
      await handleRankBundleApi(url, req, res)
      return
    }

    if (url.pathname === '/rank-addon/api/users') {
      await handleRankApi(url, req, res)
      return
    }

    if (url.pathname === '/' || url.pathname === '/rank-addon/users') {
      await serveIndex(res)
      return
    }

    if (url.pathname.startsWith('/rank-addon/assets/')) {
      await serveFile(url.pathname.slice('/rank-addon/assets/'.length), res)
      return
    }

    sendJson(res, 404, { success: false, message: 'Not found' })
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      message: error instanceof Error ? error.message : 'Internal Server Error',
    })
  }
})

server.listen(config.port, () => {
  console.log(`User rank addon listening on http://localhost:${config.port}`)
})

async function handleRankApi(url, req, res) {
  const login = await requireLogin(req, res)
  if (!login.ok) {
    return
  }

  const pageSize = normalizePageSize(
    url.searchParams.get('page_size') || url.searchParams.get('limit')
  )
  const payload = await rankService.getRankPayload({
    period: url.searchParams.get('period') || 'day',
    pageSize,
    force: isForcedRefresh(url.searchParams),
    endTimestamp: url.searchParams.has('end_timestamp')
      ? url.searchParams.get('end_timestamp')
      : undefined,
  })
  if (payload.ok === false) {
    sendJson(res, payload.status, {
      success: false,
      message: payload.message,
    })
    return
  }
  sendJson(res, 200, {
    success: true,
    data: withViewer(payload, login.user),
  })
}

async function handleRankBundleApi(url, req, res) {
  const login = await requireLogin(req, res)
  if (!login.ok) {
    return
  }

  const pageSize = normalizePageSize(
    url.searchParams.get('page_size') || url.searchParams.get('limit')
  )
  const payload = await rankService.getRankBundle({
    pageSize,
    force: isForcedRefresh(url.searchParams),
  })
  sendJson(res, 200, {
    success: true,
    data: {
      ...payload,
      viewer: {
        username: login.user.username,
        role: login.user.role,
      },
    },
  })
}

async function requireLogin(req, res) {
  if (!config.authorization) {
    sendJson(res, 500, {
      success: false,
      message: 'NEW_API_AUTHORIZATION is required',
    })
    return { ok: false }
  }

  const login = await verifyNewApiLogin({
    upstreamBase: config.upstreamBase,
    cookie: req.headers.cookie || '',
    requestNewApiUser: req.headers['new-api-user'],
    newApiUser: config.newApiUser,
  })
  if (!login.ok) {
    sendJson(res, login.status, {
      success: false,
      message: login.message,
    })
  }
  return login
}

async function fetchUserData(params) {
  const upstreamUrl = new URL('/api/data/users', config.upstreamBase)
  upstreamUrl.search = params.toString()

  // 管理员凭据只在服务端转发，不写入页面，避免浏览器侧泄露。
  const upstream = await fetch(upstreamUrl, {
    headers: {
      Authorization: config.authorization,
      'New-Api-User': config.newApiUser,
    },
  })

  const payload = await upstream.json().catch(() => null)
  if (!upstream.ok || !payload?.success) {
    return {
      ok: false,
      status: upstream.status || 502,
      message: payload?.message || `Upstream request failed: ${upstream.status}`,
      rows: [],
    }
  }

  return {
    ok: true,
    status: 200,
    rows: Array.isArray(payload.data) ? payload.data : [],
  }
}

function normalizePageSize(pageSize) {
  const value = Number(pageSize)
  if (!Number.isFinite(value) || value <= 0) return 10
  return Math.min(100, Math.floor(value))
}

function isForcedRefresh(searchParams) {
  return searchParams.get('refresh') === '1' || searchParams.get('force') === '1'
}

function withViewer(payload, user) {
  return {
    ...payload,
    viewer: {
      username: user.username,
      role: user.role,
    },
  }
}

async function serveFile(fileName, res) {
  const safeName = path.normalize(fileName).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.join(publicDir, safeName)
  const content = await readFile(filePath)
  const ext = path.extname(filePath)
  res.writeHead(200, {
    'content-type': mimeTypes.get(ext) || 'application/octet-stream',
    'cache-control': 'no-store',
  })
  res.end(content)
}

async function serveIndex(res) {
  const content = await readFile(path.join(publicDir, 'index.html'), 'utf8')
  res.writeHead(200, {
    'content-type': mimeTypes.get('.html'),
    'cache-control': 'no-store',
  })
  res.end(renderIndexHtml(content))
}

function renderIndexHtml(content) {
  const themeAssets = getThemeAssetTags(config.ui.theme)
  return String(content)
    .replaceAll('data-ui-theme="classic"', `data-ui-theme="${config.ui.theme}"`)
    .replaceAll(
      'data-terminal-visible-rows="20"',
      `data-terminal-visible-rows="${config.ui.terminal.visibleRows}"`
    )
    .replaceAll('<!-- theme-style-link -->', themeAssets.style)
    .replaceAll('<!-- theme-script-link -->', themeAssets.script)
}

function getThemeAssetTags(theme) {
  return {
    style: `<link rel="stylesheet" href="/rank-addon/assets/themes/${theme}/styles.css" />`,
    script: `<script type="module" src="/rank-addon/assets/themes/${theme}/app.js"></script>`,
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}
