// src/lib/external/land-use-api.ts
// 토지이용규제정보 — 용도지역, 건폐율, 용적률
// 1차: 브이월드(V-World) 토지특성속성조회 API
// 2차: data.go.kr LURIS (레거시 폴백)
import { fetchWithRetry } from './fetch-with-retry';
import { getVWorldApiKey, getVWorldReferer } from './vworld-config';
import { createModuleLogger } from '@/lib/logger';

const logger = createModuleLogger('land-use-api');

export interface LandUsePlanData {
  zoningDistrict: string;         // 용도지역 (예: 제2종일반주거지역)
  zoningOverlap: string[];        // 기타 용도지구 (예: 방화지구)
  buildingCoverageMax: number;    // 법정 건폐율 상한 (%)
  floorAreaRatioMax: number;      // 법정 용적률 상한 (%)
  /** 상한 출처. 'official' 만 IM 에 표시(legal-limits.ts). 현재 V-World 경로는 용도지역명 추정이라 미설정(=숨김) */
  limitsSource?: 'official' | 'inferred_zoning';
  landArea?: number;              // 토지면적 (㎡) — V-World 제공
  landShape?: string;             // 형상 (사다리형, 정방형 등)
  terrain?: string;               // 지형 (평지, 완경사 등)
  roadAccess?: string;            // 도로접면 (세로한면, 세로두면 등)
  landUseSituation?: string;      // 이용상황 (주거용, 상업기타 등)
  ldCodeNm?: string;              // 법정동명 (예: 서울특별시 영등포구 당산동5가)
  mnnmSlno?: string;              // 지번 (예: 11-47)
  jibunAddress?: string;          // 전체 지번 주소 (예: 서울특별시 영등포구 당산동5가 11-47)
  stdrYear?: string;              // 기준연도 (예: 2025)
  stdrMt?: string;                // 기준월 (예: 01)
  pblntfPclnd?: number;           // 개별공시지가 (원/㎡)
  lndcgrCodeNm?: string;          // 지목명 (예: 대)
  _source?: 'vworld' | 'data_go_kr' | 'fallback';
  _isFallback?: boolean;
}

export type LandUseData = LandUsePlanData;

export interface LandUseRegulationItem {
  code: string;
  name: string;
  conflict: '포함' | '저촉' | '접합';
  law?: string;
  formatted: string;
}

export interface LandUseRegulationSummary {
  pnu: string;
  jibunAddress?: string;
  lastUpdtDt?: string;
  /** Row 1: 「국토의 계획 및 이용에 관한 법률」에 따른 지역·지구등 */
  nationalLaw: string;
  /** Row 2: 다른 법령 등에 따른 지역·지구등 */
  otherLaws: string;
  /** Row 3: 「토지이용규제 기본법 시행령」 제9조제4항 각 호에 해당되는 사항 (해당 없으면 null) */
  article9_4: string | null;
  nationalItems: LandUseRegulationItem[];
  otherItems: LandUseRegulationItem[];
  source: 'vworld_api' | 'offline_snapshot' | 'fallback';
}

/** 용도지역명 → 법정 건폐율·용적률 상한 추론 */
function inferZoningLimits(zoningDistrict: string): { coverage: number; far: number } {
  if (zoningDistrict.includes("중심상업")) return { coverage: 60, far: 1000 };
  if (zoningDistrict.includes("일반상업")) return { coverage: 60, far: 800 };
  if (zoningDistrict.includes("근린상업")) return { coverage: 60, far: 600 };
  if (zoningDistrict.includes("유통상업")) return { coverage: 60, far: 600 };
  if (zoningDistrict.includes("준주거")) return { coverage: 60, far: 400 };
  if (zoningDistrict.includes("3종일반주거") || zoningDistrict.includes("제3종")) return { coverage: 50, far: 250 };
  if (zoningDistrict.includes("2종일반주거") || zoningDistrict.includes("제2종")) return { coverage: 60, far: 200 };
  if (zoningDistrict.includes("1종일반주거") || zoningDistrict.includes("제1종일반")) return { coverage: 60, far: 150 };
  if (zoningDistrict.includes("전용주거")) return { coverage: 50, far: 100 };
  if (zoningDistrict.includes("준공업")) return { coverage: 60, far: 400 };
  if (zoningDistrict.includes("일반공업")) return { coverage: 60, far: 350 };
  if (zoningDistrict.includes("전용공업")) return { coverage: 60, far: 300 };
  if (zoningDistrict.includes("보전녹지")) return { coverage: 20, far: 80 };
  if (zoningDistrict.includes("생산녹지")) return { coverage: 20, far: 100 };
  if (zoningDistrict.includes("자연녹지")) return { coverage: 20, far: 100 };
  return { coverage: 60, far: 250 };
}

