import postgres from "postgres";
import type { Booking, DocKey, LoginFailure, StoreBackend } from "./store-types";

// Postgres storage for production (e.g. Neon via the Vercel Marketplace).
// Enabled when DATABASE_URL (or POSTGRES_URL) is set.
//
// Each booking is a row: a few columns for querying and for the overlap
// constraint, plus the full object in `data`. The exclusion constraint makes
// double-booking impossible even with concurrent requests on many instances.

export const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS bookings (
  id            text PRIMARY KEY,
  access_token  text UNIQUE,
  activity_slug text NOT NULL,
  resource_id   text NOT NULL,
  date          text NOT NULL,
  start_hour    int  NOT NULL,
  hours         int  NOT NULL CHECK (hours > 0),
  status        text NOT NULL,
  created_at    text NOT NULL,
  data          jsonb NOT NULL,
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    activity_slug WITH =,
    resource_id   WITH =,
    date          WITH =,
    int4range(start_hour, start_hour + hours) WITH &&
  ) WHERE (status <> 'cancelled')
);
CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings (date, start_hour);

CREATE TABLE IF NOT EXISTS documents (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS login_failures (
  ip       text PRIMARY KEY,
  count    int    NOT NULL,
  until_ms bigint NOT NULL
);
`;

export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

let client: postgres.Sql | null = null;
function sql() {
  client ??= postgres(databaseUrl(), {
    // Serverless functions each hold their own pool; keep it small and use
    // the provider's pooled connection string (Neon: the "-pooler" host).
    max: Number(process.env.PG_POOL_MAX || 3),
    idle_timeout: 20,
    prepare: false,
    onnotice: () => {},
  });
  return client;
}

/** Creates tables on first use. The advisory lock stops parallel cold starts racing. */
let schemaReady: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  schemaReady ??= sql()
    .begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(718201)`;
      await tx.unsafe(SCHEMA);
    })
    .then(() => {})
    .catch((err) => {
      schemaReady = null;
      throw err;
    });
  return schemaReady;
}

async function db() {
  await ensureSchema();
  return sql();
}

type Row = { data: Booking };

function columns(b: Booking) {
  return {
    id: b.id,
    access_token: b.accessToken ?? null,
    activity_slug: b.activitySlug,
    resource_id: b.resourceId,
    date: b.date,
    start_hour: b.startHour,
    hours: b.hours,
    status: b.status,
    created_at: b.createdAt,
    data: b as unknown as postgres.JSONValue,
  };
}

const EXCLUSION_VIOLATION = "23P01";

export const postgresStore: StoreBackend = {
  async listBookings({ activitySlug, date }) {
    const q = await db();
    const rows = await q<Row[]>`
      SELECT data FROM bookings
      WHERE (${activitySlug ?? null}::text IS NULL OR activity_slug = ${activitySlug ?? null})
        AND (${date ?? null}::text IS NULL OR date = ${date ?? null})
      ORDER BY date, start_hour`;
    return rows.map((r) => r.data);
  },

  async findBooking(by, value) {
    const q = await db();
    const rows =
      by === "id"
        ? await q<Row[]>`SELECT data FROM bookings WHERE id = ${value}`
        : await q<Row[]>`SELECT data FROM bookings WHERE access_token = ${value}`;
    return rows[0]?.data;
  },

  async insertBooking(booking) {
    const q = await db();
    const c = columns(booking);
    try {
      await q`
        INSERT INTO bookings (id, access_token, activity_slug, resource_id, date, start_hour, hours, status, created_at, data)
        VALUES (${c.id}, ${c.access_token}, ${c.activity_slug}, ${c.resource_id}, ${c.date}, ${c.start_hour},
                ${c.hours}, ${c.status}, ${c.created_at}, ${q.json(c.data)})`;
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === EXCLUSION_VIOLATION) return false;
      throw err;
    }
  },

  async updateBooking(id, change) {
    const q = await db();
    return q.begin(async (tx) => {
      const [row] = await tx<Row[]>`SELECT data FROM bookings WHERE id = ${id} FOR UPDATE`;
      if (!row) return null;
      const booking = row.data;
      change(booking);
      const c = columns(booking);
      await tx`
        UPDATE bookings SET
          access_token = ${c.access_token}, activity_slug = ${c.activity_slug}, resource_id = ${c.resource_id},
          date = ${c.date}, start_hour = ${c.start_hour}, hours = ${c.hours}, status = ${c.status},
          data = ${tx.json(c.data)}
        WHERE id = ${id}`;
      return booking;
    }) as Promise<Booking | null>;
  },

  async readDoc<T>(key: DocKey, fallback: T): Promise<T> {
    const q = await db();
    const [row] = await q<{ value: T }[]>`SELECT value FROM documents WHERE key = ${key}`;
    return row ? row.value : fallback;
  },

  async updateDoc<T, R>(key: DocKey, fallback: T, change: (doc: T) => { doc: T; result: R }): Promise<R> {
    const q = await db();
    return q.begin(async (tx) => {
      await tx`INSERT INTO documents (key, value) VALUES (${key}, ${tx.json(fallback as postgres.JSONValue)}) ON CONFLICT (key) DO NOTHING`;
      const [row] = await tx<{ value: T }[]>`SELECT value FROM documents WHERE key = ${key} FOR UPDATE`;
      const { doc, result } = change(row.value);
      await tx`UPDATE documents SET value = ${tx.json(doc as postgres.JSONValue)} WHERE key = ${key}`;
      return result;
    }) as Promise<R>;
  },

  async getLoginFailure(ip) {
    const q = await db();
    const [row] = await q<{ count: number; until_ms: string }[]>`
      SELECT count, until_ms FROM login_failures WHERE ip = ${ip} AND until_ms > ${Date.now()}`;
    return row ? { count: row.count, untilMs: Number(row.until_ms) } : null;
  },

  async recordLoginFailure(ip, lockMs): Promise<LoginFailure> {
    const q = await db();
    const now = Date.now();
    await q`DELETE FROM login_failures WHERE until_ms <= ${now}`;
    const [row] = await q<{ count: number; until_ms: string }[]>`
      INSERT INTO login_failures (ip, count, until_ms) VALUES (${ip}, 1, ${now + lockMs})
      ON CONFLICT (ip) DO UPDATE SET count = login_failures.count + 1, until_ms = EXCLUDED.until_ms
      RETURNING count, until_ms`;
    return { count: row.count, untilMs: Number(row.until_ms) };
  },

  async clearLoginFailures(ip) {
    const q = await db();
    await q`DELETE FROM login_failures WHERE ip = ${ip}`;
  },
};
