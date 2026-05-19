import pg from 'pg'

const { Pool } = pg

let pool = null

export function getDb () {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'recuerdame',
      user: process.env.POSTGRES_USER || 'recuerdame',
      password: process.env.POSTGRES_PASSWORD || 'recuerdame123',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    })

    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle client', err)
    })
  }
  return pool
}

export async function initDb () {
  const db = getDb()
  await db.query('SELECT 1')
  console.log('[DB] Connected to PostgreSQL')
}

export async function closeDb () {
  if (pool) {
    await pool.end()
    pool = null
  }
}
