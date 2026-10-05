/**
 * @file kakao-basemap-scrub.ts
 * @description Kakao Static Map 원본(PNG)에 이미 구워져 있는 "지하철 출구 번호 마커"(노란 원 + 번호 + 출구 연결선) 제거.
 *
 * 배경 (2026-10-05): Kakao Static Map REST 는 레이어/마커 옵션 없이 베이스 타일에 출구 번호(노란 원 1~8)와 출구 연결선을 그려 준다.
 * level 파라미터는 무시되므로(실측: level 1/3/6 응답 바이트 동일) API 로는 끌 수 없다.
 * 우리 번호 마커(검정/파랑 1~5, 범례와 일치)와 혼동되므로 렌더 경로에서만 픽셀 단위로 지운다.
 *
 * 안전장치:
 *  - 색(노란 채움) + 크기(원 지름 22~28px, 원 면적비) + 개수 상한으로만 판정 → 도로(옅은 노랑)/지하철 노선(금색 대역)/큰 노란 면은 건드리지 않음
 *  - 판정 실패/예외 시 원본 그대로 반환 (지도 생성을 절대 막지 않음)
 *  - 지도에 없던 정보를 만들지 않는다: 마스크 영역은 주변 색 평균으로만 메움
 */
import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('kakao-basemap-scrub');

/** Kakao 출구 마커 채움색 (실측 RGB 254,246,99) */
function isMarkerFill(r: number, g: number, b: number): boolean {
  return r >= 240 && g > 205 && g <= 250 && b <= 135 && (r - b) >= 110;
}

/** 출구 연결선/마커 외곽선의 짙은 갈색 (실측 50,37,26 ~ 79,55,39) — 무채색 텍스트는 제외 */
function isMarkerInk(r: number, g: number, b: number): boolean {
  return r < 110 && g < 90 && b < 70 && (r - b) >= 15;
}

