const PERIOD_OPTIONS = [
  { label: '日排行', value: 'day' },
  { label: '周排行', value: 'week' },
  { label: '月排行', value: 'month' },
  { label: '总排行', value: 'all' },
]

const RANK_FETCH_LIMIT = 100
const INITIAL_VISIBLE_ROWS = 20
const LOAD_MORE_ROWS = 20
const SCROLL_LOAD_THRESHOLD = 280
const QUOTA_PER_UNIT = 500000
const THEME_STORAGE_KEY = 'theme-mode'

const state = {
  period: 'day',
  rankRows: [],
  visibleRows: INITIAL_VISIBLE_ROWS,
  maxQuota: 1,
}

const elements = {
  refreshButton: document.querySelector('#refresh-button'),
  periodControls: document.querySelector('#period-controls'),
  quota: document.querySelector('#metric-quota'),
  tokens: document.querySelector('#metric-tokens'),
  count: document.querySelector('#metric-count'),
  rankChart: document.querySelector('#rank-chart'),
  scrollHint: document.querySelector('#scroll-hint'),
}

installThemeSync()
renderControls()
elements.refreshButton.addEventListener('click', () => {
  loadRank()
})
window.addEventListener('scroll', handleInfiniteScroll, { passive: true })
loadRank()

function renderControls() {
  renderButtonGroup(
    elements.periodControls,
    PERIOD_OPTIONS,
    state.period,
    (option) => {
      if (state.period === option.value) return
      state.period = option.value
      loadRank()
    },
    (option) => option.value,
    (option) => option.label
  )
}

function renderButtonGroup(container, options, activeValue, onSelect, getValue, getLabel) {
  container.replaceChildren()
  for (const option of options) {
    const value = getValue(option)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `control-button${value === activeValue ? ' is-active' : ''}`
    button.textContent = getLabel(option)
    button.addEventListener('click', () => {
      onSelect(option)
      renderControls()
    })
    container.append(button)
  }
}

async function loadRank() {
  setRefreshState('loading')
  state.visibleRows = INITIAL_VISIBLE_ROWS
  const params = new URLSearchParams({
    period: state.period,
    page_size: String(RANK_FETCH_LIMIT),
  })

  try {
    const res = await fetch(`/rank-addon/api/users?${params}`, {
      headers: {
        'New-Api-User': getNewApiUserId(),
      },
    })
    const payload = await res.json()
    if (!res.ok || !payload.success) {
      throw new Error(payload.message || `请求失败：${res.status}`)
    }
    renderDashboard(payload.data)
    setRefreshState('idle')
  } catch (error) {
    renderError(error instanceof Error ? error.message : '加载失败')
    setRefreshState('error')
  }
}

function renderDashboard(data) {
  state.rankRows = Array.isArray(data.rank_rows) ? data.rank_rows : []
  state.maxQuota = Math.max(...state.rankRows.map((row) => Number(row.quota) || 0), 1)
  elements.quota.textContent = formatQuota(data.total_quota)
  elements.tokens.textContent = formatInt(data.total_tokens)
  elements.count.textContent = formatInt(data.total_count)
  renderRankChart()
}

function renderRankChart() {
  elements.rankChart.replaceChildren()
  const rows = state.rankRows
  if (!rows.length) {
    elements.rankChart.innerHTML = '<div class="empty">暂无排行数据</div>'
    renderScrollHint(0)
    return
  }

  // 一次从服务端取最多 100 人，页面只按滚动位置逐批揭示，避免移动端首屏被长列表撑乱。
  const visibleRows = rows.slice(0, state.visibleRows)
  setRankNameColumnWidth(visibleRows)
  for (const row of visibleRows) {
    const item = document.createElement('div')
    item.className = 'rank-row'
    const percentage = Math.max(2, ((Number(row.quota) || 0) / state.maxQuota) * 100)
    const tier = row.tier || {}
    const tierLabel = formatTier(tier)
    item.innerHTML = `
      <div class="rank-index">#${row.rank}</div>
      <div class="rank-name${row.is_current_user ? ' is-current' : ''}" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</div>
      <div class="rank-tier ${getTierClass(tier.code)}" title="${escapeHtml(tierLabel)}">${escapeHtml(tierLabel)}</div>
      <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${percentage}%"></div></div>
      <div class="rank-value">${formatQuota(row.quota)}</div>
    `
    elements.rankChart.append(item)
  }
  renderScrollHint(rows.length)
}

function setRankNameColumnWidth(rows) {
  const font = getComputedStyle(elements.rankChart).font
  const canvas = setRankNameColumnWidth.canvas || document.createElement('canvas')
  setRankNameColumnWidth.canvas = canvas
  const context = canvas.getContext('2d')
  if (!context) return

  context.font = font
  const measuredWidth = rows.reduce((maxWidth, row) => {
    return Math.max(maxWidth, context.measureText(String(row.name || '')).width)
  }, 0)
  const maxWidth = window.matchMedia('(max-width: 560px)').matches ? 108 : 132
  const width = Math.ceil(Math.min(Math.max(measuredWidth + 10, 48), maxWidth))
  elements.rankChart.style.setProperty('--rank-name-width', `${width}px`)
}

