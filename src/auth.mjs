export async function verifyNewApiLogin(options) {
  const upstreamBase = options.upstreamBase
  const cookie = options.cookie || ''
  const newApiUser = normalizeNewApiUser(options.requestNewApiUser)
  const fetchImpl = options.fetchImpl || fetch

  if (!cookie.trim()) {
    return {
      ok: false,
      status: 401,
      message: '请先登录后再查看排行榜',
    }
  }

  if (!newApiUser) {
    return {
      ok: false,
      status: 401,
      message: '页面未发送有效的 New-Api-User，请在 NewAPI 登录后强制刷新排行榜页面',
    }
  }

  const url = new URL('/api/user/self', upstreamBase)
  const response = await fetchImpl(url, {
    headers: {
      Cookie: cookie,
      'New-Api-User': newApiUser,
    },
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.success || !payload?.data?.username) {
    return {
      ok: false,
      status: response.status || 401,
      message: payload?.message || '登录态校验失败',
    }
  }

  return {
    ok: true,
    user: payload.data,
  }
}

function normalizeNewApiUser(value) {
  const raw = Array.isArray(value) ? value[0] : value
  const userId = String(raw || '').trim()
  return /^[1-9]\d*$/.test(userId) ? userId : ''
}
