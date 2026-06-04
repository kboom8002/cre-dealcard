import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

/**
 * /insight redirects to /pulse?tab=insight
 * Preserves the ?type= filter as a query param.
 */
export default async function InsightRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const dest = type ? `/pulse?tab=insight&type=${type}` : "/pulse?tab=insight";
  redirect(dest);
}
