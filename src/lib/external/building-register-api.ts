// src/lib/external/building-register-api.ts
// 국토교통부 건축물대장 API — 연면적, 대지면적, 층수, 구조, 승인일 조회
// API 키 없거나 요청 실패 시 null 반환 (graceful degradation)
import { fetchWithRetry } from './fetch-with-retry';
import { createModuleLogger } from '@/lib/logger';

const logger = createModuleLogger('building-register-api');

export interface BuildingRegisterData {
  totalArea: number;          // 연면적 (sqm)
  platArea: number;           // 대지면적 (sqm)
  useAprDay: string;          // 사용승인일 (YYYYMMDD)
  mainPurpose: string;        // 주용도
  structure: string;          // 구조
  floorsAbove: number;        // 지상층수
  floorsBelow: number;        // 지하층수
  bcRat: number;              // 건폐율 (%)
  vlRat: number;              // 용적률 (%)
  buildingName?: string;      // 건물명
  archArea?: number;          // 건축면적 (㎡)
  elevatorCount?: number;     // 승강기 수 (대)
  passengerElevatorCount?: number; // 승용 승강기 수
  emergencyElevatorCount?: number; // 비상용/화물 승강기 수
  parkingCount?: number;      // 주차 대수 (대)
  selfParkingCount?: number;  // 자주식 주차 대수
  mechanicalParkingCount?: number; // 기계식 주차 대수
  hasViolation?: boolean;     // 위반건축물 표시 여부
  heatMethod?: string;        // 난방 방식
  mainPnu?: string;           // 대표지번(표제부가 존재하는 필지) PNU — resolveMainLotPnu 결과 (프롬프트 제외 대상)
  attachedLots?: string[];    // 대표지번에 딸린 부속지번 PNU 목록 (getBrAtchJibunInfo)
  _isFallback?: boolean;
}

