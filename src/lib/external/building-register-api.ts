// src/lib/external/building-register-api.ts
// 국토교통부 건축물대장 API — 연면적, 대지면적, 층수, 구조, 승인일 조회
// API 키 없거나 요청 실패 시 null 반환 (graceful degradation)
import { fetchWithRetry } from './fetch-with-retry';
import { createModuleLogger } from '@/lib/logger';

const logger = createModuleLogger('building-register-api');

export interface BuildingRegisterFloor {
  flrGb: '지상' | '지하' | '옥탑';
  flrNo: number;
  flrNoNm: string;
  mainPurpose: string;
  etcPurpose?: string;
  areaSqm: number;
}

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
  platPlc?: string;           // 대지위치 (지번 주소)
  newPlatPlc?: string;        // 도로명대지위치
  floors?: BuildingRegisterFloor[]; // 층별개요 (getBrFlrOulnInfo)
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
 * 건축물대장 층별개요(`getBrFlrOulnInfo`) 응답 배열을 정규화합니다.
 */
export function parseBuildingRegisterFloors(
  rawItems: Array<Record<string, any>>,
  targetPk?: string | number,
): BuildingRegisterFloor[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];

  const mainItems = rawItems.filter(
    (it) =>
      it &&
      (String(it.mainAtchGbCd || '') === '0' ||
        String(it.mainAtchGbCdNm || '') === '주건축물' ||
        (!it.mainAtchGbCd && !it.mainAtchGbCdNm)),
  );
  let pool = mainItems.length > 0 ? mainItems : rawItems;

  if (targetPk !== undefined && targetPk !== null && String(targetPk).trim() !== '') {
    const pkFiltered = pool.filter(
      (it) => String(it?.mgmBldrgstPk || '').trim() === String(targetPk).trim(),
    );
    if (pkFiltered.length > 0) pool = pkFiltered;
  }

  const out: BuildingRegisterFloor[] = [];
  for (const it of pool) {
    if (!it) continue;
    const gbCd = String(it.flrGbCd || '').trim();
    const gbNm = String(it.flrGbCdNm || '').trim();
    let flrGb: '지상' | '지하' | '옥탑' = '지상';
    if (gbCd === '10' || gbNm === '지하') flrGb = '지하';
    else if (gbCd === '30' || gbNm === '옥탑') flrGb = '옥탑';

    const flrNo = parseInt(String(it.flrNo || '0'), 10) || 0;
    const flrNoNm = String(it.flrNoNm || (flrGb === '지하' ? `지하${flrNo}층` : `${flrNo}층`)).trim();
    const mainPurpose = String(it.mainPurpsCdNm || '').trim();
    const etcPurpose = it.etcPurps ? String(it.etcPurps).trim() : undefined;
    const areaSqm = parseFloat(String(it.area || '0')) || 0;

    if (!mainPurpose && !etcPurpose && areaSqm <= 0) continue;
    out.push({
      flrGb,
      flrNo,
      flrNoNm,
      mainPurpose,
      ...(etcPurpose ? { etcPurpose } : {}),
      areaSqm,
    });
  }

  return out;
}

/**
 * 건축물대장 층별개요(`getBrFlrOulnInfo`) API 조회 (4초 타임아웃, 실패 시 빈 배열 반환)
 */
