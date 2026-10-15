/**
 * @file address-display.ts
 * @description R4 — 도로명 + 지번 병기 주소 해석기 (Basic IM 물건 개요·토지 정보·입지 정보 공용)
 *
 * 원칙:
 * 1. 도로명주소와 지번주소가 모두 확인되면:
 *    - twoLine:    `도로명주소\n(지번: 동/리 지번 [외 N필지])`
 *    - singleLine: `도로명주소 (지번: 동/리 지번 [외 N필지])`
 * 2. 지번주소가 명시 필드에 없더라도 19자리 PNU의 본번·부번·산 여부와
 *    중개인 메모/본문 텍스트 내 지번 표기가 100% 일치하면 결정론적으로 복원한다.
 * 3. 확인되지 않은 지번은 절대 추정·생성하지 않으며 단일 줄로 폴백한다 (Rule 34).
 */

interface ParsedJibun {
  dong: string;
  isMount: boolean;
  bun: string;
  ji: string;
}

function parseJibunAddress(address: string): ParsedJibun | null {
  if (!address) return null;
  const regex = /([가-힣0-9]+(?:동(?:\d+가)?|읍|면|리|가))\s+(산)?\s*(\d+)(?:-(\d+))?(?:\s|$)/;
  const match = address.trim().match(regex);
  if (!match) return null;
  return {
    dong: match[1],
    isMount: match[2] === '산',
    bun: match[3],
    ji: match[4] || '0',
  };
}

export interface DualLineAddressInput {
  roadAddress?: string | null;
  jibunAddress?: string | null;
  pnu?: string | null;
  parcelCount?: number | null;
  landUsePlan?: Record<string, any> | null;
  buildingRegister?: Record<string, any> | null;
  memoTexts?: Array<string | null | undefined>;
}

export interface DualLineAddressResult {
  roadLine: string;
  jibunLine: string | null;
  twoLine: string;
  singleLine: string;
}

const PARCEL_SUFFIX_RE = /\s+외\s+(\d+)\s*필지\s*$/;
const ROAD_TOKEN_RE = /[가-힣0-9]+(?:로|길)\s+\d+/;

function stripParcelSuffix(addr: string): { clean: string; inferredCount: number | null } {
  const trimmed = String(addr || '').trim();
  const m = PARCEL_SUFFIX_RE.exec(trimmed);
  if (!m) return { clean: trimmed, inferredCount: null };
  const extra = parseInt(m[1], 10);
  return {
    clean: trimmed.slice(0, m.index).trim(),
    inferredCount: Number.isFinite(extra) && extra >= 1 ? extra + 1 : null,
  };
}

/**
 * 지번주소에서 시도·시군구 접두사를 제거하여 `당산동5가 11-47` 형태의 축약 지번을 반환한다.
 */
function toShortJibun(jibun: string): string {
  const { clean } = stripParcelSuffix(jibun);
  const parsed = parseJibunAddress(clean);
  if (parsed && parsed.dong && parsed.bun) {
    const lot = `${parsed.isMount ? '산 ' : ''}${parsed.bun}${parsed.ji && parsed.ji !== '0' ? `-${parsed.ji}` : ''}`;
    return `${parsed.dong} ${lot}`;
  }
  // 시도/시군구 접두 제거 폴백
  return clean
    .replace(/^(?:서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천시|인천|광주광역시|광주시|광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)\s+/, '')
    .replace(/^(?:[가-힣]+(?:시|군|구)\s+)+/, '')
    .trim();
}

/**
 * 19자리 PNU에서 산 여부·본번·부번을 파싱한다.
 * PNU 구조: 법정동코드(10) + 필지구분(1: '1'일반, '2'산) + 본번(4) + 부번(4)
 */
function parsePnuLot(pnu: string | null | undefined): {
  isMount: boolean;
  bun: string;
  ji: string;
  lotText: string;
} | null {
  const raw = String(pnu || '').trim();
  if (!/^\d{19}$/.test(raw)) return null;
  const sanFlag = raw[10];
  const bunNum = parseInt(raw.slice(11, 15), 10);
  const jiNum = parseInt(raw.slice(15, 19), 10);
  if (!Number.isFinite(bunNum) || bunNum <= 0) return null;
  const isMount = sanFlag === '2';
  const bun = String(bunNum);
  const ji = Number.isFinite(jiNum) && jiNum > 0 ? String(jiNum) : '0';
  const lotText = `${isMount ? '산 ' : ''}${bun}${ji !== '0' ? `-${ji}` : ''}`;
  return { isMount, bun, ji, lotText };
}

/**
 * 명시적 지번 필드가 없을 때 PNU(본번·부번)와 텍스트(메모·원문·도로명 괄호 법정동)를 대조하여
 * 결정론적으로 확인된 지번만 복원한다.
 */
