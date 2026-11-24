// Shared (client + server) display helpers. All times shown in IST.

const dtFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const dFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const tFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", second: "2-digit" });

export const fmtDT = (v?: string | Date | null) => (v ? dtFmt.format(new Date(v)) : "—");
export const fmtD = (v?: string | Date | null) => (v ? dFmt.format(new Date(v)) : "—");
export const fmtT = (v?: string | Date | null) => (v ? tFmt.format(new Date(v)) : "—");

export const maskPhone = (p?: string | null) => (p ? `${p.slice(0, 2)}xxxx${p.slice(-4)}` : "—");

export function relTime(v: string | Date, now = Date.now()): string {
  const ms = new Date(v).getTime() - now;
  const abs = Math.abs(ms);
  const m = Math.round(abs / 60000);
  const txt = m < 60 ? `${m}m` : m < 60 * 48 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
  return ms >= 0 ? `in ${txt}` : `${txt} ago`;
}

export type Status =
  | "open" | "accepted" | "patient_confirmed" | "arrived" | "test_done"
  | "report_sent" | "closed" | "expired" | "cancelled" | "no_show";

export const STATUS: Record<Status, { en: string; hi: string; cls: string }> = {
  open: { en: "Waiting for a lab", hi: "लैब का इंतज़ार", cls: "bg-amber-100 text-amber-900 ring-amber-300" },
  accepted: { en: "Booked", hi: "बुक हो गई", cls: "bg-sky-100 text-sky-900 ring-sky-300" },
  patient_confirmed: { en: "Patient confirmed", hi: "मरीज़ ने पुष्टि की", cls: "bg-indigo-100 text-indigo-900 ring-indigo-300" },
  arrived: { en: "Patient arrived", hi: "मरीज़ पहुँचे", cls: "bg-violet-100 text-violet-900 ring-violet-300" },
  test_done: { en: "Test done", hi: "जाँच हो गई", cls: "bg-teal-100 text-teal-900 ring-teal-300" },
  report_sent: { en: "Report ready", hi: "रिपोर्ट भेजी गई", cls: "bg-emerald-100 text-emerald-900 ring-emerald-300" },
  closed: { en: "Closed", hi: "बंद", cls: "bg-slate-100 text-slate-700 ring-slate-300" },
  expired: { en: "Expired: keep original date", hi: "पुरानी तारीख रखें", cls: "bg-rose-100 text-rose-900 ring-rose-300" },
  cancelled: { en: "Cancelled", hi: "रद्द", cls: "bg-slate-100 text-slate-700 ring-slate-300" },
  no_show: { en: "No-show", hi: "नहीं पहुँचे", cls: "bg-rose-100 text-rose-900 ring-rose-300" },
};

export const PRIORITY: Record<string, { label: string; desc: string; cls: string }> = {
  P1: { label: "P1 Urgent", desc: "Treatment decision blocked; risk of harm if delayed", cls: "bg-red-600 text-white" },
  P2: { label: "P2 Soon", desc: "Needed within days; patient symptomatic", cls: "bg-orange-500 text-white" },
  P3: { label: "P3 Routine", desc: "Follow-up or stable patient", cls: "bg-slate-500 text-white" },
};

export const ACTION_LABEL: Record<string, string> = {
  created: "Referral created",
  consent_recorded: "Patient consent recorded",
  accepted: "Accepted by lab",
  accept_rejected: "Accept rejected (already taken)",
  original_slot_held: "Original slot kept as backup",
  original_slot_released: "Original slot released to next patient",
  patient_confirmed: "Patient confirmed by SMS",
  arrived: "Patient arrived at lab",
  test_done: "Test done",
  report_sent: "Report sent to doctor",
  no_show: "Patient did not arrive",
  reopened: "Offered to labs again",
  cancelled: "Cancelled: keep original date",
  closed: "Closed by doctor",
  declined: "Lab declined",
  expired: "Expired: no lab accepted",
  radius_widened: "Search radius widened",
  transition_rejected: "Out-of-order action rejected",
  viewed_referral: "Viewed referral",
  viewed_patient: "Viewed patient details",
  viewed_report: "Viewed report",
  demo_clock_advanced: "Demo clock advanced",
};
