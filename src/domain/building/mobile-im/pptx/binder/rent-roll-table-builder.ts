import { formatPyeong } from '@/lib/utils/area-conversion';
import type { SectionData } from './binder-types';

/**
 * 렌트롤 면적 표기 SSOT: ㎡ 소수 1자리 + 천 단위 구분 (예: 2490.3 → '2,490.3')
 * A24 표와 스태킹 플랜 라벨이 동일 문자열을 사용하도록 공용화 (Rule 70 ㎡ 통일)
 */
export function formatAreaSqm(v: number): string {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** '공실', '(공실)', '[공실]' 등 공실 표식 문자열 */
const VACANT_MARK = /^[\s(（[]*공실[\s)）\]]*$/;

/**
 * 렌트롤 임차인/용도 해석 (Rule 4 비중복 렌더링 · Rule 34 무날조)
 * - 임차인: tenant_name(상호) 우선 → 없으면 업종 문자열(tenant_type)을 임차인 식별자로 사용
 * - 용도: use / tenant_type / business_type 중 임차인 표기와 **다른** 실값이 있을 때만 표시, 아니면 '-'
 *   (임차인명을 용도 칸에 복사하는 중복 렌더링 금지)
 * - 상호 없이 '카페(스타벅스)'처럼 업종(상호) 결합 문자열만 있으면 입력 문자열을 그대로 분해
 * - 공실: 임차인 '공실', 용도는 명시적 use 값이 있을 때만 (공실 표식 반복 금지)
 */
export function resolveTenantAndUse(l: {
  tenant_name?: unknown;
  tenant?: unknown;
  tenant_type?: unknown;
  use?: unknown;
  business_type?: unknown;
  is_vacant?: unknown;
}): { tenant: string; use: string; isVacant: boolean } {
  const clean = (v: unknown) => (v == null ? '' : String(v).trim());
  let name = clean(l.tenant_name) || clean(l.tenant);
  const explicitUse = clean(l.use);
  let biz = clean(l.tenant_type) || clean(l.business_type);
  const isVacant = l.is_vacant === true
    || VACANT_MARK.test(name) || VACANT_MARK.test(biz)
    || (!!name && name.includes('공실'));

  if (isVacant) {
    const use = explicitUse && !VACANT_MARK.test(explicitUse) ? explicitUse : '-';
    return { tenant: '공실', use, isVacant: true };
  }

  if (!name && biz) {
    const m = biz.match(/^(.+?)\s*[（(]\s*([^()（）]+?)\s*[)）]$/);
    if (m) {
      biz = m[1].trim();
      name = m[2].trim();
    }
  }

  const tenant = name || biz || '-';
  const useCandidate = explicitUse || biz;
  const use = useCandidate && useCandidate !== tenant && !VACANT_MARK.test(useCandidate) ? useCandidate : '-';
  return { tenant, use, isVacant: false };
}

/**
 * A24 렌트롤 테이블 바인딩 (lease_status 섹션 처리 중 호출)
 * 1) floor_leases 기반 층별 상세 테이블 (Basic: 10열 / Pro: 7열)
 * 2) floor_leases·마크다운 표가 모두 없을 때 ssot_summary 기반 요약 합성
 */
export function bindRentRollTable(
  doc: { body: Record<string, any> },
  cleanMarkdown: string,
  result: Record<string, SectionData>,
): void {
  // ─── A24 rentRoll: floor_leases 기반 층별 상세 테이블 직접 빌드 (ssot_summary 합성보다 우선) ───
  const floorLeases: any[] = (doc.body?.floor_leases ?? []).filter(Boolean);
  if (floorLeases.length > 0 && result['rentRoll']) {
    const isBasicPreset = doc.body?.preset === 'credeal_basic' || doc.body?.tier === 'basic';
    const rrHeaders = isBasicPreset
      ? ['층', '임차인', '용도', '임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계', '만기일']
      : ['호실', '업종', '면적', '보증금', '월세', '관리비', '만기일'];
    const isFinitePos = (v: any) => v != null && Number.isFinite(Number(v)) && Number(v) > 0;
    const isFiniteNonNeg = (v: any) => v != null && Number.isFinite(Number(v)) && Number(v) >= 0;

    // 통합계약(계약그룹): 금액은 대표 행에만 기입하므로, 같은 그룹의 금액 없는 행은 '〃'(위와 동일 계약)로 표기해 공란 오독을 막는다.
    // 합계는 '〃' 셀을 숫자로 읽지 않으므로 대표 행 금액만 합산된다 (중복 집계 없음).
    const groupKey = (l: any) => String(l?.contract_group ?? '').trim();
    const groupsWithAmount = new Set<string>(
      floorLeases
        .filter((l: any) => groupKey(l) && (isFinitePos(l.deposit_manwon) || isFinitePos(l.rent_manwon)))
        .map(groupKey),
    );

    const rrRows = floorLeases.map((l: any) => {
    const floor = l.floor || l.unit_label || '-';
      const areaPyeong = isFinitePos(l.area_sqm)
        ? `${formatPyeong(Number(l.area_sqm), 1)}평`
        : (isFinitePos(l.area_pyeong) ? `${l.area_pyeong}평` : '-');
      // Pro(7열 '업종' 칼럼)은 기존 표기 유지
      const tenant = l.tenant_name || l.tenant || (l.is_vacant ? '공실' : (l.tenant_type || '-'));
      // Basic(10열): 임차인/용도 비중복 해석 — 용도 칸에 임차인명 복사 금지 (Rule 4)
      const basicParty = resolveTenantAndUse(l);
      // 공실 행의 0원은 계약 금액이 아니라 '없음'이므로 '-' (0 날조 표기 방지)
      const amountCell = (v: any) => (isFiniteNonNeg(v) && !(basicParty.isVacant && Number(v) === 0))
        ? `${Number(v).toLocaleString()}`
        : '-';
      const deposit = amountCell(l.deposit_manwon);
      const rent = amountCell(l.rent_manwon);
      const mgmt = amountCell(l.mgmt_fee_manwon);
      const rentN = Number(l.rent_manwon) || 0;
      const mgmtN = Number(l.mgmt_fee_manwon) || 0;
      const totalMonthRaw = (rentN + mgmtN) > 0 ? (rentN + mgmtN).toLocaleString() : (rent !== '-' ? rent : '-');
      const isGroupFollower = !!groupKey(l) && groupsWithAmount.has(groupKey(l))
        && !isFinitePos(l.deposit_manwon) && !isFinitePos(l.rent_manwon) && !isFinitePos(l.mgmt_fee_manwon);
      const SAME_AS_ABOVE = '〃';
      const depositCell = isGroupFollower ? SAME_AS_ABOVE : deposit;
      const rentCell = isGroupFollower ? SAME_AS_ABOVE : rent;
      const mgmtCell = isGroupFollower ? SAME_AS_ABOVE : mgmt;
      const totalMonth = isGroupFollower ? SAME_AS_ABOVE : totalMonthRaw;
      const expiry = l.lease_end || l.contract_end || '-';

      // 임대면적: 레거시 단일 '전용면적' 열에서 복사된 대용값(area_sqm_is_proxy)은 임대면적이 아니므로 비운다
      const areaSqmStr = (!l.area_sqm_is_proxy && isFinitePos(l.area_sqm))
      ? formatAreaSqm(Number(l.area_sqm))
      : (isFinitePos(l.area_pyeong) ? formatAreaSqm(Number(l.area_pyeong) / 0.3025) : '-');
      // 전용면적: 미기입이면 '-' (임대면적 값을 대신 채우지 않는다). 열 표시 여부는 a24 렌더러가 데이터로 결정.
      const excSqmStr = isFinitePos(l.exclusive_area_sqm)
      ? formatAreaSqm(Number(l.exclusive_area_sqm))
      : (isFinitePos(l.exclusive_area_pyeong) ? formatAreaSqm(Number(l.exclusive_area_pyeong) / 0.3025) : '-');
      
      return isBasicPreset
        ? [
            floor,
            basicParty.tenant,
            basicParty.use,
            areaSqmStr,
            excSqmStr,
            depositCell,
            rentCell,
            mgmtCell,
            totalMonth,
            expiry
            ]
            : [floor, tenant, areaPyeong, depositCell, rentCell, mgmtCell, expiry];
    });
    result['rentRoll'].tableHead = rrHeaders;
    result['rentRoll'].tableRows = rrRows;
    result['rentRoll'].tables = [{ headers: rrHeaders, rows: rrRows }];
  }

  // ─── A24 rentRoll fallback: floor_leases 미영속 + 마크다운 테이블 미생성 시 ssot_summary 기반 합성 ───
  // LLM이 서술형 텍스트만 생성하고 마크다운 테이블을 포함하지 않은 경우,
  // A24가 suppress되지 않도록 ssot_summary와 텍스트에서 최소한의 임대차 요약 테이블을 동적으로 합성합니다.
  // Rule 34: 특정 매물 데이터 하드코딩 금지 — 모든 수치는 ssot_summary에서 동적 산출
  if (result['rentRoll'] && !(result['rentRoll'].tableRows?.length > 0)) {
    const ssot = doc.body?.ssot_summary ?? {};
    const monthlyRentKrw = ssot.monthly_rent_total_krw;
    const depositManwon = ssot.total_deposit_manwon ?? (doc.body?.total_deposit_manwon);
    const askingManwon = ssot.asking_price_manwon ?? doc.body?.asking_price_manwon;
    const vacancySignal = ssot.vacancy_signal || ssot.vacancy_status;

    // ssot에 월세 또는 보증금 데이터가 있으면 합성 가능
    if (monthlyRentKrw || depositManwon) {
      const monthlyRentManwon = monthlyRentKrw ? Math.round(monthlyRentKrw / 10000) : 0;
      const annualRentEok = monthlyRentKrw ? Number((monthlyRentKrw * 12 / 100000000).toFixed(2)) : '-';
      const depositEok = depositManwon ? Number((depositManwon / 10000).toFixed(2)) : '-';

      // 마크다운 서술에서 공실 층수 추출 (예: "2층·4층·5층 등 총 3개 층 공실")
      const vacantMatch = cleanMarkdown.match(/(\d+)\s*개?\s*층?\s*공실/);
      const vacantCount = vacantMatch ? parseInt(vacantMatch[1]) : 0;

      const summaryRows: string[][] = [
        ['월 임대료 합계', `${monthlyRentManwon.toLocaleString()}만 원`, '연간', `약 ${annualRentEok}억 원`],
        ['보증금 합계', depositManwon ? `${depositEok}억 원` : '미확인', '공실 현황', vacancySignal || `${vacantCount}개 층 공실`],
      ];
      if (askingManwon) {
        summaryRows.push(['매각 희망가', `${Number((askingManwon / 10000).toFixed(2))}억 원`, '총보증금 대비', depositManwon && askingManwon ? `${((depositManwon / askingManwon) * 100).toFixed(1)}%` : '-']);
      }

      result['rentRoll'].tableRows = summaryRows;
      result['rentRoll'].tableHead = ['항목', '금액', '항목', '금액'];
      // tables 배열에도 동기화 (A24 fallback 경로용)
      if (!result['rentRoll'].tables?.length) {
        result['rentRoll'].tables = [{ headers: ['항목', '금액', '항목', '금액'], rows: summaryRows }];
      }
    }
    // D45 M-2: 사옥형(owner_occupied)은 월세/보증금 0이어도 공실 현황 합성
    else if (doc.body?.identity?.investmentPosture === 'owner_occupied' || doc.body?.posture === 'owner_occupied') {
      const vacantMatch = cleanMarkdown.match(/(\d+)\s*개?\s*층?\s*공실/);
      const vacantCount = vacantMatch ? parseInt(vacantMatch[1]) : 0;
      const floorLeases = doc.body?.floor_leases ?? [];
      const totalFloors = floorLeases.length || parseInt(String(ssot.floors_above ?? 0)) || 0;
      const occupiedFloors = totalFloors - vacantCount;

      const summaryRows: string[][] = [
        ['사용 현황', '자가 사용 (사옥)', '총 층수', `${totalFloors}개 층`],
        ['자가 사용', `${occupiedFloors}개 층`, '공실', vacancySignal || `${vacantCount}개 층`],
      ];
      if (askingManwon) {
        summaryRows.push(['매각 희망가', `${Number((askingManwon / 10000).toFixed(2))}억 원`, '비고', '즉시 명도 가능']);
      }

      result['rentRoll'].tableRows = summaryRows;
      result['rentRoll'].tableHead = ['항목', '내용', '항목', '내용'];
      if (!result['rentRoll'].tables?.length) {
        result['rentRoll'].tables = [{ headers: ['항목', '내용', '항목', '내용'], rows: summaryRows }];
      }
    }
  }
}
