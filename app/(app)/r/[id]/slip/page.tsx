import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { referralView } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { fmtDT } from "@/lib/format";
import { PrintButton } from "./PrintButton";

// Printable referral slip: works for patients with no phone at all.
export default async function SlipPage({ params }: PageProps<"/r/[id]/slip">) {
  const u = await requireRole("doctor");
  const v = await referralView(u, Number((await params).id));
  if (!v) notFound();
  const r = v.referral as Record<string, string | number | boolean | null>;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const statusUrl = `${origin}/s/${r.patient_token}`;
  const qr = await QRCode.toDataURL(statusUrl, { margin: 1, width: 180 });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-3 flex justify-end"><PrintButton /></div>
      <div className="space-y-4 rounded-xl border-2 border-slate-800 bg-white p-6 text-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">TestBridge referral slip · रेफ़रल पर्ची</div>
            <div className="text-3xl font-black">{r.code}</div>
            <div className="text-sm">{r.patient_name} · {r.test_name} ({r.test_name_hi})</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code to status page" className="h-32 w-32" />
        </div>

        {r.lab_name ? (
          <div className="rounded-lg bg-slate-100 p-3">
            <div className="text-lg font-bold">{fmtDT(r.accepted_slot_at as string)}</div>
            <div className="font-semibold">{r.lab_name}</div>
            <div className="text-sm">{r.lab_address}</div>
            <div className="text-sm">{r.lab_address_hi}</div>
            <div className="text-sm">📞 {r.lab_phone} · {r.lab_is_free ? "निःशुल्क / Free" : `₹${r.lab_price}`}</div>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 p-3 text-sm">लैब तय होने पर SMS आएगा। / You will get an SMS when a lab is booked.</div>
        )}

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div><div className="font-semibold">तैयारी</div><p>{r.prep_hi}</p></div>
          <div><div className="font-semibold">Preparation</div><p>{r.prep_en}</p></div>
          <div><div className="font-semibold">साथ लाएँ</div><p>{r.bring_hi}</p></div>
          <div><div className="font-semibold">Bring</div><p>{r.bring_en}</p></div>
        </div>

        <div className="border-t pt-3 text-xs text-slate-600">
          जाँच के बाद रिपोर्ट सीधे {r.doctor_name} ({r.from_short}) को भेजी जाएगी। इलाज यहीं जारी रहेगा।<br />
          The report goes straight back to {r.doctor_name} ({r.from_short}). Your treatment continues here.
          Original slot kept as backup: {fmtDT(r.original_slot_at as string)}.<br />
          Status: {statusUrl}
        </div>
      </div>
    </div>
  );
}
