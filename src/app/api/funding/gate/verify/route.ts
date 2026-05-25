import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { targetType } = await request.json(); // "general" | "qualified" | "professional"
    if (!targetType) {
      return NextResponse.json({ error: "targetType is required" }, { status: 400 });
    }

    // Update investor profile with verified status
    const { data: profile, error } = await supabase
      .from("investor_profiles")
      .update({
        investor_type: targetType,
        kyc_verified: true,
        kyc_verified_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      // If profile doesn't exist, create one
      const { data: newProfile, error: insErr } = await supabase
        .from("investor_profiles")
        .insert({
          user_id: user.id,
          investor_type: targetType,
          kyc_verified: true,
          kyc_verified_at: new Date().toISOString(),
          investment_preference: [],
          preferred_sectors: [],
        })
        .select("*")
        .single();

      if (insErr) throw insErr;
      return NextResponse.json({ ok: true, data: newProfile });
    }

    return NextResponse.json({ ok: true, data: profile });
  } catch (error: any) {
    console.error("[POST /api/funding/gate/verify]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
