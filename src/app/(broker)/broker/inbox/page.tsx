import { redirect } from "next/navigation";

interface LegacyInboxPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LegacyInboxRedirectPage({ searchParams }: LegacyInboxPageProps) {
  const resolved = searchParams ? await searchParams.catch(() => ({})) : {};
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved || {})) {
    if (typeof value === "string") {
      qs.append(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          qs.append(key, item);
        }
      }
    }
  }
  const queryString = qs.toString();
  redirect(queryString ? `/broker/w/inbox?${queryString}` : "/broker/w/inbox");
}
