import {
  INITIAL_VISIBLE_ROWS,
  LOAD_MORE_ROWS,
  SCROLL_LOAD_THRESHOLD,
  startRankApp,
} from '../../shared/app-core.js'

let appContext = null

startRankApp({
  initialVisibleRows: INITIAL_VISIBLE_ROWS,
  install(context) {
    appContext = context
    window.addEventListener('scroll', handleInfiniteScroll, { passive: true })
  },
  beforeLoad(context) {
    appContext = context
    context.state.visibleRows = INITIAL_VISIBLE_ROWS
    context.state.selectedRankIndex = 0
  },
  beforeRenderCurrentPeriod(context) {
    appContext = context
    context.state.visibleRows = INITIAL_VISIBLE_ROWS
  },
  renderRankChart(context) {
    appContext = context
    renderClassicRankChart()
  },
  renderScrollHint(context, totalRows) {
    appContext = context
    renderScrollHint(totalRows)
  },
})

function renderClassicRankChart() {
  const { elements, state } = appContext
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
    const tierLabel = appContext.formatTier(tier)
    item.innerHTML = `
      <div class="rank-index">#${row.rank}</div>
      <div class="rank-name${row.is_current_user ? ' is-current' : ''}" title="${appContext.escapeHtml(row.name)}">${appContext.escapeHtml(row.name)}</div>
      <div class="rank-tier ${appContext.getTierClass(tier.code)}" title="${appContext.escapeHtml(tierLabel)}">${appContext.escapeHtml(tierLabel)}</div>
      <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${percentage}%"></div></div>
      <div class="rank-value">${appContext.formatQuota(row.quota)}</div>
    `
    elements.rankChart.append(item)
  }
  renderScrollHint(rows.length)
}

function setRankNameColumnWidth(rows) {
  const { elements } = appContext
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
  const { state } = appContext
  if (state.visibleRows >= state.rankRows.length) return

  const scrollBottom = window.scrollY + window.innerHeight
  const triggerPoint = document.documentElement.scrollHeight - SCROLL_LOAD_THRESHOLD
  if (scrollBottom < triggerPoint) return

  state.visibleRows = Math.min(state.visibleRows + LOAD_MORE_ROWS, state.rankRows.length)
  renderClassicRankChart()
}

function renderScrollHint(totalRows) {
  const { elements, state } = appContext
  if (!elements.scrollHint) return

  const hasMoreRows = state.visibleRows < totalRows
  elements.scrollHint.textContent = hasMoreRows ? '继续向下滚动查看更多' : ''
  elements.scrollHint.hidden = !hasMoreRows
}
