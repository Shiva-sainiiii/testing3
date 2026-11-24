import { NextResponse, type NextRequest } from "next/server";
import { one } from "@/lib/db";
import { getUser } from "@/lib/session";
import {
  auditView, clockOffsetHours, dhoView, doctorView, labView, phoneView, queueView, referralView,
} from "@/lib/queries";

// Polling endpoint for every live screen (Supabase Realtime, if configured, just triggers a refetch).
let lastTimers = 0;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view");

  // Run expiry / radius widening / reminders at most every 30s (no cron needed).
  if (Date.now() - lastTimers > 30_000) {
    lastTimers = Date.now();
    await one(`select tb.process_timers()`).catch((e) => console.error("timers", e));
  }

  const u = await getUser();
  const meta = await one<{ now: string }>(`select tb.app_now() as now`);
  const base = { now: meta?.now, clockOffsetH: await clockOffsetHours() };
  const forbidden = NextResponse.json({ error: "forbidden" }, { status: 403 });

  let data: unknown;
  switch (view) {
    case "doctor":
      if (u?.role !== "doctor") return forbidden;
      data = await doctorView(u);
      break;
    case "queue":
      if (u?.role !== "doctor") return forbidden;
      data = await queueView(u);
      break;
    case "lab":
      if (u?.role !== "lab") return forbidden;
      data = await labView(u);
      break;
    case "referral":
      if (!u) return forbidden;
      data = await referralView(u, Number(sp.get("id")));
      if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
      break;
    case "dho":
      if (u?.role !== "dho") return forbidden;
      data = await dhoView();
      break;
    case "phone": // simulated patient phones (demo only)
      data = await phoneView(sp.get("patient"));
      break;
    case "audit":
      data = await auditView(sp.get("q"));
      break;
    default:
      return NextResponse.json({ error: "unknown view" }, { status: 400 });
  }
  return NextResponse.json({ ...base, data }, { headers: { "cache-control": "no-store" } });
}
