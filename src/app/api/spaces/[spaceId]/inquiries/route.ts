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

    // AI Qualification + CRM auto-linking (non-blocking)
    if (space) {
      (async () => {
        try {
          // 1. AI 적합성 판정
          const qualification = await runInquiryQualifierAgent({
            space_ssot: space,
            inquiry: {
              prospect: parsed.data.prospect,
              requirement: parsed.data.requirement,
              question_text: parsed.data.question_text,
            },
          });

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

            // 2. broker_clients 자동 등록 (문의자 → CRM 고객)
            const prospect = parsed.data.prospect as {
              display_name?: string;
              company_name?: string;
              phone?: string;
              email?: string;
            };
            const requirement = parsed.data.requirement as {
              tenant_category?: string;
              budget_monthly_max?: number;
              budget_deposit_max?: number;
              desired_area_py_min?: number;
              desired_area_py_max?: number;
              preferred_floor?: string;
              move_in_date?: string;
              must_haves?: string[];
            };

            // Space owner (broker) lookup
            const brokerId = space.created_by;
            if (brokerId && prospect?.display_name) {
              // Upsert broker_client
              const { data: client } = await supabase
                .from("broker_clients")
                .upsert({
                  broker_id: brokerId,
                  display_name: prospect.display_name,
                  company: prospect.company_name ?? null,
                  phone: prospect.phone ?? null,
                  email: prospect.email ?? null,
                  source: "leasing_inquiry",
                  tier: qualification.output.fit_estimate === "high" ? "A" : "B",
                  tags: [requirement?.tenant_category ?? "미확인"].filter(Boolean),
                }, {
                  onConflict: "broker_id,phone",
                  ignoreDuplicates: false,
                })
                .select("id")
                .single();

              // 3. tenant_intent 자동 생성
              if (client?.id) {
                const areaPy = requirement?.desired_area_py_min;
                const areaSqmMin = areaPy ? areaPy * 3.3058 : null;
                const areaSqmMax = requirement?.desired_area_py_max
                  ? requirement.desired_area_py_max * 3.3058
                  : areaSqmMin;

                const { data: intent } = await supabase
                  .from("tenant_intent")
                  .insert({
                    broker_id: brokerId,
                    client_id: client.id,
                    business_type: requirement?.tenant_category ?? null,
                    area_min: areaSqmMin,
                    area_max: areaSqmMax,
                    budget_deposit_max: requirement?.budget_deposit_max ?? null,
                    budget_monthly_max: requirement?.budget_monthly_max ?? null,
                    preferred_floors: requirement?.preferred_floor
                      ? [requirement.preferred_floor]
                      : [],
                    move_in_target: requirement?.move_in_date ?? null,
                    must_have: requirement?.must_haves ?? [],
                  })
                  .select("id")
                  .single();

                // 4. leasing_inquiries에 CRM 연결
                if (intent?.id) {
                  await supabase
                    .from("leasing_inquiries")
                    .update({
                      broker_client_id: client.id,
                      tenant_intent_id: intent.id,
                      status: "qualified",
                    })
                    .eq("id", inquiry.id);

                  // 5. lease auto-matcher 트리거 (연결된 lease_space가 있으면)
                  try {
                    const { runLeaseAutoMatcher } = await import(
                      "@/domain/matching/lease-auto-matcher"
                    );
                    // 이 space에 연결된 모든 lease_spaces에 대해 매칭 재실행
                    const { data: linkedLeases } = await supabase
                      .from("lease_spaces")
                      .select("id")
                      .eq("aipage_space_id", spaceId);

                    for (const ls of linkedLeases ?? []) {
                      await runLeaseAutoMatcher(ls.id, brokerId);
                    }
                  } catch (matchErr) {
                    console.warn("[inquiries] auto-match failed:", matchErr);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error("[inquiries] qualification+CRM pipeline error:", err);
        }
      })();
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
