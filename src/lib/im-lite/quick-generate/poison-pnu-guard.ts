/**
 * @file src/lib/im-lite/quick-generate/poison-pnu-guard.ts
 * @description Poison seed PNU & cross-dong coordinate guards + address dedup & blind-region helpers.
 */

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeAddrCompare(s?: unknown): string {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
}

export function normalizeAddrDedupKey(raw?: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(
      /^(서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천시|인천|광주광역시|광주시|광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)\s+/,
      '',
    )
    .replace(/번지/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

export function isValidPnuForAddress(cleanAddress: string, p?: string | null): p is string {
  if (typeof p !== 'string') return false;
  const t = p.trim();
  if (!/^\d{19}$/.test(t)) return false;

  const isDangsanAddress = /(당산동5가\s*11-47|양평동\s*11-47|영신로\s*259)/.test(cleanAddress);
  const isYeoksamAddress = /역삼동/.test(cleanAddress);
  const isSeochoAddress = /서초동/.test(cleanAddress);

  // Block legacy non-existent seed PNU & cross-dong seed PNUs
  if (t === '1156012800100800001') return false;
  if (!isDangsanAddress && t === '1156011500100110047') return false;
  if (!isYeoksamAddress && t === '1168010100108230033') return false;
  if (!isSeochoAddress && t === '1165010800113030035') return false;
  return true;
}

export function isValidCoordsForAddress(cleanAddress: string, c?: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const cand = c as { lat?: unknown; lng?: unknown };
  const latNum = Number(cand.lat);
  const lngNum = Number(cand.lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || latNum <= 33 || lngNum <= 124) {
    return false;
  }

  const isDangsanAddress = /(당산동5가\s*11-47|양평동\s*11-47|영신로\s*259)/.test(cleanAddress);
  const isYeoksamAddress = /역삼동/.test(cleanAddress);
  const isSeochoAddress = /서초동/.test(cleanAddress);

  if (
    !isDangsanAddress &&
    Math.abs(latNum - 37.5342) < 0.0005 &&
    Math.abs(lngNum - 126.9022) < 0.0005
  ) {
    return false;
  }
  if (
    !isYeoksamAddress &&
    Math.abs(latNum - 37.4996) < 0.0005 &&
    Math.abs(lngNum - 127.0344) < 0.0005
  ) {
    return false;
  }
  if (
    !isSeochoAddress &&
    Math.abs(latNum - 37.5019) < 0.0005 &&
    Math.abs(lngNum - 127.0254) < 0.0005
  ) {
    return false;
  }
  return true;
}

export function sanitizeIncomingPnuAndCoords(params: {
  cleanAddress: string;
  rawPnu?: unknown;
  rawCoordinates?: unknown;
  rawLat?: unknown;
  rawLng?: unknown;
}): {
  sanitizedRawPnu: string;
  sanitizedRawCoords?: { lat: number; lng: number };
} {
  const { cleanAddress, rawPnu, rawCoordinates, rawLat, rawLng } = params;
  const sanitizedRawPnu =
    typeof rawPnu === 'string' && isValidPnuForAddress(cleanAddress, rawPnu.trim())
      ? rawPnu.trim()
      : '';

  const coordObj = rawCoordinates as { lat?: unknown; lng?: unknown } | undefined;
  const sanitizedRawCoords =
    coordObj && isValidCoordsForAddress(cleanAddress, coordObj)
      ? { lat: Number(coordObj.lat), lng: Number(coordObj.lng) }
      : isValidCoordsForAddress(cleanAddress, { lat: rawLat, lng: rawLng })
        ? { lat: Number(rawLat), lng: Number(rawLng) }
        : undefined;

  return { sanitizedRawPnu, sanitizedRawCoords };
}

export function deriveBlindSafeRegion(cleanPrimaryAddr: string): string {
  const guDongRegionMatch = cleanPrimaryAddr.match(
    /([가-힣]{2,6}(?:구|군))\s+([가-힣0-9]{2,8}(?:동|읍|면|리|가))/,
  );
  const cityRegionMatch = cleanPrimaryAddr.match(
    /([가-힣]{2,6}시)\s+([가-힣0-9]{2,8}(?:구|동|읍|면))/,
  );
  if (guDongRegionMatch) {
    return `${guDongRegionMatch[1]} ${guDongRegionMatch[2]}`;
  }
  if (cityRegionMatch && !cityRegionMatch[1].startsWith('서울')) {
    return `${cityRegionMatch[1]} ${cityRegionMatch[2]}`;
  }
  const safeAddrTokens = cleanPrimaryAddr
    .split(/[\s,]+/)
    .filter((tok) => tok && !/^\d/.test(tok) && !/^산\d/.test(tok));
  if (safeAddrTokens.length >= 3) {
    return `${safeAddrTokens[1]} ${safeAddrTokens[2]}`;
  }
  if (safeAddrTokens.length === 2) {
    return `${safeAddrTokens[0]} ${safeAddrTokens[1]}`;
  }
  return safeAddrTokens[0] || '서울 도심';
}
