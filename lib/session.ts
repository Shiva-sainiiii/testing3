import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { one } from "./db";

// DEMO ONLY: hardcoded logins, no passwords. Production would use real auth + RLS by hospital.
export const COOKIE = "tb_user";

export type User = {
  id: string;
  name: string;
  role: "doctor" | "lab" | "dho" | "admin";
  hospital_id: string | null;
  hospital_name: string | null;
};

export async function getUser(): Promise<User | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  return one<User>(
    `select u.id, u.name, u.role, u.hospital_id, h.short_name as hospital_name
       from tb.demo_users u left join tb.hospitals h on h.id = u.hospital_id where u.id = $1`,
    [id],
  );
}

export async function requireRole(...roles: User["role"][]): Promise<User> {
  const u = await getUser();
  if (!u || !roles.includes(u.role)) redirect("/");
  return u;
}

export function homeFor(role: User["role"]): string {
  return role === "doctor" ? "/doctor" : role === "lab" ? "/lab" : role === "dho" ? "/dho" : "/audit";
}
