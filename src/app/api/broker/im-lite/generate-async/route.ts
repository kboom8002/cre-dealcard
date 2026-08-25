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
import type { MobileIMSupplementalInput } from "@/domain/building/mobile-im/types";
import { persistLeaseUnits } from "@/domain/building/mobile-im/lease-adapter";

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

  try {
    const body = await req.json();
    buildingId = body.building_id || body.buildingId;
    skipApproval = body.skip_approval === true || body.skipApproval === true;
    directData = body.direct_data ?? body.directData ?? null;
    tier = body.tier || 'basic';
    supplemental = {
      monthly_rent_total_krw: body.monthly_rent_total_krw,
      vacancy_status: body.vacancy_status,
      vacancy_pct: body.vacancy_pct,
      resolved_address: body.resolved_address,
      resolved_pnu: body.resolved_pnu,
      photo_urls: body.photo_urls,
      photo_captions: body.photo_captions,
      photos_v2: body.photos_v2,
      broker_highlight: body.broker_highlight,
      estimated_yield_pct: body.estimated_yield_pct,
      total_deposit_manwon: body.total_deposit_manwon,
      mgmt_fee_total_manwon: body.mgmt_fee_total_manwon,
      loan_amount_manwon: body.loan_amount_manwon,
      asking_price_manwon: body.asking_price_manwon,
      floor_leases: body.floor_leases,
      logistics: body.logistics,
      monthly_revenue_manwon: body.monthly_revenue_manwon,
      hospitalitySpec: body.hospitalitySpec,
      developmentSpec: body.developmentSpec,
      vacateSpec: body.vacateSpec,
      permitSpec: body.permitSpec,
      occupancySpec: body.occupancySpec,
      sectionalSpec: body.sectionalSpec,
      residentialSpec: body.residentialSpec,
      manual_comps: body.manual_comps,
    };
    hospitalitySpecInput = body.hospitalitySpec ?? null;
    loanStatusInput = body.loan_status ?? null;
    developmentSpecInput = body.developmentSpec ?? null;
    vacateSpecInput = body.vacateSpec ?? null;
    permitSpecInput = body.permitSpec ?? null;
    occupancySpecInput = body.occupancySpec ?? null;
    sectionalSpecInput = body.sectionalSpec ?? null;
    residentialSpecInput = body.residentialSpec ?? null;
    investmentPostureInput = body.investment_posture ?? null;

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

  // ── 작업 ID 생성 + DB 레코드 삽입 ──
  const jobId = `im_${buildingId}_${Date.now()}`;
  const supabase = createServiceClient();

  await supabase.from("im_generation_jobs").upsert({
    id: jobId,
    building_id: buildingId,
    user_id: user.id,
    status: "processing",
    input_payload: { supplemental, skipApproval, directData, tier },
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
          if (supplemental.floor_leases && supplemental.floor_leases.length > 0) {
            // 바텀시트 필드명(manwon) → persistLeaseUnits 필드명(krw) 변환
            const mappedUnits = supplemental.floor_leases.map((fl: any) => ({
              floor: fl.floor,
              tenant_sector: fl.tenant_type || fl.tenant_sector || null,
              deposit_krw: fl.deposit_manwon ? Number(fl.deposit_manwon) * 10000 : (fl.deposit_krw || undefined),
              monthly_rent_krw: fl.rent_manwon ? Number(fl.rent_manwon) * 10000 : (fl.monthly_rent_krw || undefined),
              mgmt_fee_krw: fl.mgmt_fee_manwon ? Number(fl.mgmt_fee_manwon) * 10000 : (fl.mgmt_fee_krw || undefined),
              area_pyung: fl.area_pyung || undefined,
              lease_start: fl.lease_start || undefined,
              lease_end: fl.lease_end || undefined,
              source_tier: 'broker_input',
            }));
            await persistLeaseUnits(buildingId, mappedUnits);
          }

          const { data: existing } = await bgSupabase
            .from("building_ssot_lite")
            .select("layers, lease_summary, investment_posture")
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
              updatePayload.investment_posture = investmentPostureInput;
              
              // C-4: 포스처 변경 시 기존 생성물 무효화
              const previousPosture = existing.investment_posture;
              if (previousPosture && previousPosture !== investmentPostureInput) {
                await bgSupabase
                  .from('im_documents')
                  .update({ invalidated_at: new Date().toISOString() })
                  .eq('building_id', buildingId)
                  .is('invalidated_at', null);
                
                console.log(`[generate-async] Posture changed ${previousPosture} → ${investmentPostureInput}, invalidated existing IMs for ${buildingId}`);

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
                if (pdErr) console.warn('[generate-async] posture_decisions insert failed:', pdErr.message);
              }
            }
            // 주소를 top-level raw_address 컬럼에도 역류 저장
            if (supplemental.resolved_address) {
              updatePayload.raw_address = supplemental.resolved_address;
            }

            await bgSupabase.from("building_ssot_lite").update(updatePayload).eq("id", buildingId);
          }
        } catch (writebackErr: any) {
          console.warn("[im-generate-async] SSoT writeback failed (non-blocking):", writebackErr?.message);
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
      console.error("[im-generate-async] Error:", err);
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
