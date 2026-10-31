import postgres from "postgres";
import type { Booking, DocKind, PlatformDocKind, InsertOwnerResult, LoginFailure, Owner, StoreBackend } from "./store-types";

// Postgres storage for production (e.g. Neon via the Vercel Marketplace).
// Enabled when DATABASE_URL (or POSTGRES_URL) is set.
//
// Each booking is a row: a few columns for querying and for the overlap
// constraint, plus the full object in `data`. The exclusion constraint makes
// double-booking impossible even with concurrent requests on many instances.
// Owners are stored the same way. An owner's documents use the key
// "owners/<id>/<kind>"; platform-wide ones use "platform/<kind>"; a bare
// "<kind>" key is data from before accounts existed, which the first account adopts.
//
// The schema is safe to re-run, and upgrades a database created before
// accounts existed (adds owner_id and scopes the overlap rule to each owner).

export const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS owners (
  id         text PRIMARY KEY,
  handle     text NOT NULL UNIQUE,
  email      text NOT NULL UNIQUE,
  created_at text NOT NULL,
  data       jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id            text PRIMARY KEY,
  owner_id      text,
  access_token  text UNIQUE,
  activity_slug text NOT NULL,
  resource_id   text NOT NULL,
  date          text NOT NULL,
  start_hour    int  NOT NULL,
  hours         int  NOT NULL CHECK (hours > 0),
  status        text NOT NULL,
  created_at    text NOT NULL,
  data          jsonb NOT NULL
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS owner_id text;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_owner_no_overlap') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_owner_no_overlap EXCLUDE USING gist (
      owner_id      WITH =,
      activity_slug WITH =,
      resource_id   WITH =,
      date          WITH =,
      int4range(start_hour, start_hour + hours) WITH &&
    ) WHERE (status <> 'cancelled');
  END IF;
END $$;
DROP INDEX IF EXISTS bookings_date_idx;
CREATE INDEX IF NOT EXISTS bookings_owner_date_idx ON bookings (owner_id, date, start_hour);

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

const docKey = (ownerId: string, kind: DocKind) => `owners/${ownerId}/${kind}`;
const platformDocKey = (kind: PlatformDocKind) => `platform/${kind}`;

async function readKey<T>(key: string, fallback: T): Promise<T> {
  const q = await db();
  const [row] = await q<{ value: T }[]>`SELECT value FROM documents WHERE key = ${key}`;
  return row ? row.value : fallback;
}

async function updateKey<T, R>(key: string, fallback: T, change: (doc: T) => { doc: T; result: R }): Promise<R> {
  const q = await db();
  return q.begin(async (tx) => {
    await tx`INSERT INTO documents (key, value) VALUES (${key}, ${tx.json(fallback as postgres.JSONValue)}) ON CONFLICT (key) DO NOTHING`;
    const [row] = await tx<{ value: T }[]>`SELECT value FROM documents WHERE key = ${key} FOR UPDATE`;
    const { doc, result } = change(row.value);
    await tx`UPDATE documents SET value = ${tx.json(doc as postgres.JSONValue)} WHERE key = ${key}`;
    return result;
  }) as Promise<R>;
}

type Row = { data: Booking };
type OwnerRow = { data: Owner };

function columns(b: Booking) {
  return {
    id: b.id,
    owner_id: b.ownerId,
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
  async listOwners() {
    const q = await db();
    const rows = await q<OwnerRow[]>`SELECT data FROM owners ORDER BY created_at`;
    return rows.map((r) => r.data);
  },

  async findOwner(by, value) {
    const q = await db();
    const rows =
      by === "id"
        ? await q<OwnerRow[]>`SELECT data FROM owners WHERE id = ${value}`
        : by === "handle"
          ? await q<OwnerRow[]>`SELECT data FROM owners WHERE handle = ${value}`
          : await q<OwnerRow[]>`SELECT data FROM owners WHERE email = ${value}`;
    return rows[0]?.data;
  },

  async insertOwner(owner) {
    const q = await db();
    return q.begin(async (tx) => {
      // Serializes sign-ups so only one account can be "the first".
      await tx`SELECT pg_advisory_xact_lock(718202)`;
      const [taken] = await tx<{ handle: string }[]>`
        SELECT handle FROM owners WHERE handle = ${owner.handle} OR email = ${owner.email} LIMIT 1`;
      if (taken) return taken.handle === owner.handle ? "handle_taken" : "email_taken";
      const [{ count }] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM owners`;
      await tx`
        INSERT INTO owners (id, handle, email, created_at, data)
        VALUES (${owner.id}, ${owner.handle}, ${owner.email}, ${owner.createdAt}, ${tx.json(owner as unknown as postgres.JSONValue)})`;
      if (count === 0) {
        await tx`
          UPDATE bookings SET owner_id = ${owner.id}, data = jsonb_set(data, '{ownerId}', to_jsonb(${owner.id}::text))
          WHERE owner_id IS NULL`;
        await tx`
          UPDATE documents SET key = 'owners/' || ${owner.id}::text || '/' || key
          WHERE key IN ('activities', 'events', 'settings')`;
      }
      return "ok";
    }) as Promise<InsertOwnerResult>;
  },

  async updateOwner(id, change) {
    const q = await db();
    return q.begin(async (tx) => {
      const [row] = await tx<OwnerRow[]>`SELECT data FROM owners WHERE id = ${id} FOR UPDATE`;
      if (!row) return null;
      const owner = row.data;
      change(owner);
      await tx`
        UPDATE owners SET email = ${owner.email}, data = ${tx.json(owner as unknown as postgres.JSONValue)}
        WHERE id = ${id}`;
      return owner;
    }) as Promise<Owner | null>;
  },

  async deleteOwner(id) {
    const q = await db();
    await q.begin(async (tx) => {
      await tx`DELETE FROM bookings WHERE owner_id = ${id}`;
      await tx`DELETE FROM documents WHERE key LIKE ${`owners/${id}/%`}`;
      await tx`DELETE FROM owners WHERE id = ${id}`;
    });
  },

  async listBookings({ ownerId, activitySlug, date, status }) {
    const q = await db();
    const rows = await q<Row[]>`
      SELECT data FROM bookings
      WHERE owner_id = ${ownerId}
        AND (${activitySlug ?? null}::text IS NULL OR activity_slug = ${activitySlug ?? null})
        AND (${date ?? null}::text IS NULL OR date = ${date ?? null})
        AND (${status ?? null}::text IS NULL OR status = ${status ?? null})
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
        INSERT INTO bookings (id, owner_id, access_token, activity_slug, resource_id, date, start_hour, hours, status, created_at, data)
        VALUES (${c.id}, ${c.owner_id}, ${c.access_token}, ${c.activity_slug}, ${c.resource_id}, ${c.date}, ${c.start_hour},
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

  readDoc(ownerId, kind, fallback) {
    return readKey(docKey(ownerId, kind), fallback);
  },

  updateDoc(ownerId, kind, fallback, change) {
    return updateKey(docKey(ownerId, kind), fallback, change);
  },

  readPlatformDoc(kind, fallback) {
    return readKey(platformDocKey(kind), fallback);
  },

  updatePlatformDoc(kind, fallback, change) {
    return updateKey(platformDocKey(kind), fallback, change);
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

