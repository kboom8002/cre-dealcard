import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInvestorGateLevel, filterProjectByGate } from "@/domain/gate/funding-gate";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { id } = await params;
    
    // Get current user session
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch the project
    const { data: project, error: pErr } = await supabase
      .from("funding_projects")
      .select("*")
      .eq("id", id)
      .single();

    if (pErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Determine investor gate level
    let gateLevel = 0; // default anon/non-member
    if (user) {
      const { data: profile } = await supabase
        .from("investor_profiles")
        .select("investor_type, kyc_verified")
        .eq("user_id", user.id)
        .single();

      gateLevel = profile 
        ? getInvestorGateLevel(profile.investor_type as any, profile.kyc_verified)
        : 1; // standard member if no profile yet
    }

    // If operator is the owner, bypass gate check
    if (user && project.operator_id === user.id) {
      return NextResponse.json({ ok: true, data: project });
    }

    // Filter project details based on gate level
    const filteredProject = filterProjectByGate(project, gateLevel as any);

    return NextResponse.json({
      ok: true,
      data: filteredProject,
      viewerGateLevel: gateLevel,
    });
  } catch (error: any) {
    console.error("[GET /api/funding/project/[id]]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { id } = await params;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const { data: project, error: checkErr } = await supabase
      .from("funding_projects")
      .select("operator_id")
      .eq("id", id)
      .single();

    if (checkErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.operator_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: updated, error } = await supabase
      .from("funding_projects")
      .update(body)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data: updated });
  } catch (error: any) {
    console.error("[PUT /api/funding/project/[id]]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { id } = await params;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: project, error: checkErr } = await supabase
      .from("funding_projects")
      .select("operator_id")
      .eq("id", id)
      .single();

    if (checkErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.operator_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("funding_projects")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true, message: "Project deleted successfully" });
  } catch (error: any) {
    console.error("[DELETE /api/funding/project/[id]]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
