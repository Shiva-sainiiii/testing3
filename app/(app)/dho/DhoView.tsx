"use client";

import Link from "next/link";
import { useLive } from "@/lib/useLive";
import { fmtDT } from "@/lib/format";
import { Card, PriorityChip, Stat, StatusChip } from "@/components/ui";
import { LiveBadge } from "@/components/LiveBadge";

type Data = {
  kpi: {
    sent: number; accepted: number; tests_done: number; median_days_saved: number; total_days_saved: number;
    slots_released: number; expired: number; temp_med_waiting_14d: number;
  };
  hospitals: { id: string; short_name: string; kind: string; sent: number; received: number; accepted: number; declined: number; tests_done: number }[];
  doctors: { name: string; short_name: string; referrals: number; p1: number; temp_med: number }[];
  waiting: { code: string; test: string; from_name: string; priority: string; status: string; created_at: string; expected_at: string }[];
};

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export function DhoView() {
  const { data, stale } = useLive<Data>("/api/live?view=dho", 4000);
  const k = data?.kpi;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">District dashboard</h1>
          <p className="text-sm text-slate-500">Demo District · all numbers are computed live from referral records (synthetic data)</p>
        </div>
        <LiveBadge stale={stale} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Referrals sent" value={k?.sent ?? "…"} />
        <Stat label="Accepted by a lab" value={k ? `${k.accepted} (${pct(k.accepted, k.sent)})` : "…"} />
        <Stat label="Tests done earlier" value={k?.tests_done ?? "…"} />
        <Stat label="Median days saved" value={k ? k.median_days_saved : "…"} hint={k ? `${k.total_days_saved} patient-days in total` : ""} />
        <Stat label="Queue slots released" value={k?.slots_released ?? "…"} hint="given to the next patient at the sending hospital" />
        <Stat label="Expired (no lab)" value={k?.expired ?? "…"} hint="patient kept original date" />
        <Stat label="On temp. medication, >14 days to test" value={k?.temp_med_waiting_14d ?? "…"} hint="needs attention" />
      </div>

      <Card className="overflow-x-auto !p-0">
        <div className="border-b border-slate-100 px-4 py-2 font-semibold">Facilities</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Facility</th><th className="px-3 py-2">Referrals sent</th><th className="px-3 py-2">Requests received</th>
              <th className="px-3 py-2">Accepted</th><th className="px-3 py-2">Declined</th><th className="px-3 py-2">Tests done for others</th>
            </tr>
          </thead>
          <tbody>
            {data?.hospitals.map((h) => (
              <tr key={h.id} className="border-t border-slate-100">
                <td className="px-3 py-1.5 font-medium">{h.short_name} <span className="text-xs text-slate-500">{h.kind === "ppp" ? "PPP" : "Govt"}</span></td>
                <td className="px-3 py-1.5">{h.sent}</td>
                <td className="px-3 py-1.5">{h.received}</td>
                <td className="px-3 py-1.5">{h.accepted} <span className="text-xs text-slate-500">{pct(h.accepted, h.received)}</span></td>
                <td className="px-3 py-1.5">{h.declined}</td>
                <td className="px-3 py-1.5">{h.tests_done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="!p-0">
          <div className="border-b border-slate-100 px-4 py-2 font-semibold">Priority use by doctor <span className="text-xs font-normal text-slate-500">(spot queue-jumping)</span></div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2">Doctor</th><th className="px-3 py-2">Referrals</th><th className="px-3 py-2">P1 share</th><th className="px-3 py-2">Temp. med flag</th></tr>
            </thead>
            <tbody>
              {data?.doctors.map((d) => (
                <tr key={d.name} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{d.name}<div className="text-xs text-slate-500">{d.short_name}</div></td>
                  <td className="px-3 py-1.5">{d.referrals}</td>
                  <td className="px-3 py-1.5">{pct(d.p1, d.referrals)}</td>
                  <td className="px-3 py-1.5">{pct(d.temp_med, d.referrals)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="!p-0">
          <div className="border-b border-slate-100 px-4 py-2 font-semibold">On temporary medication, test more than 14 days away</div>
          <ul className="divide-y divide-slate-100 text-sm">
            {data?.waiting.length === 0 && <li className="px-4 py-6 text-center text-slate-500">None right now.</li>}
            {data?.waiting.map((w) => (
              <li key={w.code} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span><b>{w.code}</b> {w.test} · {w.from_name} · <PriorityChip p={w.priority} /></span>
                <span className="flex items-center gap-2 text-xs text-slate-600">expected {fmtDT(w.expected_at)} <StatusChip status={w.status} /></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="text-xs text-slate-500">DHO sees counts, not patient details. <Link className="underline" href="/audit">Open audit log</Link></p>
    </div>
  );
}
