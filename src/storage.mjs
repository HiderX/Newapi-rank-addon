import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

export function createSqliteStore(options = {}) {
  return new SqliteStore(options)
}

class SqliteStore {
  constructor(options = {}) {
    this.sqlitePath = options.sqlitePath || path.resolve('data/rank-addon.sqlite')
    mkdirSync(path.dirname(this.sqlitePath), { recursive: true })
    this.db = new DatabaseSync(this.sqlitePath)
    this.initialize()
  }

  initialize() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS response_cache (
        cache_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        fresh_until INTEGER NOT NULL,
        stale_until INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inheritance_cache_meta (
        season_start INTEGER PRIMARY KEY,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inheritance_cache (
        season_start INTEGER NOT NULL,
        user_key TEXT NOT NULL,
        inherited_stars INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (season_start, user_key)
      );

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  }

  getResponseCache(cacheKey, nowSeconds) {
    const row = this.db
      .prepare(
        'SELECT payload_json, fresh_until, stale_until FROM response_cache WHERE cache_key = ?'
      )
      .get(cacheKey)
    if (!row) return null

    const now = Number(nowSeconds)
    if (now > Number(row.stale_until)) return null

    return {
      state: now <= Number(row.fresh_until) ? 'fresh' : 'stale',
      payload: JSON.parse(row.payload_json),
    }
  }

  setResponseCache(cacheKey, payload, options = {}) {
    const createdAt = Number(options.createdAt)
    const freshSeconds = Math.max(0, Number(options.freshSeconds) || 0)
    const staleSeconds = Math.max(0, Number(options.staleSeconds) || 0)
    this.db
      .prepare(
        `
          INSERT INTO response_cache (cache_key, payload_json, created_at, fresh_until, stale_until)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(cache_key) DO UPDATE SET
            payload_json = excluded.payload_json,
            created_at = excluded.created_at,
            fresh_until = excluded.fresh_until,
            stale_until = excluded.stale_until
        `
      )
      .run(
        cacheKey,
        JSON.stringify(payload),
        createdAt,
        createdAt + freshSeconds,
        createdAt + freshSeconds + staleSeconds
      )
  }

  getInheritanceStars(seasonStart) {
    const meta = this.db
      .prepare('SELECT updated_at FROM inheritance_cache_meta WHERE season_start = ?')
      .get(seasonStart)
    if (!meta) return { exists: false, starsByUserId: new Map() }

    const rows = this.db
      .prepare(
        'SELECT user_key, inherited_stars FROM inheritance_cache WHERE season_start = ?'
      )
      .all(seasonStart)
    return {
      exists: true,
      updatedAt: Number(meta.updated_at),
      starsByUserId: new Map(
        rows.map((row) => [String(row.user_key), Number(row.inherited_stars) || 0])
      ),
    }
  }

  setInheritanceStars(seasonStart, starsByUserId, updatedAt) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM inheritance_cache WHERE season_start = ?').run(seasonStart)
      const insert = this.db.prepare(
        `
          INSERT INTO inheritance_cache (season_start, user_key, inherited_stars, updated_at)
          VALUES (?, ?, ?, ?)
        `
      )
      for (const [userKey, stars] of starsByUserId instanceof Map ? starsByUserId : new Map()) {
        insert.run(seasonStart, String(userKey), Math.max(0, Math.floor(Number(stars) || 0)), updatedAt)
      }
      this.db
        .prepare(
          `
            INSERT INTO inheritance_cache_meta (season_start, updated_at)
            VALUES (?, ?)
            ON CONFLICT(season_start) DO UPDATE SET updated_at = excluded.updated_at
          `
        )
        .run(seasonStart, updatedAt)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getMeta(key) {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
    return row ? String(row.value) : ''
  }

  setMeta(key, value) {
    this.db
      .prepare(
        `
          INSERT INTO meta (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `
      )
      .run(String(key), String(value))
  }

  async snapshotTo(snapshotPath) {
    await mkdir(path.dirname(snapshotPath), { recursive: true })
    await rm(snapshotPath, { force: true })
    this.db.exec(`VACUUM INTO '${escapeSqliteString(snapshotPath)}'`)
  }

  close() {
    this.db.close()
  }
}

function escapeSqliteString(value) {
  return String(value).replaceAll("'", "''")
}