function handleInfiniteScroll() {
  if (state.visibleRows >= state.rankRows.length) return

  const scrollBottom = window.scrollY + window.innerHeight
  const triggerPoint = document.documentElement.scrollHeight - SCROLL_LOAD_THRESHOLD
  if (scrollBottom < triggerPoint) return

  state.visibleRows = Math.min(state.visibleRows + LOAD_MORE_ROWS, state.rankRows.length)
  renderRankChart()
}

function renderScrollHint(totalRows) {
  if (!elements.scrollHint) return

  const hasMoreRows = state.visibleRows < totalRows
  elements.scrollHint.textContent = hasMoreRows ? '继续向下滚动查看更多' : ''
  elements.scrollHint.hidden = !hasMoreRows
}

function renderError(message) {
  state.rankRows = []
  elements.rankChart.innerHTML = `<div class="error">${escapeHtml(message)}</div>`
  renderScrollHint(0)
}

function setRefreshState(state) {
  const isLoading = state === '加载中' || state === 'loading'
  const isError = state === 'error'
  elements.refreshButton.textContent = isLoading ? '刷新中' : '刷新'
  elements.refreshButton.disabled = isLoading
  elements.refreshButton.classList.toggle('is-error', isError)
}

function installThemeSync() {
  syncNewApiTheme()
  window.addEventListener('storage', (event) => {
    if (!event.key || isThemeStorageKey(event.key)) syncNewApiTheme()
  })

  const colorScheme = window.matchMedia?.('(prefers-color-scheme: dark)')
  colorScheme?.addEventListener?.('change', syncNewApiTheme)

  const observer = new MutationObserver(syncNewApiTheme)
  for (const themeDocument of getThemeDocuments()) {
    observeThemeTarget(observer, themeDocument.documentElement)
    observeThemeTarget(observer, themeDocument.body)
  }

  window.setInterval(syncNewApiTheme, 1000)
}

function observeThemeTarget(observer, target) {
  if (!target) return
  observer.observe(target, {
    attributes: true,
    attributeFilter: ['class', 'theme-mode'],
  })
}

function syncNewApiTheme() {
  const theme = detectNewApiTheme()
  if (document.documentElement.dataset.theme === theme) return
  document.documentElement.dataset.theme = theme
}

function detectNewApiTheme() {
  for (const themeDocument of getThemeDocuments()) {
    const theme = readThemeFromDocument(themeDocument)
    if (theme) return theme
  }

  const storageTheme = readThemeFromStorage()
  if (storageTheme) return storageTheme

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getThemeDocuments() {
  const documents = [document]
  try {
    if (window.parent !== window && window.parent.document) {
      documents.push(window.parent.document)
    }
  } catch {
    // 跨域嵌入时不能读取父页面，退回本页和 localStorage。
  }
  return documents
}

function readThemeFromDocument(themeDocument) {
  const root = themeDocument.documentElement
  const body = themeDocument.body
  if (root?.classList.contains('dark') || body?.getAttribute('theme-mode') === 'dark') {
    return 'dark'
  }
  if (body && !body.hasAttribute('theme-mode') && root && !root.classList.contains('dark')) {
    return 'light'
  }
  return ''
}

function readThemeFromStorage() {
  try {
    return resolveConfiguredTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'auto')
  } catch {
    return resolveConfiguredTheme('auto')
  }
}

function isThemeStorageKey(key) {
  return key === THEME_STORAGE_KEY
}

function resolveConfiguredTheme(value) {
  const normalized = String(value || '').toLowerCase()
  if (/(dark|night|black|moon|semi-always-dark)/.test(normalized)) return 'dark'
  if (/(light|day|white|sun|semi-always-light)/.test(normalized)) return 'light'
  return ''
}

function getNewApiUserId() {
  const userJson = localStorage.getItem('user')
  if (!userJson) return '-1'

  try {
    // 复用 NewAPI 前端的用户 ID 来源，避免 Cookie 中的 new-api-user 过期后校验失败。
    const user = JSON.parse(userJson)
    return user?.id === undefined || user?.id === null ? '-1' : String(user.id)
  } catch {
    return '-1'
  }
}

function formatQuota(value) {
  const raw = Number(value) || 0
  const usd = raw / QUOTA_PER_UNIT
  if (usd >= 0.01) return `$${usd.toFixed(2)}`
  return raw.toLocaleString()
}

function formatInt(value) {
  return (Number(value) || 0).toLocaleString()
}

function formatTier(tier) {
  if (tier?.display) return tier.display
  if (!tier?.label) return '-'
  return tier.code?.includes('king') ? `${tier.label}⭐${formatInt(tier.stars)}` : tier.label
}

function getTierClass(code) {
  const safeCode = String(code || 'unknown').replace(/[^a-z0-9-]/gi, '')
  return `tier-${safeCode || 'unknown'}`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
