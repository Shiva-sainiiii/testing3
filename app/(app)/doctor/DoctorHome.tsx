"use client";

import Link from "next/link";
import { useLive } from "@/lib/useLive";
import { fmtDT } from "@/lib/format";
import { Alert, Card, PriorityChip, Stat, StatusChip, btnPrimary } from "@/components/ui";
import { LiveBadge } from "@/components/LiveBadge";

type Row = {
  id: number; code: string; status: string; priority: string; on_temp_medication: boolean; test_name: string;
  patient_name: string; phone: string; original_slot_at: string; accepted_slot_at: string | null; lab_name: string | null;
  created_at: string; updated_at: string; days_saved: number | null; labs_notified: number;
};
type Data = { referrals: Row[]; stats: { active: number; done: number; days_saved: number; slots_released: number } };

export function DoctorHome({ hospital }: { hospital: string }) {
  const { data, stale, error, now } = useLive<Data>("/api/live?view=doctor");
  const recent = (at: string) => now != null && new Date(now).getTime() - new Date(at).getTime() < 10_000;
  const ready = data?.referrals.filter((r) => r.status === "report_sent") ?? [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My referrals</h1>
          <p className="text-sm text-slate-500">{hospital} · test referrals to partner labs</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveBadge stale={stale} />
          <Link href="/doctor/new" className={btnPrimary}>+ New referral</Link>
        </div>
      </div>
      {error && <Alert kind="error">{error}</Alert>}

      {ready.map((r) => (
        <Link key={r.id} href={`/r/${r.id}`} className="block">
          <Alert kind="success">
            <b>Report ready: {r.code}</b> · {r.patient_name} · {r.test_name} done at {r.lab_name}
            {r.days_saved != null && <> · <b>{r.days_saved} days earlier</b> than the original slot</>} → Open
          </Alert>
        </Link>
      ))}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active referrals" value={data?.stats.active ?? "…"} />
        <Stat label="Tests done elsewhere" value={data?.stats.done ?? "…"} />
        <Stat label="Patient-days saved" value={data?.stats.days_saved ?? "…"} hint="original date − actual test date" />
        <Stat label="Queue slots released" value={data?.stats.slots_released ?? "…"} hint="given to next patient in your queue" />
      </div>

      <Card className="overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Referral</th><th className="px-3 py-2">Patient</th><th className="px-3 py-2">Test</th>
              <th className="px-3 py-2">Status</th><th className="px-3 py-2">Lab / slot</th><th className="px-3 py-2">Original slot</th>
              <th className="px-3 py-2">Saved</th>
            </tr>
          </thead>
          <tbody>
            {data?.referrals.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No referrals yet. Create one to start.</td></tr>
            )}
            {data?.referrals.map((r) => (
              <tr key={`${r.id}-${r.status}`} className={`${recent(r.updated_at) ? "flash-in" : ""} border-t border-slate-100 hover:bg-slate-50`}>
                <td className="px-3 py-2">
                  <Link href={`/r/${r.id}`} className="font-semibold text-teal-800 hover:underline">{r.code}</Link>
                  <div className="mt-0.5 flex gap-1"><PriorityChip p={r.priority} /></div>
                </td>
                <td className="px-3 py-2">{r.patient_name}{r.on_temp_medication && <div className="text-xs text-fuchsia-700">temp. medication</div>}</td>
                <td className="px-3 py-2">{r.test_name}</td>
                <td className="px-3 py-2"><StatusChip status={r.status} />
                  {r.status === "open" && <div className="mt-0.5 text-xs text-slate-500">sent to {r.labs_notified} labs</div>}
                </td>
                <td className="px-3 py-2">{r.lab_name ? <>{r.lab_name}<div className="text-xs text-slate-500">{fmtDT(r.accepted_slot_at)}</div></> : "—"}</td>
                <td className="px-3 py-2 text-slate-600">{fmtDT(r.original_slot_at)}</td>
                <td className="px-3 py-2 font-semibold text-emerald-700">{r.days_saved != null ? `${r.days_saved} d` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
