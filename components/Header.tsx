import Link from "next/link";
import { logout } from "@/app/actions";
import { clockOffsetHours } from "@/lib/queries";
import { getUser } from "@/lib/session";
import { DemoControls } from "./DemoControls";

const NAV: Record<string, { href: string; label: string }[]> = {
  doctor: [
    { href: "/doctor", label: "My referrals" },
    { href: "/doctor/new", label: "New referral" },
    { href: "/doctor/queue", label: "Hospital queue" },
  ],
  lab: [{ href: "/lab", label: "Lab desk" }],
  dho: [{ href: "/dho", label: "District dashboard" }],
};

export async function Header() {
  const [u, offsetH] = await Promise.all([getUser(), clockOffsetHours()]);
  return (
    <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="bg-amber-100 px-4 py-0.5 text-center text-[11px] font-medium text-amber-900">
        Demo with synthetic data only. All hospitals, patients and phone numbers are fictional.
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <Link href="/" className="flex items-center gap-2 font-bold text-teal-800">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-teal-700 text-sm text-white">TB</span>
          TestBridge
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {(u ? NAV[u.role] ?? [] : []).map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100">
              {n.label}
            </Link>
          ))}
          <Link href="/phone" className="rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100">Patient phone</Link>
          <Link href="/audit" className="rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100">Audit log</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {u ? (
            <>
              <span className="hidden text-right leading-tight sm:block">
                <span className="block font-semibold">{u.name}</span>
                <span className="block text-xs text-slate-500">{u.role}{u.hospital_name ? ` · ${u.hospital_name}` : ""}</span>
              </span>
              <form action={logout}>
                <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">Switch</button>
              </form>
            </>
          ) : (
            <Link href="/" className="rounded-md border border-slate-300 px-2 py-1 text-xs">Log in</Link>
          )}
          <DemoControls offsetH={offsetH} />
        </div>
      </div>
    </header>
  );
}
