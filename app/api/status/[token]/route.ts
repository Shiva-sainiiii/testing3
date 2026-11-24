import { NextResponse } from "next/server";
import { statusView } from "@/lib/queries";

// Public, tokenised status for the patient (no login). Shows minimal data only.
export async function GET(_req: Request, ctx: RouteContext<"/api/status/[token]">) {
  const { token } = await ctx.params;
  const data = await statusView(token);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ data }, { headers: { "cache-control": "no-store" } });
}
