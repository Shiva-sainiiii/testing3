import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";

/**
 * Two storage modes, same SQL:
 *  - DATABASE_URL empty (default): embedded Postgres (PGlite) stored in ./.data/pglite.
 *    No install, no Docker. Created and seeded automatically on first start.
 *  - DATABASE_URL set: a real Postgres server (Supabase, Docker, …) via `pg`.
 */
const url = process.env.DATABASE_URL?.trim();
export const DB_MODE: "pglite" | "postgres" = url ? "postgres" : "pglite";
const DATA_DIR = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");

type Rows = Record<string, unknown>[];
type Runner = (sql: string, params: unknown[]) => Promise<Rows>;

const g = globalThis as unknown as { __tbRunner?: Promise<Runner> };

async function makePg(): Promise<Runner> {
  const { Pool, types } = await import("pg");
  types.setTypeParser(20, (v: string) => parseInt(v, 10)); // bigint ids → number
  types.setTypeParser(1700, (v: string) => parseFloat(v)); // numeric → number
  const pool: Pool = new Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url!) ? false : { rejectUnauthorized: false },
    max: 5,
  });
  return async (sql, params) => (await pool.query(sql, params)).rows;
}

async function makePglite(): Promise<Runner> {
  const { PGlite } = await import("@electric-sql/pglite");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db: PGlite = new PGlite(DATA_DIR, {
    parsers: { 20: (v: string) => parseInt(v, 10), 1700: (v: string) => parseFloat(v) },
  });
  await db.waitReady;
  const exists = await db.query<{ ok: boolean }>(`select to_regnamespace('tb') is not null as ok`);
  if (!exists.rows[0]?.ok) {
    console.log(`[testbridge] creating local database in ${DATA_DIR} …`);
    const dir = path.join(process.cwd(), "db");
    await db.exec(fs.readFileSync(path.join(dir, "schema.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(dir, "seed.sql"), "utf8"));
    console.log("[testbridge] local database ready (demo data loaded)");
  }
  return async (sql, params) => (await db.query(sql, params)).rows as Rows;
}

function runner(): Promise<Runner> {
  if (!g.__tbRunner) {
    g.__tbRunner = (DB_MODE === "postgres" ? makePg() : makePglite()).catch((e) => {
      g.__tbRunner = undefined; // allow a retry on the next request
      throw e;
    });
  }
  return g.__tbRunner;
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await (await runner())(sql, params)) as T[];
}

export async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

export type RpcResult = {
  ok: boolean;
  reason?: string;
  message?: string;
  replayed?: boolean;
  [k: string]: unknown;
};

/** Calls a tb.* Postgres function that returns jsonb. All state changes go through these. */
export async function rpc(fn: string, args: unknown[]): Promise<RpcResult> {
  if (!/^[a-z_]+$/.test(fn)) throw new Error("bad rpc name");
  const ph = args.map((_, i) => `$${i + 1}`).join(", ");
  try {
    const row = await one<{ r: RpcResult }>(`select tb.${fn}(${ph}) as r`, args);
    return row?.r ?? { ok: false, message: "No result" };
  } catch (e) {
    console.error(`rpc ${fn} failed`, e);
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : "Database error" };
  }
}
