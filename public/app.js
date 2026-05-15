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
const TERMINAL_DEFAULT_VISIBLE_ROWS = 20
const isTerminalTheme = document.documentElement.dataset.uiTheme === 'terminal'

const state = {
  period: 'day',
  periodData: {},
  rankRows: [],
  visibleRows: INITIAL_VISIBLE_ROWS,
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
  terminalBanner: null,
  terminalPrompt: null,
  terminalStatus: null,
}

installThemeSync()
installTerminalChrome()
renderControls()
installKeyboardControls()
elements.refreshButton.addEventListener('click', () => {
  loadRankBundle({ force: true })
})
window.addEventListener('scroll', handleInfiniteScroll, { passive: true })
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
  renderControls()
  renderCurrentPeriod()
  resetTerminalRankScroll()
}

function installTerminalChrome() {
  if (!isTerminalTheme) return

  const shell = document.querySelector('.page-shell')
  if (!shell) return

  shell.classList.add('terminal-window')
  const titlebar = document.createElement('div')
  titlebar.className = 'terminal-titlebar'
  titlebar.innerHTML = `
    <div class="terminal-lights" aria-hidden="true">
      <span class="terminal-light terminal-red"></span>
      <span class="terminal-light terminal-yellow"></span>
      <span class="terminal-light terminal-green"></span>
    </div>
    <div class="terminal-title">newapi-rank-addon - zsh - rankctl</div>
  `
  shell.prepend(titlebar)

  const banner = document.createElement('div')
  banner.className = 'terminal-banner'
  const prompt = document.createElement('div')
  prompt.className = 'terminal-prompt'
  prompt.setAttribute('aria-live', 'polite')
  const status = document.createElement('div')
  status.className = 'terminal-status'
  status.setAttribute('aria-live', 'polite')

  const toolbar = document.querySelector('.toolbar')
  const panel = document.querySelector('.panel')
  toolbar?.before(banner, prompt)
  panel?.after(status)
  elements.terminalBanner = banner
  elements.terminalPrompt = prompt
  elements.terminalStatus = status
  elements.rankChart.classList.add('terminal-output')
  document.documentElement.style.setProperty(
    '--terminal-visible-rows',
    String(getTerminalVisibleRows())
  )
  updateTerminalBanner()
  updateTerminalPrompt()
}

function installKeyboardControls() {
  if (!isTerminalTheme) return

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    switch (key) {
      case '1':
        event.preventDefault()
        selectPeriod('day')
        break
      case '2':
        event.preventDefault()
        selectPeriod('week')
        break
      case '3':
        event.preventDefault()
        selectPeriod('month')
        break
      case '4':
        event.preventDefault()
        selectPeriod('all')
        break
      case 'j':
      case 'ArrowDown':
        event.preventDefault()
        moveSelectedRank(1)
        break
      case 'k':
      case 'ArrowUp':
        event.preventDefault()
        moveSelectedRank(-1)
        break
      case 'r':
        event.preventDefault()
        loadRankBundle({ force: true })
        break
    }
  })
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false

  const tagName = target.tagName
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
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
    })
    container.append(button)
  }
}

async function loadRankBundle(options = {}) {
  setRefreshState('loading')
  if (!isTerminalTheme) {
    state.visibleRows = INITIAL_VISIBLE_ROWS
    state.selectedRankIndex = 0
  }
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
    updateTerminalBanner()
    renderCurrentPeriod()
    setRefreshState('idle')
  } catch (error) {
    renderError(error instanceof Error ? error.message : '加载失败')
    setRefreshState('error')
  }
}

function renderCurrentPeriod() {
  if (!isTerminalTheme) state.visibleRows = INITIAL_VISIBLE_ROWS
  updateTerminalPrompt()
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
  if (isTerminalTheme) {
    renderTerminalRankChart()
    return
  }

  renderClassicRankChart()
}

