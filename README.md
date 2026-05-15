# New API 外挂用户排行榜 / New API Rank Add-on

独立排行榜页面和代理服务，不修改 New API 原项目。

An independent ranking page and proxy service for New API, designed to run without modifying the upstream New API project.

## 效果预览 / Preview

| 桌面端浅色 / Desktop Light | 桌面端深色 / Desktop Dark |
| --- | --- |
| ![巅峰排行榜桌面端浅色截图](docs/screenshots/desktop-light.png) | ![巅峰排行榜桌面端深色截图](docs/screenshots/desktop-dark.png) |

| 移动端浅色 / Mobile Light | 移动端深色 / Mobile Dark |
| --- | --- |
| ![巅峰排行榜移动端浅色截图](docs/screenshots/mobile-light.png) | ![巅峰排行榜移动端深色截图](docs/screenshots/mobile-dark.png) |

## 启动 / Getting Started

运行环境需要 Node.js 22.13.0 或更高版本，因为服务端使用内置的 `node:sqlite` 持久化缓存和段位继承结果。

Node.js 22.13.0 or newer is required because the server uses the built-in `node:sqlite` module to persist cache and tier inheritance data.

先按实际环境修改项目根目录的 `config.json`：

Edit `config.json` in the project root for your environment first:

```json
{
  "server": {
    "port": 2234
  },
  "newApi": {
    "baseUrl": "http://127.0.0.1:2233",
    "authorization": "Bearer <your-admin-token>",
    "adminUserId": "1"
  },
  "rank": {
    "timezone": "Asia/Shanghai",
    "utcOffsetMinutes": 480,
    "seasonResetDay": 7
  },
  "cache": {
    "freshSeconds": 60,
    "allFreshSeconds": 300,
    "staleSeconds": 600
  },
  "storage": {
    "sqlitePath": "./data/rank-addon.sqlite"
  },
  "ui": {
    "theme": "classic",
    "terminal": {
      "visibleRows": 20
    }
  },
  "webdav": {
    "enabled": false,
    "baseUrl": "https://example.com/dav",
    "username": "",
    "password": "",
    "targetFolder": "newapi-rank-addon",
    "backupIntervalSeconds": 21600,
    "retention": 20,
    "timeoutSeconds": 30
  }
}
```

本地启动：

Start locally:

```bash
npm start
```

打开：

Open:

```text
http://localhost:2234/rank-addon/users
```

如果要复用 New API 网页登录态，生产环境建议把外挂服务反向代理到 New API 同域名下，例如：

To reuse the New API web login session, reverse proxy the add-on under the same domain as New API in production, for example:

```text
https://xxx.aaa.bb/rank-addon/* -> http://127.0.0.1:2234/rank-addon/*
```

这样浏览器会自动携带 New API 的 Cookie，外挂服务才能用 `/api/user/self` 校验登录态。

This lets the browser send the New API cookies automatically, so the add-on can verify the login session through `/api/user/self`.

## 配置 / Configuration

- `server.port`：外挂服务端口，默认 `2234`
  `server.port`: add-on service port, default `2234`
- `newApi.baseUrl`：New API 地址，默认 `http://localhost:2233`
  `newApi.baseUrl`: New API base URL, default `http://localhost:2233`
- `newApi.authorization`：服务端请求 `/api/data/users` 时使用的管理员 `Authorization`
  `newApi.authorization`: admin `Authorization` used by the server when requesting `/api/data/users`
- `newApi.adminUserId`：服务端请求 `/api/data/users` 时使用的管理员 `New-Api-User`
  `newApi.adminUserId`: admin `New-Api-User` used by the server when requesting `/api/data/users`
- `rank.timezone`：排行口径的时区说明，默认 `Asia/Shanghai`
  `rank.timezone`: timezone label for ranking windows, default `Asia/Shanghai`
- `rank.utcOffsetMinutes`：排行口径的 UTC 偏移分钟数，上海时区为 `480`
  `rank.utcOffsetMinutes`: UTC offset in minutes for ranking windows, `480` for Asia/Shanghai
