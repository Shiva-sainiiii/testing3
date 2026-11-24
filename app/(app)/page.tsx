import Link from "next/link";
import { loginAs } from "@/app/actions";
import { q } from "@/lib/db";

type Row = { id: string; name: string; role: string; hospital_id: string | null; hospital: string | null; kind: string | null };

export default async function LoginPage() {
  const users = await q<Row>(
    `select u.id, u.name, u.role, u.hospital_id, h.name as hospital, h.kind
       from tb.demo_users u left join tb.hospitals h on h.id = u.hospital_id order by u.role = 'doctor' desc, u.role, u.id`,
  );
  const groups: [string, string, Row[]][] = [
    ["Referring doctor", "Creates test referrals and receives reports", users.filter((u) => u.role === "doctor")],
    ["Partner lab desks", "Accept requests, mark arrived and done, upload reports", users.filter((u) => u.role === "lab")],
    ["District", "Network-level view", users.filter((u) => u.role === "dho")],
  ];
  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 p-6 text-white shadow">
        <h1 className="text-3xl font-bold">TestBridge</h1>
        <p className="mt-1 text-lg text-teal-50">Your doctor stays the same. Only the test moves, to wherever it can be done fastest.</p>
        <p className="mt-1 text-teal-100">आपका डॉक्टर वही रहेगा। सिर्फ़ जाँच वहाँ होगी जहाँ सबसे जल्दी हो सके।</p>
      </section>

      {groups.map(([title, sub, rows]) => (
        <section key={title}>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mb-3 text-sm text-slate-500">{sub}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((u) => (
              <form key={u.id} action={loginAs}>
                <input type="hidden" name="id" value={u.id} />
                <button className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-500 hover:shadow">
                  <div className="font-semibold">{u.name}</div>
                  <div className="text-sm text-slate-500">
                    {u.hospital ?? "Demo District"}
                    {u.hospital_id ? ` (${u.hospital_id})` : ""}
                    {u.kind === "ppp" ? " · PPP, paid" : u.kind ? " · Govt" : ""}
                  </div>
                </button>
              </form>
            ))}
          </div>
        </section>
      ))}

      <section>
        <h2 className="text-lg font-semibold">No login needed</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/phone" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-500">
            <div className="font-semibold">Patient phone (simulated SMS)</div>
            <div className="text-sm text-slate-500">What the patient receives, in Hindi and English</div>
          </Link>
          <Link href="/audit" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-500">
            <div className="font-semibold">Audit log</div>
            <div className="text-sm text-slate-500">Every action, append-only</div>
          </Link>
        </div>
      </section>
    </div>
  );
}
