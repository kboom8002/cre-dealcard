/**
 * API: POST /api/spaces/[spaceId]/inquiries — 문의 접수 + AI 분류
 * API: GET  /api/spaces/[spaceId]/inquiries — 문의 목록 조회 (관리용)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PublicInquiryInputSchema } from "@/contracts/inquiry";
import { runInquiryQualifierAgent } from "@/ai/agents/inquiry-qualifier-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── POST: 문의 접수 ──────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    const body = await req.json();

    // Privacy consent 확인
    if (!body.consent?.privacy_consent_given) {
      return NextResponse.json(
        { error: "개인정보 처리에 동의가 필요합니다." },
        { status: 400 },
      );
    }

    // Validate input
    const parsed = PublicInquiryInputSchema.safeParse({
      ...body,
      space_id: spaceId,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력 형식이 올바르지 않습니다.", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // Save inquiry
    const { data: inquiry, error: insertError } = await supabase
      .from("leasing_inquiries")
      .insert({
        space_id: spaceId,
        leasing_page_id: parsed.data.leasing_page_id,
        status: "submitted",
        source_channel: "leasing_page",
        question_text: parsed.data.question_text,
        prospect: parsed.data.prospect,
        requirement: parsed.data.requirement,
        consent: parsed.data.consent,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[inquiries] insert error:", insertError);
      return NextResponse.json({ error: "문의 저장에 실패했습니다." }, { status: 500 });
    }

    // Fetch space for qualification
    const { data: space } = await supabase
      .from("spaces")
      .select("*")
      .eq("id", spaceId)
      .single();

    // AI Qualification (non-blocking — fire and forget qualification)
    if (space) {
      runInquiryQualifierAgent({
        space_ssot: space,
        inquiry: {
          prospect: parsed.data.prospect,
          requirement: parsed.data.requirement,
          question_text: parsed.data.question_text,
        },
      }).then(async (qualification) => {
        if (qualification.status === "success" && qualification.output && inquiry) {
          await supabase.from("inquiry_qualifications").insert({
            inquiry_id: inquiry.id,
            space_id: spaceId,
            fit_estimate: qualification.output.fit_estimate,
            summary: qualification.output.summary,
            budget_fit: qualification.output.budget_fit,
            timing_fit: qualification.output.timing_fit,
            facility_fit: qualification.output.facility_fit,
            key_concerns: qualification.output.key_concerns,
            recommended_next_action: qualification.output.recommended_next_action,
            kakao_reply_draft: qualification.output.kakao_reply_draft,
            missing_info_to_ask: qualification.output.missing_info_to_ask,
            ai_generated: true,
          });
        }
      }).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      inquiry_id: inquiry?.id,
      message: "문의가 접수되었습니다. 브로커가 곧 연락드립니다.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "문의 접수에 실패했습니다.", detail: String(error) },
      { status: 500 },
    );
  }
}

// ── GET: 문의 목록 (관리용) ──────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    const supabase = createServiceClient();

    const { data: inquiries, error } = await supabase
      .from("leasing_inquiries")
      .select("id, status, source_channel, question_text, created_at, requirement")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "조회에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ inquiries: inquiries ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: "조회에 실패했습니다.", detail: String(error) },
      { status: 500 },
    );
  }
}
