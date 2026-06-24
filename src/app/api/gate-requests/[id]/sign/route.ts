import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { signature } = body;

    if (!signature || signature.trim() === "") {
      return NextResponse.json({ error: "서명이 필요합니다." }, { status: 400 });
    }

    const supabase = createServiceClient();
    
    const { error } = await supabase
      .from("gate_requests")
      .update({ status: "approved" })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "알 수 없는 오류" }, { status: 500 });
  }
}
