/**
 * @file floor-unit-resolver.ts
 * @description 층(Floor) / 호실(Unit) 단일 해석기 (SSOT)
 *
 * 엑셀 렌트롤(단일 '호실/층' 열 및 분리된 '층'+'호실' 열), 바텀시트 UI, DB 레거시 floor_leases에서
 * 유입되는 모든 형태의 층·호실 표기를 정규화된 물리 층(`floor`)과 호실(`unitLabel`)로 분리합니다.
 *
 * 핵심 해결 과제:
 *  - "101호" ~ "501호" 입력 시 스태킹 플랜이 101F ~ 501F(15개 층)로 오인하던 버그 차단
 *  - "1F 101호", "1층 101호", "1F-101", "9F(1)", "B101호", "101~102호" 등 모든 실무 표기 정규화
 *  - Basic IM(A24) 및 Pro IM(A22, A03) 스태킹 플랜·렌트롤 표·시장임대료 층 분류(yield-set)에 단일 기준 제공
 */

export interface ResolvedFloorUnit {
  /** 정규화된 물리적 층 키 (예: 'B2', 'B1', '1F', '2F', ..., 'RF') */
  floor: string;
  /** floor 와 동일 (별칭) */
  floorKey: string;
  /** floor 와 동일 (별칭) */
  floorLabel: string;
  /** 호실/구분 표기 (예: '101호', '202호', 'A호', '1'). 전층 단독 사용 시 '' */
  unitLabel: string;
  /** 렌트롤 표 통합 표기 (구분호실이 있으면 '1F 101호', 전층이면 '1F') */
  combinedLabel: string;
  /** combinedLabel 과 동일 (별칭) */
  displayLabel: string;
  /** 스태킹 플랜 및 렌트롤 정렬용 층 순서 (B2=-2, B1=-1, 1F=1, 2F=2, ..., RF=99) */
  order: number;
  /** 호실 내부 정렬 순서 (101호=1, 102호=2, 전층=0) */
  unitOrder: number;
  /** 지하층 여부 */
  isSubterranean: boolean;
}

/** 예시 행前缀(`[예시]`) 제거 헬퍼 */
function stripExamplePrefix(raw: string): string {
  return raw.replace(/^\[예시\]\s*/i, '').trim();
}

