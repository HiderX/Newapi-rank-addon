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
