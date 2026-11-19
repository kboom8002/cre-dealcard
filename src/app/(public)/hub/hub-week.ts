import { mondayOfWeek, todayKst } from "@/lib/magazine/kst";

/**
 * ISO timestamp (UTC) of Monday 00:00 KST for the week containing `now`.
 * Uses the shared KST helper so the "이번 주 신규" count is identical on a UTC server
 * (Vercel) and a KST workstation.
 */
export function kstWeekStartIso(now: Date = new Date()): string {
  return new Date(`${mondayOfWeek(todayKst(now))}T00:00:00+09:00`).toISOString();
}