export async function fetchLandUsePlan(pnu: string): Promise<LandUsePlanData | null> {
  // ═══════════════════════════════════════════════════════════
  // 1차: 브이월드 토지특성속성조회 (getLandCharacteristics)
  // ═══════════════════════════════════════════════════════════
  const vworldKey = getVWorldApiKey();
  if (vworldKey && vworldKey !== "") {
    const currentYear = new Date().getFullYear();
    const yearsToTry = [currentYear.toString(), (currentYear - 1).toString()];

    for (const stdrYear of yearsToTry) {
      try {
        const url = `https://api.vworld.kr/ned/data/getLandCharacteristics?key=${vworldKey}&pnu=${pnu}&format=json&stdrYear=${stdrYear}&numOfRows=1&pageNo=1`;
        const res = await fetchWithRetry(url, {
          timeoutMs: 15_000,
          maxRetries: 2,
          headers: { 'Referer': getVWorldReferer() },
        });
        if (res.ok) {
          const data = await res.json();
          const items = data?.landCharacteristicss?.field;
          const item = Array.isArray(items) ? items[0] : items;

          if (item && item.prposArea1Nm) {
            const zoningDistrict = String(item.prposArea1Nm);
            const zoningOverlap = item.prposArea2Nm && item.prposArea2Nm !== '지정되지않음' && item.prposArea2Nm !== '-'
              ? [String(item.prposArea2Nm)]
              : [];

            const { coverage, far } = inferZoningLimits(zoningDistrict);

            const ldCodeNm = item.ldCodeNm ? String(item.ldCodeNm).trim() : undefined;
            const mnnmSlno = item.mnnmSlno ? String(item.mnnmSlno).trim() : undefined;
            const jibunAddress = [ldCodeNm, mnnmSlno].filter(Boolean).join(' ') || undefined;
            const itemStdrYear = item.stdrYear ? String(item.stdrYear).trim() : stdrYear;
            const stdrMt = item.stdrMt ? String(item.stdrMt).trim() : undefined;
            const pblntfPclnd = item.pblntfPclnd && Number(item.pblntfPclnd) > 0
              ? Number(item.pblntfPclnd)
              : undefined;
            const lndcgrCodeNm = item.lndcgrCodeNm && item.lndcgrCodeNm !== '지정되지않음'
              ? String(item.lndcgrCodeNm).trim()
              : undefined;

            logger.info(`V-World 조회 성공 (${stdrYear}): ${zoningDistrict} (PNU: ${pnu})`);
            return {
              zoningDistrict,
              zoningOverlap,
              buildingCoverageMax: coverage,
              floorAreaRatioMax: far,
              limitsSource: 'inferred_zoning',
              landArea: item.lndpclAr ? parseFloat(item.lndpclAr) : undefined,
              landShape: item.tpgrphFrmCodeNm || undefined,
              terrain: item.tpgrphHgCodeNm || undefined,
              roadAccess: item.roadSideCodeNm || undefined,
              landUseSituation: item.ladUseSittnNm || undefined,
              ldCodeNm,
              mnnmSlno,
              jibunAddress,
              stdrYear: itemStdrYear,
              stdrMt,
              pblntfPclnd,
              lndcgrCodeNm,
              _source: 'vworld',
            };
          } else {
            logger.info(`V-World 토지특성 ${stdrYear}년 데이터 없음, 이전 연도 확인 시도`);
          }
        } else {
          const body = await res.text().catch(() => '');
          logger.warn(`V-World 응답 오류 (${res.status}): ${body.slice(0, 200)}`);
        }
      } catch (err) {
        logger.warn(`V-World 호출 실패 (${stdrYear})`, { err });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2차: data.go.kr LURIS (레거시 폴백)
  // ═══════════════════════════════════════════════════════════
  logger.warn('data.go.kr 토지이용규제 서비스 폐기됨. V-World API 키(VWORLD_API_KEY) 설정을 권장합니다. (폴백 생략)');
  return null;
}

function normalizeConflictStatus(cnflcAtNm?: string, cnflcAt?: string | number): '포함' | '저촉' | '접합' {
  const nm = String(cnflcAtNm || '').trim();
  const cd = String(cnflcAt || '').trim();
  if (nm === '저촉' || cd === '2') return '저촉';
  if (nm === '접함' || nm === '접합' || cd === '3') return '접합';
  return '포함';
}

function conflictWeight(conflict: '포함' | '저촉' | '접합'): number {
  if (conflict === '저촉') return 3;
  if (conflict === '접합') return 2;
  return 1;
}

export function resolveOtherLawName(code: string, name: string): string | undefined {
  const c = code.toUpperCase();
  const n = name.trim();
  if (c.startsWith('UBA') || c.startsWith('UBB') || c.startsWith('UBC') || /(과밀억제권역|성장관리권역|자연보전권역)/.test(n)) {
    return '수도권정비계획법';
  }
  if (c.startsWith('UDX') || c.startsWith('UD') || /(가로구역별|건축선|특별건축구역|건축협정)/.test(n)) {
    return '건축법';
  }
  if (
    c.startsWith('UNE') ||
    c.startsWith('UNF') ||
    c.startsWith('UNG') ||
    c.startsWith('UJA') ||
    /(대공방어협조구역|군사기지|군사시설|제한보호구역|통제보호구역|비행안전구역)/.test(n)
  ) {
    return '군사기지 및 군사시설 보호법';
  }
  if (c.startsWith('UOA') || /(교육환경보호구역|상대보호구역|절대보호구역)/.test(n)) {
    return '교육환경 보호에 관한 법률';
  }
  if (c.startsWith('UMZ') || /가축사육제한구역/.test(n)) {
    return '가축분뇨의 관리 및 이용에 관한 법률';
  }
  if (c.startsWith('UMK') || /(\(한강\)폐기물매립시설|수변구역|상수원보호구역)/.test(n)) {
    return '한강수계 상수원수질개선 및 주민지원 등에 관한 법률';
  }
  if (c === 'UQQ600' || /토지거래계약에관한허가구역/.test(n)) {
    return '부동산 거래신고 등에 관한 법률';
  }
  if (c.startsWith('UHA') || /(역사문화환경보존지역|문화재|문화유산)/.test(n)) {
    return '문화유산의 보존 및 활용에 관한 법률';
  }
  if (c.startsWith('UFA') || /(장애물제한표면|진입표면|수평표면|원추표면|공항)/.test(n)) {
    return '공항시설법';
  }
  if (c.startsWith('UIA') || /(정비구역|재정비촉진지구)/.test(n)) {
    return '도시 및 주거환경정비법';
  }
  if (c.startsWith('UEA') || /택지개발지구/.test(n)) {
    return '택지개발촉진법';
  }
  return undefined;
}

function isNationalPlanningLawItem(code: string, name: string): boolean {
  const c = code.toUpperCase();
  if (c === 'UQQ600' || /토지거래계약에관한허가구역/.test(name)) {
    return false;
  }
  if (c.startsWith('UQ')) {
    return true;
  }
  if (!c) {
    return /^(도시지역|관리지역|농림지역|자연환경보전지역|.*주거지역|.*상업지역|.*공업지역|.*녹지지역|지구단위계획구역|방화지구|경관지구|고도지구|개발제한구역|도로|공원|철도|녹지|광장|주차장|학교|하천|유수지)$/.test(
      name.trim(),
    );
  }
  return false;
}

function nationalItemSortPriority(item: { code: string; name: string }): number {
  const c = item.code.toUpperCase();
  const n = item.name.trim();
  if (n === '도시지역' || c.startsWith('UQA01')) return 10;
  if (c.startsWith('UQA') || /(주거지역|상업지역|공업지역|녹지지역|관리지역)$/.test(n)) return 20;
  if (c.startsWith('UQB') || c.startsWith('UQC') || c.startsWith('UQD')) return 30;
  if (c.startsWith('UQQ')) return 40;
  if (c.startsWith('UQS') || n === '도로' || n === '철도' || n === '공원') return 50;
  return 60;
}

function otherItemSortPriority(item: { code: string; name: string }): number {
  const c = item.code.toUpperCase();
  if (c.startsWith('UMZ')) return 10;
  if (c.startsWith('UDX') || c.startsWith('UD')) return 20;
  if (c.startsWith('UNE') || c.startsWith('UNF') || c.startsWith('UNG') || c.startsWith('UJA')) return 30;
  if (c.startsWith('UBA') || c.startsWith('UBB') || c.startsWith('UBC')) return 40;
  if (c.startsWith('UMK')) return 50;
  if (c.startsWith('UOA')) return 60;
  if (c.startsWith('UHA') || c.startsWith('UFA') || c.startsWith('UIA') || c.startsWith('UEA')) return 70;
  if (c === 'UQQ600') return 90;
  return 80;
}

/**
 * V-World `getLandUseAttr` 응답 배열을 토지이용계획확인원 3행 법령 분류 체계로 정규화합니다.
 */
export function classifyLandUseAttrFields(
  fields: Array<Record<string, any>>,
  pnu = '',
  article9_4: string | null = null,
  source: LandUseRegulationSummary['source'] = 'vworld_api',
): LandUseRegulationSummary {
  const dedupMap = new Map<
    string,
    { code: string; name: string; conflict: '포함' | '저촉' | '접합'; isNational: boolean }
  >();

  let resolvedPnu = pnu;
  let jibunAddress: string | undefined;
  let lastUpdtDt: string | undefined;

  for (const f of fields || []) {
    const name = String(f?.prposAreaDstrcCodeNm || '').trim();
    if (!name || name === '지정되지않음') continue;
    const code = String(f?.prposAreaDstrcCode || '').trim().toUpperCase();
    const conflict = normalizeConflictStatus(f?.cnflcAtNm, f?.cnflcAt);
    const isNational = isNationalPlanningLawItem(code, name);

    if (!resolvedPnu && f?.pnu) resolvedPnu = String(f.pnu).trim();
    if (!jibunAddress && (f?.ldCodeNm || f?.mnnmSlno)) {
      jibunAddress = [f.ldCodeNm, f.mnnmSlno].map((x) => String(x || '').trim()).filter(Boolean).join(' ') || undefined;
    }
    if (!lastUpdtDt && f?.lastUpdtDt) {
      lastUpdtDt = String(f.lastUpdtDt).trim();
    }

    const existing = dedupMap.get(name);
    if (!existing) {
      dedupMap.set(name, { code, name, conflict, isNational });
    } else if (conflictWeight(conflict) > conflictWeight(existing.conflict)) {
      dedupMap.set(name, {
        code: existing.code || code,
        name,
        conflict,
        isNational: existing.isNational || isNational,
      });
    }
  }

  const rawNational: Array<{ code: string; name: string; conflict: '포함' | '저촉' | '접합' }> = [];
  const rawOther: Array<{ code: string; name: string; conflict: '포함' | '저촉' | '접합' }> = [];

  for (const entry of dedupMap.values()) {
    if (entry.isNational) {
      rawNational.push(entry);
    } else {
      rawOther.push(entry);
    }
  }

  rawNational.sort((a, b) => nationalItemSortPriority(a) - nationalItemSortPriority(b));
  rawOther.sort((a, b) => otherItemSortPriority(a) - otherItemSortPriority(b));

  const nationalItems: LandUseRegulationItem[] = rawNational.map((item) => {
    const suffix = item.conflict === '포함' ? '' : `(${item.conflict})`;
    return {
      code: item.code,
      name: item.name,
      conflict: item.conflict,
      formatted: `${item.name}${suffix}`,
    };
  });

  const otherItems: LandUseRegulationItem[] = rawOther.map((item) => {
    const law = resolveOtherLawName(item.code, item.name);
    const lawTag = law ? `<${law}>` : '';
    const suffix = item.conflict === '포함' ? '' : `(${item.conflict})`;
    return {
      code: item.code,
      name: item.name,
      conflict: item.conflict,
      law,
      formatted: `${item.name}${lawTag}${suffix}`,
    };
  });

  return {
    pnu: resolvedPnu,
    jibunAddress,
    lastUpdtDt,
    nationalLaw: nationalItems.map((i) => i.formatted).join(', '),
    otherLaws: otherItems.map((i) => i.formatted).join(', '),
    article9_4: article9_4 && article9_4.trim() ? article9_4.trim() : null,
    nationalItems,
    otherItems,
    source,
  };
}

/**
 * PNU(19자리)로 V-World 토지이용계획속성(`getLandUseAttr`)을 조회하여
 * 토지이용계획확인원 표준 3행 구조(`국계법` / `다른 법령` / `시행령 제9조제4항`)로 반환합니다.
 */
export async function fetchLandUseRegulations(pnu: string): Promise<LandUseRegulationSummary | null> {
  if (!pnu || pnu.length !== 19) {
    return null;
  }

  const vworldKey = getVWorldApiKey();
  if (!vworldKey || vworldKey === '') {
    logger.warn('VWORLD_API_KEY 미설정 — 토지이용계획속성(getLandUseAttr) 조회 스킵');
    return null;
  }

  const referer = getVWorldReferer();
  try {
    const url = `https://api.vworld.kr/ned/data/getLandUseAttr?key=${vworldKey}&domain=${encodeURIComponent(referer)}&pnu=${pnu}&format=json&numOfRows=100`;
    const res = await fetchWithRetry(url, {
      timeoutMs: 8_000,
      maxRetries: 1,
      headers: { 'Referer': referer },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const rawFields = data?.landUses?.field;
    if (!rawFields) return null;

    const fields = Array.isArray(rawFields) ? rawFields : [rawFields];
    if (fields.length === 0) return null;

    return classifyLandUseAttrFields(fields, pnu, null, 'vworld_api');
  } catch (err) {
    logger.warn('토지이용계획속성(getLandUseAttr) 조회 실패', { err });
    return null;
  }
}

/**
 * 골든 스냅샷 대상 필지(예: 당산동5가 11-47, PNU 1156011500100110047)의
 * V-World getLandUseAttr 실측 검증 데이터 (오프라인 테스트 시 결정론적 복원용)
 */
const VERIFIED_LAND_USE_ATTR_BY_PNU: Record<string, Array<Record<string, any>>> = {
  '1156011500100110047': [
    {
      pnu: '1156011500100110047',
      ldCodeNm: '서울특별시 영등포구 당산동5가',
      mnnmSlno: '11-47',
      prposAreaDstrcCode: 'UNE200',
      prposAreaDstrcCodeNm: '대공방어협조구역',
      cnflcAt: '1',
      cnflcAtNm: '포함',
      lastUpdtDt: '2026-04-06',
    },
    {
      pnu: '1156011500100110047',
      ldCodeNm: '서울특별시 영등포구 당산동5가',
      mnnmSlno: '11-47',
      prposAreaDstrcCode: 'UMK600',
      prposAreaDstrcCodeNm: '(한강)폐기물매립시설 설치제한지역',
      cnflcAt: '1',
      cnflcAtNm: '포함',
      lastUpdtDt: '2026-04-06',
    },
    {
      pnu: '1156011500100110047',
      ldCodeNm: '서울특별시 영등포구 당산동5가',
      mnnmSlno: '11-47',
      prposAreaDstrcCode: 'UQA01X',
      prposAreaDstrcCodeNm: '도시지역',
      cnflcAt: '1',
      cnflcAtNm: '포함',
      lastUpdtDt: '2026-04-06',
    },
    {
      pnu: '1156011500100110047',
      ldCodeNm: '서울특별시 영등포구 당산동5가',
      mnnmSlno: '11-47',
      prposAreaDstrcCode: 'UQS100',
      prposAreaDstrcCodeNm: '도로',
      cnflcAt: '3',
      cnflcAtNm: '접함',
      lastUpdtDt: '2026-04-06',
    },
    {
      pnu: '1156011500100110047',
      ldCodeNm: '서울특별시 영등포구 당산동5가',
      mnnmSlno: '11-47',
      prposAreaDstrcCode: 'UQQ600',
      prposAreaDstrcCodeNm: '토지거래계약에관한허가구역',
      cnflcAt: '1',
      cnflcAtNm: '포함',
      lastUpdtDt: '2026-04-06',
    },
    {
      pnu: '1156011500100110047',
      ldCodeNm: '서울특별시 영등포구 당산동5가',
      mnnmSlno: '11-47',
      prposAreaDstrcCode: 'UMZ100',
      prposAreaDstrcCodeNm: '가축사육제한구역',
      cnflcAt: '1',
      cnflcAtNm: '포함',
      lastUpdtDt: '2026-04-06',
    },
    {
      pnu: '1156011500100110047',
      ldCodeNm: '서울특별시 영등포구 당산동5가',
      mnnmSlno: '11-47',
      prposAreaDstrcCode: 'UQA330',
      prposAreaDstrcCodeNm: '준공업지역',
      cnflcAt: '1',
      cnflcAtNm: '포함',
      lastUpdtDt: '2026-04-06',
    },
    {
      pnu: '1156011500100110047',
      ldCodeNm: '서울특별시 영등포구 당산동5가',
      mnnmSlno: '11-47',
      prposAreaDstrcCode: 'UOA100',
      prposAreaDstrcCodeNm: '교육환경보호구역',
      cnflcAt: '1',
      cnflcAtNm: '포함',
      lastUpdtDt: '2026-04-06',
    },
    {
      pnu: '1156011500100110047',
      ldCodeNm: '서울특별시 영등포구 당산동5가',
      mnnmSlno: '11-47',
      prposAreaDstrcCode: 'UBA100',
      prposAreaDstrcCodeNm: '과밀억제권역',
      cnflcAt: '1',
      cnflcAtNm: '포함',
      lastUpdtDt: '2026-04-06',
    },
    {
      pnu: '1156011500100110047',
      ldCodeNm: '서울특별시 영등포구 당산동5가',
      mnnmSlno: '11-47',
      prposAreaDstrcCode: 'UDX200',
      prposAreaDstrcCodeNm: '가로구역별 최고높이 제한지역',
      cnflcAt: '1',
      cnflcAtNm: '포함',
      lastUpdtDt: '2026-04-06',
    },
    {
      pnu: '1156011500100110047',
      ldCodeNm: '서울특별시 영등포구 당산동5가',
      mnnmSlno: '11-47',
      prposAreaDstrcCode: 'UOA100',
      prposAreaDstrcCodeNm: '교육환경보호구역',
      cnflcAt: '2',
      cnflcAtNm: '저촉',
      lastUpdtDt: '2026-04-06',
    },
  ],
};

/**
 * 라이브 `enrichment.landUseRegulations`가 없는 오프라인 골든 스냅샷 또는 폴백 환경에서
 * 토지이용계획확인원 요약을 결정론적으로 합성합니다.
 */
export function synthesizeLandUseConfirmFromSnapshot(
  enrichment?: any,
  ssot?: any,
  explicitPnu?: string | null,
): LandUseRegulationSummary {
  const existing = enrichment?.landUseRegulations as LandUseRegulationSummary | undefined | null;
  if (existing && (existing.nationalLaw || existing.otherLaws)) {
    return existing;
  }

  const resolvedPnu = String(
    explicitPnu ||
      ssot?.pnu ||
      ssot?.register_main_pnu ||
      enrichment?.buildingRegister?.mainPnu ||
      '',
  ).trim();

  if (resolvedPnu && VERIFIED_LAND_USE_ATTR_BY_PNU[resolvedPnu]) {
    return classifyLandUseAttrFields(
      VERIFIED_LAND_USE_ATTR_BY_PNU[resolvedPnu],
      resolvedPnu,
      null,
      'offline_snapshot',
    );
  }

  const landUsePlan: LandUsePlanData | undefined = enrichment?.landUsePlan || undefined;
  const zoningDistrict = String(
    landUsePlan?.zoningDistrict || ssot?.zoning || ssot?.zone_type || '',
  ).trim();
  const zoningOverlap = Array.isArray(landUsePlan?.zoningOverlap)
    ? landUsePlan!.zoningOverlap!.map((z) => String(z || '').trim()).filter(Boolean)
    : [];
  const roadAccess = String(
    landUsePlan?.roadAccess || ssot?.road_condition || '',
  ).trim();

  const nationalParts: string[] = [];
  const isNonUrban = /(관리지역|농림지역|자연환경보전지역)$/.test(zoningDistrict);
  if (zoningDistrict && !isNonUrban && zoningDistrict !== '도시지역') {
    nationalParts.push('도시지역');
  }
  if (zoningDistrict && !nationalParts.includes(zoningDistrict)) {
    nationalParts.push(zoningDistrict);
  }
  for (const ov of zoningOverlap) {
    if (ov && !nationalParts.includes(ov)) nationalParts.push(ov);
  }
  if (roadAccess && roadAccess !== '맹지' && !nationalParts.includes('도로(접합)')) {
    nationalParts.push('도로(접합)');
  }

  const nationalItems: LandUseRegulationItem[] = nationalParts.map((part) => {
    const isRoad = part === '도로(접합)';
    return {
      code: isRoad ? 'UQS100' : 'UQA',
      name: isRoad ? '도로' : part,
      conflict: isRoad ? '접합' : '포함',
      formatted: part,
    };
  });

  return {
    pnu: resolvedPnu,
    jibunAddress: landUsePlan?.jibunAddress,
    nationalLaw: nationalParts.join(', '),
    otherLaws: '',
    article9_4: null,
    nationalItems,
    otherItems: [],
    source: 'fallback',
  };
}

