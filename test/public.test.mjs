import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('ranking page keeps a manual refresh button instead of showing update time', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const core = await readFile(new URL('../public/shared/app-core.js', import.meta.url), 'utf8')

  assert.match(html, /id="refresh-button"/)
  assert.doesNotMatch(html, /load-status/)
  assert.doesNotMatch(core, /更新于/)
})

test('ranking summary shows total quota, token usage, and request count', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const core = await readFile(new URL('../public/shared/app-core.js', import.meta.url), 'utf8')

  assert.match(html, /总消耗/)
  assert.match(html, /Token 消耗/)
  assert.match(html, /请求数/)
  assert.match(html, /id="metric-tokens"/)
  assert.match(core, /tokens:\s*document\.querySelector\('#metric-tokens'\)/)
  assert.match(core, /elements\.tokens\.textContent\s*=\s*formatInt\(data\.total_tokens\)/)
  assert.doesNotMatch(html, /数据条目/)
  assert.doesNotMatch(html, /用户数/)
  assert.doesNotMatch(core, /sourceRows/)
  assert.doesNotMatch(core, /userCount/)
})

test('ranking controls remove page-size select and use scroll reveal', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const core = await readFile(new URL('../public/shared/app-core.js', import.meta.url), 'utf8')
  const app = await readFile(new URL('../public/themes/classic/app.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../public/themes/classic/styles.css', import.meta.url), 'utf8')

  assert.doesNotMatch(html, /page-size-select/)
  assert.doesNotMatch(html, /每页显示/)
  assert.doesNotMatch(core, /PAGE_SIZE_OPTIONS/)
  assert.doesNotMatch(core, /pageSizeSelect/)
  assert.match(app, /INITIAL_VISIBLE_ROWS/)
  assert.match(app, /handleInfiniteScroll/)
  assert.match(app, /setRankNameColumnWidth/)
  assert.match(app, /measureText/)
  assert.match(app, /measuredWidth \+ 10/)
  assert.match(app, /\? 108 : 132/)
  assert.match(core, /page_size:\s*String\(RANK_FETCH_LIMIT\)/)
  assert.match(css, /\.scroll-hint/)
  assert.match(css, /\.refresh-button\s*\{[^}]*min-width:\s*68px/s)
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.period-control\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
})

test('ranking page hides document scrollbar while keeping window scroll enabled', async () => {
  const css = await readFile(new URL('../public/themes/classic/styles.css', import.meta.url), 'utf8')

  assert.match(css, /html,\s*body\s*\{[^}]*scrollbar-width:\s*none/s)
  assert.match(css, /html::-webkit-scrollbar,\s*body::-webkit-scrollbar\s*\{[^}]*display:\s*none/s)
  assert.doesNotMatch(css, /html\s*\{[^}]*overflow-y:\s*scroll/s)
  assert.doesNotMatch(css, /scrollbar-gutter:\s*stable/)
  assert.doesNotMatch(css, /(?:html|body)(?:,\s*(?:html|body))*\s*\{[^}]*overflow(?:-y)?:\s*hidden/s)
})

test('ranking panel copy omits username alignment text and tier badge uses compact fixed width', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const css = await readFile(new URL('../public/themes/classic/styles.css', import.meta.url), 'utf8')

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
  const core = await readFile(new URL('../public/shared/app-core.js', import.meta.url), 'utf8')
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8')

  assert.match(html, /<!-- theme-style-link -->/)
  assert.match(html, /<!-- theme-script-link -->/)
  assert.match(server, /\/rank-addon\/assets\/themes\/\$\{theme\}\/styles\.css/)
  assert.match(server, /\/rank-addon\/assets\/themes\/\$\{theme\}\/app\.js/)
  assert.match(core, /fetch\(`\/rank-addon\/api\/users\/bundle\?\$\{params\}`/)
  assert.match(server, /url\.pathname === '\/rank-addon\/api\/users\/bundle'/)
  assert.match(server, /url\.pathname === '\/rank-addon\/api\/users'/)
  assert.match(server, /url\.pathname === '\/rank-addon\/users'/)
  assert.match(server, /url\.pathname\.startsWith\('\/rank-addon\/assets\/'\)/)
  assert.doesNotMatch(html, /"\/assets\//)
  assert.doesNotMatch(core, /\/api\/rank\//)
})

test('ranking page forwards NewAPI user id from localStorage as request header', async () => {
  const core = await readFile(new URL('../public/shared/app-core.js', import.meta.url), 'utf8')

  assert.match(core, /localStorage\.getItem\('user'\)/)
  assert.match(core, /JSON\.parse\(userJson\)/)
  assert.match(core, /'New-Api-User': getNewApiUserId\(\)/)
})

test('ranking page syncs light and dark theme from NewAPI source behavior', async () => {
  const core = await readFile(new URL('../public/shared/app-core.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../public/themes/classic/styles.css', import.meta.url), 'utf8')

  assert.match(core, /THEME_STORAGE_KEY = 'theme-mode'/)
  assert.match(core, /localStorage\.getItem\(THEME_STORAGE_KEY\)/)
  assert.match(core, /classList\.contains\('dark'\)/)
  assert.match(core, /getAttribute\('theme-mode'\) === 'dark'/)
  assert.match(core, /function isDocumentDark/)
  assert.match(core, /function isDocumentLight/)
  assert.match(core, /find\(\(themeDocument\) => themeDocument !== document\)/)
  assert.match(core, /resolveConfiguredTheme\('auto'\)/)
  assert.match(core, /MutationObserver/)
  assert.match(core, /window\.parent\.document/)
  assert.match(core, /prefers-color-scheme:\s*dark/)
  assert.doesNotMatch(core, /color-mode/)
  assert.doesNotMatch(core, /arco-theme/)
  assert.doesNotMatch(
    core,
    /function readThemeFromDocument[\s\S]*?!body\.hasAttribute\('theme-mode'\)[\s\S]*?return 'light'/
  )
  assert.match(css, /:root\[data-theme='dark'\]/)
  assert.match(css, /color-scheme:\s*dark/)
  assert.match(css, /--panel-bg:/)
})

test('bundle API and page keep partial period failures isolated', async () => {
  const core = await readFile(new URL('../public/shared/app-core.js', import.meta.url), 'utf8')
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8')

  assert.doesNotMatch(server, /failedPeriod/)
  assert.match(server, /success:\s*true,[\s\S]*data:\s*\{[\s\S]*\.\.\.payload/)
  assert.match(core, /if \(data\?\.ok === false\)/)
  assert.match(core, /renderError\(data\.message \|\| '当前周期排行加载失败'\)/)
  assert.match(core, /elements\.quota\.textContent\s*=\s*formatQuota\(0\)/)
  assert.match(core, /elements\.tokens\.textContent\s*=\s*formatInt\(0\)/)
  assert.match(core, /elements\.count\.textContent\s*=\s*formatInt\(0\)/)
})
