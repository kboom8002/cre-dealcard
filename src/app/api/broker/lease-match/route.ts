/**
 * POST /api/broker/lease-match — 임대차 매물 - 임차의향서 매칭 수동 실행
 * Auth: Required (broker or admin) + Ownership verification
 */
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import {
  runLeaseMatchingEngine,
  type LeaseSpaceMatchInput,
  type TenantIntentMatchInput,
} from "@/domain/matching/lease-matching-engine";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("lease-match-route");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PersistedLeaseSchema = z.object({
  leaseSpaceId: z.string().min(1),
  tenantIntentId: z.string().min(1),
});

const InlineSpaceSchema = z.object({
  id:                 z.string().optional(),
  floor:              z.string().optional().default("1F"),
  area_sqm:           z.union([z.number(), z.string()]).nullable().optional(),
  space_type:         z.string().optional().default("office"),
  deposit:            z.union([z.number(), z.string()]).nullable().optional(),
  monthly_rent:       z.union([z.number(), z.string()]).nullable().optional(),
  maintenance_fee:    z.union([z.number(), z.string()]).nullable().optional(),
  available_from:     z.string().nullable().optional(),
  lease_term_months:  z.number().nullable().optional(),
  incentives:         z.any().optional(),
  restrictions:       z.array(z.string()).optional().default([]),
  area_signal:        z.string().optional().default("강남구"),
  fit_summary:        z.string().optional().default(""),
  caution_summary:    z.string().optional().default(""),
});

const InlineTenantSchema = z.object({
  id:                 z.string().optional(),
  business_type:      z.string().optional().default("IT"),
  preferred_regions:  z.array(z.string()).optional().default([]),
  area_min:           z.union([z.number(), z.string()]).nullable().optional(),
  area_max:           z.union([z.number(), z.string()]).nullable().optional(),
  budget_deposit_max: z.union([z.number(), z.string()]).nullable().optional(),
  budget_monthly_max: z.union([z.number(), z.string()]).nullable().optional(),
  preferred_floors:   z.array(z.string()).optional().default([]),
  move_in_target:     z.string().nullable().optional(),
  must_have:          z.array(z.string()).optional().default([]),
  nice_to_have:       z.array(z.string()).optional().default([]),
});

const InlineLeaseSchema = z.object({
  space:  InlineSpaceSchema,
  intent: InlineTenantSchema,
});

