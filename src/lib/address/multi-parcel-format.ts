/**
 * @file src/lib/address/multi-parcel-format.ts
 * @description 브라우저·서버 공용 순수 다필지 주소 파싱·번지 추가·제거 유틸리티.
 *  - "서울특별시 영등포구 양평동4가 117, 134, 125-2"
 *  - "서울 영등포구 양평동4가 117 외 2필지" / "잠원동 26-14 외 1"
 *  - "양평동4가 117 외 2필지 (134, 125-2)"
 */

export interface ParsedLotToken {
  bun: string;
  ji: string;
  isMount: boolean;
  /** 정규화된 번지 표기 (예: "117", "125-2", "산 12-1") */
  label: string;
}

const OUTER_LOT_COUNT_RE = /\s*외\s*\d*\s*(?:필지|번지)?(?=\s*$|\s*\()/g;
const OUTER_LOT_DETECT_RE = /(?:^|\s|\d)외\s*(?:\d+\s*(?:필지|번지)?|필지)(?:\s*$|\s*\()/;

export function formatLotLabel(lot: { bun: string | number; ji?: string | number; isMount?: boolean }): string {
  const bunNum = parseInt(String(lot.bun), 10);
  const jiNum = parseInt(String(lot.ji ?? '0'), 10);
  if (!Number.isFinite(bunNum) || bunNum <= 0) return '';
  const sanPrefix = lot.isMount ? '산 ' : '';
  return Number.isFinite(jiNum) && jiNum > 0 ? `${sanPrefix}${bunNum}-${jiNum}` : `${sanPrefix}${bunNum}`;
}

export function formatPnuLotShortLabel(pnu: string): string {
  const digits = String(pnu || '').replace(/\D/g, '');
  if (digits.length !== 19) return '';
  const isMount = digits[10] === '2';
  const bun = parseInt(digits.slice(11, 15), 10);
  const ji = parseInt(digits.slice(15, 19), 10);
  return formatLotLabel({ bun, ji, isMount });
}

export function parseSingleLotToken(rawToken: string): ParsedLotToken | null {
  const cleaned = String(rawToken || '')
    .trim()
    .replace(/번지$/g, '')
    .trim();
  if (!cleaned) return null;
  const m = cleaned.match(/^(산\s*)?(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const bun = String(parseInt(m[2], 10));
  const ji = m[3] ? String(parseInt(m[3], 10)) : '0';
  if (!bun || bun === 'NaN' || Number(bun) <= 0) return null;
  const isMount = Boolean(m[1]);
  return {
    bun,
    ji,
    isMount,
    label: formatLotLabel({ bun, ji, isMount }),
  };
}

export function splitMultiParcelAddressPure(rawAddress: string): {
  primaryAddress: string;
  secondaryLots: ParsedLotToken[];
  hasExplicitMultiLotHint: boolean;
} {
  if (!rawAddress || !rawAddress.trim()) {
    return { primaryAddress: '', secondaryLots: [], hasExplicitMultiLotHint: false };
  }

  const secondaryLots: ParsedLotToken[] = [];
  const seenLabels = new Set<string>();
  let working = rawAddress.trim();
  const hadOuterHint = OUTER_LOT_DETECT_RE.test(working);

  const pushUnique = (lot: ParsedLotToken | null) => {
    if (!lot || !lot.label || seenLabels.has(lot.label)) return;
    seenLabels.add(lot.label);
    secondaryLots.push(lot);
  };

  // 1. 괄호 안 부속 지번 추출: 예) "양평동4가 117 외 2필지 (134, 125-2)"
  const parenMatch = working.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const tokens = parenMatch[1]
      .split(/[,/·\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    for (const tok of tokens) {
      pushUnique(parseSingleLotToken(tok));
    }
    if (secondaryLots.length > 0) {
      working = working.replace(/\s*\([^)]+\)/g, '').trim();
    }
  }

  // 2. "외 N필지" 또는 지번 뒤 "외 N" 문구 제거 (예: "117 외 2필지", "26-14 외 1", "26-14외1")
  working = working
    .replace(/(\d)\s*외\s*\d+\s*(?:필지|번지)?(?=\s*$)/g, '$1')
    .replace(OUTER_LOT_COUNT_RE, '')
    .trim();

  // 3. 쉼표로 나열된 지번 분리: 예) "서울특별시 영등포구 양평동4가 117, 134, 125-2"
  const commaParts = working
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (commaParts.length > 1) {
    const firstPart = commaParts[0];
    for (let i = 1; i < commaParts.length; i++) {
      // 동 이름이 함께 반복된 경우("잠원동 26-16")도 말미 지번 추출 허용
      const direct = parseSingleLotToken(commaParts[i]);
      if (direct) {
        pushUnique(direct);
        continue;
      }
      const trailing = commaParts[i].match(/(?:^|\s)(산\s*\d+(?:-\d+)?|\d+(?:-\d+)?)(?:번지)?$/);
      if (trailing) {
        pushUnique(parseSingleLotToken(trailing[1]));
      }
    }
    working = firstPart;
  }

  return {
    primaryAddress: working,
    secondaryLots,
    hasExplicitMultiLotHint: hadOuterHint || secondaryLots.length > 0,
  };
}

function extractPrimaryLotLabel(primaryAddress: string): string | null {
  const m =
    primaryAddress.match(/(?:동\d*가?|로\d*가?|리|읍|면)\s+(산\s*\d+(?:-\d+)?|\d+(?:-\d+)?)(?:번지)?\s*$/) ||
    primaryAddress.match(/(?:^|\s)(산\s*\d+(?:-\d+)?|\d+(?:-\d+)?)(?:번지)?\s*$/);
  if (!m) return null;
  return parseSingleLotToken(m[1])?.label ?? null;
}

/**
 * 현재 주소 문자열에 부속 번지(쉼표/공백 구분 다중 입력 지원)를 깔끔하게 병합합니다.
 */
export function appendSecondaryLotsToAddress(
  currentAddress: string,
  extraInput: string,
): { nextAddress: string; addedLots: string[] } {
  const rawBase = String(currentAddress || '').trim();
  const { primaryAddress, secondaryLots } = splitMultiParcelAddressPure(rawBase);
  const primaryLabel = extractPrimaryLotLabel(primaryAddress);

  const existingSet = new Set<string>(secondaryLots.map((s) => s.label));
  if (primaryLabel) existingSet.add(primaryLabel);

  const rawTokens = String(extraInput || '')
    .split(/[,/·\n]+/)
    .flatMap((chunk) => {
      const trimmed = chunk.trim();
      if (/^산\s+\d/.test(trimmed)) return [trimmed];
      return trimmed.split(/\s+/);
    })
    .map((t) => t.trim())
    .filter(Boolean);

  const addedLots: string[] = [];
  const mergedSecondary = [...secondaryLots.map((s) => s.label)];

  for (const tok of rawTokens) {
    const parsed = parseSingleLotToken(tok);
    if (!parsed || existingSet.has(parsed.label)) continue;
    existingSet.add(parsed.label);
    mergedSecondary.push(parsed.label);
    addedLots.push(parsed.label);
  }

  if (!primaryAddress) {
    return {
      nextAddress: addedLots.join(', '),
      addedLots,
    };
  }

  const cleanPrimary = primaryAddress.replace(/번지\s*$/, '').trim();
  const nextAddress =
    mergedSecondary.length > 0
      ? `${cleanPrimary}, ${mergedSecondary.join(', ')}`
      : cleanPrimary;

  return { nextAddress, addedLots };
}

/**
 * 주소 문자열에서 특정 부속 번지(예: "134" 또는 "양평동4가 134" 또는 19자리 PNU)를 제거합니다.
 */
export function removeSecondaryLotFromAddress(
  currentAddress: string,
  target: { lotLabel?: string; pnu?: string },
): string {
  const { primaryAddress, secondaryLots } = splitMultiParcelAddressPure(currentAddress);
  if (!primaryAddress) return '';

  let targetShort = '';
  if (target.pnu) {
    targetShort = formatPnuLotShortLabel(target.pnu);
  }
  if (!targetShort && target.lotLabel) {
    const direct = parseSingleLotToken(target.lotLabel);
    if (direct) {
      targetShort = direct.label;
    } else {
      const m = target.lotLabel.match(/(산\s*\d+(?:-\d+)?|\d+(?:-\d+)?)(?:번지)?\s*$/);
      if (m) targetShort = parseSingleLotToken(m[1])?.label ?? '';
    }
  }

  if (!targetShort) return currentAddress.trim();

  const remaining = secondaryLots
    .map((s) => s.label)
    .filter((lbl) => lbl !== targetShort);

  return remaining.length > 0
    ? `${primaryAddress}, ${remaining.join(', ')}`
    : primaryAddress;
}