function renderClassicRankChart() {
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

function renderTerminalRankChart() {
  elements.rankChart.replaceChildren()
  const rows = state.rankRows
  if (!rows.length) {
    const empty = document.createElement('div')
    empty.className = 'terminal-empty'
    empty.textContent = '暂无排行数据'
    elements.rankChart.append(empty)
    renderScrollHint(0)
    updateTerminalStatus('rows=0 selected=-')
    return
  }

  clampSelectedRankIndex()
  const visibleRows = rows
  const table = document.createElement('div')
  table.className = 'terminal-table'
  table.setAttribute('role', 'table')
  table.setAttribute('aria-label', '终端风格用户消耗排行')
  table.append(createTerminalTableRow(['RANK', 'USER', 'TIER', 'QUOTA', 'TOKENS', 'REQ'], true))

  for (const [index, row] of visibleRows.entries()) {
    const tierLabel = formatTerminalTier(row.tier || {})
    const item = createTerminalTableRow(
      [
        `#${row.rank}`,
        String(row.name || '-'),
        tierLabel,
        formatQuota(row.quota),
        formatInt(row.token_used),
        formatInt(row.count),
      ],
      false
    )
    item.dataset.rankIndex = String(index)
    item.classList.toggle('is-selected', index === state.selectedRankIndex)
    item.setAttribute('aria-selected', index === state.selectedRankIndex ? 'true' : 'false')
    decorateTerminalTierCell(item.children[2])
    table.append(item)
  }

  elements.rankChart.append(table)
  renderScrollHint(rows.length)
  updateTerminalStatus(getTerminalStatusText(rows.length))
}

function createTerminalTableRow(cells, isHeader) {
  const row = document.createElement('div')
  row.className = `terminal-table-row${isHeader ? ' terminal-table-head' : ''}`
  row.setAttribute('role', 'row')

  for (const cellText of cells) {
    const cell = document.createElement('div')
    cell.setAttribute('role', isHeader ? 'columnheader' : 'cell')
    cell.textContent = cellText
    row.append(cell)
  }

  return row
}

function moveSelectedRank(delta) {
  if (!state.rankRows.length) return

  const nextIndex = Math.min(
    Math.max(state.selectedRankIndex + delta, 0),
    state.rankRows.length - 1
  )
  if (nextIndex === state.selectedRankIndex) return

  state.selectedRankIndex = nextIndex
  if (!isTerminalTheme && state.selectedRankIndex >= state.visibleRows) {
    state.visibleRows = Math.min(state.selectedRankIndex + 1, state.rankRows.length)
  }
  renderRankChart()
  scrollSelectedRankIntoView()
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

function scrollSelectedRankIntoView() {
  if (!isTerminalTheme) return

  const selected = elements.rankChart.querySelector(
    `.terminal-table-row[data-rank-index="${state.selectedRankIndex}"]`
  )
  selected?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

function resetTerminalRankScroll() {
  if (!isTerminalTheme) return
  elements.rankChart.scrollTop = 0
  elements.rankChart.scrollLeft = 0
}

function getTerminalVisibleRows() {
  const value = Number(document.documentElement.dataset.terminalVisibleRows)
  if (!Number.isFinite(value) || value <= 0) return TERMINAL_DEFAULT_VISIBLE_ROWS
  return Math.floor(value)
}

function updateTerminalPrompt() {
  if (!isTerminalTheme || !elements.terminalPrompt) return

  elements.terminalPrompt.textContent = `rank@newapi ~ % rankctl ${state.period} --limit ${RANK_FETCH_LIMIT}`
}

function updateTerminalBanner() {
  if (!isTerminalTheme || !elements.terminalBanner) return
  elements.terminalBanner.textContent = formatTerminalLoginTime(state.lastRefreshAt)
}

function updateTerminalStatus(text) {
  if (!isTerminalTheme || !elements.terminalStatus) return
  elements.terminalStatus.textContent = text
}

function getTerminalStatusText(totalRows) {
  const selected = state.rankRows[state.selectedRankIndex]
  const selectedText = selected ? `selected=#${selected.rank} ${selected.name}` : 'selected=-'
  return [
    `period=${state.period} rows=${totalRows}/${totalRows} ${selectedText}`,
    `total=${formatQuota(state.summary.quota)} tokens=${formatInt(state.summary.tokens)} requests=${formatInt(state.summary.count)}`,
    'keys: 1 day 2 week 3 month 4 all, j/k move, r refresh',
  ].join('\n')
}

function decorateTerminalTierCell(cell) {
  if (!(cell instanceof HTMLElement)) return
  const text = cell.textContent || ''
  if (!/[★☆]/.test(text)) return

  cell.classList.add('terminal-tier-cell')
  const fragment = document.createDocumentFragment()
  for (const char of text) {
    if (char === '★' || char === '☆') {
      const star = document.createElement('span')
      star.className = 'terminal-star'
      star.textContent = char
      fragment.append(star)
    } else {
      fragment.append(document.createTextNode(char))
    }
  }
  cell.replaceChildren(fragment)
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
  if (isTerminalTheme) return
  if (state.visibleRows >= state.rankRows.length) return

  const scrollBottom = window.scrollY + window.innerHeight
  const triggerPoint = document.documentElement.scrollHeight - SCROLL_LOAD_THRESHOLD
  if (scrollBottom < triggerPoint) return

  state.visibleRows = Math.min(state.visibleRows + LOAD_MORE_ROWS, state.rankRows.length)
  renderRankChart()
}

function renderScrollHint(totalRows) {
  if (!elements.scrollHint) return

  if (isTerminalTheme) {
    elements.scrollHint.textContent = ''
    elements.scrollHint.hidden = true
    return
  }

  const hasMoreRows = state.visibleRows < totalRows
  elements.scrollHint.textContent = hasMoreRows ? '继续向下滚动查看更多' : ''
  elements.scrollHint.hidden = !hasMoreRows
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
  elements.rankChart.innerHTML = `<div class="${isTerminalTheme ? 'terminal-error' : 'error'}">${escapeHtml(message)}</div>`
  renderScrollHint(0)
  updateTerminalStatus(`error=${message}`)
}

function setRefreshState(refreshState) {
  const isLoading = refreshState === '加载中' || refreshState === 'loading'
  const isError = refreshState === 'error'
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

function formatQuota(value) {
  const raw = Number(value) || 0
  const usd = raw / QUOTA_PER_UNIT
  if (usd >= 0.01) return `$${usd.toFixed(2)}`
  return raw.toLocaleString()
}

function formatInt(value) {
  return (Number(value) || 0).toLocaleString()
}

function formatTerminalLoginTime(value) {
  const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date()
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = String(date.getDate()).padStart(2, ' ')
  const time = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':')

  return `Last login: ${weekdays[date.getDay()]} ${months[date.getMonth()]} ${day} ${time} on ttys000`
}

function formatTerminalTier(tier) {
  if (tier?.display) {
    return String(tier.display)
      .replaceAll('⭐️', getTerminalStarSymbol())
      .replaceAll('⭐', getTerminalStarSymbol())
  }
  if (!tier?.label) return '-'
  return tier.code?.includes('king') ? `${tier.label}${getTerminalStarSymbol()}${formatInt(tier.stars)}` : tier.label
}

function getTerminalStarSymbol() {
  return document.documentElement.dataset.theme === 'dark' ? '☆' : '★'
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
