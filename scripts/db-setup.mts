// Creates the Postgres schema, and optionally imports local JSON data.
//
//   npm run db:setup    create tables (safe to re-run)
//   npm run db:import   also copy data/*.json into the database and, if
//                       BLOB_READ_WRITE_TOKEN is set, data/uploads/* into Blob
//
// Reads DATABASE_URL (or POSTGRES_URL) from the environment or .env.local.
// Runs on Node 22.18+ (built-in TypeScript type stripping).

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { SCHEMA } from "../lib/store-postgres.ts";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("Set DATABASE_URL (or POSTGRES_URL) first, e.g. in .env.local.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const dataDir = path.join(process.cwd(), "data");

async function readJson(file: string) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, file), "utf8"));
  } catch {
    return undefined;
  }
}

try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(718201)`;
    await tx.unsafe(SCHEMA);
  });
  console.log("Schema is ready.");

  if (process.argv.includes("--import")) {
    // Accounts first, so their documents and bookings have somewhere to go.
    const owners: Record<string, unknown>[] = (await readJson("owners.json")) ?? [];
    let ownersAdded = 0;
    for (const o of owners) {
      const result = await sql`
        INSERT INTO owners (id, handle, email, created_at, data)
        VALUES (${o.id as string}, ${o.handle as string}, ${o.email as string}, ${o.createdAt as string}, ${sql.json(o as postgres.JSONValue)})
        ON CONFLICT DO NOTHING`;
      if (result.count) ownersAdded++;
    }
    console.log(`Accounts: ${ownersAdded} imported, ${owners.length - ownersAdded} already there (same id, handle or email).`);

    const bookings: Record<string, unknown>[] = (await readJson("bookings.json")) ?? [];
    let added = 0;
    let skipped = 0;
    for (const b of bookings) {
      try {
        // Bookings without an owner are from before accounts existed; the first account to sign up adopts them.
        const result = await sql`
          INSERT INTO bookings (id, owner_id, access_token, activity_slug, resource_id, date, start_hour, hours, status, created_at, data)
          VALUES (${b.id as string}, ${(b.ownerId as string) ?? null}, ${(b.accessToken as string) ?? null}, ${b.activitySlug as string}, ${b.resourceId as string},
                  ${b.date as string}, ${b.startHour as number}, ${b.hours as number}, ${b.status as string},
                  ${b.createdAt as string}, ${sql.json(b as postgres.JSONValue)})
          ON CONFLICT (id) DO NOTHING`;
        if (result.count) added++;
        else skipped++;
      } catch (err) {
        // e.g. an old booking that overlaps one already in the database
        console.warn(`Skipped booking ${b.id}: ${(err as Error).message}`);
        skipped++;
      }
    }
    console.log(`Bookings: ${added} imported, ${skipped} skipped.`);

    // Each account's documents (data/owners/<id>/<kind>.json -> key "owners/<id>/<kind>"), plus
    // any top-level data/<kind>.json from before accounts existed (key "<kind>", adopted later).
    const docFiles = [
      ...(["activities", "events", "settings"] as const).map((kind) => ({ file: `${kind}.json`, key: kind })),
      ...owners.flatMap((o) =>
        (["activities", "events", "settings"] as const).map((kind) => ({
          file: path.join("owners", o.id as string, `${kind}.json`),
          key: `owners/${o.id}/${kind}`,
        })),
      ),
    ];
    for (const { file, key } of docFiles) {
      const value = await readJson(file);
      if (value === undefined) continue;
      const result = await sql`
        INSERT INTO documents (key, value) VALUES (${key}, ${sql.json(value)}) ON CONFLICT (key) DO NOTHING`;
      console.log(`${key}: ${result.count ? "imported" : "already in the database, left unchanged"}.`);
    }

    const uploadsDir = path.join(dataDir, "uploads");
    const files = await readdir(uploadsDir).catch(() => [] as string[]);
    if (files.length && process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      const types: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
      const access = process.env.BLOB_ACCESS === "private" ? "private" : "public";
      for (const name of files) {
        const ext = name.split(".").pop()!;
        if (!types[ext]) continue;
        await put(`uploads/${name}`, await readFile(path.join(uploadsDir, name)), {
          access,
          contentType: types[ext],
          addRandomSuffix: false,
          allowOverwrite: true,
        });
      }
      console.log(`Uploads: ${files.length} copied to Vercel Blob.`);
    } else if (files.length) {
      console.log(`Uploads: ${files.length} local files not copied (set BLOB_READ_WRITE_TOKEN to copy them to Vercel Blob).`);
    }
  }
} finally {
  await sql.end();
}
