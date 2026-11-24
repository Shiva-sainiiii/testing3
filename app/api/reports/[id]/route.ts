import { NextResponse } from "next/server";
import { one, rpc } from "@/lib/db";
import { getUser } from "@/lib/session";

const MAX_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request limit

// GET: doctor (sender), lab (performer) or DHO opens the report. Every view is audited.
export async function GET(_req: Request, ctx: RouteContext<"/api/reports/[id]">) {
  const id = Number((await ctx.params).id);
  const u = await getUser();
  if (!u) return NextResponse.json({ error: "login required" }, { status: 401 });
  const rep = await one<{ content: Buffer; mime: string; filename: string; from_hospital_id: string; accepted_hospital_id: string }>(
    `select rp.content, rp.mime, rp.filename, r.from_hospital_id, r.accepted_hospital_id
       from tb.reports rp join tb.referrals r on r.id = rp.referral_id where rp.referral_id = $1`,
    [id],
  );
  if (!rep) return NextResponse.json({ error: "not found" }, { status: 404 });
  const allowed =
    u.role === "dho" ||
    (u.role === "doctor" && u.hospital_id === rep.from_hospital_id) ||
    (u.role === "lab" && u.hospital_id === rep.accepted_hospital_id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await one(`select tb.log_view($1, $2, 'report')`, [u.id, id]);
  return new NextResponse(new Uint8Array(rep.content), {
    headers: {
      "content-type": rep.mime,
      "content-disposition": `inline; filename="${rep.filename.replace(/[^\w.\-]/g, "_")}"`,
      "cache-control": "no-store",
    },
  });
}

// POST: lab uploads the report PDF (multipart form). DB function enforces one report per referral.
export async function POST(req: Request, ctx: RouteContext<"/api/reports/[id]">) {
  const id = Number((await ctx.params).id);
  const u = await getUser();
  if (u?.role !== "lab") return NextResponse.json({ ok: false, message: "Lab login required" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  const idem = String(form.get("idem") ?? "");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, message: "Choose a PDF file" });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, message: "PDF must be under 4 MB" });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 4).toString() !== "%PDF") return NextResponse.json({ ok: false, message: "File is not a PDF" });
  const result = await rpc("attach_report", [
    u.id, idem, id, file.name || "report.pdf", "application/pdf", buf,
    String(form.get("reported_by") ?? ""), String(form.get("reg_no") ?? ""),
  ]);
  return NextResponse.json(result);
}
