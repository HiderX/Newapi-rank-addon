import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('ranking page keeps a manual refresh button instead of showing update time', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')

  assert.match(html, /id="refresh-button"/)
  assert.doesNotMatch(html, /load-status/)
  assert.doesNotMatch(app, /更新于/)
})

test('ranking summary shows total quota, token usage, and request count', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')

  assert.match(html, /总消耗/)
  assert.match(html, /Token 消耗/)
  assert.match(html, /请求数/)
  assert.match(html, /id="metric-tokens"/)
  assert.match(app, /tokens:\s*document\.querySelector\('#metric-tokens'\)/)
  assert.match(app, /elements\.tokens\.textContent\s*=\s*formatInt\(data\.total_tokens\)/)
  assert.doesNotMatch(html, /数据条目/)
  assert.doesNotMatch(html, /用户数/)
  assert.doesNotMatch(app, /sourceRows/)
  assert.doesNotMatch(app, /userCount/)
})

test('ranking controls remove page-size select and use scroll reveal', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8')

  assert.doesNotMatch(html, /page-size-select/)
  assert.doesNotMatch(html, /每页显示/)
  assert.doesNotMatch(app, /PAGE_SIZE_OPTIONS/)
  assert.doesNotMatch(app, /pageSizeSelect/)
  assert.match(app, /INITIAL_VISIBLE_ROWS/)
  assert.match(app, /handleInfiniteScroll/)
  assert.match(app, /setRankNameColumnWidth/)
  assert.match(app, /measureText/)
  assert.match(app, /measuredWidth \+ 10/)
  assert.match(app, /\? 108 : 132/)
  assert.match(app, /page_size:\s*String\(RANK_FETCH_LIMIT\)/)
  assert.match(css, /\.scroll-hint/)
  assert.match(css, /\.refresh-button\s*\{[^}]*min-width:\s*68px/s)
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.period-control\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
})

test('ranking panel copy omits username alignment text and tier badge uses compact fixed width', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8')

  assert.doesNotMatch(html, /用户名左对齐/)
  assert.match(css, /--tier-width:\s*112px/)
  assert.match(css, /\.rank-tier\s*\{[^}]*text-align:\s*center/s)
  assert.doesNotMatch(css, /\.rank-user/)
  assert.match(css, /grid-template-columns:\s*52px var\(--rank-name-width\) var\(--tier-width\) minmax\(160px, 1fr\) 96px/)
  assert.match(css, /--rank-side-padding:\s*22px/)
  assert.match(css, /\.rank-chart\s*\{[^}]*padding:\s*16px var\(--rank-side-padding\)/s)
  assert.match(css, /\.rank-name\s*\{[^}]*grid-column:\s*2[^}]*align-self:\s*center[^}]*max-width:\s*var\(--rank-name-width\)/s)
  assert.match(css, /\.rank-index\s*\{[^}]*align-self:\s*center/s)
  assert.match(css, /\.rank-tier\s*\{[^}]*grid-column:\s*3[^}]*align-self:\s*center/s)
  assert.match(css, /\.bar-track\s*\{[^}]*grid-column:\s*4[^}]*align-self:\s*center/s)
  assert.match(css, /\.rank-value\s*\{[^}]*grid-column:\s*5[^}]*align-self:\s*center/s)
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.rank-row\s*\{[\s\S]*?grid-template-columns:\s*42px minmax\(0, 1fr\) var\(--tier-width\) var\(--rank-value-width\)/s)
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.rank-row\s*\{[\s\S]*?align-items:\s*center/s)
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.rank-index\s*\{[\s\S]*?grid-row:\s*1[\s\S]*?padding-top:\s*0/s)
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.rank-tier\s*\{[\s\S]*?grid-column:\s*3[\s\S]*?grid-row:\s*1/s)
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.bar-track\s*\{[\s\S]*?grid-column:\s*2 \/ 5[\s\S]*?grid-row:\s*2/s)
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.rank-chart\s*\{[\s\S]*?--rank-side-padding:\s*12px[\s\S]*?padding:\s*10px var\(--rank-side-padding\)/s)
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.rank-row\s*\{[\s\S]*?--rank-value-width:\s*66px[\s\S]*?grid-template-columns:\s*36px minmax\(0, 1fr\) var\(--tier-width\) var\(--rank-value-width\)/s)
  assert.doesNotMatch(css, /@media \(max-width: 560px\) \{[\s\S]*?--rank-name-width:\s*clamp\(58px, 18vw, 84px\)/)
})

test('ranking addon uses isolated public paths to avoid NewAPI route conflicts', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8')

  assert.match(html, /href="\/rank-addon\/assets\/styles\.css"/)
  assert.match(html, /src="\/rank-addon\/assets\/app\.js"/)
  assert.match(app, /fetch\(`\/rank-addon\/api\/users\?\$\{params\}`/)
  assert.match(server, /url\.pathname === '\/rank-addon\/api\/users'/)
  assert.match(server, /url\.pathname === '\/rank-addon\/users'/)
  assert.match(server, /url\.pathname\.startsWith\('\/rank-addon\/assets\/'\)/)
  assert.doesNotMatch(html, /"\/assets\//)
  assert.doesNotMatch(app, /\/api\/rank\//)
})

test('ranking page forwards NewAPI user id from localStorage as request header', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')

  assert.match(app, /localStorage\.getItem\('user'\)/)
  assert.match(app, /JSON\.parse\(userJson\)/)
  assert.match(app, /'New-Api-User': getNewApiUserId\(\)/)
})

test('ranking page syncs light and dark theme from NewAPI source behavior', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8')

  assert.match(app, /THEME_STORAGE_KEY = 'theme-mode'/)
  assert.match(app, /localStorage\.getItem\(THEME_STORAGE_KEY\)/)
  assert.match(app, /classList\.contains\('dark'\)/)
  assert.match(app, /getAttribute\('theme-mode'\) === 'dark'/)
  assert.match(app, /resolveConfiguredTheme\('auto'\)/)
  assert.match(app, /MutationObserver/)
  assert.match(app, /window\.parent\.document/)
  assert.match(app, /prefers-color-scheme:\s*dark/)
  assert.doesNotMatch(app, /color-mode/)
  assert.doesNotMatch(app, /arco-theme/)
  assert.match(css, /:root\[data-theme='dark'\]/)
  assert.match(css, /color-scheme:\s*dark/)
  assert.match(css, /--panel-bg:/)
})