/** 라벨 글자/외곽선 등 어두운 잉크색 판정 (휘도 < 140) — 인페인팅 시 배경색으로 전파하지 않음. 금색 노선 대역(휘도≈148)·옅은 노랑 도로·흰 배경은 해당 없음 */
function isInkLike(r: number, g: number, b: number): boolean {
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/** 출구 마커 원 지름 범위(px, 2x 해상도 원본 기준 26px) */
const MIN_DIAMETER = 22;
const MAX_DIAMETER = 28;
const MIN_AREA = 150;
const MAX_AREA = 650;
/** 한 장당 제거 상한 (출구 번호는 보통 1~12개) — 초과하면 오검출로 보고 건너뜀 */
const MAX_MARKERS = 24;
/** 마커 채움 → 외곽선 포함 확장 반경(px) */
const DILATE_R = 4;
/** 가려진 채움 조각을 같이 지울 때, 이미 마스크된 영역과의 최대 거리(px) */
const FRAGMENT_NEAR_PX = 5;
/** 출구 연결선 추적 상한 (마커당 픽셀) */
const MAX_LINE_PIXELS_PER_MARKER = 5000;

export interface ScrubResult {
  buffer: Buffer;
  /** 제거한 출구 마커 수 */
  removed: number;
}

interface Comp { n: number; x0: number; y0: number; x1: number; y1: number; pix: number[] }

export function scrubExitMarkersRaw(data: Uint8Array, W: number, H: number, ch = 3): number {
  const idx = (x: number, y: number) => (y * W + x) * ch;
  const seen = new Uint8Array(W * H);
  const comps: Comp[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (seen[p]) continue;
      const o = p * ch;
      if (!isMarkerFill(data[o], data[o + 1], data[o + 2])) continue;
      const stack = [p];
      seen[p] = 1;
      const c: Comp = { n: 0, x0: x, y0: y, x1: x, y1: y, pix: [] };
      while (stack.length) {
        const q = stack.pop()!;
        c.n++;
        c.pix.push(q);
        const cx = q % W;
        const cy = (q / W) | 0;
        if (cx < c.x0) c.x0 = cx;
        if (cx > c.x1) c.x1 = cx;
        if (cy < c.y0) c.y0 = cy;
        if (cy > c.y1) c.y1 = cy;
        if (c.n > MAX_AREA * 4) continue; // 너무 큰 면: 더 키우지 않고 버림(아래 필터에서 탈락)
        if (cx > 0) { const j = q - 1; if (!seen[j]) { const k = j * ch; if (isMarkerFill(data[k], data[k + 1], data[k + 2])) { seen[j] = 1; stack.push(j); } } }
        if (cx < W - 1) { const j = q + 1; if (!seen[j]) { const k = j * ch; if (isMarkerFill(data[k], data[k + 1], data[k + 2])) { seen[j] = 1; stack.push(j); } } }
        if (cy > 0) { const j = q - W; if (!seen[j]) { const k = j * ch; if (isMarkerFill(data[k], data[k + 1], data[k + 2])) { seen[j] = 1; stack.push(j); } } }
        if (cy < H - 1) { const j = q + W; if (!seen[j]) { const k = j * ch; if (isMarkerFill(data[k], data[k + 1], data[k + 2])) { seen[j] = 1; stack.push(j); } } }
      }
      comps.push(c);
    }
  }

  const markers = comps.filter(c => {
    const w = c.x1 - c.x0 + 1;
    const h = c.y1 - c.y0 + 1;
    if (c.n < MIN_AREA || c.n > MAX_AREA) return false;
    if (w > MAX_DIAMETER || h > MAX_DIAMETER) return false;
    // 번호 글자/라벨에 가려 한 변이 잘린 마커도 허용: 긴 변은 원 지름 범위
    if (Math.max(w, h) < MIN_DIAMETER) return false;
    // 원형 면적비 (π/4 ≈ 0.785, 글자 구멍/가림 허용)
    return c.n / (w * h) >= 0.45;
  });
  if (markers.length === 0 || markers.length > MAX_MARKERS) return 0;

  const mask = new Uint8Array(W * H);
  const markDisc = (cx: number, cy: number, r: number) => {
    for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[y * W + x] = 1;
      }
    }
  };
  for (const m of markers) {
    // 채움 픽셀 확장(외곽선 포함) — 원 중심 추정에 의존하지 않아 가려진 마커도 처리
    for (const q of m.pix) markDisc(q % W, (q / W) | 0, DILATE_R);
    // 번호 글자(채움 안쪽 구멍) 메우기: 확장 영역이 채움 구멍을 포함하므로 추가 작업 불필요
  }

  // 라벨/선에 가려져 작은 조각(MIN_AREA 미만)으로 남은 같은 채움색은, 제거한 마커 바로 곁(FRAGMENT_NEAR_PX 이내)에 있을 때만 함께 제거
  const nearMask = (x: number, y: number): boolean => {
    for (let dy = -FRAGMENT_NEAR_PX; dy <= FRAGMENT_NEAR_PX; dy++) {
      for (let dx = -FRAGMENT_NEAR_PX; dx <= FRAGMENT_NEAR_PX; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && mask[ny * W + nx]) return true;
      }
    }
    return false;
  };
  const fragments: number[] = [];
  for (const m of markers) {
    for (let y = Math.max(0, m.y0 - 30); y <= Math.min(H - 1, m.y1 + 30); y++) {
      for (let x = Math.max(0, m.x0 - 30); x <= Math.min(W - 1, m.x1 + 30); x++) {
        const p = y * W + x;
        if (mask[p]) continue;
        const o = p * ch;
        if (isMarkerFill(data[o], data[o + 1], data[o + 2]) && nearMask(x, y)) fragments.push(p);
      }
    }
  }
  for (const p of fragments) markDisc(p % W, (p / W) | 0, 3);

  // 출구 연결선: 마스크 가장자리에서 짙은 갈색 픽셀을 따라가며 마스크에 추가 (마커당 상한)
  const ink = (p: number) => { const o = p * ch; return isMarkerInk(data[o], data[o + 1], data[o + 2]); };
  for (const m of markers) {
    const stack: number[] = [];
    const visited = new Set<number>();
    for (const q of m.pix) {
      const cx = q % W;
      const cy = (q / W) | 0;
      for (let dy = -DILATE_R - 2; dy <= DILATE_R + 2; dy++) {
        for (let dx = -DILATE_R - 2; dx <= DILATE_R + 2; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const p = y * W + x;
          if (!visited.has(p) && ink(p)) { visited.add(p); stack.push(p); }
        }
      }
      if (stack.length > MAX_LINE_PIXELS_PER_MARKER) break;
    }
    let budget = MAX_LINE_PIXELS_PER_MARKER;
    while (stack.length && budget-- > 0) {
      const p = stack.pop()!;
      markDisc(p % W, (p / W) | 0, 1);
      const x = p % W;
      const y = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!visited.has(j) && ink(j)) { visited.add(j); stack.push(j); }
        }
      }
    }
  }

  // 양파껍질식 인페인팅: 마스크 경계에서 안쪽으로 한 겹씩, 이미 알려진 이웃 픽셀 평균으로 채움 (결정적)
  const known = new Uint8Array(W * H);
  const queued = new Uint8Array(W * H);
  const filled = new Uint8Array(W * H);
  for (let i = 0; i < known.length; i++) known[i] = mask[i] ? 0 : 1;
  let frontier: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (known[p]) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H && known[ny * W + nx]) { touch = true; break; }
        }
      }
      if (touch) frontier.push(p);
    }
  }
  let guard = 0;
  while (frontier.length && guard++ < 200) {
    const fills: Array<[number, number[]]> = [];
    for (const p of frontier) {
      const x = p % W;
      const y = (p / W) | 0;
      // 이웃 픽셀의 채널별 중앙값 — 평균은 도로/건물 경계를 번지게 하므로 평탄한 색을 유지하는 중앙값 사용.
      // 라벨 글자/외곽선 같은 어두운 잉크색은 배경으로 번지지 않도록 1차로 제외 (배경색만 전파, 없으면 전체 이웃 사용)
      const collect = (skipInk: boolean): number[][] => {
        const vals: number[][] = Array.from({ length: ch }, () => []);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = ny * W + nx;
            if (!known[j]) continue;
            if (skipInk && !filled[j] && isInkLike(data[j * ch], data[j * ch + 1], data[j * ch + 2])) continue;
            for (let c = 0; c < ch; c++) vals[c].push(data[j * ch + c]);
          }
        }
        return vals;
      };
      let vals = collect(true);
      if (vals[0].length === 0) vals = collect(false);
      fills.push([p, vals.map(v => {
        if (v.length === 0) return 0;
        v.sort((a, b) => a - b);
        return v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2);
      })]);
    }
    const next: number[] = [];
    for (const [p, v] of fills) {
      for (let c = 0; c < ch; c++) data[p * ch + c] = v[c];
      known[p] = 1;
      filled[p] = 1;
    }
    for (const [p] of fills) {
      const x = p % W;
      const y = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!known[j] && !queued[j]) { queued[j] = 1; next.push(j); }
        }
      }
    }
    frontier = next;
  }
  return markers.length;
}

/**
 * Kakao 정적지도 PNG 에서 출구 번호 마커 제거. 실패/미검출 시 원본 반환.
 */
export async function scrubKakaoExitMarkers(input: Buffer): Promise<ScrubResult> {
  try {
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const removed = scrubExitMarkersRaw(data, info.width, info.height, info.channels);
    if (removed === 0) return { buffer: input, removed: 0 };
    const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
    return { buffer: out, removed };
  } catch (err) {
    log.warn('[kakao-basemap-scrub] 출구 마커 제거 건너뜀 (원본 사용):', err);
    return { buffer: input, removed: 0 };
  }
}
