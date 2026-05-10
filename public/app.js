const PERIOD_OPTIONS = [
  { label: '日排行', value: 'day' },
  { label: '周排行', value: 'week' },
  { label: '月排行', value: 'month' },
  { label: '总排行', value: 'all' },
]

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const QUOTA_PER_UNIT = 500000

const state = {
  period: 'day',
  pageSize: 10,
}

const elements = {
  refreshButton: document.querySelector('#refresh-button'),
  periodControls: document.querySelector('#period-controls'),
  pageSizeSelect: document.querySelector('#page-size-select'),
  quota: document.querySelector('#metric-quota'),
  tokens: document.querySelector('#metric-tokens'),
  count: document.querySelector('#metric-count'),
  rankChart: document.querySelector('#rank-chart'),
}

renderControls()
elements.refreshButton.addEventListener('click', () => {
  loadRank()
})
loadRank()

function renderControls() {
  renderButtonGroup(
    elements.periodControls,
    PERIOD_OPTIONS,
    state.period,
    (option) => {
      state.period = option.value
      loadRank()
    },
    (option) => option.value,
    (option) => option.label
  )

  elements.pageSizeSelect.replaceChildren(
    ...PAGE_SIZE_OPTIONS.map((pageSize) => {
      const option = document.createElement('option')
      option.value = String(pageSize)
      option.textContent = `${pageSize} 人`
      option.selected = pageSize === state.pageSize
      return option
    })
  )
}

elements.pageSizeSelect.addEventListener('change', () => {
  state.pageSize = Number(elements.pageSizeSelect.value) || 10
  loadRank()
})

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
  const params = new URLSearchParams({
    period: state.period,
    page_size: String(state.pageSize),
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
  elements.quota.textContent = formatQuota(data.total_quota)
  elements.tokens.textContent = formatInt(data.total_tokens)
  elements.count.textContent = formatInt(data.total_count)
  renderRankChart(data.rank_rows)
}

function renderRankChart(rows) {
  elements.rankChart.replaceChildren()
  if (!rows.length) {
    elements.rankChart.innerHTML = '<div class="empty">暂无排行数据</div>'
    return
  }

  const maxQuota = Math.max(...rows.map((row) => Number(row.quota) || 0), 1)
  for (const row of rows) {
    const item = document.createElement('div')
    item.className = 'rank-row'
    const percentage = Math.max(2, ((Number(row.quota) || 0) / maxQuota) * 100)
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
}

function renderError(message) {
  elements.rankChart.innerHTML = `<div class="error">${escapeHtml(message)}</div>`
}

function setRefreshState(state) {
  const isLoading = state === '加载中' || state === 'loading'
  const isError = state === 'error'
  elements.refreshButton.textContent = isLoading ? '刷新中' : '刷新'
  elements.refreshButton.disabled = isLoading
  elements.refreshButton.classList.toggle('is-error', isError)
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
