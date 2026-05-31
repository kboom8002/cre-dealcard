import { fetchBuildingRegister, type GovtBuildingInfo } from "./govt-api-client";
import {
  resolveAddressToComponents,
  type AddressComponents,
} from "./address-resolver";

export type VerificationStatus = "pending" | "verified" | "mismatch" | "not_found" | "skipped";

export interface VerificationResult {
  status: VerificationStatus;
  checks: {
    buildingExists: boolean | null;
    purposeMatch: boolean | null;    // AI asset_type ↔ 대장 주용도
    areaWithinRange: boolean | null; // AI 면적 ↔ 대장 연면적 (±30%)
  };
  details: {
    aiAddress?: string;
    aiAssetType?: string;
    aiSizeSignal?: string;
    govtAddress?: string;
    govtPurpose?: string;
    govtArea?: number;
    govtFloors?: number;
    govtBuildYear?: number;
    govtStructure?: string;
    govtCoverageRatio?: number;
    govtFloorAreaRatio?: number;
    errorReason?: string;
  };
  /** 도로명주소 API로 정규화된 주소 정보 */
  resolvedComponents?: AddressComponents | null;
}

// AI 자산유형 -> 건축물대장 주용도 허용 매핑
const ASSET_TYPE_MAP: Record<string, string[]> = {
  "오피스빌딩": ["업무시설", "근린생활시설", "판매시설", "제1종근린생활시설", "제2종근린생활시설"],
  "오피스": ["업무시설", "근린생활시설", "제2종근린생활시설"],
  "상가": ["판매시설", "근린생활시설", "제1종근린생활시설", "제2종근린생활시설", "운동시설"],
  "지식산업센터": ["공장", "지식산업센터", "업무시설"],
  "물류": ["창고시설", "운수시설", "공장"],
  "호텔": ["숙박시설", "관광숙박시설", "위락시설"],
  "빌딩": ["업무시설", "근린생활시설", "제1종근린생활시설", "제2종근린생활시설"],
  "근린생활시설": ["근린생활시설", "제1종근린생활시설", "제2종근린생활시설"],
};

/**
 * AI 면적 시그널 텍스트에서 ㎡ 단위 숫자를 안전하게 추출/환산
 * 예: "3200평" -> 10578.5 ㎡, "9917.3㎡" -> 9917.3 ㎡
 */
export function extractAreaInSqm(sizeSignal: string): number | null {
  if (!sizeSignal) return null;

  // 숫자 추출 (공백 및 콤마 제거)
  const cleaned = sizeSignal.replace(/,/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;

  // '평' 단위 단어가 포함되어 있다면 평 -> ㎡ 로 환산 (1평 = 3.30578 ㎡)
  if (cleaned.includes("평")) {
    return num * 3.30578;
  }

  return num;
}

/**
 * AI 산출 데이터와 공공 데이터를 교차 검증
 *
 * 1. 주소를 도로명주소 API로 정규화하여 시군구코드/법정동코드 획득
 * 2. 건축물대장 API로 건물 정보 조회
 * 3. AI 데이터와 교차 비교 (용도, 면적)
 */
export async function verifyAgainstPublicData(
  aiAddress: string,
  aiAssetType: string,
  aiSizeSignal: string,
): Promise<VerificationResult> {
  // 1. 주소 → 시군구코드/법정동코드/번/지 변환 (API 우선, 폴백 매핑 차선)
  const comps = await resolveAddressToComponents(aiAddress);

  if (!comps) {
    return {
      status: "skipped",
      checks: { buildingExists: null, purposeMatch: null, areaWithinRange: null },
      details: {
        aiAddress,
        aiAssetType,
        aiSizeSignal,
        errorReason: "주소 파싱 실패 (시군구/법정동 분리 불가)",
      },
      resolvedComponents: null,
    };
  }

  // 2. 국토부 건축물대장 API 조회
  const govtInfo = await fetchBuildingRegister(
    comps.sigunguCd,
    comps.bjdongCd,
    comps.bun,
    comps.ji,
  );

  if (!govtInfo.exists) {
    return {
      status: "not_found",
      checks: { buildingExists: false, purposeMatch: null, areaWithinRange: null },
      details: {
        aiAddress,
        aiAssetType,
        aiSizeSignal,
        errorReason: "국토부 건축물대장에 해당 건물 정보 없음",
      },
      resolvedComponents: comps,
    };
  }

  // 3. 용도 비교 (AI asset_type ↔ 대장 주용도)
  let purposeMatch = false;
  if (aiAssetType && govtInfo.mainPurpose) {
    const allowedPurposes = ASSET_TYPE_MAP[aiAssetType] || [aiAssetType];
    purposeMatch = allowedPurposes.some(
      (purp) =>
        govtInfo.mainPurpose?.includes(purp) || purp.includes(govtInfo.mainPurpose!),
    );
  }

  // 4. 연면적 비교 (AI 면적 ↔ 대장 연면적, ±30% 이내 오차 검증)
  let areaWithinRange = false;
  const aiAreaSqm = extractAreaInSqm(aiSizeSignal);

  if (aiAreaSqm !== null && govtInfo.totalFloorArea) {
    const diff = Math.abs(aiAreaSqm - govtInfo.totalFloorArea);
    const errorRate = diff / govtInfo.totalFloorArea;
    areaWithinRange = errorRate <= 0.3; // 오차 범위 30% 이내
  }

  // 5. 최종 결과 상태 판정
  const allPassed = purposeMatch && areaWithinRange;
  const status: VerificationStatus = allPassed ? "verified" : "mismatch";

  return {
    status,
    checks: {
      buildingExists: true,
      purposeMatch,
      areaWithinRange,
    },
    details: {
      aiAddress,
      aiAssetType,
      aiSizeSignal,
      govtAddress: govtInfo.address,
      govtPurpose: govtInfo.mainPurpose,
      govtArea: govtInfo.totalFloorArea,
      govtFloors: govtInfo.floors,
      govtBuildYear: govtInfo.buildYear,
      govtStructure: govtInfo.mainStructure,
      govtCoverageRatio: govtInfo.buildingCoverageRatio,
      govtFloorAreaRatio: govtInfo.floorAreaRatio,
    },
    resolvedComponents: comps,
  };
}