const MatchTriggerRequest = z.union([PersistedLeaseSchema, InlineLeaseSchema]);

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const userId = guard.user?.id || "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "인증이 필요합니다." }, { status: 401 });
  }
  const isAdmin = guard.role === "admin";

  try {
    const json = await req.json().catch(() => null);
    const parsed = MatchTriggerRequest.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "매칭 요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const input = parsed.data;

    let spaceInput: LeaseSpaceMatchInput;
    let intentInput: TenantIntentMatchInput;
    let spaceId = "space-1";
    let intentId = "intent-1";
    let shouldPersistMatch = false;
    let supabase: ReturnType<typeof createServiceClient> | null = null;

    if ("space" in input && "intent" in input) {
      const s = input.space;
      const i = input.intent;
      spaceId = s.id || "space-1";
      intentId = i.id || "intent-1";

      // If caller supplies UUIDs in inline mode, verify they cannot spoof another broker's persisted records
      if (UUID_RE.test(spaceId) || UUID_RE.test(intentId)) {
        supabase = createServiceClient();
        let verifiedOwnedSpace = false;
        let verifiedOwnedIntent = false;

        if (UUID_RE.test(spaceId) && supabase && typeof supabase.from === "function") {
          const { data: sRow } = await supabase
            .from("lease_spaces")
            .select("id, broker_id, building_id")
            .eq("id", spaceId)
            .maybeSingle();
          if (sRow) {
            let owns = isAdmin || (Boolean(sRow.broker_id) && sRow.broker_id === userId);
            if (!owns && sRow.building_id) {
              const bOwn = await assertBuildingOwner(supabase, String(sRow.building_id), userId, {
                allowAdmin: true,
                role: guard.role,
              });
              owns = bOwn.ok;
            }
            if (!owns) {
              return NextResponse.json(
                { ok: false, error: "이 임대 매물에 대한 권한이 없습니다.", code: "FORBIDDEN" },
                { status: 403 },
              );
            }
            verifiedOwnedSpace = true;
          }
        }

        if (UUID_RE.test(intentId) && supabase && typeof supabase.from === "function") {
          const { data: iRow } = await supabase
            .from("tenant_intent")
            .select("*")
            .eq("id", intentId)
            .maybeSingle();
          if (iRow) {
            const rowOwner = iRow.broker_id ?? (iRow as Record<string, unknown>).owner_id ?? null;
            if (!isAdmin && (!rowOwner || rowOwner !== userId)) {
              return NextResponse.json(
                { ok: false, error: "이 임차 의향서에 대한 권한이 없습니다.", code: "FORBIDDEN" },
                { status: 403 },
              );
            }
            verifiedOwnedIntent = true;
          }
        }

        shouldPersistMatch = verifiedOwnedSpace && verifiedOwnedIntent;
      }

      spaceInput = {
        id: spaceId,
        floor: s.floor,
        area_sqm: s.area_sqm ? Number(s.area_sqm) : 100,
        space_type: s.space_type as any,
        deposit: s.deposit ? Number(s.deposit) : 5000,
        monthly_rent: s.monthly_rent ? Number(s.monthly_rent) : 500,
        maintenance_fee: s.maintenance_fee ? Number(s.maintenance_fee) : 50,
        available_from: s.available_from ?? "2026-09-01",
        lease_term_months: s.lease_term_months ?? 24,
        incentives: s.incentives ?? null,
        restrictions: s.restrictions || [],
        area_signal: s.area_signal || "강남구",
        fit_summary: s.fit_summary || "",
        caution_summary: s.caution_summary || "",
      };

      intentInput = {
        id: intentId,
        business_type: i.business_type,
        preferred_regions: i.preferred_regions.length > 0 ? i.preferred_regions : ["강남구"],
        area_min: i.area_min ? Number(i.area_min) : null,
        area_max: i.area_max ? Number(i.area_max) : null,
        budget_deposit_max: i.budget_deposit_max ? Number(i.budget_deposit_max) : null,
        budget_monthly_max: i.budget_monthly_max ? Number(i.budget_monthly_max) : null,
        preferred_floors: i.preferred_floors || [],
        move_in_target: i.move_in_target ?? null,
        must_have: i.must_have || [],
        nice_to_have: i.nice_to_have || [],
      };
    } else {
      supabase = createServiceClient();
      spaceId = input.leaseSpaceId;
      intentId = input.tenantIntentId;

      // 1. Fetch space
      const { data: space, error: spaceErr } = await supabase
        .from("lease_spaces")
        .select(`
          *,
          building:building_id (
            id,
            owner_id,
            area_signal,
            fit_summary,
            caution_summary
          )
        `)
        .eq("id", spaceId)
        .maybeSingle();

      // 2. Fetch intent
      const { data: intent, error: intentErr } = await supabase
        .from("tenant_intent")
        .select("*")
        .eq("id", intentId)
        .maybeSingle();

      if (spaceErr || intentErr) {
        log.error("Failed to lookup lease_spaces or tenant_intent", { spaceErr, intentErr });
        return NextResponse.json({ ok: false, error: "권한을 확인하지 못했습니다." }, { status: 500 });
      }

      if (!space || !intent) {
        return NextResponse.json({ ok: false, error: "매물 또는 임차 요구조건을 찾을 수 없습니다." }, { status: 404 });
      }

      // 3. Enforce ownership BEFORE computing or upserting lease_match_results
      let ownsSpace =
        isAdmin ||
        (Boolean(space.broker_id) && space.broker_id === userId) ||
        (Boolean(space.building?.owner_id) && space.building.owner_id === userId);
      if (!ownsSpace && space.building_id) {
        const bOwn = await assertBuildingOwner(supabase, String(space.building_id), userId, {
          allowAdmin: true,
          role: guard.role,
        });
        ownsSpace = bOwn.ok;
      }

      const intentOwnerId = intent.broker_id ?? intent.owner_id ?? null;
      const ownsIntent = isAdmin || (Boolean(intentOwnerId) && intentOwnerId === userId);

      const spaceAccessible = ownsSpace || space.is_marketplace_listed === true;
      const intentAccessible = ownsIntent || intent.visibility === "anonymous_matchable";

      if ((!ownsSpace && !ownsIntent) || !spaceAccessible || !intentAccessible) {
        return NextResponse.json(
          { ok: false, error: "이 임대 매물 또는 임차 의향서에 대한 권한이 없습니다.", code: "FORBIDDEN" },
          { status: 403 },
        );
      }

      shouldPersistMatch = true;

      spaceInput = {
        id: space.id || spaceId,
        floor: space.floor || "1F",
        area_sqm: space.area_sqm ? parseFloat(space.area_sqm) : 100,
        space_type: space.space_type || "office",
        deposit: space.deposit ? parseFloat(space.deposit) : 5000,
        monthly_rent: space.monthly_rent ? parseFloat(space.monthly_rent) : 500,
        maintenance_fee: space.maintenance_fee ? parseFloat(space.maintenance_fee) : 50,
        available_from: space.available_from || "2026-09-01",
        lease_term_months: space.lease_term_months || 24,
        incentives: space.incentives || null,
        restrictions: space.restrictions || [],
        area_signal: space.building?.area_signal || "서울",
        fit_summary: space.building?.fit_summary || "",
        caution_summary: space.building?.caution_summary || "",
      };

      intentInput = {
        id: intent.id || intentId,
        business_type: intent.business_type || "IT",
        preferred_regions: intent.preferred_regions || ["서울"],
        area_min: intent.area_min ? parseFloat(intent.area_min) : null,
        area_max: intent.area_max ? parseFloat(intent.area_max) : null,
        budget_deposit_max: intent.budget_deposit_max ? parseFloat(intent.budget_deposit_max) : null,
        budget_monthly_max: intent.budget_monthly_max ? parseFloat(intent.budget_monthly_max) : null,
        preferred_floors: intent.preferred_floors || [],
        move_in_target: intent.move_in_target,
        must_have: intent.must_have || [],
        nice_to_have: intent.nice_to_have || [],
      };
    }

    // 4. Compute match
    const result = await runLeaseMatchingEngine({
      space: spaceInput,
      intent: intentInput,
    });

    // 5. Upsert result only when persisted entities and ownership were verified
    if (shouldPersistMatch && supabase && result.stage1Passed && result.grade !== "C") {
      try {
        await supabase
          .from("lease_match_results")
          .upsert({
            lease_space_id: spaceId,
            tenant_intent_id: intentId,
            grade: result.grade,
            score: result.score,
            reasoning: result.reasoning,
          });
      } catch {
        // Non-blocking in mock environments
      }
    }

    return NextResponse.json({
      ok: true,
      grade: result.grade,
      score: result.score,
      stage1Passed: result.stage1Passed,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "매칭 요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    log.error("Match Trigger Error:", error);
    return NextResponse.json({ error: "임대 매칭 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
