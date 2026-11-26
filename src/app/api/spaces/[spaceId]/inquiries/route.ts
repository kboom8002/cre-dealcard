/**
 * API: POST /api/spaces/[spaceId]/inquiries — 공개 문의 접수 + AI 분류 (IP 레이트리밋 + 입력 길이 제한)
 * API: GET  /api/spaces/[spaceId]/inquiries — 문의 목록 조회 (브로커 소유자 전용)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBroker } from "@/lib/auth-guard";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { PublicInquiryInputSchema } from "@/contracts/inquiry";
import { runInquiryQualifierAgent } from "@/ai/agents/inquiry-qualifier-agent";
import { pyeongToSqm } from "@/lib/utils/area-conversion";
import { createModuleLogger } from "@/lib/logger";
import { runAfterResponse } from "@/lib/server/after-safe";

const log = createModuleLogger("space-inquiries-route");

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_INQUIRY_BODY_BYTES = 16 * 1024;
const MAX_QUESTION_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;
const MAX_COMPANY_LENGTH = 120;
const MAX_PHONE_LENGTH = 40;
const MAX_EMAIL_LENGTH = 254;
const MAX_TIMING_LENGTH = 100;
const MAX_FACILITY_ITEMS = 20;
const MAX_FACILITY_ITEM_LENGTH = 60;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSpaceOwnership(
  supabase: ReturnType<typeof createServiceClient>,
  spaceId: string,
  userId: string,
  role: string | null,
): Promise<{ ok: true; space: any } | { ok: false; response: NextResponse }> {
  if (!spaceId || typeof spaceId !== "string" || !spaceId.trim()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "유효하지 않은 공간 ID입니다." }, { status: 400 }),
    };
  }

  const { data: space, error: spaceErr } = await supabase
    .from("spaces")
    .select("id, created_by, building_ssot_lite_id")
    .eq("id", spaceId)
    .maybeSingle();

  if (spaceErr) {
    log.error("[spaces-authz] space lookup error:", spaceErr.message);
    return {
      ok: false,
      response: NextResponse.json({ error: "공간 권한을 확인하지 못했습니다." }, { status: 500 }),
    };
  }

  if (!space) {
    return {
      ok: false,
      response: NextResponse.json({ error: "공간을 찾을 수 없습니다." }, { status: 404 }),
    };
  }

  const directOwnerId =
    (space.created_by as string | null | undefined) ??
    ((space as Record<string, unknown>).owner_id as string | null | undefined) ??
    ((space as Record<string, unknown>).broker_id as string | null | undefined) ??
    null;

  if (directOwnerId && directOwnerId === userId) {
    return { ok: true, space };
  }

  if (!directOwnerId) {
    if (typeof space.building_ssot_lite_id === "string" && space.building_ssot_lite_id) {
      const bOwn = await assertBuildingOwner(supabase, space.building_ssot_lite_id, userId, {
        allowAdmin: true,
        role,
      });
      if (bOwn.ok) return { ok: true, space };
      if (bOwn.status === 500) return { ok: false, response: bOwn.response };
    }

    const { data: leaseSpace, error: lsErr } = await supabase
      .from("lease_spaces")
      .select("id, broker_id, building_id")
      .eq("aipage_space_id", spaceId)
      .limit(1)
      .maybeSingle();

    if (lsErr) {
      log.error("[spaces-authz] lease_spaces lookup error:", lsErr.message);
      return {
        ok: false,
        response: NextResponse.json({ error: "공간 권한을 확인하지 못했습니다." }, { status: 500 }),
      };
    }

    if (leaseSpace?.broker_id && leaseSpace.broker_id === userId) {
      return { ok: true, space };
    }

    if (!leaseSpace?.broker_id && typeof leaseSpace?.building_id === "string" && leaseSpace.building_id) {
      const lbOwn = await assertBuildingOwner(supabase, leaseSpace.building_id, userId, {
        allowAdmin: true,
        role,
      });
      if (lbOwn.ok) return { ok: true, space };
      if (lbOwn.status === 500) return { ok: false, response: lbOwn.response };
    }
  }

  if (role === "admin") {
    return { ok: true, space };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "이 공간에 대한 권한이 없습니다." }, { status: 403 }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateInquiryBounds(body: Record<string, any>): string | null {
  if (typeof body.question_text === "string" && body.question_text.length > MAX_QUESTION_LENGTH) {
    return "문의 내용은 2,000자 이내로 입력해 주세요.";
  }

  const prospect = body.prospect;
  if (prospect && typeof prospect === "object") {
    if (typeof prospect.display_name === "string" && prospect.display_name.length > MAX_NAME_LENGTH) {
      return "이름 입력 길이가 허용 범위를 초과했습니다.";
    }
    if (typeof prospect.company_name === "string" && prospect.company_name.length > MAX_COMPANY_LENGTH) {
      return "업체명 입력 길이가 허용 범위를 초과했습니다.";
    }
    const contact = prospect.contact_internal;
    if (contact && typeof contact === "object") {
      if (typeof contact.phone === "string" && contact.phone.length > MAX_PHONE_LENGTH) {
        return "연락처 입력 길이가 허용 범위를 초과했습니다.";
      }
      if (typeof contact.email === "string" && contact.email.length > MAX_EMAIL_LENGTH) {
        return "이메일 입력 길이가 허용 범위를 초과했습니다.";
      }
    }
    if (typeof prospect.phone === "string" && prospect.phone.length > MAX_PHONE_LENGTH) {
      return "연락처 입력 길이가 허용 범위를 초과했습니다.";
    }
    if (typeof prospect.email === "string" && prospect.email.length > MAX_EMAIL_LENGTH) {
      return "이메일 입력 길이가 허용 범위를 초과했습니다.";
    }
  }

  const requirement = body.requirement;
  if (requirement && typeof requirement === "object") {
    if (typeof requirement.move_in_timing === "string" && requirement.move_in_timing.length > MAX_TIMING_LENGTH) {
      return "희망 입주 시기 입력 길이가 허용 범위를 초과했습니다.";
    }
    if (Array.isArray(requirement.required_facilities)) {
      if (requirement.required_facilities.length > MAX_FACILITY_ITEMS) {
        return "필수 시설 항목 수가 허용 범위를 초과했습니다.";
      }
      if (
        requirement.required_facilities.some(
          (item: unknown) => typeof item === "string" && item.length > MAX_FACILITY_ITEM_LENGTH,
        )
      ) {
        return "필수 시설 항목 길이가 허용 범위를 초과했습니다.";
      }
    }
  }

  return null;
}

// ── POST: 문의 접수 (공개 리드 폼) ───────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const clientIp = getClientIp(req) ?? "unknown";
    const allowed = await checkRateLimit(clientIp, "space_inquiries_post", 10, 10 * 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: "문의 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 },
      );
    }

    const { spaceId } = await params;
    if (!spaceId || spaceId.length > 64) {
      return NextResponse.json({ error: "유효하지 않은 공간 ID입니다." }, { status: 400 });
    }

    const declaredLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_INQUIRY_BODY_BYTES) {
      return NextResponse.json(
        { error: "요청 크기가 허용 한도를 초과했습니다." },
        { status: 413 },
      );
    }

    const rawText = await req.text();
    if (Buffer.byteLength(rawText, "utf8") > MAX_INQUIRY_BODY_BYTES) {
      return NextResponse.json(
        { error: "요청 크기가 허용 한도를 초과했습니다." },
        { status: 413 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: Record<string, any>;
    try {
      const parsedJson = rawText.length > 0 ? JSON.parse(rawText) : null;
      if (!parsedJson || typeof parsedJson !== "object" || Array.isArray(parsedJson)) {
        return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
      }
      body = parsedJson;
    } catch {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }

    // Privacy consent 확인
    if (!body.consent?.privacy_consent_given) {
      return NextResponse.json(
        { error: "개인정보 처리에 동의가 필요합니다." },
        { status: 400 },
      );
    }

    const boundsError = validateInquiryBounds(body);
    if (boundsError) {
      return NextResponse.json({ error: boundsError }, { status: 400 });
    }

    // Validate input schema
    const parsed = PublicInquiryInputSchema.safeParse({
      ...body,
      space_id: spaceId,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력 형식이 올바르지 않습니다." },
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
      log.error("[inquiries] insert error:", insertError.message);
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
      runAfterResponse("space-inquiry-qualify", async () => {
        try {
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

            const prospect = parsed.data.prospect as {
              display_name?: string;
              company_name?: string;
              phone?: string;
              email?: string;
              contact_internal?: { phone?: string; email?: string };
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

            const brokerId = space.created_by;
            const phone = prospect.contact_internal?.phone ?? prospect.phone ?? null;
            const email = prospect.contact_internal?.email ?? prospect.email ?? null;

            if (brokerId && prospect?.display_name) {
              const { data: upsertedClient } = await supabase
                .from("broker_clients")
                .upsert(
                  {
                    broker_id: brokerId,
                    display_name: prospect.display_name,
                    company: prospect.company_name ?? null,
                    phone,
                    email,
                    consent_source: "leasing_inquiry",
                    tier: qualification.output.fit_estimate === "high" ? "A" : "B",
                    tags: [requirement?.tenant_category ?? "미확인"].filter(Boolean),
                  },
                  {
                    onConflict: "broker_id,phone",
                    ignoreDuplicates: true,
                  },
                )
                .select("id")
                .maybeSingle();

              let clientId: string | null = upsertedClient?.id ?? null;
              if (!clientId && phone) {
                const { data: existingClient } = await supabase
                  .from("broker_clients")
                  .select("id")
                  .eq("broker_id", brokerId)
                  .eq("phone", phone)
                  .maybeSingle();
                clientId = existingClient?.id ?? null;
              }

              if (clientId) {
                const areaPy = requirement?.desired_area_py_min;
                const areaSqmMin = areaPy ? pyeongToSqm(areaPy) : null;
                const areaSqmMax = requirement?.desired_area_py_max
                  ? pyeongToSqm(requirement.desired_area_py_max)
                  : areaSqmMin;

                const { data: intent } = await supabase
                  .from("tenant_intent")
                  .insert({
                    broker_id: brokerId,
                    client_id: clientId,
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

                if (intent?.id) {
                  await supabase
                    .from("leasing_inquiries")
                    .update({
                      status: "qualified",
                      requirement: {
                        ...(parsed.data.requirement ?? {}),
                        broker_client_id: clientId,
                        tenant_intent_id: intent.id,
                      },
                    })
                    .eq("id", inquiry.id);

                  try {
                    const { runLeaseAutoMatcher } = await import(
                      "@/domain/matching/lease-auto-matcher"
                    );
                    const { data: linkedLeases } = await supabase
                      .from("lease_spaces")
                      .select("id")
                      .eq("aipage_space_id", spaceId);

                    for (const ls of linkedLeases ?? []) {
                      await runLeaseAutoMatcher(ls.id, brokerId);
                    }
                  } catch (matchErr) {
                    log.warn("[inquiries] auto-match failed:", matchErr);
                  }
                }
              }
            }
          }
        } catch (err) {
          log.error("[inquiries] qualification+CRM pipeline error:", err);
        }
      });
    }

    return NextResponse.json({
      success: true,
      inquiry_id: inquiry?.id,
      message: "문의가 접수되었습니다. 브로커가 곧 연락드립니다.",
    });
  } catch (error) {
    log.error(
      "[inquiries] POST error:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "문의 접수에 실패했습니다." },
      { status: 500 },
    );
  }
}

// ── GET: 문의 목록 (브로커 소유자 전용) ──────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  try {
    const { spaceId } = await params;
    const supabase = createServiceClient();

    const access = await assertSpaceOwnership(supabase, spaceId, guard.user!.id, guard.role);
    if (!access.ok) return access.response;

    const { data: inquiries, error } = await supabase
      .from("leasing_inquiries")
      .select("id, status, source_channel, question_text, prospect, created_at, requirement")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false });

    if (error) {
      log.error("[inquiries] GET error:", error.message);
      return NextResponse.json({ error: "조회에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ inquiries: inquiries ?? [] });
  } catch (error) {
    log.error(
      "[inquiries] GET unexpected error:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
