"use client";

import { useState } from "react";
import { useLive } from "@/lib/useLive";
import { fmtDT } from "@/lib/format";

type S = {
  code: string; status: string; accepted_slot_at: string | null; original_slot_at: string; updated_at: string;
  first_name: string; test_en: string; test_hi: string; prep_en: string; prep_hi: string; bring_en: string; bring_hi: string;
  from_name: string; doctor_name: string; lab_name: string | null; lab_address_en: string | null; lab_address_hi: string | null;
  lab_phone: string | null; lab_lat: number | null; lab_lng: number | null; lab_is_free: boolean | null; lab_price: number | null;
  confirmed: boolean;
};
type Lang = "hi" | "en";

const T = {
  hi: {
    hello: "नमस्ते", yourTest: "आपकी जाँच", token: "टोकन",
    steps: ["अनुरोध भेजा", "लैब में तारीख तय", "आपने पुष्टि की", "जाँच हो गई", "रिपोर्ट डॉक्टर को भेजी"],
    searching: "जल्दी की तारीख ढूँढी जा रही है…",
    keepOriginal: (d: string, h: string) => `आपकी पुरानी तारीख ${d} (${h}) सुरक्षित है।`,
    noSlot: "पास में जल्दी की तारीख नहीं मिली।", cancelled: "अनुरोध रद्द किया गया।",
    goTo: "यहाँ जाएँ", map: "नक्शा खोलें", call: "लैब को फ़ोन करें", free: "निःशुल्क (सरकारी)", paid: (p: number) => `शुल्क ₹${p}`,
    confirmHint: "पुष्टि के लिए SMS में 1 भेजें।", confirmed: "आपने आना पक्का किया है। धन्यवाद!",
    atLab: "आप लैब पहुँच गए हैं। जाँच जारी है।",
    done: "जाँच हो गई। रिपोर्ट आपके डॉक्टर को भेजी जाएगी।",
    reportSent: (d: string, h: string) => `रिपोर्ट ${d} (${h}) को भेज दी गई है। इलाज वहीं जारी रखें।`,
    prep: "तैयारी", bring: "साथ लाएँ", updated: "अपडेट", help: "सवाल हो तो अपने अस्पताल से संपर्क करें।",
  },
  en: {
    hello: "Hello", yourTest: "Your test", token: "Token",
    steps: ["Request sent", "Booked at a lab", "You confirmed", "Test done", "Report sent to your doctor"],
    searching: "Looking for an earlier slot…",
    keepOriginal: (d: string, h: string) => `Your original date ${d} (${h}) is kept.`,
    noSlot: "No earlier slot was found nearby.", cancelled: "The request was cancelled.",
    goTo: "Go to", map: "Open map", call: "Call the lab", free: "Free (government)", paid: (p: number) => `Fee ₹${p}`,
    confirmHint: "Reply 1 to the SMS to confirm.", confirmed: "You confirmed you are coming. Thank you!",
    atLab: "You are at the lab. Test in progress.",
    done: "Test done. The report will be sent to your doctor.",
    reportSent: (d: string, h: string) => `The report has been sent to ${d} (${h}). Continue your treatment there.`,
    prep: "Preparation", bring: "Bring with you", updated: "Updated", help: "Questions? Contact your hospital.",
  },
};

const ORDER = ["open", "accepted", "patient_confirmed", "arrived", "test_done", "report_sent", "closed"];
function stepIndex(s: S) {
  const i = ORDER.indexOf(s.status);
  if (i >= ORDER.indexOf("report_sent")) return 4;
  if (i >= ORDER.indexOf("test_done")) return 3;
  if (s.confirmed || i >= ORDER.indexOf("arrived")) return 2;
  if (i >= ORDER.indexOf("accepted")) return 1;
  return 0;
}

