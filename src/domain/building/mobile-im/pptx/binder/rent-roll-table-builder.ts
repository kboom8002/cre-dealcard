import { formatPyeong } from '@/lib/utils/area-conversion';
import type { SectionData } from './binder-types';

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

    const rrRows = floorLeases.map((l: any) => {
      const floor = l.floor || l.unit_label || '-';
      const areaPyeong = isFinitePos(l.area_sqm)
        ? `${formatPyeong(Number(l.area_sqm), 1)}평`
        : (isFinitePos(l.area_pyeong) ? `${l.area_pyeong}평` : '-');
      const tenant = l.tenant_name || l.tenant || (l.is_vacant ? '공실' : (l.tenant_type || '-'));
      const use = l.use || l.tenant_type || l.business_type || (l.is_vacant ? '공실' : '-');
      const deposit = isFiniteNonNeg(l.deposit_manwon) ? `${Number(l.deposit_manwon).toLocaleString()}` : '-';
      const rent = isFiniteNonNeg(l.rent_manwon) ? `${Number(l.rent_manwon).toLocaleString()}` : (l.is_vacant ? '-' : '-');
      const mgmt = isFiniteNonNeg(l.mgmt_fee_manwon) ? `${Number(l.mgmt_fee_manwon).toLocaleString()}` : '-';
      const rentN = Number(l.rent_manwon) || 0;
      const mgmtN = Number(l.mgmt_fee_manwon) || 0;
      const totalMonth = (rentN + mgmtN) > 0 ? (rentN + mgmtN).toLocaleString() : (rent !== '-' ? rent : '-');
      const expiry = l.lease_end || l.contract_end || '-';

      const areaSqmStr = isFinitePos(l.area_sqm)
        ? Number(l.area_sqm).toFixed(1)
        : (isFinitePos(l.area_pyeong) ? (Number(l.area_pyeong) / 0.3025).toFixed(1) : '-');
      const excSqmStr = isFinitePos(l.exclusive_area_sqm)
        ? Number(l.exclusive_area_sqm).toFixed(1)
        : (isFinitePos(l.exclusive_area_pyeong) ? (Number(l.exclusive_area_pyeong) / 0.3025).toFixed(1) : areaSqmStr);
      
      return isBasicPreset
        ? [
            floor,
            tenant,
            use,
            areaSqmStr,
            excSqmStr,
            deposit,
            rent,
            mgmt,
            totalMonth,
            expiry
          ]
        : [floor, tenant, areaPyeong, deposit, rent, mgmt, expiry];
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
