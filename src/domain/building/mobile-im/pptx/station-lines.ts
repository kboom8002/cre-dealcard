/**
 * @file station-lines.ts
 * @description 지하철 노선 병합 유틸리티 (Summary A02 & Location A06 공용)
 *
 * 동일 역명의 복수 노선 엔트리(예: 당산역 2호선 406m, 당산역 9호선 468m)를
 * 역 기본명(baseName) 기준으로 그룹화하여 최단 거리·도보시간과 정렬된 노선 목록을 반환한다.
 */

import { parseStationName } from './binder/station-name';

export interface MergedStation {
  baseName: string;
  lines: string[];
  formattedName: string;
  distanceM: number;
  walkMinutes: number;
}

const MAX_SUBWAY_DISTANCE_M = 1500;
const WALK_M_PER_MIN = 80;

/**
 * 노선 배열을 표기용 문자열로 포맷한다.
 * - 전부 숫자 호선(`2호선`, `9호선`)이면 `2·9호선`
 * - 특수 노선 포함(`2호선`, `신분당선`)이면 `2호선·신분당선`
 */
export function formatLinesLabel(lines: string[]): string {
  if (!Array.isArray(lines) || lines.length === 0) return '';
  if (lines.every(l => /^\d+호선$/.test(l))) {
    return `${lines.map(l => l.replace(/호선$/, '')).join('·')}호선`;
  }
  return lines.join('·');
}

function normalizeLineToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  // 카카오 카테고리명 예: '교통,수송 > 지하철,전철 > 수도권9호선' → '9호선'
  if (s.includes('>')) {
    const parts = s.split('>').map(p => p.trim()).filter(Boolean);
    s = parts[parts.length - 1] || s;
  }
  s = s.replace(/^(?:수도권|서울|부산|대구|인천|광주|대전)\s*/, '').trim();
  const parsed = parseStationName(`역 ${s}`);
  if (parsed.lines.length > 0) return parsed.lines[0];
  if (/^(?:\d+호선|[가-힣A-Za-z0-9]+선)$/.test(s) && s !== '지하철' && s !== '전철') {
    return s;
  }
  return null;
}

function isSubwayEntry(entry: any): boolean {
  if (!entry || typeof entry !== 'object') return false;
  if (entry._isFallback) return false;
  const cat = String(entry.category || '').toLowerCase();
  const catName = String(entry.categoryName || entry.category_name || '');
  const name = String(entry.name || entry.place_name || '').trim();
  if (cat === 'subway' || cat === 'sw8') return true;
  if (/지하철|전철|도시철도/.test(catName)) return true;
  // nearestStation 객체 또는 'OO역 N호선' 패턴
  if (name.endsWith('역') || /역\s*\(/.test(name) || /역\s+\S+선/.test(name)) {
    const parsed = parseStationName(name);
    if (parsed.name.endsWith('역')) return true;
  }
  return false;
}

export function resolveMergedStations(
  locationPoi: any,
  landmarkPool?: any,
  maxDistanceM: number = MAX_SUBWAY_DISTANCE_M,
): MergedStation[] {
  const rawEntries: any[] = [];

  if (locationPoi && typeof locationPoi === 'object') {
    if (locationPoi.nearestStation && !locationPoi.nearestStation._isFallback) {
      rawEntries.push({ ...locationPoi.nearestStation, category: 'subway' });
    }
    if (Array.isArray(locationPoi.keySpots)) {
      for (const s of locationPoi.keySpots) {
        if (isSubwayEntry(s)) rawEntries.push(s);
      }
    }
    if (Array.isArray(locationPoi.candidateSpots)) {
      for (const s of locationPoi.candidateSpots) {
        if (isSubwayEntry(s)) rawEntries.push(s);
      }
    }
  }

  const poolCandidates = Array.isArray(landmarkPool)
    ? landmarkPool
    : Array.isArray(landmarkPool?.candidates)
      ? landmarkPool.candidates
      : [];
  for (const c of poolCandidates) {
    if (isSubwayEntry(c)) rawEntries.push(c);
  }

  const byStation = new Map<string, {
    baseName: string;
    lines: Set<string>;
    minDistanceM: number;
    explicitWalkMin?: number;
  }>();

  for (const entry of rawEntries) {
    const rawName = String(entry?.name || entry?.place_name || '').trim();
    if (!rawName || rawName === '인근역') continue;

    const distRaw = Number(entry?.distanceM ?? entry?.distance_m ?? entry?.distance);
    if (!Number.isFinite(distRaw) || distRaw <= 0 || distRaw > maxDistanceM) continue;

    const parsed = parseStationName(rawName);
    const baseName = parsed.name.trim();
    if (!baseName || !baseName.endsWith('역')) continue;

    const group = byStation.get(baseName) ?? {
      baseName,
      lines: new Set<string>(),
      minDistanceM: distRaw,
      explicitWalkMin: undefined,
    };

    for (const l of parsed.lines) {
      if (l) group.lines.add(l);
    }
    const extraLine =
      normalizeLineToken(entry?.line) ??
      normalizeLineToken(entry?.lineName) ??
      normalizeLineToken(entry?.categoryName ?? entry?.category_name);
    if (extraLine) {
      group.lines.add(extraLine);
    }

    const walkRaw = Number(entry?.walkMinutes ?? entry?.walk_min ?? entry?.walkMin);
    if (distRaw < group.minDistanceM) {
      group.minDistanceM = distRaw;
      if (Number.isFinite(walkRaw) && walkRaw > 0) {
        group.explicitWalkMin = Math.round(walkRaw);
      }
    } else if (group.explicitWalkMin === undefined && distRaw === group.minDistanceM && Number.isFinite(walkRaw) && walkRaw > 0) {
      group.explicitWalkMin = Math.round(walkRaw);
    }

    byStation.set(baseName, group);
  }

  const merged: MergedStation[] = [];
  for (const group of byStation.values()) {
    const sortedLines = Array.from(group.lines).sort((a, b) =>
      a.localeCompare(b, 'ko', { numeric: true })
    );
    const linesLabel = formatLinesLabel(sortedLines);
    const formattedName = linesLabel ? `${group.baseName}(${linesLabel})` : group.baseName;
    const distanceM = Math.round(group.minDistanceM);
    const computedWalk = Math.max(1, Math.round(distanceM / WALK_M_PER_MIN));
    const walkMinutes = group.explicitWalkMin ?? computedWalk;

    merged.push({
      baseName: group.baseName,
      lines: sortedLines,
      formattedName,
      distanceM,
      walkMinutes,
    });
  }

  merged.sort((a, b) => a.distanceM - b.distanceM || a.baseName.localeCompare(b.baseName, 'ko'));
  return merged;
}

export function formatPrimaryStationText(locationPoi: any, landmarkPool?: any): string | null {
  const stations = resolveMergedStations(locationPoi, landmarkPool);
  if (stations.length === 0) return null;
  const primary = stations[0];
  return `${primary.formattedName} 도보 ${primary.walkMinutes}분(${primary.distanceM}m)`;
}
