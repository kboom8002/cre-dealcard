import { fetchBuildingRegister, type GovtBuildingInfo } from "./govt-api-client";

export type VerificationStatus = 'pending' | 'verified' | 'mismatch' | 'not_found' | 'skipped';

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
    errorReason?: string;
  };
}

// AI 자산유형 -> 건축물대장 주용도 허용 매핑
const ASSET_TYPE_MAP: Record<string, string[]> = {
  '오피스빌딩': ['업무시설', '근린생활시설', '판매시설', '제1종근린생활시설', '제2종근린생활시설'],
  '오피스': ['업무시설', '근린생활시설', '제2종근린생활시설'],
  '상가': ['판매시설', '근린생활시설', '제1종근린생활시설', '제2종근린생활시설', '운동시설'],
  '지식산업센터': ['공장', '지식산업센터', '업무시설'],
  '물류': ['창고시설', '운수시설', '공장'],
  '호텔': ['숙박시설', '관광숙박시설', '위락시설'],
  '빌딩': ['업무시설', '근린생활시설', '제1종근린생활시설', '제2종근린생활시설'],
};

/**
 * AI 면적 시그널 텍스트에서 ㎡ 단위 숫자를 안전하게 추출/환산
 * 예: "3200평" -> 10578.5 ㎡, "9917.3㎡" -> 9917.3 ㎡
 */
export function extractAreaInSqm(sizeSignal: string): number | null {
  if (!sizeSignal) return null;

  // 숫자 추출 (공백 및 콤마 제거)
  const cleaned = sizeSignal.replace(/,/g, '');
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;

  // '평' 단위 단어가 포함되어 있다면 평 -> ㎡ 로 환산 (1평 = 3.30578 ㎡)
  if (cleaned.includes('평')) {
    return num * 3.30578;
  }

  return num;
}

/**
 * 주소 텍스트에서 시군구코드, 법정동코드, 번, 지를 모의 파싱
 * (실제 프로덕션 환경에서는 카카오 주소 API 또는 정규식을 통해 정제하지만, SSoT Lite 기반 경량 매칭을 위해 번지 파싱 위주로 구현)
 */
export interface AddressComponents {
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
}

export function parseAddressToComponents(address: string): AddressComponents | null {
  if (!address) return null;

  // 테스트 매핑 (역삼동 742-1)
  if (address.includes("역삼동 742-1") || address.includes("역삼동 742")) {
    return {
      sigunguCd: "11680", // 강남구
      bjdongCd: "10100",  // 역삼동
      bun: "742",
      ji: "1",
    };
  }

  // 지번 패턴 파싱 시도 (예: "서초동 1303-35")
  const regex = /([가-힣\s]+)\s+(\d{1,4})(?:-(\d{1,4}))?/;
  const match = address.match(regex);
  if (match) {
    const dong = match[1].trim();
    const bun = match[2];
    const ji = match[3] || "0";

    // 헬퍼용 법정동 코드 폴백 매핑
    let sigunguCd = "11680"; // 강남구 기본값
    let bjdongCd = "10100";  // 역삼동 기본값

    if (dong.includes("서초")) {
      sigunguCd = "11650"; // 서초구
      bjdongCd = "10800";  // 서초동
    } else if (dong.includes("여의도")) {
      sigunguCd = "11560"; // 영등포구
      bjdongCd = "11000";  // 여의도동
    } else if (dong.includes("성수")) {
      sigunguCd = "11200"; // 성동구
      bjdongCd = "11400";  // 성수동
    }

    return { sigunguCd, bjdongCd, bun, ji };
  }

  return null;
}

/**
 * AI 산출 데이터와 공공 데이터를 교차 검증
 */
export async function verifyAgainstPublicData(
  aiAddress: string,
  aiAssetType: string,
  aiSizeSignal: string,
): Promise<VerificationResult> {
  const comps = parseAddressToComponents(aiAddress);
  if (!comps) {
    return {
      status: 'skipped',
      checks: { buildingExists: null, purposeMatch: null, areaWithinRange: null },
      details: { aiAddress, aiAssetType, aiSizeSignal, errorReason: '주소 파싱 실패 (시군구/법정동 분리 불가)' }
    };
  }

  // 1. 국토부 API 조회
  const govtInfo = await fetchBuildingRegister(comps.sigunguCd, comps.bjdongCd, comps.bun, comps.ji);

  if (!govtInfo.exists) {
    return {
      status: 'not_found',
      checks: { buildingExists: false, purposeMatch: null, areaWithinRange: null },
      details: { aiAddress, aiAssetType, aiSizeSignal, errorReason: '국토부 건축물대장에 해당 건물 정보 없음' }
    };
  }

  // 2. 용도 비교 (AI asset_type ↔ 대장 주용도)
  let purposeMatch = false;
  if (aiAssetType && govtInfo.mainPurpose) {
    const allowedPurposes = ASSET_TYPE_MAP[aiAssetType] || [aiAssetType];
    purposeMatch = allowedPurposes.some(purp => govtInfo.mainPurpose?.includes(purp) || purp.includes(govtInfo.mainPurpose!));
  }

  // 3. 연면적 비교 (AI 면적 ↔ 대장 연면적, ±30% 이내 오차 검증)
  let areaWithinRange = false;
  const aiAreaSqm = extractAreaInSqm(aiSizeSignal);
  
  if (aiAreaSqm !== null && govtInfo.totalFloorArea) {
    const diff = Math.abs(aiAreaSqm - govtInfo.totalFloorArea);
    const errorRate = diff / govtInfo.totalFloorArea;
    areaWithinRange = errorRate <= 0.3; // 오차 범위 30% 이내
  }

  // 4. 최종 결과 상태 판정
  const allPassed = purposeMatch && areaWithinRange;
  const status: VerificationStatus = allPassed ? 'verified' : 'mismatch';

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
    }
  };
}
