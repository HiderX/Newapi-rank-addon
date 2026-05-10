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
  assert.match(css, /grid-template-columns:\s*52px minmax\(120px, 220px\) var\(--tier-width\)/)
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.bar-track\s*\{[\s\S]*?grid-row:\s*3/s)
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
