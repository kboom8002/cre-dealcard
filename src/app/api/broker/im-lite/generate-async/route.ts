/**
 * POST /api/broker/im-lite/generate-async
 * 
 * IM 생성을 시작합니다.
 * - after()를 사용하여 즉시 jobId를 반환하고, 백그라운드에서 IM 생성 실행
 * - iOS Safari의 60~75s fetch 타임아웃 문제를 근본적으로 해결
 * - 클라이언트는 GET /api/broker/im-lite/job-status?jobId=xxx 로 폴링
 * - maxDuration=300 (Vercel Pro 플랜)
 */
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { randomUUID } from "node:crypto";
import type { MobileIMSupplementalInput } from "@/domain/building/mobile-im/types";
import { persistLeaseUnits, floorLeaseToPersistUnit } from "@/domain/building/mobile-im/lease-adapter";
import { parseSupplementalFromBody } from "@/domain/building/mobile-im/supplemental-whitelist";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export const maxDuration = 300; // Vercel Pro: 최대 300초

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  if (!user?.id) {
    return NextResponse.json({ error: "인증 정보가 유효하지 않습니다. 다시 로그인해주세요." }, { status: 401 });
  }

  let buildingId: string;
  let supplemental: MobileIMSupplementalInput;
  let skipApproval = false;
  let directData: Record<string, unknown> | null = null;
  let tier: 'basic' | 'pro' = 'basic';
  let hospitalitySpecInput: Record<string, any> | null = null;
  let loanStatusInput: string | null = null;
  let developmentSpecInput: Record<string, any> | null = null;
  let vacateSpecInput: Record<string, any> | null = null;
  let permitSpecInput: Record<string, any> | null = null;
  let occupancySpecInput: Record<string, any> | null = null;
  let sectionalSpecInput: Record<string, any> | null = null;
  let residentialSpecInput: Record<string, any> | null = null;
  let investmentPostureInput: string | null = null;
  let preset: string | undefined = undefined;
  let hasExplicitRentRollMeta = false;

  try {
    const body = await req.json();
    buildingId = body.building_id || body.buildingId;
    skipApproval = body.skip_approval === true || body.skipApproval === true;
    directData = body.direct_data ?? body.directData ?? null;
    tier = body.tier || 'basic';
    preset = body.preset || (tier === 'basic' ? 'credeal_basic' : undefined);
    // 화이트리스트·검증은 sync(generate) 라우트와 공유하는 단일 헬퍼 (drift 방지). 실패 시 400 + 한국어 메시지.
    const parsed = parseSupplementalFromBody(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    supplemental = parsed.supplemental;
    ({
      hospitalitySpecInput, loanStatusInput, developmentSpecInput, vacateSpecInput, permitSpecInput,
      occupancySpecInput, sectionalSpecInput, residentialSpecInput, investmentPostureInput, hasExplicitRentRollMeta,
    } = parsed.side);
    if (parsed.parcelWarnings.length > 0) log.warn('[generate-async] parcels 일부 필드 무시', { warnings: parsed.parcelWarnings });

    if (!buildingId) {
      return NextResponse.json({ error: "building_id is required" }, { status: 400 });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(buildingId)) {
      return NextResponse.json({ error: `유효하지 않은 building_id: ${buildingId}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Pro IM tier gate: D-grade rentroll blocks Pro generation
  const incomingGrade = (directData?.qualityGrade || (directData as any)?.grade) as string | undefined;
  if (tier === 'pro' && (incomingGrade === 'D' || incomingGrade === 'C')) {
    return NextResponse.json(
      { error: 'Pro IM은 B등급(완성도 60%) 이상의 데이터가 필요합니다.' },
      { status: 422 }
    );
  }

  // ── 작업 ID 생성 + DB 레코드 삽입 ──
  const jobId = `im_${buildingId}_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const supabase = createServiceClient();

  await supabase.from("im_generation_jobs").upsert({
    id: jobId,
    building_id: buildingId,
    user_id: user.id,
    status: "processing",
    input_payload: { supplemental, skipApproval, directData, tier, preset },
    created_at: new Date().toISOString(),
  });

  // ── after(): 응답 반환 후 백그라운드에서 IM 생성 실행 ──
  // iOS Safari 60~75s fetch 타임아웃 문제 해결 — 즉시 jobId 반환
  after(async () => {
    const bgSupabase = createServiceClient();
    try {
      const { generateMobileIMHandler } = await import("../generate/handler");
      const result = await generateMobileIMHandler({
        buildingId,
        userId: user!.id,
        supplemental,
        skipApproval,
        directData,
        tier,
        preset,
        identity: investmentPostureInput
          ? { investmentPosture: investmentPostureInput }
          : undefined,
      });

      if (result.ok) {
        await bgSupabase.from("im_generation_jobs").update({
          status: "completed",
          result: {
            im_lite_id: result.im_lite_id,
            url: result.url,
            readiness_score: result.readiness_score,
            ai_used: result.ai_used,
            sections_count: result.sections_count,
            external_data_loaded: result.external_data_loaded,
            message: result.message,
          },
          completed_at: new Date().toISOString(),
        }).eq("id", jobId);

        // ── Phase B: SSoT 역류 — 바텀시트 데이터를 building_ssot_lite에 영속화 ──
        try {
          if (Array.isArray(supplemental.floor_leases) && supplemental.floor_leases.length > 0) {
            // 바텀시트 필드명(manwon) → persistLeaseUnits 필드명(krw) 변환 (공용 매핑: lease-adapter.floorLeaseToPersistUnit)
            const mappedUnits = supplemental.floor_leases.filter(Boolean).map(floorLeaseToPersistUnit);
            // 메타(G9 면적 입력 단위 등)는 클라이언트가 명시적으로 보낸 경우에만 원장에 쓴다 —
            // 미전송(구 클라이언트) 시 기본값 'sqm' 으로 기존 'pyeong' 메타를 덮어쓰지 않기 위함.
            // handler 가 override.by/at 을 서버 값으로 채운 supplemental.rent_roll_meta 를 사용한다.
            await persistLeaseUnits(buildingId, mappedUnits, undefined, {
              meta: hasExplicitRentRollMeta ? supplemental.rent_roll_meta : undefined,
            });
          }

          const { data: existing } = await bgSupabase
            .from("building_ssot_lite")
            .select("layers, lease_summary")
            .eq("id", buildingId)
            .single();

          if (existing) {
            const existingLayers = (existing.layers ?? {}) as Record<string, any>;
            const existingLease = (existing.lease_summary ?? {}) as Record<string, any>;

            // layers 패치: 물류/운영/개발/사옥/주거/구분소유 팩슬롯, 사진, 브로커 하이라이트
            const layersPatch: Record<string, any> = { ...existingLayers };
            const packSlotsPatch: Record<string, any> = { ...(existingLayers.pack_slots ?? {}) };

            if (supplemental.floor_leases) layersPatch.rent_roll = supplemental.floor_leases;
            if (supplemental.logistics) {
              packSlotsPatch.PhysicalSpec = supplemental.logistics;
            }
            if (hospitalitySpecInput) {
              packSlotsPatch.HospitalitySpec = hospitalitySpecInput;
            }
            if (developmentSpecInput) {
              packSlotsPatch.DevelopmentPlan = developmentSpecInput;
            }
            if (vacateSpecInput) {
              packSlotsPatch.VacatePlan = vacateSpecInput;
            }
            if (permitSpecInput) {
              packSlotsPatch.PermitRisk = permitSpecInput;
            }
            if (occupancySpecInput) {
              packSlotsPatch.OccupancyPlan = occupancySpecInput;
            }
            if (sectionalSpecInput) {
              packSlotsPatch.SectionalSpec = sectionalSpecInput;
            }
            if (residentialSpecInput) {
              packSlotsPatch.ResidentialSpec = residentialSpecInput;
            }
            layersPatch.pack_slots = packSlotsPatch;

            if (supplemental.broker_highlight) layersPatch.broker_highlight = supplemental.broker_highlight;
            // D4: 중개인 입력 주차/승강기 대수 — layers.physical(대장 유래)과 분리 저장, 해석은 resolvePhysicalSpecs
            if (supplemental.parking_count != null || supplemental.elevator_count != null) {
              layersPatch.broker_inputs = {
                ...(existingLayers.broker_inputs ?? {}),
                ...(supplemental.parking_count != null ? { parking_count: supplemental.parking_count } : {}),
                ...(supplemental.elevator_count != null ? { elevator_count: supplemental.elevator_count } : {}),
              };
            }
            // D4: 중개인 추가 정보(구조화, handler에서 sanitize 완료본) — 비우고 재생성하면 stale 값도 제거
            if (supplemental.broker_extras) {
              layersPatch.broker_inputs = { ...(layersPatch.broker_inputs ?? existingLayers.broker_inputs ?? {}), extras: supplemental.broker_extras };
            } else if (existingLayers.broker_inputs?.extras) {
              const { extras: _staleExtras, ...restInputs } = layersPatch.broker_inputs ?? existingLayers.broker_inputs;
              layersPatch.broker_inputs = restInputs;
            }
            if (supplemental.photo_urls?.length) layersPatch.photos = supplemental.photo_urls;
            if (supplemental.resolved_address) {
              layersPatch.location = { ...(existingLayers.location ?? {}), address: supplemental.resolved_address };
            }
            if (supplemental.resolved_pnu) {
              layersPatch.location = { ...(layersPatch.location ?? existingLayers.location ?? {}), pnu: supplemental.resolved_pnu };
            }

            // lease_summary 패치
            const leasePatch: Record<string, any> = { ...existingLease };
            if (supplemental.monthly_rent_total_krw != null) leasePatch.monthly_rent_total_krw = supplemental.monthly_rent_total_krw;
            if (supplemental.total_deposit_manwon != null) leasePatch.total_deposit_manwon = supplemental.total_deposit_manwon;
            if (supplemental.mgmt_fee_total_manwon != null) leasePatch.mgmt_fee_total_manwon = supplemental.mgmt_fee_total_manwon;
            if (supplemental.loan_amount_manwon != null) leasePatch.loan_amount_manwon = supplemental.loan_amount_manwon;
            if (supplemental.asking_price_manwon != null) leasePatch.asking_price_manwon = supplemental.asking_price_manwon;
            if (supplemental.vacancy_pct != null) leasePatch.vacancy_pct = supplemental.vacancy_pct;
            if (loanStatusInput) leasePatch.loan_status = loanStatusInput;

            const updatePayload: Record<string, any> = {
              layers: layersPatch,
              lease_summary: leasePatch,
              updated_at: new Date().toISOString(),
            };
            if (investmentPostureInput) {
              // TODO: investment_posture does not exist on building_ssot_lite.
              // updatePayload.investment_posture = investmentPostureInput;
              
              // C-4: 포스처 변경 시 기존 생성물 무효화
              /*
              const previousPosture = existing.investment_posture;
              if (previousPosture && previousPosture !== investmentPostureInput) {
                await bgSupabase
                  .from('im_documents')
                  .update({ invalidated_at: new Date().toISOString() })
                  .eq('building_id', buildingId)
                  .is('invalidated_at', null);
                
                log.info(`[generate-async] Posture changed ${previousPosture} → ${investmentPostureInput}, invalidated existing IMs for ${buildingId}`);

                // S2-4: 포스처 결정 이력 기록
                const { error: pdErr } = await bgSupabase.from('posture_decisions').insert({
                  deal_id: buildingId,
                  proposed_posture: null,
                  proposed_confidence: null,
                  proposed_reason: null,
                  confirmed_posture: investmentPostureInput,
                  confirmed_by: user,
                  changed_from: previousPosture,
                });
                if (pdErr) log.warn('[generate-async] posture_decisions insert failed:', pdErr.message);
              }
              */
            }
            // 주소를 top-level raw_address 컬럼에도 역류 저장
            if (supplemental.resolved_address) {
              updatePayload.raw_address = supplemental.resolved_address;
            }

            await bgSupabase.from("building_ssot_lite").update(updatePayload).eq("id", buildingId);
          }
        } catch (writebackErr: any) {
          log.warn("[im-generate-async] SSoT writeback failed (non-blocking):", writebackErr?.message);
        }
      } else {
        await bgSupabase.from("im_generation_jobs").update({
          status: "failed",
          result: {
            error: result.error,
            score: result.score,
            threshold: result.threshold,
            missing: result.missing,
          },
          completed_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
    } catch (err: any) {
      log.error("[im-generate-async] Error:", err);
      await bgSupabase.from("im_generation_jobs").update({
        status: "failed",
        result: { error: err?.message ?? "Unknown error" },
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
  });

  // ── 즉시 jobId 반환 (< 1초 이내) ──
  // 클라이언트는 GET /api/broker/im-lite/job-status?jobId=xxx 로 폴링
  return NextResponse.json({
    jobId,
    status: "processing",
    result: null,
  });
}
