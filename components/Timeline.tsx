import { ACTION_LABEL, fmtDT } from "@/lib/format";

export type AuditRow = {
  id: number;
  at: string;
  actor_name: string;
  actor_role: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  details: Record<string, unknown>;
};

const tone = (a: string) =>
  a.includes("rejected") || a === "expired" || a === "no_show"
    ? "bg-rose-500"
    : a.startsWith("viewed")
      ? "bg-slate-300"
      : a.includes("slot")
        ? "bg-fuchsia-500"
        : a === "report_sent"
          ? "bg-emerald-500"
          : "bg-teal-600";

export function Timeline({ rows, showViews = false }: { rows: AuditRow[]; showViews?: boolean }) {
  const list = showViews ? rows : rows.filter((r) => !r.action.startsWith("viewed"));
  return (
    <ol className="relative ml-2 border-l border-slate-200">
      {list.map((r) => (
        <li key={r.id} className="mb-3 ml-4">
          <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ring-2 ring-white ${tone(r.action)}`} />
          <div className="text-sm font-medium text-slate-900">{ACTION_LABEL[r.action] ?? r.action}</div>
          <div className="text-xs text-slate-500">
            {fmtDT(r.at)} · {r.actor_name} ({r.actor_role})
            {r.from_status || r.to_status ? ` · ${r.from_status ?? "—"} → ${r.to_status ?? "—"}` : ""}
          </div>
          {Object.keys(r.details ?? {}).length > 0 && (
            <div className="mt-0.5 text-xs text-slate-600">
              {Object.entries(r.details)
                .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`)
                .join(" · ")}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
