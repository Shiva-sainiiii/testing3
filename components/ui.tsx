import type { ReactNode } from "react";
import { PRIORITY, STATUS, type Status } from "@/lib/format";

export function StatusChip({ status, lang = "en" }: { status: string; lang?: "en" | "hi" }) {
  const s = STATUS[status as Status] ?? { en: status, hi: status, cls: "bg-slate-100 text-slate-700 ring-slate-300" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.cls}`}>
      {lang === "hi" ? s.hi : s.en}
    </span>
  );
}

export function PriorityChip({ p }: { p: string }) {
  const m = PRIORITY[p];
  return (
    <span title={m?.desc} className={`inline-flex rounded px-1.5 py-0.5 text-xs font-bold ${m?.cls ?? "bg-slate-400 text-white"}`}>
      {m?.label ?? p}
    </span>
  );
}

export function TempMedBadge() {
  return (
    <span className="inline-flex rounded bg-fuchsia-100 px-1.5 py-0.5 text-xs font-semibold text-fuchsia-900 ring-1 ring-fuchsia-300">
      On temporary medication
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const cls = {
    info: "bg-sky-50 text-sky-900 border-sky-200",
    error: "bg-rose-50 text-rose-900 border-rose-300",
    success: "bg-emerald-50 text-emerald-900 border-emerald-300",
    warn: "bg-amber-50 text-amber-900 border-amber-300",
  }[kind];
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export type Score = { total: number; parts: { label: string; pts: number }[] };

export function ScoreBreakdown({ score }: { score: Score }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600">
      <span className="font-semibold text-slate-800">Score {score.total}</span>
      <span>=</span>
      {score.parts.map((p, i) => (
        <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5">
          {p.label} <b className={p.pts >= 0 ? "text-emerald-700" : "text-rose-700"}>{p.pts >= 0 ? `+${p.pts}` : p.pts}</b>
        </span>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="!p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}

export const btn =
  "inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = `${btn} bg-teal-700 text-white hover:bg-teal-800`;
export const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
export const btnDanger = `${btn} border border-rose-300 bg-white text-rose-700 hover:bg-rose-50`;
export const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
