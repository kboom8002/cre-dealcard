import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAddress, splitMultiParcelAddress } from "@/lib/external/address-resolver";
import { fetchBuildingRegister } from "@/lib/external/building-register-api";
import { fetchLandUsePlan } from "@/lib/external/land-use-api";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("buildings-lookup");

function formatUseAprDay(raw?: string | number | null): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (/^\d{8}$/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  if (/^\d{4}$/.test(str)) {
    return `${str}-01-01`;
  }
  return str || null;
}

export async function GET(req: NextRequest) {
  try {
    const rawAddress = req.nextUrl.searchParams.get("address")?.trim() || "";
    if (!rawAddress) {
      return NextResponse.json(
        { ok: false, error: "INVALID_INPUT", message: "주소를 입력해 주세요." },
        { status: 400 }
      );
    }

    const { primaryAddress } = splitMultiParcelAddress(rawAddress);
    const searchTarget = primaryAddress || rawAddress;

    // 1. Resolve address & check Supabase building_ssot_lite in parallel
    const supabase = createServiceClient();
    const [resolvedResult, ssotResult] = await Promise.allSettled([
      resolveAddress(rawAddress),
      supabase
        .from("building_ssot_lite")
        .select("id, pnu, raw_address, raw_input, ssot_summary, layers")
        .or(`raw_address.ilike.%${searchTarget}%,raw_input.ilike.%${searchTarget}%`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const resolved = resolvedResult.status === "fulfilled" ? resolvedResult.value : null;
    let ssotRow: Record<string, any> | null =
      ssotResult.status === "fulfilled" && ssotResult.value?.data
        ? ssotResult.value.data
        : null;

    if (!ssotRow && resolved?.pnu && resolved.pnu.length === 19) {
      try {
        const { data: pnuRow } = await supabase
          .from("building_ssot_lite")
          .select("id, pnu, raw_address, raw_input, ssot_summary, layers")
          .eq("pnu", resolved.pnu)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pnuRow) ssotRow = pnuRow;
      } catch {
        // ignore
      }
    }

    // 2. Fetch public building register & land use plan if address resolved
    let bldReg: Awaited<ReturnType<typeof fetchBuildingRegister>> = null;
    let landUse: Awaited<ReturnType<typeof fetchLandUsePlan>> = null;

    if (resolved?.sigunguCd && resolved?.bjdongCd && resolved?.bun) {
      const [regRes, landRes] = await Promise.allSettled([
        fetchBuildingRegister(
          resolved.sigunguCd,
          resolved.bjdongCd,
          resolved.bun,
          resolved.ji || "0000"
        ),
        resolved.pnu && resolved.pnu.length === 19
          ? fetchLandUsePlan(resolved.pnu)
          : Promise.resolve(null),
      ]);
      bldReg = regRes.status === "fulfilled" ? regRes.value : null;
      landUse = landRes.status === "fulfilled" ? landRes.value : null;
    }

    // 3. Extract from ssotRow fallback if needed
    const ssotSummary = (ssotRow?.ssot_summary || {}) as Record<string, any>;
    const ssotLayers = (ssotRow?.layers || {}) as Record<string, any>;
    const ssotBldReg = (ssotLayers?.building_register || {}) as Record<string, any>;
    const ssotLandUse = (ssotLayers?.land_use_plan || {}) as Record<string, any>;

    const gfaSqm =
      (bldReg?.totalArea && bldReg.totalArea > 0 ? bldReg.totalArea : null) ??
      (Number(ssotSummary.total_area_sqm || ssotBldReg.totalArea || ssotBldReg.totArea || 0) || null);

    const landAreaSqm =
      (bldReg?.platArea && bldReg.platArea > 0 ? bldReg.platArea : null) ??
      (landUse?.landArea && landUse.landArea > 0 ? landUse.landArea : null) ??
      (Number(ssotSummary.land_area_sqm || ssotBldReg.platArea || ssotLandUse.landArea || 0) || null);

    const zoning =
      (landUse?.zoningDistrict && landUse.zoningDistrict.trim() ? landUse.zoningDistrict.trim() : null) ??
      (ssotSummary.zoning && String(ssotSummary.zoning).trim() ? String(ssotSummary.zoning).trim() : null) ??
      (ssotLandUse.zoningDistrict && String(ssotLandUse.zoningDistrict).trim() ? String(ssotLandUse.zoningDistrict).trim() : null);

    const rawUseAprDay =
      bldReg?.useAprDay ||
      ssotSummary.completion_date ||
      ssotSummary.build_year ||
      ssotBldReg.useAprDay ||
      null;
    const completionDate = formatUseAprDay(rawUseAprDay);

    const mainPurpose =
      bldReg?.mainPurpose ||
      ssotSummary.main_purpose ||
      ssotBldReg.mainPurpose ||
      null;

    const floorsAbove =
      bldReg?.floorsAbove ||
      Number(ssotSummary.floors_above || ssotBldReg.floorsAbove || 0) ||
      null;

    const floorsBelow =
      bldReg?.floorsBelow ||
      Number(ssotSummary.floors_below || ssotBldReg.floorsBelow || 0) ||
      null;

    const buildingName =
      bldReg?.buildingName ||
      ssotSummary.building_name ||
      ssotBldReg.buildingName ||
      null;

    if (!gfaSqm && !landAreaSqm && !zoning && !completionDate) {
      return NextResponse.json(
        {
          ok: false,
          error: "NOT_FOUND",
          message: "해당 주소의 공적장부 정보를 찾지 못했습니다.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      address: resolved?.jibunAddress || resolved?.roadAddress || ssotRow?.raw_address || rawAddress,
      pnu: resolved?.pnu || ssotRow?.pnu || null,
      grossFloorAreaSqm: gfaSqm ? Math.round(Number(gfaSqm) * 100) / 100 : null,
      gfaSqm: gfaSqm ? Math.round(Number(gfaSqm) * 100) / 100 : null,
      landAreaSqm: landAreaSqm ? Math.round(Number(landAreaSqm) * 100) / 100 : null,
      zoning: zoning || null,
      completionDate: completionDate || null,
      useAprDay: rawUseAprDay ? String(rawUseAprDay) : null,
      mainPurpose,
      floorsAbove,
      floorsBelow,
      buildingName,
    });
  } catch (err) {
    log.error({ err }, "[buildings/lookup] error:");
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: "공적장부 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
