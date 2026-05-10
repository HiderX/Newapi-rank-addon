import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyNewApiLogin } from '../src/auth.mjs'

test('verifyNewApiLogin forwards browser cookie and New-Api-User header to New API self endpoint', async () => {
  const calls = []
  const result = await verifyNewApiLogin({
    upstreamBase: 'http://localhost:2233',
    cookie: 'session=abc',
    requestNewApiUser: '7',
    newApiUser: '1',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { id: 7, username: 'alice', role: 1 },
        }),
      }
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.user.username, 'alice')
  assert.equal(calls[0].url, 'http://localhost:2233/api/user/self')
  assert.equal(calls[0].options.headers.Cookie, 'session=abc')
  assert.equal(calls[0].options.headers['New-Api-User'], '7')
})

test('verifyNewApiLogin rejects missing browser New-Api-User header instead of guessing from cookie', async () => {
  let called = false
  const result = await verifyNewApiLogin({
    upstreamBase: 'http://localhost:2233',
    cookie: 'session=abc; new-api-user=23',
    newApiUser: '1',
    fetchImpl: async () => {
      called = true
      throw new Error('should not be called')
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.match(result.message, /New-Api-User/)
  assert.equal(called, false)
})

test('verifyNewApiLogin prefers the browser New-Api-User header over stale cookie user id', async () => {
  const calls = []
  const result = await verifyNewApiLogin({
    upstreamBase: 'http://localhost:2233',
    cookie: 'session=abc; new-api-user=1',
    requestNewApiUser: '23',
    newApiUser: '1',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { id: 23, username: 'bob', role: 1 },
        }),
      }
    },
  })

  assert.equal(result.ok, true)
  assert.equal(calls[0].options.headers['New-Api-User'], '23')
})

test('verifyNewApiLogin rejects invalid browser New-Api-User header', async () => {
  let called = false
  const result = await verifyNewApiLogin({
    upstreamBase: 'http://localhost:2233',
    cookie: 'session=abc',
    requestNewApiUser: '-1',
    newApiUser: '1',
    fetchImpl: async () => {
      called = true
      throw new Error('should not be called')
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.match(result.message, /New-Api-User/)
  assert.equal(called, false)
})

test('verifyNewApiLogin rejects missing cookie before calling upstream', async () => {
  let called = false
  const result = await verifyNewApiLogin({
    upstreamBase: 'http://localhost:2233',
    cookie: '',
    newApiUser: '1',
    fetchImpl: async () => {
      called = true
      throw new Error('should not be called')
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 401)
  assert.equal(called, false)
})
