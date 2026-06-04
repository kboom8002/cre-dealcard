import { redirect } from "next/navigation";

/**
 * Root page — redirects to /hub (the central platform homepage).
 * First-time visitor hero is rendered conditionally on the hub page itself.
 */
export default function RootPage() {
  redirect("/hub");
}