export function StatusView({ token }: { token: string }) {
  const [lang, setLang] = useState<Lang>("hi");
  const { data: s, stale } = useLive<S>(`/api/status/${token}`, 3000);
  const t = T[lang];

  if (!s) return <main className="p-8 text-center text-slate-500">…</main>;
  const step = stepIndex(s);
  const booked = ["accepted", "patient_confirmed", "arrived"].includes(s.status);
  const ended = s.status === "expired" || s.status === "cancelled";

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-5 text-[17px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-teal-800">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-teal-700 text-sm text-white">TB</span> TestBridge
        </div>
        <div className="flex overflow-hidden rounded-full border border-slate-300 text-sm">
          {(["hi", "en"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} className={`px-3 py-1 ${lang === l ? "bg-teal-700 text-white" : "bg-white"}`}>
              {l === "hi" ? "हिंदी" : "English"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-slate-600">{t.hello} {s.first_name} ji</div>
        <h1 className="text-2xl font-bold">{t.yourTest}: {lang === "hi" ? s.test_hi : s.test_en}</h1>
        <div className="text-sm text-slate-500">{t.token}: <b className="text-slate-800">{s.code}</b></div>
      </div>

      {/* steps */}
      {!ended && (
        <ol className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          {t.steps.map((label, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${i <= step ? "bg-teal-700 text-white" : "bg-slate-200 text-slate-500"}`}>
                {i <= step ? "✓" : i + 1}
              </span>
              <span className={i <= step ? "font-semibold" : "text-slate-500"}>{label}</span>
            </li>
          ))}
        </ol>
      )}

      {/* current state */}
      {s.status === "open" && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <div className="font-semibold">{t.searching}</div>
          <div className="text-sm">{t.keepOriginal(fmtDT(s.original_slot_at), s.from_name)}</div>
        </div>
      )}
      {ended && (
        <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <div className="font-semibold">{s.status === "expired" ? t.noSlot : t.cancelled}</div>
          <div>{t.keepOriginal(fmtDT(s.original_slot_at), s.from_name)}</div>
        </div>
      )}
      {booked && s.lab_name && (
        <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-2 ring-teal-600">
          <div className="text-sm text-slate-500">{t.goTo}</div>
          <div className="text-2xl font-bold">{fmtDT(s.accepted_slot_at)}</div>
          <div className="text-lg font-semibold">{s.lab_name}</div>
          <div className="text-slate-700">{lang === "hi" ? s.lab_address_hi : s.lab_address_en}</div>
          <div className="text-sm">{s.lab_is_free ? t.free : t.paid(s.lab_price ?? 0)}</div>
          <div className="flex gap-2 pt-1">
            <a className="flex-1 rounded-xl bg-teal-700 py-2 text-center font-semibold text-white" target="_blank"
              href={`https://www.google.com/maps/search/?api=1&query=${s.lab_lat},${s.lab_lng}`}>📍 {t.map}</a>
            <a className="flex-1 rounded-xl border border-teal-700 py-2 text-center font-semibold text-teal-800" href={`tel:${s.lab_phone}`}>📞 {t.call}</a>
          </div>
          <div className={`rounded-lg p-2 text-sm ${s.status === "arrived" || s.confirmed ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
            {s.status === "arrived" ? t.atLab : s.confirmed ? t.confirmed : t.confirmHint}
          </div>
        </div>
      )}
      {s.status === "test_done" && <div className="rounded-2xl bg-teal-50 p-4 font-semibold ring-1 ring-teal-200">{t.done}</div>}
      {(s.status === "report_sent" || s.status === "closed") && (
        <div className="rounded-2xl bg-emerald-50 p-4 font-semibold ring-1 ring-emerald-300">{t.reportSent(s.doctor_name, s.from_name)}</div>
      )}

      {(s.status === "open" || booked) && (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <div><div className="font-semibold">{t.prep}</div><p className="text-slate-700">{lang === "hi" ? s.prep_hi : s.prep_en}</p></div>
          <div><div className="font-semibold">{t.bring}</div><p className="text-slate-700">{lang === "hi" ? s.bring_hi : s.bring_en}</p></div>
        </div>
      )}

      <p className="text-center text-xs text-slate-500">
        {t.updated}: {fmtDT(s.updated_at)}{stale ? " · offline, retrying" : ""} · {t.help}
        <br />Demo with synthetic data. All names are fictional.
      </p>
    </main>
  );
}
