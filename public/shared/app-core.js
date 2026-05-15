export const PERIOD_OPTIONS = [
  { label: '日排行', value: 'day' },
  { label: '周排行', value: 'week' },
  { label: '月排行', value: 'month' },
  { label: '总排行', value: 'all' },
]

export const RANK_FETCH_LIMIT = 100
export const INITIAL_VISIBLE_ROWS = 20
export const LOAD_MORE_ROWS = 20
export const SCROLL_LOAD_THRESHOLD = 280
export const QUOTA_PER_UNIT = 500000

const THEME_STORAGE_KEY = 'theme-mode'

export function startRankApp(theme) {
  const state = {
    period: 'day',
    periodData: {},
    rankRows: [],
    visibleRows: theme.initialVisibleRows || INITIAL_VISIBLE_ROWS,
    maxQuota: 1,
    selectedRankIndex: 0,
    lastRefreshAt: new Date(),
    summary: {
      quota: 0,
      tokens: 0,
      count: 0,
    },
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

  const context = {
    state,
    elements,
    periodOptions: PERIOD_OPTIONS,
    rankFetchLimit: RANK_FETCH_LIMIT,
    selectPeriod,
    loadRankBundle,
    renderControls,
    renderCurrentPeriod,
    renderRankChart,
    renderScrollHint,
    renderError,
    setRefreshState,
    clampSelectedRankIndex,
    renderButtonGroup,
    formatQuota,
    formatInt,
    formatTier,
    getTierClass,
    escapeHtml,
  }

  installThemeSync(theme, () => context)
  theme.install?.(context)
  renderControls()
  elements.refreshButton.addEventListener('click', () => {
    loadRankBundle({ force: true })
  })
  loadRankBundle()

  function renderControls() {
    renderButtonGroup(
      elements.periodControls,
      PERIOD_OPTIONS,
      state.period,
      (option) => {
        selectPeriod(option.value)
      },
      (option) => option.value,
      (option) => option.label
    )
  }

  function selectPeriod(period) {
    if (!PERIOD_OPTIONS.some((option) => option.value === period)) return
    if (state.period === period) return

    state.period = period
    state.selectedRankIndex = 0
    theme.beforePeriodChange?.(context)
    renderControls()
    renderCurrentPeriod()
    theme.afterPeriodChange?.(context)
  }

  async function loadRankBundle(options = {}) {
    setRefreshState('loading')
    theme.beforeLoad?.(context)
    const params = new URLSearchParams({
      page_size: String(RANK_FETCH_LIMIT),
    })
    if (options.force) params.set('refresh', '1')

    try {
      const res = await fetch(`/rank-addon/api/users/bundle?${params}`, {
        headers: {
          'New-Api-User': getNewApiUserId(),
        },
      })
      const payload = await res.json()
      if (!res.ok || !payload.success) {
        throw new Error(payload.message || `请求失败：${res.status}`)
      }
      state.periodData = payload.data?.periods || {}
      state.lastRefreshAt = new Date()
      theme.afterLoadSuccess?.(context)
      renderCurrentPeriod()
      setRefreshState('idle')
    } catch (error) {
      renderError(error instanceof Error ? error.message : '加载失败')
      setRefreshState('error')
    }
  }

  function renderCurrentPeriod() {
    theme.beforeRenderCurrentPeriod?.(context)
    const data = state.periodData[state.period]
    if (!data) {
      renderError('暂无排行数据')
      return
    }
    if (data?.ok === false) {
      renderError(data.message || '当前周期排行加载失败')
      return
    }
    renderDashboard(data)
  }

  function renderDashboard(data) {
    state.rankRows = Array.isArray(data.rank_rows) ? data.rank_rows : []
    state.maxQuota = Math.max(...state.rankRows.map((row) => Number(row.quota) || 0), 1)
    state.summary = {
      quota: data.total_quota,
      tokens: data.total_tokens,
      count: data.total_count,
    }
    clampSelectedRankIndex()
    elements.quota.textContent = formatQuota(data.total_quota)
    elements.tokens.textContent = formatInt(data.total_tokens)
    elements.count.textContent = formatInt(data.total_count)
    renderRankChart()
  }

  function renderRankChart() {
    theme.renderRankChart(context)
  }

  function renderScrollHint(totalRows) {
    if (theme.renderScrollHint) {
      theme.renderScrollHint(context, totalRows)
      return
    }

    if (!elements.scrollHint) return
    elements.scrollHint.textContent = ''
    elements.scrollHint.hidden = true
  }

  function renderError(message) {
    state.rankRows = []
    state.maxQuota = 1
    state.selectedRankIndex = 0
    state.summary = {
      quota: 0,
      tokens: 0,
      count: 0,
    }
    elements.quota.textContent = formatQuota(0)
    elements.tokens.textContent = formatInt(0)
    elements.count.textContent = formatInt(0)
    elements.rankChart.innerHTML = `<div class="${theme.errorClass || 'error'}">${escapeHtml(message)}</div>`
    renderScrollHint(0)
    theme.onError?.(context, message)
  }

  function setRefreshState(refreshState) {
    const isLoading = refreshState === '加载中' || refreshState === 'loading'
    const isError = refreshState === 'error'
    elements.refreshButton.textContent = isLoading ? '刷新中' : '刷新'
    elements.refreshButton.disabled = isLoading
    elements.refreshButton.classList.toggle('is-error', isError)
  }

  function clampSelectedRankIndex() {
    if (!state.rankRows.length) {
      state.selectedRankIndex = 0
      return
    }

    state.selectedRankIndex = Math.min(
      Math.max(state.selectedRankIndex, 0),
      state.rankRows.length - 1
    )
  }
}

export function renderButtonGroup(container, options, activeValue, onSelect, getValue, getLabel) {
  container.replaceChildren()
  for (const option of options) {
    const value = getValue(option)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `control-button${value === activeValue ? ' is-active' : ''}`
    button.textContent = getLabel(option)
    button.addEventListener('click', () => {
      onSelect(option)
    })
    container.append(button)
  }
}

function installThemeSync(theme, getContext) {
  applyNewApiTheme()
  const syncTheme = () => {
    if (applyNewApiTheme()) theme.onColorSchemeChange?.(getContext())
  }

  window.addEventListener('storage', (event) => {
    if (!event.key || isThemeStorageKey(event.key)) syncTheme()
  })

  const colorScheme = window.matchMedia?.('(prefers-color-scheme: dark)')
  colorScheme?.addEventListener?.('change', syncTheme)

  const observer = new MutationObserver(syncTheme)
  for (const themeDocument of getThemeDocuments()) {
    observeThemeTarget(observer, themeDocument.documentElement)
    observeThemeTarget(observer, themeDocument.body)
  }

  window.setInterval(syncTheme, 1000)
}

function observeThemeTarget(observer, target) {
  if (!target) return
  observer.observe(target, {
    attributes: true,
    attributeFilter: ['class', 'theme-mode'],
  })
}

function applyNewApiTheme() {
  const theme = detectNewApiTheme()
  if (document.documentElement.dataset.theme === theme) return false
  document.documentElement.dataset.theme = theme
  return true
}

function detectNewApiTheme() {
  const themeDocuments = getThemeDocuments()
  if (themeDocuments.some(isDocumentDark)) return 'dark'

  const parentThemeDocument = themeDocuments.find((themeDocument) => themeDocument !== document)
  if (parentThemeDocument && isDocumentLight(parentThemeDocument)) return 'light'

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

function isDocumentDark(themeDocument) {
  const root = themeDocument.documentElement
  const body = themeDocument.body
  return root?.classList.contains('dark') || body?.getAttribute('theme-mode') === 'dark'
}

function isDocumentLight(themeDocument) {
  const root = themeDocument.documentElement
  const body = themeDocument.body
  return Boolean(body && root && !body.hasAttribute('theme-mode') && !root.classList.contains('dark'))
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

export function formatQuota(value) {
  const raw = Number(value) || 0
  const usd = raw / QUOTA_PER_UNIT
  if (usd >= 0.01) return `$${usd.toFixed(2)}`
  return raw.toLocaleString()
}

export function formatInt(value) {
  return (Number(value) || 0).toLocaleString()
}

export function formatTier(tier) {
  if (tier?.display) return tier.display
  if (!tier?.label) return '-'
  return tier.code?.includes('king') ? `${tier.label}⭐${formatInt(tier.stars)}` : tier.label
}

export function getTierClass(code) {
  const safeCode = String(code || 'unknown').replace(/[^a-z0-9-]/gi, '')
  return `tier-${safeCode || 'unknown'}`
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
