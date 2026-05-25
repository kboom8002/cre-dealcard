import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: projects, error } = await supabase
      .from("funding_projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: projects || [],
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message });
  }
}
