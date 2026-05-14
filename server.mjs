import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aggregateUserRank,
  buildUserQuotaMap,
  getPeriodRange,
  presentRankRows,
} from './src/rank.mjs'
import { verifyNewApiLogin } from './src/auth.mjs'
import { loadConfig } from './src/config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, 'public')
const config = await loadConfig({
  configPath: path.join(__dirname, 'config.json'),
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

    if (url.pathname === '/rank-addon/api/users') {
      await handleRankApi(url, req, res)
      return
    }

    if (url.pathname === '/' || url.pathname === '/rank-addon/users') {
      await serveFile('index.html', res)
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
  if (!config.authorization) {
    sendJson(res, 500, {
      success: false,
      message: 'NEW_API_AUTHORIZATION is required',
    })
    return
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
    return
  }

  const { params, range } = buildQueryParams(url.searchParams)
  const rankResult = await fetchUserData(params)
  if (!rankResult.ok) {
    sendJson(res, rankResult.status, {
      success: false,
      message: rankResult.message,
    })
    return
  }

  const pageSize = normalizePageSize(
    url.searchParams.get('page_size') || url.searchParams.get('limit')
  )
  const rawRows = rankResult.rows
  const tierRange = getPeriodRange('month', range.end, config.rankOptions)
  const tierResult =
    range.period === 'month'
      ? { ok: true, rows: rawRows }
      : await fetchUserData(rangeToParams(tierRange))
  if (!tierResult.ok) {
    sendJson(res, tierResult.status, {
      success: false,
      message: tierResult.message,
    })
    return
  }
  const tierRows = tierResult.rows
  const tierQuotaByUserId = buildUserQuotaMap(tierRows)
  const aggregate = aggregateUserRank(rawRows, { limit: pageSize })
  const rankRows = presentRankRows(aggregate.rankRows, { tierQuotaByUserId })

  sendJson(res, 200, {
    success: true,
    data: {
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
      viewer: {
        username: login.user.username,
        role: login.user.role,
      },
      rank_rows: rankRows,
    },
  })
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

function buildQueryParams(searchParams) {
  const now = Math.floor(Date.now() / 1000)
  const end = Number(searchParams.get('end_timestamp') || now)
  const range = getPeriodRange(searchParams.get('period') || 'day', end, config.rankOptions)
  const params = new URLSearchParams()
  params.set('start_timestamp', String(range.start))
  params.set('end_timestamp', String(range.end))
  return { params, range }
}

function rangeToParams(range) {
  const params = new URLSearchParams()
  params.set('start_timestamp', String(range.start))
  params.set('end_timestamp', String(range.end))
  return params
}

function normalizePageSize(pageSize) {
  const value = Number(pageSize)
  if (!Number.isFinite(value) || value <= 0) return 10
  return Math.min(100, Math.floor(value))
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

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}
