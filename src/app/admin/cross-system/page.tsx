import { Metadata } from "next";
import { CrossSystemFunnel } from "@/components/admin/cross-system-funnel";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "크로스시스템 현황 | JS 1분 딜카드 어드민",
};

export default async function CrossSystemAdminPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="container max-w-4xl py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">크로스시스템 연계 현황</h1>
        <p className="text-muted-foreground mt-2">
          MVP, Full IM Studio, Space AI Page 3개 시스템의 연계 데이터 흐름을 확인합니다.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <CrossSystemFunnel />
      </div>
    </div>
  );
}