/** 호실 문자열에서 정렬용 숫자 추출 */
function extractUnitOrder(unitLabel: string): number {
  if (!unitLabel) return 0;
  const m = unitLabel.match(/(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    // 101호 -> 1, 202호 -> 2, 1005호 -> 5
    return n >= 100 ? n % 100 || n : n;
  }
  const alpha = unitLabel.match(/^([A-Z])/i);
  if (alpha) {
    return alpha[1].toUpperCase().charCodeAt(0) - 64;
  }
  const kor = unitLabel.match(/^([가-하])/);
  if (kor) {
    return '가나다라마바사아자차카타파하'.indexOf(kor[1]) + 1;
  }
  return 0;
}

/** 호실 표기 정규화 ('101' -> '101호', '101호' -> '101호', 'A' -> 'A호') */
export function normalizeUnitSuffix(rawUnit: string): string {
  const u = rawUnit.trim().replace(/^[()\-–·,\s]+|[()\-–·,\s]+$/g, '');
  if (!u || u === '-' || u === '전층' || u === '전체') return '';
  if (/(호|호실|실|동|층|구역|코너)$/i.test(u)) return u;
  if (/^(B?\d{2,4}(?:[~,\-–]\d{1,4})?)$/i.test(u)) return `${u}호`;
  return u;
}

/**
 * 단일 문자열 또는 분리된 (floor, unit) 입력을 물리적 층(`floor`)과 호실(`unitLabel`)로 분해합니다.
 */
function withAliases(r: Omit<ResolvedFloorUnit, 'floorKey' | 'floorLabel' | 'displayLabel'>): ResolvedFloorUnit {
  return {
    ...r,
    floorKey: r.floor,
    floorLabel: r.floor,
    displayLabel: r.combinedLabel,
  };
}

export function splitFloorAndUnit(
  rawFloorInput?: string | number | null,
  explicitUnitInput?: string | number | null,
): ResolvedFloorUnit {
  const rawFloor = stripExamplePrefix(String(rawFloorInput ?? '').trim());
  const explicitUnit = stripExamplePrefix(String(explicitUnitInput ?? '').trim());

  // 1. 명시적 호실(explicitUnit)이 별도로 주어진 경우, rawFloor가 순수 층인지 먼저 해석
  if (explicitUnit && explicitUnit !== '-') {
    const baseFloor = parseSingleFloorOrUnitToken(rawFloor);
    const normUnit = normalizeUnitSuffix(explicitUnit) || explicitUnit;
    // 만약 rawFloor가 비어 있거나 호실 번호였고 explicitUnit에서 층을 추론할 수 있는 경우 보정
    if ((!rawFloor || baseFloor.floor === '-') && normUnit) {
      const fromUnit = parseSingleFloorOrUnitToken(normUnit);
      if (fromUnit.floor !== '-') {
        return withAliases({
          ...fromUnit,
          unitLabel: normUnit,
          combinedLabel: `${fromUnit.floor} ${normUnit}`,
          unitOrder: extractUnitOrder(normUnit),
        });
      }
    }
    const finalFloor = baseFloor.floor !== '-' ? baseFloor.floor : '1F';
    return withAliases({
      floor: finalFloor,
      unitLabel: normUnit,
      combinedLabel: normUnit ? `${finalFloor} ${normUnit}` : finalFloor,
      order: baseFloor.floor !== '-' ? baseFloor.order : 1,
      unitOrder: extractUnitOrder(normUnit),
      isSubterranean: baseFloor.isSubterranean,
    });
  }

  return withAliases(parseSingleFloorOrUnitToken(rawFloor));
}

function parseSingleFloorOrUnitToken(s: string): Omit<ResolvedFloorUnit, 'floorKey' | 'floorLabel' | 'displayLabel'> {
  if (!s || s === '-') {
    return { floor: '-', unitLabel: '', combinedLabel: '-', order: 0, unitOrder: 0, isSubterranean: false };
  }

  // 옥탑 / 루프탑 / RF / PH
  if (/^(옥탑|옥상|RF|R\/F|PH|루프탑|지붕층)(?:\s*(.*))?$/i.test(s)) {
    const m = s.match(/^(?:옥탑|옥상|RF|R\/F|PH|루프탑|지붕층)\s*(.*)$/i);
    const subUnit = m?.[1] ? normalizeUnitSuffix(m[1]) : '';
    return {
      floor: 'RF',
      unitLabel: subUnit,
      combinedLabel: subUnit ? `RF ${subUnit}` : 'RF',
      order: 99,
      unitOrder: extractUnitOrder(subUnit),
      isSubterranean: false,
    };
  }

  // 패턴 A: 복합 표기 — "1F 101호", "1층 101호", "지하1층 B101호", "B1 B101호", "2F-201호", "3F(301호)"
  const compoundMatch = s.match(
    /^(?:(B|지하)\s*(\d+)\s*(?:F|층)?|(?:지상\s*)?(\d+)\s*(?:F|층))[\s·,\-–/(]+([B지하]*\d{1,4}(?:[~,\-–]\d{1,4})?\s*(?:호|호실|실)?|[A-Za-z가-하]\s*(?:호|실)?)\)?$/i,
  );
  if (compoundMatch) {
    const isBelow = Boolean(compoundMatch[1]);
    const flrNum = parseInt(compoundMatch[2] || compoundMatch[3], 10);
    const floor = isBelow ? `B${flrNum}` : `${flrNum}F`;
    const order = isBelow ? -flrNum : flrNum;
    const rawUnit = compoundMatch[4].trim().replace(/\)$/, '');
    const unitLabel = normalizeUnitSuffix(rawUnit);
    return {
      floor,
      unitLabel,
      combinedLabel: unitLabel ? `${floor} ${unitLabel}` : floor,
      order,
      unitOrder: extractUnitOrder(unitLabel),
      isSubterranean: isBelow,
    };
  }

  // 패턴 B: 지하 호실 번호 단독 — "B101호", "B102", "지하101호", "지하 102호", "B1-1호"
  const basementRoomMatch = s.match(/^(?:B|지하\s*)(\d)(\d{2})(?:\s*([~,\-–]\s*\d{1,4}))?\s*(호|호실|실)?$/i);
  if (basementRoomMatch) {
    const bFlr = parseInt(basementRoomMatch[1], 10) || 1;
    const roomPart = `B${basementRoomMatch[1]}${basementRoomMatch[2]}${basementRoomMatch[3] ? basementRoomMatch[3].replace(/\s+/g, '') : ''}호`;
    const floor = `B${bFlr}`;
    return {
      floor,
      unitLabel: roomPart,
      combinedLabel: `${floor} ${roomPart}`,
      order: -bFlr,
      unitOrder: parseInt(basementRoomMatch[2], 10),
      isSubterranean: true,
    };
  }

  // 패턴 C: 지상 3~4자리 호실 번호 단독 — "101호", "105호", "201호", "1201호", "101~102호", "301-1호", 또는 단위 없는 "101", "202"
  // 단, 뒤에 'F'나 '층'이 붙은 경우("101F", "101층")는 제외하되, 101F가 이전 버그로 생성된 값인지도 방어 가능
  const roomNumberMatch = s.match(/^(?:지상\s*)?(\d{1,2})(\d{2})(?:\s*([~,\-–]\s*\d{1,4}))?\s*(호|호실|실)?$/);
  if (roomNumberMatch) {
    const flrNum = parseInt(roomNumberMatch[1], 10);
    const unitNum = parseInt(roomNumberMatch[2], 10);
    const rangePart = roomNumberMatch[3] ? roomNumberMatch[3].replace(/\s+/g, '') : '';
    const hasHoSuffix = Boolean(roomNumberMatch[4]);
    // 호 접미사가 있거나, 층 번호가 1~69이고 호 번호가 01~60 사이인 전형적 호실 번호(101~6960)인 경우
    if (flrNum >= 1 && flrNum <= 69 && (hasHoSuffix || (unitNum >= 1 && unitNum <= 60))) {
      const floor = `${flrNum}F`;
      const unitLabel = `${roomNumberMatch[1]}${roomNumberMatch[2]}${rangePart}호`;
      return {
        floor,
        unitLabel,
        combinedLabel: `${floor} ${unitLabel}`,
        order: flrNum,
        unitOrder: unitNum,
        isSubterranean: false,
      };
    }
  }

  // 패턴 D: 1~2자리 호실 단독 ("1호", "2호", "10호") — 단층/1층 상가에서 층 표기 없이 호수만 적은 경우
  const smallRoomMatch = s.match(/^(\d{1,2})\s*(호|호실)$/);
  if (smallRoomMatch) {
    const unitNum = parseInt(smallRoomMatch[1], 10);
    const unitLabel = `${unitNum}호`;
    return {
      floor: '1F',
      unitLabel,
      combinedLabel: `1F ${unitLabel}`,
      order: 1,
      unitOrder: unitNum,
      isSubterranean: false,
    };
  }

  // 패턴 E: 순수 지하층 또는 지하층+부속기호 — "B1", "B2F", "지하1층", "지하 1층", "지하층", "지층", "B1(좌)"
  if (/^(지하층|지층|지하)$/i.test(s)) {
    return { floor: 'B1', unitLabel: '', combinedLabel: 'B1', order: -1, unitOrder: 0, isSubterranean: true };
  }
  const basementFloorMatch = s.match(/^(?:B|지하\s*)(\d+)\s*(?:F|층)?(.*)$/i);
  if (basementFloorMatch) {
    const bFlr = parseInt(basementFloorMatch[1], 10) || 1;
    const floor = `B${bFlr}`;
    const rest = (basementFloorMatch[2] || '').trim();
    const isAllFloor = !rest || /^(전층|전체)$/i.test(rest);
    const unitLabel = isAllFloor ? '' : normalizeUnitSuffix(rest);
    return {
      floor,
      unitLabel,
      combinedLabel: unitLabel ? `${floor} ${unitLabel}` : floor,
      order: -bFlr,
      unitOrder: extractUnitOrder(unitLabel),
      isSubterranean: true,
    };
  }

  // 패턴 F: 지상층 또는 지상층+부속기호 — "1F", "2층", "지상 3층", "1F-A", "9F(1)", "1~2층"
  const groundRangeMatch = s.match(/^(?:지상\s*)?(\d+)\s*[~,\-–]\s*(\d+)\s*(?:F|층)$/i);
  if (groundRangeMatch) {
    const startFlr = parseInt(groundRangeMatch[1], 10);
    const endFlr = parseInt(groundRangeMatch[2], 10);
    const floor = `${startFlr}F`;
    const unitLabel = `${startFlr}~${endFlr}층`;
    return {
      floor,
      unitLabel,
      combinedLabel: `${floor} (${unitLabel})`,
      order: startFlr,
      unitOrder: 0,
      isSubterranean: false,
    };
  }

  const groundFloorMatch = s.match(/^(?:지상\s*)?(\d{1,2})\s*(?:F|층)?(.*)$/i);
  if (groundFloorMatch) {
    const flrNum = parseInt(groundFloorMatch[1], 10);
    const floor = `${flrNum}F`;
    const rest = (groundFloorMatch[2] || '').trim();
    const isAllFloor = !rest || /^(전층|전체)$/i.test(rest);
    const unitLabel = isAllFloor ? '' : normalizeUnitSuffix(rest);
    return {
      floor,
      unitLabel,
      combinedLabel: unitLabel ? `${floor} ${unitLabel}` : floor,
      order: flrNum,
      unitOrder: extractUnitOrder(unitLabel),
      isSubterranean: false,
    };
  }

  // 기타 문자열 폴백
  return {
    floor: s,
    unitLabel: '',
    combinedLabel: s,
    order: 50,
    unitOrder: 0,
    isSubterranean: false,
  };
}

/**
 * Lease 객체(floor_leases 원소)에서 정규화된 층/호 정보를 추출합니다.
 */
export function resolveLeaseFloorAndUnit(lease: Record<string, any> | null | undefined): ResolvedFloorUnit {
  if (!lease) {
    return withAliases({ floor: '-', unitLabel: '', combinedLabel: '-', order: 0, unitOrder: 0, isSubterranean: false });
  }
  const rawFloor = lease.floor ?? lease.raw_floor_label ?? '';
  const rawUnit = lease.unit_label ?? lease.unit ?? lease.ho ?? lease.room ?? '';
  return splitFloorAndUnit(rawFloor, rawUnit);
}
