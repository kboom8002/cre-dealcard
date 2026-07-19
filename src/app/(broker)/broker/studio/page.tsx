import { redirect } from "next/navigation";

export default function StudioRedirectPage() {
  redirect("/broker/magazine-editor?tab=ai_assist");
}
