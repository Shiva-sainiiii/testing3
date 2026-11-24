"use client";

import Link from "next/link";
import { useState } from "react";
import { useLive } from "@/lib/useLive";
import { ACTION_LABEL, fmtT, fmtDT } from "@/lib/format";
import { Card, input } from "@/components/ui";
import { LiveBadge } from "@/components/LiveBadge";

type Row = {
  id: number; at: string; actor_name: string; actor_role: string; actor_hospital_id: string | null;
  referral_id: number | null; referral_code: string | null; action: string;
  from_status: string | null; to_status: string | null; details: Record<string, unknown>;
};

const tone = (a: string) =>
  a.includes("rejected") || a === "expired" || a === "no_show" ? "bg-rose-100 text-rose-800"
  : a.startsWith("viewed") ? "bg-slate-100 text-slate-600"
  : a.includes("slot") ? "bg-fuchsia-100 text-fuchsia-800"
  : a === "report_sent" ? "bg-emerald-100 text-emerald-800"
  : "bg-teal-50 text-teal-800";

export function AuditView() {
  const [filter, setFilter] = useState("");
  const [hideViews, setHideViews] = useState(false);
  const { data, stale } = useLive<Row[]>(`/api/live?view=audit${filter ? `&q=${encodeURIComponent(filter)}` : ""}`);
  const rows = (data ?? []).filter((r) => !(hideViews && r.action.startsWith("viewed")));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Audit log</h1>
          <p className="text-sm text-slate-500">
            Every action and every view of patient data: who, which role, when, and the state change. Append-only (the database rejects edits and deletes).
          </p>
        </div>
        <LiveBadge stale={stale} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input className={`${input} max-w-xs`} placeholder="Filter: TB-1001, accept, viewed…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" checked={hideViews} onChange={(e) => setHideViews(e.target.checked)} /> hide data views
        </label>
        <span className="text-sm text-slate-500">{rows.length} rows (latest first)</span>
      </div>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">#</th><th className="px-3 py-2">Time (IST)</th><th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th><th className="px-3 py-2">Referral</th><th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No entries.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-1.5 text-xs text-slate-400">{r.id}</td>
                <td className="whitespace-nowrap px-3 py-1.5" title={fmtDT(r.at)}>{fmtT(r.at)}</td>
                <td className="px-3 py-1.5">
                  {r.actor_name}
                  <div className="text-xs text-slate-500">{r.actor_role}{r.actor_hospital_id ? ` · ${r.actor_hospital_id}` : ""}</div>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${tone(r.action)}`}>{ACTION_LABEL[r.action] ?? r.action}</span>
                </td>
                <td className="px-3 py-1.5">
                  {r.referral_code ? <Link href={`/r/${r.referral_id}`} className="text-teal-700 hover:underline">{r.referral_code}</Link> : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-600">
                  {r.from_status || r.to_status ? `${r.from_status ?? "—"} → ${r.to_status ?? "—"}` : ""}
                </td>
                <td className="px-3 py-1.5 text-xs text-slate-600">
                  {Object.entries(r.details ?? {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
