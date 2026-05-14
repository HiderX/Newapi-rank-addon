import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadConfig } from '../src/config.mjs'

test('loadConfig reads runtime values from config.json', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rank-config-'))
  const configPath = path.join(dir, 'config.json')
  await writeFile(
    configPath,
    JSON.stringify({
      server: { port: 2235 },
      newApi: {
        baseUrl: 'http://127.0.0.1:2233',
        authorization: 'Bearer test-token',
        adminUserId: '9',
      },
      rank: {
        timezone: 'Asia/Shanghai',
        utcOffsetMinutes: 480,
        seasonResetDay: 7,
      },
      cache: {
        freshSeconds: 45,
        allFreshSeconds: 240,
        staleSeconds: 900,
      },
      storage: {
        sqlitePath: './data/custom.sqlite',
      },
      webdav: {
        enabled: true,
        baseUrl: 'https://dav.example.com/root',
        username: 'dav-user',
        password: 'dav-pass',
        targetFolder: 'newapi-rank-addon',
        backupIntervalSeconds: 7200,
        retention: 12,
        timeoutSeconds: 20,
      },
    })
  )

  const config = await loadConfig({ configPath, env: {} })

  assert.equal(config.port, 2235)
  assert.equal(config.upstreamBase, 'http://127.0.0.1:2233')
  assert.equal(config.authorization, 'Bearer test-token')
  assert.equal(config.newApiUser, '9')
  assert.deepEqual(config.rankOptions, {
    timezone: 'Asia/Shanghai',
    utcOffsetMinutes: 480,
    resetDay: 7,
  })
  assert.deepEqual(config.cacheOptions, {
    freshSeconds: 45,
    allFreshSeconds: 240,
    staleSeconds: 900,
  })
  assert.equal(config.storage.sqlitePath, path.join(dir, 'data/custom.sqlite'))
  assert.deepEqual(config.webdav, {
    enabled: true,
    baseUrl: 'https://dav.example.com/root',
    username: 'dav-user',
    password: 'dav-pass',
    targetFolder: 'newapi-rank-addon',
    backupIntervalSeconds: 7200,
    retention: 12,
    timeoutSeconds: 20,
  })
})

test('loadConfig still supports environment overrides for local one-off runs', async () => {
  const config = await loadConfig({
    configPath: '/path/not/exist/config.json',
    env: {
      PORT: '2236',
      NEW_API_BASE: 'http://localhost:2233',
      NEW_API_AUTHORIZATION: 'Bearer env-token',
      NEW_API_USER: '2',
      RANK_TIMEZONE: 'UTC',
      RANK_UTC_OFFSET_MINUTES: '0',
      RANK_SEASON_RESET_DAY: '9',
      RANK_CACHE_FRESH_SECONDS: '30',
      RANK_CACHE_ALL_FRESH_SECONDS: '180',
      RANK_CACHE_STALE_SECONDS: '600',
      RANK_SQLITE_PATH: '/tmp/rank.sqlite',
      RANK_WEBDAV_ENABLED: 'true',
      RANK_WEBDAV_BASE_URL: 'https://dav.example.com',
      RANK_WEBDAV_USERNAME: 'env-user',
      RANK_WEBDAV_PASSWORD: 'env-pass',
      RANK_WEBDAV_TARGET_FOLDER: 'backups/rank',
      RANK_WEBDAV_BACKUP_INTERVAL_SECONDS: '3600',
      RANK_WEBDAV_RETENTION: '7',
      RANK_WEBDAV_TIMEOUT_SECONDS: '15',
    },
  })

  assert.equal(config.port, 2236)
  assert.equal(config.upstreamBase, 'http://localhost:2233')
  assert.equal(config.authorization, 'Bearer env-token')
  assert.equal(config.newApiUser, '2')
  assert.deepEqual(config.rankOptions, {
    timezone: 'UTC',
    utcOffsetMinutes: 0,
    resetDay: 9,
  })
  assert.deepEqual(config.cacheOptions, {
    freshSeconds: 30,
    allFreshSeconds: 180,
    staleSeconds: 600,
  })
  assert.equal(config.storage.sqlitePath, '/tmp/rank.sqlite')
  assert.deepEqual(config.webdav, {
    enabled: true,
    baseUrl: 'https://dav.example.com',
    username: 'env-user',
    password: 'env-pass',
    targetFolder: 'backups/rank',
    backupIntervalSeconds: 3600,
    retention: 7,
    timeoutSeconds: 15,
  })
})

test('project service file keeps business configuration in config.json', async () => {
  const service = await readFile(new URL('../newapi-rank-addon.service', import.meta.url), 'utf8')

  assert.match(service, /WorkingDirectory=\/home\/ubuntu\/newapi-rank-addon/)
  assert.match(
    service,
    /ExecStart=\/home\/ubuntu\/\.nvm\/versions\/node\/v22\.22\.2\/bin\/node \/home\/ubuntu\/newapi-rank-addon\/server\.mjs/
  )
  assert.doesNotMatch(service, /NEW_API_AUTHORIZATION/)
  assert.doesNotMatch(service, /NEW_API_BASE/)
  assert.doesNotMatch(service, /NEW_API_USER/)
  assert.doesNotMatch(service, /Environment=PORT=/)
})

test('package and README require a Node version with node:sqlite', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  )
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')

  assert.equal(packageJson.engines.node, '>=22.13.0')
  assert.match(readme, /Node\.js 22\.13\.0/)
})