function resolveVerifiedJibunFromPnuAndTexts(
  pnu: string | null | undefined,
  texts: Array<string | null | undefined>,
  roadOrNewPlatPlc: string,
): string | null {
  const pnuLot = parsePnuLot(pnu);
  if (!pnuLot) return null;

  // 1) 텍스트 내 `동/읍/면/리/가 + 본번(-부번)` 패턴 전수 검사 후 PNU 본번·부번 일치 검증
  const candidateRe = /([가-힣0-9]+(?:동(?:\d+가)?|읍|면|리|가))\s+(산?\s*\d+(?:-\d+)?)/g;
  for (const t of texts) {
    if (!t || typeof t !== 'string') continue;
    candidateRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = candidateRe.exec(t)) !== null) {
      const dong = m[1].trim();
      const lotRaw = m[2].replace(/\s+/g, ' ').trim();
      const candidate = `${dong} ${lotRaw}`;
      const parsed = parseJibunAddress(candidate);
      if (
        parsed &&
        parsed.bun === pnuLot.bun &&
        parsed.ji === pnuLot.ji &&
        parsed.isMount === pnuLot.isMount
      ) {
        return `${parsed.dong} ${pnuLot.lotText}`;
      }
    }
  }

  // 2) 도로명주소 괄호 표기 법정동 예: `(당산동5가)` 또는 `(역삼동, ...)` + PNU 본번-부번
  const parenMatch = /\(([가-힣0-9]+(?:동(?:\d+가)?|읍|면|리|가))(?:[,，\s][^)]*)?\)/.exec(roadOrNewPlatPlc);
  if (parenMatch) {
    const dong = parenMatch[1].trim();
    return `${dong} ${pnuLot.lotText}`;
  }

  return null;
}

function appendLotParcelSuffix(address: string, count: number): string {
  if (!address || count <= 1 || /필지/.test(address)) return address;
  return `${address} 외 ${count - 1}필지`;
}

export function resolveDualLineAddress(input: DualLineAddressInput): DualLineAddressResult {
  const br = input.buildingRegister ?? {};
  const lup = input.landUsePlan ?? {};

  // 1. 도로명 후보 추출
  const rawRoadInput = String(input.roadAddress || br.newPlatPlc || '').trim();
  const { clean: strippedRoad, inferredCount: roadInferredCount } = stripParcelSuffix(rawRoadInput);
  // 괄호 안 법정동/건물명 부기 제거한 깔끔한 도로명
  const cleanRoad = strippedRoad.replace(/\s*\([^)]*\)\s*$/, '').trim();

  // 2. 명시적 지번 후보 추출
  const lupCombined =
    lup.ldCodeNm && lup.mnnmSlno
      ? `${String(lup.ldCodeNm).trim()} ${String(lup.mnnmSlno).trim()}`
      : '';
  const explicitJibunRaw = String(
    input.jibunAddress ||
    br.platPlc ||
    lup.jibunAddress ||
    lup.address ||
    lupCombined ||
    ''
  ).trim();
  const { clean: cleanExplicitJibun, inferredCount: jibunInferredCount } = stripParcelSuffix(explicitJibunRaw);

  // 만약 roadAddress로 들어온 문자열이 실제로는 지번주소이고 명시적 지번이 비어 있는 경우
  const roadLooksLikeJibunOnly =
    Boolean(cleanRoad) &&
    !ROAD_TOKEN_RE.test(cleanRoad) &&
    Boolean(parseJibunAddress(cleanRoad));

  const roadLine = roadLooksLikeJibunOnly ? '' : cleanRoad;
  let resolvedJibun: string | null = null;

  if (cleanExplicitJibun && !ROAD_TOKEN_RE.test(cleanExplicitJibun)) {
    resolvedJibun = toShortJibun(cleanExplicitJibun);
  } else if (roadLooksLikeJibunOnly) {
    resolvedJibun = toShortJibun(cleanRoad);
  } else {
    const searchTexts: Array<string | null | undefined> = [
      ...(input.memoTexts ?? []),
      rawRoadInput,
      typeof br.newPlatPlc === 'string' ? br.newPlatPlc : null,
    ];
    resolvedJibun = resolveVerifiedJibunFromPnuAndTexts(input.pnu, searchTexts, rawRoadInput || String(br.newPlatPlc || ''));
  }

  const effectiveParcelCount =
    (typeof input.parcelCount === 'number' && Number.isFinite(input.parcelCount) && input.parcelCount >= 2)
      ? Math.floor(input.parcelCount)
      : (roadInferredCount ?? jibunInferredCount ?? 1);

  // 도로명과 지번이 모두 존재하고 서로 다른 경우
  if (roadLine && resolvedJibun && roadLine !== resolvedJibun) {
    const jibunWithParcel = appendLotParcelSuffix(resolvedJibun, effectiveParcelCount);
    return {
      roadLine,
      jibunLine: jibunWithParcel,
      twoLine: `${roadLine}\n(지번: ${jibunWithParcel})`,
      singleLine: `${roadLine} (지번: ${jibunWithParcel})`,
    };
  }

  // 도로명만 있거나 지번만 있는 경우
  const fallbackBase = roadLine || resolvedJibun || cleanRoad || strippedRoad || '';
  const fallbackWithParcel = fallbackBase ? appendLotParcelSuffix(fallbackBase, effectiveParcelCount) : '';
  return {
    roadLine: fallbackWithParcel,
    jibunLine: resolvedJibun ? fallbackWithParcel : null,
    twoLine: fallbackWithParcel,
    singleLine: fallbackWithParcel,
  };
}