- `rank.seasonResetDay`：赛季月每月几号重置，当前为 `7`
  `rank.seasonResetDay`: day of month when the season month resets, currently `7`
- `cache.freshSeconds`：日/周/月排行服务端缓存新鲜期，默认 `60`
  `cache.freshSeconds`: server-side fresh cache TTL for day/week/month rankings, default `60`
- `cache.allFreshSeconds`：总排行服务端缓存新鲜期，默认 `300`
  `cache.allFreshSeconds`: server-side fresh cache TTL for all-time rankings, default `300`
- `cache.staleSeconds`：缓存过期后允许返回旧数据并后台刷新的窗口，默认 `600`
  `cache.staleSeconds`: stale-while-refresh window after fresh TTL expires, default `600`
- `storage.sqlitePath`：SQLite 数据库路径，用于缓存响应和持久化段位继承结果，默认 `./data/rank-addon.sqlite`
  `storage.sqlitePath`: SQLite database path for response cache and persisted tier inheritance, default `./data/rank-addon.sqlite`
- `ui.theme`：页面主题，只能在 `config.json` 中配置；`classic` 保持默认设计，`terminal` 启用 macOS Terminal.app 风格界面
  `ui.theme`: page theme configured through `config.json`; `classic` keeps the default design, while `terminal` enables the macOS Terminal.app-style UI
- `ui.terminal.visibleRows`：终端主题排行榜窗口可见数据行数，默认 `20`
  `ui.terminal.visibleRows`: visible ranking rows in the terminal theme viewport, default `20`
- `webdav.enabled`：是否启用 SQLite 快照备份，默认 `false`
  `webdav.enabled`: enable SQLite snapshot backup, default `false`
- `webdav.baseUrl`：WebDAV 根地址
  `webdav.baseUrl`: WebDAV base URL
- `webdav.username` / `webdav.password`：WebDAV Basic Auth 凭据
  `webdav.username` / `webdav.password`: WebDAV Basic Auth credentials
- `webdav.targetFolder`：WebDAV 目标文件夹，不存在时会自动逐级创建
  `webdav.targetFolder`: target WebDAV folder; missing folders are created automatically
- `webdav.backupIntervalSeconds`：备份周期，默认 `21600` 秒
  `webdav.backupIntervalSeconds`: backup interval in seconds, default `21600`
- `webdav.retention`：保留数量配置，默认 `20`
  `webdav.retention`: retention setting, default `20`
- `webdav.timeoutSeconds`：WebDAV 请求超时，默认 `30`
  `webdav.timeoutSeconds`: WebDAV request timeout in seconds, default `30`

`PORT`、`NEW_API_BASE`、`NEW_API_AUTHORIZATION`、`NEW_API_USER`、`RANK_TIMEZONE`、`RANK_UTC_OFFSET_MINUTES`、`RANK_SEASON_RESET_DAY`、`RANK_CACHE_FRESH_SECONDS`、`RANK_CACHE_ALL_FRESH_SECONDS`、`RANK_CACHE_STALE_SECONDS`、`RANK_SQLITE_PATH` 和 `RANK_WEBDAV_*` 仍可作为临时环境变量覆盖配置，但 systemd 部署默认只读 `config.json`。

`PORT`, `NEW_API_BASE`, `NEW_API_AUTHORIZATION`, `NEW_API_USER`, `RANK_TIMEZONE`, `RANK_UTC_OFFSET_MINUTES`, `RANK_SEASON_RESET_DAY`, `RANK_CACHE_FRESH_SECONDS`, `RANK_CACHE_ALL_FRESH_SECONDS`, `RANK_CACHE_STALE_SECONDS`, `RANK_SQLITE_PATH`, and `RANK_WEBDAV_*` can still override the config for one-off runs, while the systemd deployment reads `config.json` by default.

访问排行榜接口时，外挂服务会先把浏览器传入的 New API Cookie 转发到 `/api/user/self` 校验登录态。未登录用户只能看到页面骨架，不能获取排行榜数据。

When the ranking API is requested, the add-on first forwards the browser's New API cookies to `/api/user/self` to verify the login session. Logged-out users can see the page shell but cannot fetch ranking data.