export async function fetchBuildingFloors(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string,
  platGbCd?: string,
  targetPk?: string | number,
): Promise<BuildingRegisterFloor[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) return [];

  const url = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrFlrOulnInfo?ServiceKey=${encodeURIComponent(apiKey)}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&platGbCd=${platGbCd || '0'}&bun=${bun}&ji=${ji}&numOfRows=100&pageNo=1&_type=json`;
  try {
    const res = await fetchWithRetry(url, { timeoutMs: 4_000, maxRetries: 1 });
    if (!res.ok) return [];
    const data = await res.json();
    const item = data?.response?.body?.items?.item;
    const items = Array.isArray(item) ? item : item ? [item] : [];
    return parseBuildingRegisterFloors(items, targetPk);
  } catch (err) {
    logger.warn('getBrFlrOulnInfo lookup failed (graceful skip):', err);
    return [];
  }
}

/**
 * 건축물대장 층별 용도 또는 렌트롤 업종/상호 문자열을
 * 스태킹 다이어그램용 표준 건물용도 카테고리(`근린생활` / `업무` / `주거` / `판매` / `교육` / `숙박` / `산업/물류` / `의료` / `공용/주차`)로 정규화합니다.
 */
export function normalizeBuildingUseCategory(
  rawUse?: string | null,
  fallbackMainPurpose?: string | null,
): string {
  const raw = String(rawUse || '').trim();
  const fb = String(fallbackMainPurpose || '').trim();
  const combined = `${raw} ${fb}`.trim();

  if (!combined) return '근린생활';

  // 1) 공용 / 주차 / 설비
  if (/(주차장|기계실|전기실|발전실|보일러실|계단실|관리실|대피공간|펌프실|물탱크|공용)/.test(raw)) {
    return '공용/주차';
  }

  // 2) 명시적 제1·2종 근린생활시설 (또는 건축물대장 코드명 '사무소' — 제2종근생 사무소)
  if (/(제1종근린생활|제2종근린생활|1종근생|2종근생|근린생활시설|근린생활|근생)/.test(raw)) {
    return '근린생활';
  }
  if (raw === '사무소' && !/(업무시설|일반업무)/.test(fb)) {
    return '근린생활';
  }

  // 3) 대형 의료시설 vs 근생 의원/클리닉
  if (/(의료시설|종합병원|요양병원|정신병원|한방병원|치과병원|대학병원|의료원)/.test(raw)) {
    return '의료';
  }

  // 4) 근린생활 업종 (음식점, 카페, 의원, 약국, 학원, 체력단련장/헬스, 소매점 등)
  if (
    /(일반음식점|휴게음식점|음식점|소매점|소매|음식|카페|커피|스타벅스|투썸|이디야|베이커리|제과|식당|레스토랑|주점|와인바|와인|바$|호프|약국|의원|내과|치과|한의원|클리닉|피부과|안과|소아과|정형외과|성형외과|이비인후과|재활의학과|가정의학과|산부인과|비뇨기과|신경외과|마취통증|병원|학원|교습소|독서실|스터디|체력단련장|헬스|피트니스|필라테스|요가|골프|체육|당구|볼링|탁구|미용|헤어|네일|피부관리|마사지|세탁|편의점|마트|상가|점포|매장|안경|꽃집|서점|문구|노래|PC방|게임|사진관|부동산|중개)/.test(
      raw,
    )
  ) {
    return '근린생활';
  }

  // 건물 주용도가 근린생활시설인 경우 세무/회계/사무소 등도 제2종근린생활시설(사무소)로 귀속
  if (
    /(근린생활|근생)/.test(fb) &&
    /(사무소|사무실|세무|회계|법무|변호사|법률|노무|행정|설계|디자인|스튜디오|에이전시|컨설팅|오피스)/.test(raw)
  ) {
    return '근린생활';
  }

  // 5) 교육연구시설 / 교육기관
  if (/(교육연구시설|교육연구|교육기관|학교|대학교|대학|연구소|교육원|도서관|유치원|어린이집)/.test(raw)) {
    return '교육';
  }

  // 6) 판매시설
  if (/(판매시설|백화점|복합쇼핑몰|대형마트|시장|아울렛|쇼핑몰)/.test(raw)) {
    return '판매';
  }

  // 7) 숙박시설
  if (/(숙박시설|숙박|호텔|모텔|리조트|생활숙박|호스텔|여관|펜션)/.test(raw)) {
    return '숙박';
  }

  // 8) 주거시설
  if (/(공동주택|단독주택|다가구|다세대|연립주택|연립|아파트|주택|주거|기숙사)/.test(raw)) {
    return '주거';
  }

  // 9) 산업 / 물류 / 공장 / 창고
  if (/(창고시설|창고|공장|운수시설|지식산업센터|물류|산업|위험물저장|자동차관련)/.test(raw)) {
    return '산업/물류';
  }

  // 10) 업무시설 / 오피스
  if (
    /(업무시설|일반업무|업무|오피스텔|오피스|사옥|본사|기업|스타트업|법인|에이전시|법률사무소|회계법인|세무|컨설팅|설계사무소|스튜디오|금융|보험|은행|증권)/.test(
      raw,
    )
  ) {
    return '업무';
  }

  // 폴백: 건물 주용도(fallbackMainPurpose) 기준 분류
  if (fb && fb !== raw) {
    return normalizeBuildingUseCategory(fb, null);
  }

  return '근린생활';
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

        const platPlc = targetItem.platPlc ? String(targetItem.platPlc).trim() : undefined;
        const newPlatPlc = targetItem.newPlatPlc ? String(targetItem.newPlatPlc).trim() : undefined;
        const targetPk = targetItem.mgmBldrgstPk ? String(targetItem.mgmBldrgstPk).trim() : undefined;

        const floors = await fetchBuildingFloors(
          sigunguCd,
          bjdongCd,
          bun,
          ji,
          platGbCd,
          targetPk,
        ).catch(() => []);

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
          ...(platPlc ? { platPlc } : {}),
          ...(newPlatPlc ? { newPlatPlc } : {}),
          ...(floors.length > 0 ? { floors } : {}),
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
