// npm run db:reset
//  - Local mode (DATABASE_URL empty): deletes ./.data/pglite. The app recreates + seeds it on next start.
//    STOP the app first (Ctrl+C). While the app runs, use "Demo ⚙ → Reset demo data" instead.
//  - Postgres mode (DATABASE_URL set): applies db/schema.sql + db/seed.sql (+ realtime on Supabase).
import fs from "node:fs";
import path from "node:path";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const url = process.env.DATABASE_URL?.trim();

if (!url) {
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`Local database removed (${dir}). Start the app (npm run dev / npm start) to recreate it with demo data.`);
  process.exit(0);
}

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await client.connect();
const files = ["db/schema.sql", "db/seed.sql"];
const isSupabase = (await client.query("select exists(select 1 from pg_publication where pubname='supabase_realtime') as s")).rows[0].s;
if (isSupabase) files.push("db/supabase-realtime.sql");
for (const f of files) {
  process.stdout.write(`Applying ${f} ... `);
  await client.query(fs.readFileSync(f, "utf8"));
  console.log("ok");
}
await client.end();
console.log(isSupabase ? "Done (Supabase realtime enabled)." : "Done.");