## 接口 / API

```text
GET /rank-addon/api/users?period=day&page_size=100
GET /rank-addon/api/users/bundle?page_size=100
```

`period` 支持 `day`、`week`、`month`、`all`，分别对应日排行、周排行、月排行和总排行。其中 `month` 不是自然月，而是每月 7 日 00:00 重置的赛季月。页面默认请求 `/rank-addon/api/users/bundle` 一次取回四个周期，切换日/周/月/总排行时直接使用浏览器内存里的数据；点击刷新会带 `refresh=1` 强制服务端刷新。接口本身仍支持最多返回 100 个用户。返回数据已按有效用户 ID 聚合并按总 `quota` 降序排序；当 New API 数据看板返回零值用户 ID 时，会回退按用户名聚合。每行会包含按当前赛季月消耗计算的 `tier` 段位字段。

`period` supports `day`, `week`, `month`, and `all`, corresponding to daily, weekly, monthly, and all-time rankings. `month` is a season month that resets at 00:00 on the 7th day of each month, not a calendar month. The page requests `/rank-addon/api/users/bundle` by default to fetch all four periods once, and switching tabs uses in-memory browser data. The refresh button sends `refresh=1` to force a server refresh. The API itself still returns up to 100 users. Response rows are aggregated by valid user ID and sorted by total `quota` in descending order; when New API dashboard data returns zero-value user IDs, the add-on falls back to username aggregation. Each row includes a `tier` field calculated from the current season-month usage.

周排行按 `rank.utcOffsetMinutes` 对应时区的自然周统计，默认使用 `Asia/Shanghai` 口径，即周一 00:00 到当前请求时间。

The weekly ranking uses the natural week in the timezone represented by `rank.utcOffsetMinutes`. By default, it follows `Asia/Shanghai`, from Monday 00:00 to the current request time.

段位换算使用 0-1520 刀对应 0-200 星：前 100 星对应青铜到星耀，100 星后进入王者细分，1520 刀对应传奇王者 100 星。页面展示使用 `至尊星耀III`、`最强王者⭐3` 这种格式；只有王者段位显示星数。

Tier conversion maps 0-1520 USD to 0-200 stars. The first 100 stars cover Bronze through Star Glory, and stars after 100 enter King sub-tiers, with 1520 USD mapping to Legendary King 100 stars. The UI uses formats such as `至尊星耀III` and `最强王者⭐3`; only King tiers show star counts.

赛季段位支持继承：服务端会读取当前赛季开始前的历史数据，找到每个用户最近一次有消耗的历史赛季，并按段位继承表计算起始星数。上赛季活跃使用“直接继承”，隔 1 个赛季使用“跨单赛季继承”，隔 2 个及以上赛季使用“跨多赛季继承”。最终展示段位 = 继承起始星数 + 当前赛季消耗换算星数。

Season tier inheritance is supported. The server reads historical data before the current season, finds each user's latest active historical season, and converts that previous tier into starting stars through the inheritance table. Users active in the previous season use direct inheritance, users who skipped one season use single-season inheritance, and users who skipped two or more seasons use multi-season inheritance. The displayed tier is calculated from inherited starting stars plus stars earned from current-season usage.

排行响应和段位继承结果会写入 SQLite。缓存命中时不会请求 New API；缓存进入过期窗口时会先返回旧数据并后台刷新。SQLite 可按配置定期上传到 WebDAV，备份前会生成一致性快照，目标目录不存在时自动创建。

Ranking responses and tier inheritance results are persisted in SQLite. Cache hits do not call New API. During the stale window, the add-on returns stale data first and refreshes in the background. SQLite can be uploaded to WebDAV on a configured interval; backups use a consistent snapshot and automatically create missing target folders.

## 致谢 / Acknowledgements

感谢 [LinuxDo](https://linux.do/) 社区在使用反馈、部署实践和体验改进上的讨论与支持。

Thanks to the [LinuxDo](https://linux.do/) community for its feedback, deployment experience, and discussions that helped improve the user experience.
