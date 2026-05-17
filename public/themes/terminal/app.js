import { RANK_FETCH_LIMIT, startRankApp } from '../../shared/app-core.js'

const TERMINAL_DEFAULT_VISIBLE_ROWS = 20

let appContext = null

startRankApp({
  errorClass: 'terminal-error',
  install(context) {
    appContext = context
    installTerminalViewportSizing()
    installTerminalChrome()
    installKeyboardControls()
  },
  afterLoadSuccess(context) {
    appContext = context
    updateTerminalBanner()
  },
  beforeRenderCurrentPeriod(context) {
    appContext = context
    updateTerminalPrompt()
  },
  afterPeriodChange(context) {
    appContext = context
    resetTerminalRankScroll()
  },
  renderRankChart(context) {
    appContext = context
    renderTerminalRankChart()
  },
  renderScrollHint(context) {
    appContext = context
    const { elements } = appContext
    elements.scrollHint.textContent = ''
    elements.scrollHint.hidden = true
  },
  onError(context, message) {
    appContext = context
    updateTerminalStatus(`error=${message}`)
  },
  onColorSchemeChange(context) {
    appContext = context
    if (context.state.rankRows.length) context.renderRankChart()
  },
})

function installTerminalViewportSizing() {
  const syncViewportHeight = () => {
    const visualHeight = window.visualViewport?.height
    const viewportHeight =
      Number.isFinite(visualHeight) && visualHeight > 0 ? visualHeight : window.innerHeight

    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return
    document.documentElement.style.setProperty('--terminal-viewport-height', `${viewportHeight}px`)
  }

  // Safari 在 iframe 内可能把 CSS vh 算成父页面视口；这里以实际窗口高度锁定终端布局。
  syncViewportHeight()
  window.addEventListener('resize', syncViewportHeight)
  window.addEventListener('orientationchange', syncViewportHeight)
  window.addEventListener('pageshow', syncViewportHeight)
  window.visualViewport?.addEventListener?.('resize', syncViewportHeight)
}

function installTerminalChrome() {
  const { elements } = appContext
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
  const handleShortcutEvent = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return

    if (handleTerminalShortcut(event.key)) event.preventDefault()
  }

  window.addEventListener('keydown', handleShortcutEvent)
  installParentKeyboardBridge(handleShortcutEvent)
}

function installParentKeyboardBridge(handleShortcutEvent) {
  const parentWindow = getSameOriginParentWindow()
  if (!parentWindow) return

  let isParentKeyboardListening = false

  function addParentKeyboardListener() {
    if (isParentKeyboardListening) return
    parentWindow.addEventListener('keydown', handleShortcutEvent)
    isParentKeyboardListening = true
  }

  function removeParentKeyboardListener() {
    if (!isParentKeyboardListening) return
    parentWindow.removeEventListener('keydown', handleShortcutEvent)
    isParentKeyboardListening = false
  }

  addParentKeyboardListener()
  window.addEventListener('pagehide', removeParentKeyboardListener)
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) addParentKeyboardListener()
  })
}

function getSameOriginParentWindow() {
  try {
    if (window.parent !== window && window.parent.location.origin === window.location.origin) {
      return window.parent
    }
    return null
  } catch {
    return null
  }
}

function handleTerminalShortcut(keyValue) {
  const key = keyValue.length === 1 ? keyValue.toLowerCase() : keyValue
  switch (key) {
    case '1':
      appContext.selectPeriod('day')
      return true
    case '2':
      appContext.selectPeriod('week')
      return true
    case '3':
      appContext.selectPeriod('month')
      return true
    case '4':
      appContext.selectPeriod('all')
      return true
    case 'j':
    case 'ArrowDown':
      moveSelectedRank(1)
      return true
    case 'k':
    case 'ArrowUp':
      moveSelectedRank(-1)
      return true
    case 'r':
      appContext.loadRankBundle({ force: true })
      return true
    default:
      return false
  }
}

function isEditableTarget(target) {
  if (!target || target.nodeType !== Node.ELEMENT_NODE) return false

  const tagName = target.tagName
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  )
}

function renderTerminalRankChart() {
  const { elements, state } = appContext
  elements.rankChart.replaceChildren()
  const rows = state.rankRows
  if (!rows.length) {
    const empty = document.createElement('div')
    empty.className = 'terminal-empty'
    empty.textContent = '暂无排行数据'
    elements.rankChart.append(empty)
    appContext.renderScrollHint(0)
    updateTerminalStatus('rows=0 selected=-')
    return
  }

  appContext.clampSelectedRankIndex()
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
        appContext.formatQuota(row.quota),
        appContext.formatInt(row.token_used),
        appContext.formatInt(row.count),
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
  appContext.renderScrollHint(rows.length)
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
  const { state } = appContext
  if (!state.rankRows.length) return

  const nextIndex = Math.min(
    Math.max(state.selectedRankIndex + delta, 0),
    state.rankRows.length - 1
  )
  if (nextIndex === state.selectedRankIndex) return

  state.selectedRankIndex = nextIndex
  renderTerminalRankChart()
  scrollSelectedRankIntoView()
}

function scrollSelectedRankIntoView() {
  const { elements, state } = appContext
  const selected = elements.rankChart.querySelector(
    `.terminal-table-row[data-rank-index="${state.selectedRankIndex}"]`
  )
  selected?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

function resetTerminalRankScroll() {
  const { elements } = appContext
  elements.rankChart.scrollTop = 0
  elements.rankChart.scrollLeft = 0
}

function getTerminalVisibleRows() {
  const value = Number(document.documentElement.dataset.terminalVisibleRows)
  if (!Number.isFinite(value) || value <= 0) return TERMINAL_DEFAULT_VISIBLE_ROWS
  return Math.floor(value)
}

function updateTerminalPrompt() {
  const { elements, state } = appContext
  if (!elements.terminalPrompt) return

  elements.terminalPrompt.textContent = `rank@newapi ~ % rankctl ${state.period} --limit ${RANK_FETCH_LIMIT}`
}

function updateTerminalBanner() {
  const { elements, state } = appContext
  if (!elements.terminalBanner) return
  elements.terminalBanner.textContent = formatTerminalLoginTime(state.lastRefreshAt)
}

function updateTerminalStatus(text) {
  const { elements } = appContext
  if (!elements.terminalStatus) return
  elements.terminalStatus.textContent = text
}

function getTerminalStatusText(totalRows) {
  const { state } = appContext
  const selected = state.rankRows[state.selectedRankIndex]
  const selectedText = selected ? `selected=#${selected.rank} ${selected.name}` : 'selected=-'
  return [
    `period=${state.period} rows=${totalRows}/${totalRows} ${selectedText}`,
    `total=${appContext.formatQuota(state.summary.quota)} tokens=${appContext.formatInt(state.summary.tokens)} requests=${appContext.formatInt(state.summary.count)}`,
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
  return tier.code?.includes('king') ? `${tier.label}${getTerminalStarSymbol()}${appContext.formatInt(tier.stars)}` : tier.label
}

function getTerminalStarSymbol() {
  return document.documentElement.dataset.theme === 'dark' ? '☆' : '★'
}