/** 0/NaN/Infinity 는 undefined (0을 사실처럼 노출하지 않는다 — Rule 37) */
function posOrUndef(n: number): number | undefined {
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * @param hintBuildingUse 딜카드에서 입력된 건물 용도 (선택). 다동 필지에서 올바른 동을 선택하는 데 사용.
 */
export async function fetchBuildingRegister(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string,
  hintBuildingUse?: string,
  platGbCd?: string
): Promise<BuildingRegisterData | null> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;

  if (apiKey && apiKey !== "") {
    // 두 엔드포인트 시도: HubService(신규) → v2(기존) fallback
    // numOfRows=30: 한 필지에 여러 동이 있을 수 있으므로 충분히 가져온다
    const endpoints = [
      `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?ServiceKey=${encodeURIComponent(apiKey)}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&platGbCd=${platGbCd || '0'}&bun=${bun}&ji=${ji}&numOfRows=30&pageNo=1&_type=json`,
      `https://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo?ServiceKey=${encodeURIComponent(apiKey)}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&numOfRows=30&pageNo=1&_type=json`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetchWithRetry(url, { timeoutMs: 15_000, maxRetries: 1 });
        if (!res.ok) continue;
        const data = await res.json();

        const item = data?.response?.body?.items?.item;
        const items = Array.isArray(item) ? item : item ? [item] : [];
        const validItems = items.filter((it: Record<string, unknown>) => it && parseFloat(String(it.totArea || "0")) > 0);
        if (validItems.length === 0) continue;

        // 다동 필지에서 올바른 동 선택 (D17 QA-SANITY-03 해소)
        // ① hintBuildingUse와 mainPurpsCdNm이 일치하는 동 우선
        // ② 일치하는 동이 없으면 비주거 용도(공동주택·단독주택 제외) 중 연면적 최대 선택
        // ③ 그래도 없으면 연면적 최대 선택
        const RESIDENTIAL_USES = ['공동주택', '단독주택', '아파트', '연립주택', '다세대주택', '다가구주택'];
        
        // 주건축물 우선 필터링
        const primaryBuildings = validItems.filter((it: Record<string, unknown>) =>
          String(it.mainAtchGbCd || '') === '0' || String(it.mainAtchGbCdNm || '') === '주건축물'
        );
        const selectionPool = primaryBuildings.length > 0 ? primaryBuildings : validItems;
        let targetItem = selectionPool[0];

        if (selectionPool.length > 1) {
          // 1단계: hint 용도와 매칭
          if (hintBuildingUse) {
            const hintMatched = selectionPool.filter((it: Record<string, unknown>) =>
              String(it.mainPurpsCdNm || "").includes(hintBuildingUse) ||
              hintBuildingUse.includes(String(it.mainPurpsCdNm || ""))
            );
            if (hintMatched.length > 0) {
              targetItem = hintMatched.reduce((a: Record<string, unknown>, b: Record<string, unknown>) =>
                parseFloat(String(a.totArea || "0")) >= parseFloat(String(b.totArea || "0")) ? a : b
              );
            } else {
              // 2단계: 비주거 용도 중 연면적 최대
              const nonResidential = selectionPool.filter((it: Record<string, unknown>) =>
                !RESIDENTIAL_USES.includes(String(it.mainPurpsCdNm || ""))
              );
              const pool = nonResidential.length > 0 ? nonResidential : selectionPool;
              targetItem = pool.reduce((a: Record<string, unknown>, b: Record<string, unknown>) =>
                parseFloat(String(a.totArea || "0")) >= parseFloat(String(b.totArea || "0")) ? a : b
              );
            }
          } else {
            // hint 없으면: 비주거 중 연면적 최대 → 전체 연면적 최대
            const nonResidential = selectionPool.filter((it: Record<string, unknown>) =>
              !RESIDENTIAL_USES.includes(String(it.mainPurpsCdNm || ""))
            );
            const pool = nonResidential.length > 0 ? nonResidential : selectionPool;
            targetItem = pool.reduce((a: Record<string, unknown>, b: Record<string, unknown>) =>
              parseFloat(String(a.totArea || "0")) >= parseFloat(String(b.totArea || "0")) ? a : b
            );
          }
          logger.info(`${selectionPool.length}동 중 "${String(targetItem.mainPurpsCdNm)}" (${String(targetItem.totArea)}㎡) 선택`);
        }

        // 대지면적 폴백: 선택 동에 0이면 다른 동에서 승계
        let platArea = parseFloat(String(targetItem.platArea || '0'));
        if (platArea === 0) {
          const donor = validItems.find((it: Record<string, unknown>) => parseFloat(String(it.platArea || '0')) > 0);
          if (donor) platArea = parseFloat(String(donor.platArea || '0'));
        }

        // 표제부 부가 제원 (0/NaN → undefined: 0을 사실처럼 내보내지 않는다)
        const archArea = posOrUndef(parseFloat(String(targetItem.archArea || "0")));
        const rideElvt = parseInt(String(targetItem.rideUseElvtCnt || "0"), 10) || 0;
        const emgenElvt = parseInt(String(targetItem.emgenUseElvtCnt || "0"), 10) || 0;
        const selfParking = (parseInt(String(targetItem.indrAutoUtcnt || "0"), 10) || 0) + (parseInt(String(targetItem.oudrAutoUtcnt || "0"), 10) || 0);
        const mechParking = (parseInt(String(targetItem.indrMechUtcnt || "0"), 10) || 0) + (parseInt(String(targetItem.oudrMechUtcnt || "0"), 10) || 0);

        return {
          totalArea: parseFloat(String(targetItem.totArea || "0")),
          platArea: platArea,
          useAprDay: targetItem.useAprDay ? String(targetItem.useAprDay) : '',
          mainPurpose: targetItem.mainPurpsCdNm ? String(targetItem.mainPurpsCdNm) : '[용도 미기재]',
          structure: targetItem.strctCdNm ? String(targetItem.strctCdNm) : '[구조 미기재]',
          floorsAbove: parseInt(String(targetItem.grndFlrCnt || "0"), 10),
          floorsBelow: parseInt(String(targetItem.ugrndFlrCnt || "0"), 10),
          bcRat: parseFloat(String(targetItem.bcRat || "0")),
          vlRat: parseFloat(String(targetItem.vlRat || "0")),
          buildingName: String(targetItem.bldNm || ""),
          ...(archArea !== undefined ? { archArea } : {}),
          ...(rideElvt + emgenElvt > 0
            ? { elevatorCount: rideElvt + emgenElvt, ...(rideElvt > 0 ? { passengerElevatorCount: rideElvt } : {}), ...(emgenElvt > 0 ? { emergencyElevatorCount: emgenElvt } : {}) }
            : {}),
          ...(selfParking + mechParking > 0
            ? { parkingCount: selfParking + mechParking, ...(selfParking > 0 ? { selfParkingCount: selfParking } : {}), ...(mechParking > 0 ? { mechanicalParkingCount: mechParking } : {}) }
            : {}),
        };
      } catch (err) {
        logger.warn("endpoint failed, trying next:", err);
      }
    }
  }

  return null;
}

/**
 * 부속지번 조회 (getBrAtchJibunInfo) — 대표지번(표제부가 있는 필지)의 PNU 로 호출하면 딸린 필지 목록을 준다.
 * 부속지번 PNU 로 호출하면 0건이므로 역방향(부속→대표) 조회는 불가하다 (실측: p5 134/125-2 → total=0).
 * @returns 19자리 PNU 배열. 키 없음/실패/0건이면 빈 배열 (호출부는 '없음'으로만 취급, 날조 금지)
 */
export async function fetchBuildingAttachedLots(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string,
  platGbCd?: string
): Promise<string[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) return [];
  const url = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrAtchJibunInfo?ServiceKey=${encodeURIComponent(apiKey)}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&platGbCd=${platGbCd || '0'}&bun=${bun}&ji=${ji}&numOfRows=50&pageNo=1&_type=json`;
  try {
    const res = await fetchWithRetry(url, { timeoutMs: 15_000, maxRetries: 1 });
    if (!res.ok) return [];
    const data = await res.json();
    const item = data?.response?.body?.items?.item;
    const items: Record<string, unknown>[] = Array.isArray(item) ? item : item ? [item] : [];
    const out: string[] = [];
    for (const it of items) {
      const sgg = String(it.atchSigunguCd || '');
      const bjd = String(it.atchBjdongCd || '');
      const atchBun = String(it.atchBun || '').padStart(4, '0');
      const atchJi = String(it.atchJi || '').padStart(4, '0');
      if (sgg.length !== 5 || bjd.length !== 5 || !/^\d{4}$/.test(atchBun) || !/^\d{4}$/.test(atchJi)) continue;
      // 건축HUB 대지구분(0:대지, 1:산, 2:블록) → PNU 대지구분(1:일반, 2:산)
      const pnu = `${sgg}${bjd}${String(it.atchPlatGbCd) === '1' ? '2' : '1'}${atchBun}${atchJi}`;
      if (!out.includes(pnu)) out.push(pnu);
    }
    return out;
  } catch (err) {
    logger.warn("attached-lots lookup failed", err);
    return [];
  }
}

export interface BuildingRecapData {
  archArea: number;           // 건축면적 (㎡)
  rideUseElvtCnt: number;     // 승용 승강기 수
  emgenUseElvtCnt: number;    // 비상용 승강기 수
  indrAutoUtcnt: number;      // 옥내 기계식 주차 대수
  oudrAutoUtcnt: number;      // 옥외 주차 대수
  indrMechUtcnt: number;      // 옥내 자주식 주차 대수
  heatMethodNm: string;       // 난방 방식
  _isFallback?: boolean;
}

export async function fetchBuildingRecap(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string
): Promise<BuildingRecapData | null> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;

  if (apiKey && apiKey !== "") {
    const endpoints = [
      `https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo?ServiceKey=${encodeURIComponent(apiKey)}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&platGbCd=0&bun=${bun}&ji=${ji}&numOfRows=1&pageNo=1&_type=json`,
      `https://apis.data.go.kr/1613000/BldRgstService_v2/getBrRecapTitleInfo?ServiceKey=${encodeURIComponent(apiKey)}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&numOfRows=1&pageNo=1&_type=json`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetchWithRetry(url, { timeoutMs: 15_000, maxRetries: 1 });
        if (!res.ok) continue;
        const data = await res.json();

        const item = data?.response?.body?.items?.item;
        const row = Array.isArray(item) ? item[0] : item;

        if (row && row.archArea) {
          return {
            archArea: parseFloat(row.archArea || "0"),
            rideUseElvtCnt: parseInt(row.rideUseElvtCnt || "0", 10),
            emgenUseElvtCnt: parseInt(row.emgenUseElvtCnt || "0", 10),
            indrAutoUtcnt: parseInt(row.indrAutoUtcnt || "0", 10),
            oudrAutoUtcnt: parseInt(row.oudrAutoUtcnt || "0", 10),
            indrMechUtcnt: parseInt(row.indrMechUtcnt || "0", 10),
            heatMethodNm: String(row.heatMthdCdNm || ""),
          };
        }
      } catch (err) {
        logger.warn("Recap endpoint failed, trying next", { err });
      }
    }
  }

  return null;
}
