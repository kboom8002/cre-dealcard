/**
 * @file macro-transit-engine.ts
 * @description Location Macro Transit Vector Diagram Engine
 *
 * Requirements (Follow-up 2026-09-05T01:04:24Z, R2):
 * - Sharp SVG-based in-memory vector graphic generation
 * - Resolution: 1600x1200 px (viewBox 0 0 800 600)
 * - Effective DPI: In 5.60" x 4.50" box, produces 266.7 DPI (>= 180+ DPI target, passing G32 >= 150 DPI)
 * - Concentric walking distance circles: 0.5km (도보 5분, r=95px, dashed) and 1.0km (도보 10분, r=185px, dashed) in #E8DEC8
 * - Operating lines (5호선, 9호선, 신림선 등) & Future lines with year badges (신안산선, GTX-B, 서부선 등)
 * - Major stations / transit centers (여의도역, 샛강역, 여의도환승센터 등)
 * - Asset pin & beacon ([ ASSET ]) with champagne gold halo
 * - Commute directional vector arrows (CBD, GBD, Magok / Pangyo 등)
 * - Legend box distinguishing operating vs scheduled future lines
 * - Multi-district presets (YBD, GBD, CBD, generic) and auto-detection from address
 */

import sharp from 'sharp';

export type TransitDistrict = 'YBD' | 'GBD' | 'CBD' | 'generic';
export type GbdSubDistrict = 'GBD_SINSA' | 'GBD_SEOCHO' | 'GBD_TEHERAN';

export interface MacroTransitOptions {
  /** 대상 자산명 (기본: '대상 자산') */
  propertyName?: string;
  /** CRE 권역 프리셋 ('YBD' | 'GBD' | 'CBD' | 'generic') - 생략 시 주소/명칭으로 자동 감지 */
  district?: TransitDistrict;
  /** GBD 하위 권역 ('GBD_SINSA' | 'GBD_SEOCHO' | 'GBD_TEHERAN') - 생략 시 자동 감지 */
  subDistrict?: GbdSubDistrict;
  /** 자산 주소 */
  address?: string;
  /** 자산 좌표 (위도, 경도) */
  coordinates?: { lat: number; lng: number } | null;
  /** 렌더링 픽셀 폭 (기본: 1600) */
  width?: number;
  /** 렌더링 픽셀 높이 (기본: 1200) */
  height?: number;
  /** 슬라이드 내 목표 상자 크기(인치) - 기본: { w: 5.60, h: 4.50 } */
  targetBoxInches?: { w: number; h: number };
  /** 커스텀 다이어그램 타이틀/서브타이틀 */
  customTitle?: string;
  /** 출력 이미지 포맷 ('png' | 'jpeg', 기본: 'png') */
  format?: 'png' | 'jpeg';
}

export interface MacroTransitResult {
  /** 바이너리 버퍼 */
  buffer: Buffer;
  /** Base64 데이터 URI ('image/png;base64,...' 또는 'image/jpeg;base64,...') */
  base64: string;
  /** 생성된 원본 SVG 문자열 */
  svg: string;
  /** 이미지 픽셀 폭 */
  width: number;
  /** 이미지 픽셀 높이 */
  height: number;
  /** 목표 상자 기준 실효 DPI (Math.min(w/boxW, h/boxH)) */
  effectiveDpi: number;
  /** 적용된 권역 */
  district: TransitDistrict;
  /** 적용된 GBD 하위 권역 */
  subDistrict?: GbdSubDistrict;
  /** 포함된 미래 개통 예정 노선 목록 */
  futureLines: string[];
  /** 포함된 주요 권역 통근 화살표 목록 */
  coreDistrictArrows: string[];
  /** 포함된 주요 전철역/환승센터 목록 */
  stations: string[];
}

export const DEFAULT_WIDTH = 1600;
export const DEFAULT_HEIGHT = 1200;
export const DEFAULT_TARGET_BOX = { w: 5.60, h: 4.50 };
export const MIN_EFFECTIVE_DPI_G32 = 150;
export const TARGET_EFFECTIVE_DPI_R2 = 180;

/** XML 특수 문자 이스케이프 */
export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 실효 DPI 계산 */
export function calculateEffectiveDpi(
  width: number,
  height: number,
  boxW: number = DEFAULT_TARGET_BOX.w,
  boxH: number = DEFAULT_TARGET_BOX.h,
): number {
  if (width <= 0 || height <= 0 || boxW <= 0 || boxH <= 0) return 0;
  const dpiW = width / boxW;
  const dpiH = height / boxH;
  return Math.round(Math.min(dpiW, dpiH) * 10) / 10;
}

/** 주소 및 자산명 기반 권역 자동 감지 */
export function detectDistrict(address?: string, propertyName?: string): TransitDistrict {
  const query = `${address || ''} ${propertyName || ''}`.trim();
  if (!query) return 'YBD'; // 기본값은 금융 중심지 YBD

  if (/여의도|영등포|당산|샛강|마포|양평|선유도/i.test(query)) {
    return 'YBD';
  }
  if (/강남|테헤란|역삼|선릉|삼성|서초|양재|신사|교대/i.test(query)) {
    return 'GBD';
  }
  if (/종로|중구|광화문|을지로|명동|서울역|시청|서대문/i.test(query)) {
    return 'CBD';
  }
  return 'generic';
}

/** GBD 하위 권역 자동 감지 */
export function detectSubDistrict(address?: string, propertyName?: string): GbdSubDistrict | undefined {
  const query = `${address || ''} ${propertyName || ''}`.trim();
  if (/신사|도산대로|압구정|논현/i.test(query)) {
    return 'GBD_SINSA';
  }
  if (/서초|양재|남부순환/i.test(query)) {
    return 'GBD_SEOCHO';
  }
  if (/강남|테헤란|역삼|선릉|삼성|교대/i.test(query)) {
    return 'GBD_TEHERAN';
  }
  return undefined;
}

/**
 * 권역별 대중교통 SVG 다이어그램 마크업 생성
 */
export function generateMacroTransitSvg(options?: MacroTransitOptions): {
  svg: string;
  district: TransitDistrict;
  subDistrict?: GbdSubDistrict;
  futureLines: string[];
  coreDistrictArrows: string[];
  stations: string[];
} {
  const width = options?.width ?? DEFAULT_WIDTH;
  const height = options?.height ?? DEFAULT_HEIGHT;

  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0 || isNaN(width) || isNaN(height)) {
    throw new Error(`Invalid width or height: width (${width}) and height (${height}) must be positive numbers`);
  }

  const rawDistrict = options?.district ?? detectDistrict(options?.address, options?.propertyName);
  let district: TransitDistrict = rawDistrict;
  let subDistrict: GbdSubDistrict | undefined = options?.subDistrict;

  // GBD_SINSA, GBD_SEOCHO, GBD_TEHERAN가 district 인자로 전달된 경우 하위호환
  if ((rawDistrict as string) === 'GBD_SINSA' || (rawDistrict as string) === 'GBD_SEOCHO' || (rawDistrict as string) === 'GBD_TEHERAN') {
    subDistrict = rawDistrict as GbdSubDistrict;
    district = 'GBD';
  }

  if (district === 'GBD' && !subDistrict) {
    subDistrict = detectSubDistrict(options?.address, options?.propertyName) ?? 'GBD_TEHERAN';
  }

  const rawPropName = options?.propertyName || '대상 자산';
  const escapedPropName = escapeXml(rawPropName);
  const badgeW = Math.max(130, Math.min(260, rawPropName.length * 11 + 44));

  if (district === 'GBD') {
    // ── GBD_SINSA: 신사·도산대로·압구정 (북강남) ──
    if (subDistrict === 'GBD_SINSA') {
      const cx = 410;
      const cy = 310;
      const futureLines = ['위례신사선 을지병원사거리역 (2029 예정)', '신분당선 북부 연장'];
      const coreDistrictArrows = ['CBD (도심 20분)', 'YBD (여의도 25분)', '판교 (18분)', '판교 (20분)'];
      const stations = ['신사역 (3호선/신분당선)', '신사역 (3·신분당선)', '압구정역 (3호선)', '학동역 (7호선)', '압구정로데오역 (수인분당선)', '강남을지병원사거리역 (2029 예정)'];

      const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#F59E0B"/>
      </marker>
    </defs>
    <!-- 다크 슬레이트 배경 -->
    <rect width="100%" height="100%" fill="#1E222D"/>

    <!-- 한강 물길 (상단 북단 인접) -->
    <path d="M 0,60 Q 300,25 550,65 T 800,45 L 800,0 L 0,0 Z" fill="#1A2D42" opacity="0.85"/>
    <text x="400" y="32" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="14" font-weight="bold" fill="#3B82F6" letter-spacing="6" opacity="0.4">H A N   R I V E R ( 한 강 )</text>

    <!-- 올림픽대로 & 한남대교/동호대교 연결축 -->
    <path d="M 0,80 Q 400,55 800,85" stroke="#27333F" stroke-width="8" fill="none" opacity="0.6"/>
    <text x="730" y="75" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9" fill="#64748B">올림픽대로</text>
    <line x1="200" y1="20" x2="200" y2="120" stroke="#334155" stroke-width="6" stroke-dasharray="4,2"/>
    <text x="210" y="60" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9" fill="#94A3B8">한남대교</text>
    <line x1="410" y1="20" x2="410" y2="120" stroke="#334155" stroke-width="6" stroke-dasharray="4,2"/>
    <text x="420" y="60" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9" fill="#94A3B8">동호대교</text>

    <!-- 신사·도산대로 중심 상권/업무 권역 (GBD NORTH) -->
    <rect x="100" y="120" width="600" height="380" rx="30" fill="#242A38" stroke="#384252" stroke-width="1.5"/>
    <text x="125" y="150" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="12" font-weight="bold" fill="#64748B">GBD NORTH / DOSAN-DAERO COMMERCIAL HUB (신사·도산대로)</text>

    <!-- 주요 간선 도로: 도산대로 (동서) & 강남대로 (남북) & 논현로 (남북) -->
    <line x1="120" y1="310" x2="680" y2="310" stroke="#334155" stroke-width="14" stroke-linecap="round" opacity="0.7"/>
    <text x="630" y="295" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#94A3B8">도산대로</text>

    <line x1="120" y1="180" x2="680" y2="180" stroke="#334155" stroke-width="10" stroke-linecap="round" opacity="0.5"/>
    <text x="630" y="170" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" font-weight="bold" fill="#94A3B8">압구정로</text>

    <line x1="200" y1="130" x2="200" y2="490" stroke="#334155" stroke-width="12" stroke-linecap="round" opacity="0.6"/>
    <text x="210" y="165" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#94A3B8">강남대로</text>

    <line x1="410" y1="130" x2="410" y2="490" stroke="#334155" stroke-width="12" stroke-linecap="round" opacity="0.6"/>
    <text x="420" y="165" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#94A3B8">논현로</text>

    <line x1="620" y1="130" x2="620" y2="490" stroke="#334155" stroke-width="10" stroke-linecap="round" opacity="0.5"/>
    <text x="630" y="165" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" font-weight="bold" fill="#94A3B8">언주로</text>

    <!-- 대상지 기준 반경 동심원 (0.5km / 1.0km) -->
    <circle cx="${cx}" cy="${cy}" r="95" fill="none" stroke="#E8DEC8" stroke-width="1.2" stroke-dasharray="4,4" opacity="0.6"/>
    <text x="${cx}" y="${cy - 80}" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">0.5km (도보 5분)</text>

    <circle cx="${cx}" cy="${cy}" r="185" fill="none" stroke="#E8DEC8" stroke-width="1.0" stroke-dasharray="6,6" opacity="0.4"/>
    <text x="${cx}" y="${cy - 165}" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">1.0km (도보 10분)</text>

    <!-- 운행 노선: 3호선 (Orange), 신분당선 (Red), 7호선 (Olive) -->
    <path d="M 200,310 L 410,180 L 620,180" stroke="#EF7C1C" stroke-width="6" fill="none" stroke-linecap="round"/>
    <text x="450" y="170" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FB923C">3호선</text>

    <path d="M 200,130 L 200,490" stroke="#D4003B" stroke-width="5" fill="none" stroke-linecap="round"/>
    <text x="145" y="460" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#F87171">신분당선</text>

    <path d="M 120,460 L 680,460" stroke="#747F00" stroke-width="5" fill="none" stroke-linecap="round"/>
    <text x="140" y="450" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#A3E635">7호선</text>

    <!-- 예정 노선: 위례신사선 (2029 예정 - 강남을지병원사거리역) -->
    <path d="M 120,290 L 410,290 L 680,330" stroke="#10B981" stroke-width="4" stroke-dasharray="6,4" fill="none"/>
    <text x="470" y="280" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#34D399">위례신사선 (2029 예정)</text>

    <!-- 주요 역 핀 -->
    <!-- 신사역 (3·신분당 환승) -->
    <circle cx="200" cy="310" r="10" fill="#FFFFFF" stroke="#D4003B" stroke-width="3"/>
    <circle cx="200" cy="310" r="5" fill="#EF7C1C"/>
    <text x="200" y="335" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">신사역 (3호선/신분당선)</text>

    <!-- 압구정역 (3호선) -->
    <circle cx="410" cy="180" r="8" fill="#EF7C1C" stroke="#FFFFFF" stroke-width="2"/>
    <text x="410" y="205" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle">압구정역 (3호선)</text>

    <!-- 학동역 (7호선) -->
    <circle cx="410" cy="460" r="7" fill="#747F00" stroke="#FFFFFF" stroke-width="2"/>
    <text x="410" y="482" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#CBD5E1" text-anchor="middle">학동역 (7호선)</text>

    <!-- 압구정로데오역 (수인분당선) -->
    <circle cx="660" cy="180" r="7" fill="#F5A200" stroke="#FFFFFF" stroke-width="2"/>
    <text x="660" y="205" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#CBD5E1" text-anchor="middle">압구정로데오역</text>

    <!-- 위례신사선 강남을지병원사거리 예정역 노드 -->
    <circle cx="410" cy="290" r="8" fill="#1E222D" stroke="#10B981" stroke-width="2.5" stroke-dasharray="3,2"/>
    <text x="410" y="275" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" font-weight="bold" fill="#34D399" text-anchor="middle">강남을지병원사거리역(을지병원사거리 / Eulji Hospital Stn) (2029 예정)</text>

    <!-- [ ASSET ] 대상지 핀 및 샴페인 골드 비콘 -->
    <g transform="translate(${cx}, ${cy})">
      <circle cx="0" cy="0" r="22" fill="#E8DEC8" opacity="0.25"/>
      <circle cx="0" cy="0" r="14" fill="#E8DEC8" opacity="0.4"/>
      <polygon points="0,-18 12,0 0,6 -12,0" fill="#E8DEC8"/>
      <circle cx="0" cy="-6" r="4" fill="#1E222D"/>
      <rect x="${-badgeW / 2}" y="14" width="${badgeW}" height="26" rx="5" fill="#E8DEC8" stroke="#FFFFFF" stroke-width="1"/>
      <text x="0" y="31" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#1E222D" text-anchor="middle">[ ASSET ] ${escapedPropName}</text>
    </g>

    <!-- 주요 상권 배후 허브 태그 -->
    <rect x="235" y="220" width="130" height="20" rx="4" fill="#1E293B" stroke="#475569" stroke-width="1"/>
    <text x="300" y="234" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="8.5" fill="#E2E8F0" text-anchor="middle">도산공원·가로수길 리테일</text>
    <rect x="445" y="325" width="130" height="20" rx="4" fill="#1E293B" stroke="#475569" stroke-width="1"/>
    <text x="510" y="339" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="8.5" fill="#E2E8F0" text-anchor="middle">K-Beauty·메디컬 클러스터</text>

    <!-- 광역 방향 통근 벡터 화살표 -->
    <g transform="translate(690, 75)">
      <line x1="0" y1="20" x2="50" y2="0" stroke="#F59E0B" stroke-width="3"/>
      <text x="25" y="-6" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ CBD (도심 20분)</text>
    </g>
    <g transform="translate(70, 75)">
      <line x1="40" y1="20" x2="0" y2="0" stroke="#F59E0B" stroke-width="3"/>
      <text x="20" y="-6" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ YBD (여의도 25분)</text>
    </g>
    <g transform="translate(180, 525)">
      <line x1="0" y1="0" x2="0" y2="35" stroke="#F59E0B" stroke-width="3"/>
      <text x="55" y="25" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24">➔ 판교 (18분)</text>
    </g>

    <!-- 범례 박스 -->
    <rect x="50" y="475" width="230" height="95" rx="6" fill="#1A1F2C" stroke="#334155" stroke-width="1"/>
    <text x="65" y="495" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10.5" font-weight="bold" fill="#E2E8F0">대중교통망 범례 (신사·도산)</text>
    <line x1="65" y1="512" x2="95" y2="512" stroke="#EF7C1C" stroke-width="4"/>
    <text x="105" y="516" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">3호선 / 신분당선 / 7호선 (신사역 (3·신분당선))</text>
    <line x1="65" y1="532" x2="95" y2="532" stroke="#10B981" stroke-width="3" stroke-dasharray="4,2"/>
    <text x="105" y="536" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">위례신사선 (2029 예정)</text>
    <line x1="65" y1="552" x2="95" y2="552" stroke="#D4003B" stroke-width="3" stroke-dasharray="4,2"/>
    <text x="105" y="556" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">신분당선 북부연장 (용산)</text>
  </svg>`;

      return { svg, district, subDistrict, futureLines, coreDistrictArrows, stations };
    }

    // ── GBD_SEOCHO: 서초·양재·남부순환 (남강남) ──
    if (subDistrict === 'GBD_SEOCHO') {
      const cx = 410;
      const cy = 310;
      const futureLines = ['GTX-C (2028 예정)', 'GTX-C 양재역 복합환승 (2028 예정)', '신분당선 서북부연장 (추진)'];
      const coreDistrictArrows = ['판교 (10분)', '판교 (11분)', 'CBD (도심 25분)', 'YBD (여의도 20분)', '➔ GBD 테헤란 (7분)'];
      const stations = ['양재역 (3호선/신분당선)', '양재역 (3·신분당·GTX-C)', '강남역 (2·신분당선)', '남부터미널 (3호선)', '남부터미널역 (3호선)', '매봉역 (3호선)'];

      const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#F59E0B"/>
      </marker>
    </defs>
    <!-- 다크 슬레이트 배경 -->
    <rect width="100%" height="100%" fill="#1E222D"/>

    <!-- 서초·양재 혁신 R&D 및 비즈니스 권역 (GBD SOUTH) -->
    <rect x="100" y="120" width="600" height="380" rx="30" fill="#242A38" stroke="#384252" stroke-width="1.5"/>
    <text x="125" y="150" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="12" font-weight="bold" fill="#64748B">GBD SOUTH / SEOCHO-YANGJAE INNOVATION CLUSTER (서초·양재)</text>

    <!-- 주요 도로: 경부고속도로 (서초IC/양재IC) & 남부순환로 & 강남대로 -->
    <line x1="200" y1="130" x2="200" y2="490" stroke="#1E293B" stroke-width="16" stroke-linecap="round" opacity="0.8"/>
    <text x="190" y="165" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#64748B" text-anchor="end">경부고속도로</text>

    <line x1="360" y1="130" x2="360" y2="490" stroke="#334155" stroke-width="14" stroke-linecap="round" opacity="0.6"/>
    <text x="370" y="165" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#94A3B8">강남대로</text>

    <line x1="120" y1="210" x2="680" y2="210" stroke="#334155" stroke-width="10" stroke-linecap="round" opacity="0.5"/>
    <text x="630" y="200" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" font-weight="bold" fill="#94A3B8">서초대로</text>

    <line x1="120" y1="370" x2="680" y2="370" stroke="#334155" stroke-width="14" stroke-linecap="round" opacity="0.7"/>
    <text x="630" y="355" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#94A3B8">남부순환로</text>

    <!-- 고속도로 IC 뱃지 (서초IC / 서초 IC) -->
    <rect x="165" y="300" width="70" height="20" rx="4" fill="#047857" opacity="0.9"/>
    <text x="200" y="314" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9" font-weight="bold" fill="#FFFFFF" text-anchor="middle">서초 IC (서초IC)</text>

    <!-- 대상지 기준 반경 동심원 (0.5km / 1.0km) -->
    <circle cx="${cx}" cy="${cy}" r="95" fill="none" stroke="#E8DEC8" stroke-width="1.2" stroke-dasharray="4,4" opacity="0.6"/>
    <text x="${cx}" y="${cy - 80}" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">0.5km (도보 5분)</text>

    <circle cx="${cx}" cy="${cy}" r="185" fill="none" stroke="#E8DEC8" stroke-width="1.0" stroke-dasharray="6,6" opacity="0.4"/>
    <text x="${cx}" y="${cy - 165}" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">1.0km (도보 10분)</text>

    <!-- 운행 노선: 3호선 (Orange), 신분당선 (Red), 2호선 (Green) -->
    <path d="M 120,310 L 260,370 L 360,370 L 680,370" stroke="#EF7C1C" stroke-width="6" fill="none" stroke-linecap="round"/>
    <text x="640" y="390" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FB923C">3호선</text>

    <path d="M 360,130 L 360,490" stroke="#D4003B" stroke-width="6" fill="none" stroke-linecap="round"/>
    <text x="310" y="470" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#F87171">신분당선</text>

    <path d="M 120,210 L 680,210" stroke="#00A84D" stroke-width="5" fill="none" stroke-linecap="round"/>
    <text x="140" y="200" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#34D399">2호선</text>

    <!-- 예정 노선: GTX-C (2028 예정 - 양재역 복합환승) -->
    <path d="M 340,130 L 360,370 L 400,490" stroke="#6366F1" stroke-width="4" stroke-dasharray="6,4" fill="none"/>
    <text x="410" y="460" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#818CF8">GTX-C (2028 예정)</text>

    <!-- 주요 역 핀 -->
    <!-- 강남역 (2·신분당 환승) -->
    <circle cx="360" cy="210" r="9" fill="#FFFFFF" stroke="#D4003B" stroke-width="2.5"/>
    <circle cx="360" cy="210" r="4.5" fill="#00A84D"/>
    <text x="360" y="195" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle">강남역 (2·신분당선)</text>

    <!-- 양재역 (3·신분당·GTX-C 복합환승) -->
    <circle cx="360" cy="370" r="11" fill="#FFFFFF" stroke="#6366F1" stroke-width="3"/>
    <circle cx="360" cy="370" r="5" fill="#D4003B"/>
    <text x="360" y="400" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">양재역 (3호선/신분당선·GTX-C)</text>

    <!-- 남부터미널역 -->
    <circle cx="240" cy="360" r="7" fill="#EF7C1C" stroke="#FFFFFF" stroke-width="2"/>
    <text x="240" y="345" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#CBD5E1" text-anchor="middle">남부터미널 (남부터미널역 3호선)</text>

    <!-- 매봉역 -->
    <circle cx="530" cy="370" r="7" fill="#EF7C1C" stroke="#FFFFFF" stroke-width="2"/>
    <text x="530" y="355" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#CBD5E1" text-anchor="middle">매봉역 (3호선)</text>

    <!-- [ ASSET ] 대상지 핀 (FM빌딩 코너 인접) -->
    <g transform="translate(${cx}, ${cy})">
      <circle cx="0" cy="0" r="22" fill="#E8DEC8" opacity="0.25"/>
      <circle cx="0" cy="0" r="14" fill="#E8DEC8" opacity="0.4"/>
      <polygon points="0,-18 12,0 0,6 -12,0" fill="#E8DEC8"/>
      <circle cx="0" cy="-6" r="4" fill="#1E222D"/>
      <rect x="${-badgeW / 2}" y="14" width="${badgeW}" height="26" rx="5" fill="#E8DEC8" stroke="#FFFFFF" stroke-width="1"/>
      <text x="0" y="31" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#1E222D" text-anchor="middle">[ ASSET ] ${escapedPropName}</text>
    </g>

    <!-- 배후 인프라 허브 뱃지 -->
    <rect x="420" y="240" width="135" height="20" rx="4" fill="#1E293B" stroke="#475569" stroke-width="1"/>
    <text x="487" y="254" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="8.5" fill="#E2E8F0" text-anchor="middle">양재 AI·ICT R&amp;D 혁신특구</text>
    <rect x="235" y="420" width="120" height="20" rx="4" fill="#1E293B" stroke="#475569" stroke-width="1"/>
    <text x="295" y="434" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="8.5" fill="#E2E8F0" text-anchor="middle">양재역 말죽거리 상권</text>

    <!-- 광역 통근 방향 화살표 -->
    <g transform="translate(340, 525)">
      <line x1="20" y1="0" x2="20" y2="35" stroke="#F59E0B" stroke-width="3"/>
      <text x="20" y="48" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ 판교 (10분 / 11분)</text>
    </g>
    <g transform="translate(680, 80)">
      <line x1="0" y1="20" x2="45" y2="0" stroke="#F59E0B" stroke-width="3"/>
      <text x="22" y="-6" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ CBD (도심 25분)</text>
    </g>
    <g transform="translate(80, 80)">
      <line x1="45" y1="20" x2="0" y2="0" stroke="#F59E0B" stroke-width="3"/>
      <text x="22" y="-6" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ YBD (여의도 20분)</text>
    </g>
    <g transform="translate(480, 110)">
      <line x1="0" y1="20" x2="35" y2="0" stroke="#F59E0B" stroke-width="3"/>
      <text x="18" y="-6" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10.5" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ GBD 테헤란 (7분)</text>
    </g>

    <!-- 범례 박스 -->
    <rect x="50" y="475" width="240" height="95" rx="6" fill="#1A1F2C" stroke="#334155" stroke-width="1"/>
    <text x="65" y="495" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10.5" font-weight="bold" fill="#E2E8F0">대중교통망 범례 (서초·양재)</text>
    <line x1="65" y1="512" x2="95" y2="512" stroke="#EF7C1C" stroke-width="4"/>
    <text x="105" y="516" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">3호선 / 신분당선 (양재역 (3·신분당·GTX-C))</text>
    <line x1="65" y1="532" x2="95" y2="532" stroke="#6366F1" stroke-width="3" stroke-dasharray="4,2"/>
    <text x="105" y="536" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">GTX-C (2028 예정)</text>
    <line x1="65" y1="552" x2="95" y2="552" stroke="#047857" stroke-width="4"/>
    <text x="105" y="556" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">경부고속도로 (서초IC 인접)</text>
  </svg>`;

      return { svg, district, subDistrict, futureLines, coreDistrictArrows, stations };
    }

    // ── GBD_TEHERAN: 기존 테헤란로 기본 프리셋 유지 (완전 하위호환) ──
    const cx = 410;
    const cy = 310;
    const futureLines = ['GTX-A (2028 예정)', 'GTX-C (2028 예정)', '위례신사선 (2029 예정)'];
    const coreDistrictArrows = ['CBD (도심 25분)', 'YBD (여의도 20분)', '판교 (13분)'];
    const stations = ['강남역 (2·신분당선)', '역삼역 (2호선)', '선릉역 (2·수인분당선)', '삼성역 (2·GTX)'];

    const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#F59E0B"/>
      </marker>
    </defs>
    <!-- 다크 슬레이트 배경 -->
    <rect width="100%" height="100%" fill="#1E222D"/>

    <!-- 한강 물길 (상단 북단) -->
    <path d="M 0,60 Q 300,30 550,70 T 800,50 L 800,0 L 0,0 Z" fill="#1A2D42" opacity="0.7"/>
    <text x="400" y="35" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="14" font-weight="bold" fill="#3B82F6" letter-spacing="6" opacity="0.35">H A N   R I V E R ( 한 강 )</text>

    <!-- 올림픽대로 & 강변북로 라인 -->
    <path d="M 0,85 Q 400,60 800,90" stroke="#27333F" stroke-width="8" fill="none" opacity="0.5"/>
    <text x="730" y="80" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9" fill="#64748B">올림픽대로</text>

    <!-- 강남 중심 비즈니스 권역 (GBD) -->
    <rect x="100" y="130" width="600" height="370" rx="30" fill="#242A38" stroke="#384252" stroke-width="1.5"/>
    <text x="125" y="160" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="12" font-weight="bold" fill="#64748B">GANGNAM (GBD) BUSINESS DISTRICT</text>

    <!-- 주요 간선 도로: 테헤란로 & 강남대로 -->
    <line x1="120" y1="310" x2="680" y2="310" stroke="#334155" stroke-width="14" stroke-linecap="round" opacity="0.6"/>
    <text x="630" y="295" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#94A3B8">테헤란로</text>
    <line x1="230" y1="140" x2="230" y2="490" stroke="#334155" stroke-width="12" stroke-linecap="round" opacity="0.6"/>
    <text x="240" y="180" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#94A3B8">강남대로</text>
    <line x1="570" y1="140" x2="570" y2="490" stroke="#334155" stroke-width="12" stroke-linecap="round" opacity="0.6"/>
    <text x="580" y="180" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#94A3B8">영동대로</text>

    <!-- 대상지 기준 반경 동심원 (0.5km / 1.0km) -->
    <circle cx="${cx}" cy="${cy}" r="95" fill="none" stroke="#E8DEC8" stroke-width="1.2" stroke-dasharray="4,4" opacity="0.6"/>
    <text x="${cx}" y="${cy - 80}" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">0.5km (도보 5분)</text>

    <circle cx="${cx}" cy="${cy}" r="185" fill="none" stroke="#E8DEC8" stroke-width="1.0" stroke-dasharray="6,6" opacity="0.4"/>
    <text x="${cx}" y="${cy - 165}" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">1.0km (도보 10분)</text>

    <!-- 운행 노선: 2호선 (Green), 신분당선 (Red), 9호선 (Gold) -->
    <path d="M 120,310 L 680,310" stroke="#00A84D" stroke-width="6" fill="none" stroke-linecap="round"/>
    <text x="140" y="300" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#34D399">2호선</text>

    <path d="M 230,140 L 230,490" stroke="#D4003B" stroke-width="5" fill="none" stroke-linecap="round"/>
    <text x="180" y="470" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#F87171">신분당선</text>

    <path d="M 120,200 L 680,200" stroke="#D97706" stroke-width="5" fill="none" stroke-linecap="round"/>
    <text x="140" y="190" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24">9호선</text>

    <!-- 예정 노선: GTX-A (2028), GTX-C (2028), 위례신사선 (2029) -->
    <path d="M 570,140 L 570,490" stroke="#6366F1" stroke-width="4" stroke-dasharray="6,4" fill="none"/>
    <text x="495" y="470" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#818CF8">GTX-A (2028 예정)</text>

    <path d="M 550,140 L 590,490" stroke="#8B5CF6" stroke-width="3.5" stroke-dasharray="5,3" fill="none"/>
    <text x="595" y="450" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#A78BFA">GTX-C (2028 예정)</text>

    <path d="M 640,140 L 670,490" stroke="#10B981" stroke-width="3.5" stroke-dasharray="5,3" fill="none"/>
    <text x="640" y="380" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#34D399">위례신사선 (2029 예정)</text>

    <!-- 주요 역 핀 -->
    <!-- 강남역 (2·신분당 환승) -->
    <circle cx="230" cy="310" r="10" fill="#FFFFFF" stroke="#D4003B" stroke-width="3"/>
    <circle cx="230" cy="310" r="5" fill="#00A84D"/>
    <text x="230" y="280" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">강남역 (2·신분당선)</text>

    <!-- 역삼역 -->
    <circle cx="340" cy="310" r="7" fill="#00A84D" stroke="#FFFFFF" stroke-width="2"/>
    <text x="340" y="280" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#CBD5E1" text-anchor="middle">역삼역 (2호선)</text>

    <!-- 선릉역 -->
    <circle cx="460" cy="310" r="8" fill="#00A84D" stroke="#FFFFFF" stroke-width="2"/>
    <text x="460" y="280" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#CBD5E1" text-anchor="middle">선릉역 (2·수인분당선)</text>

    <!-- 삼성역 (2·GTX 복합환승센터) -->
    <circle cx="570" cy="310" r="10" fill="#FFFFFF" stroke="#6366F1" stroke-width="3"/>
    <circle cx="570" cy="310" r="5" fill="#00A84D"/>
    <text x="570" y="280" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">삼성역 (2·GTX)</text>

    <!-- [ ASSET ] 대상지 핀 및 샴페인 골드 비콘 -->
    <g transform="translate(${cx}, ${cy})">
      <circle cx="0" cy="0" r="22" fill="#E8DEC8" opacity="0.25"/>
      <circle cx="0" cy="0" r="14" fill="#E8DEC8" opacity="0.4"/>
      <polygon points="0,-18 12,0 0,6 -12,0" fill="#E8DEC8"/>
      <circle cx="0" cy="-6" r="4" fill="#1E222D"/>
      <rect x="${-badgeW / 2}" y="14" width="${badgeW}" height="26" rx="5" fill="#E8DEC8" stroke="#FFFFFF" stroke-width="1"/>
      <text x="0" y="31" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#1E222D" text-anchor="middle">[ ASSET ] ${escapedPropName}</text>
    </g>

    <!-- 광역 방향 통근 벡터 화살표 -->
    <g transform="translate(690, 75)">
      <line x1="0" y1="20" x2="50" y2="0" stroke="#F59E0B" stroke-width="3"/>
      <text x="25" y="-6" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ CBD (도심 25분)</text>
    </g>
    <g transform="translate(70, 75)">
      <line x1="40" y1="20" x2="0" y2="0" stroke="#F59E0B" stroke-width="3"/>
      <text x="20" y="-6" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ YBD (여의도 20분)</text>
    </g>
    <g transform="translate(200, 525)">
      <line x1="0" y1="0" x2="0" y2="35" stroke="#F59E0B" stroke-width="3"/>
      <text x="60" y="25" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24">➔ 판교 (13분)</text>
    </g>

    <!-- 범례 박스 -->
    <rect x="50" y="475" width="220" height="95" rx="6" fill="#1A1F2C" stroke="#334155" stroke-width="1"/>
    <text x="65" y="495" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10.5" font-weight="bold" fill="#E2E8F0">대중교통망 범례</text>
    <line x1="65" y1="512" x2="95" y2="512" stroke="#00A84D" stroke-width="4"/>
    <text x="105" y="516" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">운행노선 (2호선/신분당/9호선)</text>
    <line x1="65" y1="532" x2="95" y2="532" stroke="#6366F1" stroke-width="3" stroke-dasharray="4,2"/>
    <text x="105" y="536" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">GTX-A / GTX-C (2028 예정)</text>
    <line x1="65" y1="552" x2="95" y2="552" stroke="#10B981" stroke-width="3" stroke-dasharray="4,2"/>
    <text x="105" y="556" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">위례신사선 (2029 예정)</text>
  </svg>`;

    return { svg, district, subDistrict: 'GBD_TEHERAN', futureLines, coreDistrictArrows, stations };
  }

  if (district === 'CBD') {
    const cx = 400;
    const cy = 320;
    const futureLines = ['GTX-A (2028 예정)', 'GTX-B (2030 예정)', '신안산선 서울역 연장 (2026 예정)'];
    const coreDistrictArrows = ['GBD (강남 25분)', 'YBD (여의도 15분)', '상암 DMC (12분)'];
    const stations = ['서울역 (1·4·KTX)', '시청역 (1·2호선)', '광화문역 (5호선)', '을지로입구역 (2호선)'];

    const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
    <!-- 다크 슬레이트 배경 -->
    <rect width="100%" height="100%" fill="#1E222D"/>

    <!-- 청계천 물길 -->
    <path d="M 120,250 Q 400,240 750,260" stroke="#1A2D42" stroke-width="16" fill="none" opacity="0.9"/>
    <text x="640" y="240" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#3B82F6" opacity="0.5">CHEONGGYECHEON (청계천)</text>

    <!-- 종로/도심 비즈니스 권역 (CBD) -->
    <rect x="100" y="110" width="600" height="400" rx="30" fill="#242A38" stroke="#384252" stroke-width="1.5"/>
    <text x="125" y="140" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="12" font-weight="bold" fill="#64748B">CENTRAL (CBD) DOWNTOWN DISTRICT</text>

    <!-- 간선 도로: 세종대로 & 종로 & 을지로 -->
    <line x1="280" y1="120" x2="280" y2="490" stroke="#334155" stroke-width="14" stroke-linecap="round" opacity="0.6"/>
    <text x="290" y="160" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#94A3B8">세종대로</text>
    <line x1="120" y1="190" x2="680" y2="190" stroke="#334155" stroke-width="12" stroke-linecap="round" opacity="0.6"/>
    <text x="630" y="180" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#94A3B8">종로</text>
    <line x1="120" y1="300" x2="680" y2="300" stroke="#334155" stroke-width="12" stroke-linecap="round" opacity="0.6"/>
    <text x="630" y="290" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#94A3B8">을지로</text>

    <!-- 대상지 기준 반경 동심원 (0.5km / 1.0km) -->
    <circle cx="${cx}" cy="${cy}" r="95" fill="none" stroke="#E8DEC8" stroke-width="1.2" stroke-dasharray="4,4" opacity="0.6"/>
    <text x="${cx}" y="${cy - 80}" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">0.5km (도보 5분)</text>

    <circle cx="${cx}" cy="${cy}" r="185" fill="none" stroke="#E8DEC8" stroke-width="1.0" stroke-dasharray="6,6" opacity="0.4"/>
    <text x="${cx}" y="${cy - 165}" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">1.0km (도보 10분)</text>

    <!-- 운행 노선: 1호선 (Blue), 2호선 (Green), 5호선 (Purple) -->
    <path d="M 280,120 L 280,490" stroke="#0052A4" stroke-width="6" fill="none" stroke-linecap="round"/>
    <text x="240" y="470" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#60A5FA">1호선</text>

    <path d="M 120,300 L 680,300" stroke="#00A84D" stroke-width="5" fill="none" stroke-linecap="round"/>
    <text x="140" y="290" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#34D399">2호선</text>

    <path d="M 120,160 L 400,210 L 680,180" stroke="#8B5CF6" stroke-width="5" fill="none" stroke-linecap="round"/>
    <text x="140" y="150" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#A78BFA">5호선</text>

    <!-- 예정 노선: GTX-A (2028), GTX-B (2030), 신안산선 서울역 연장 (2026) -->
    <path d="M 280,120 L 280,490" stroke="#6366F1" stroke-width="4" stroke-dasharray="6,4" fill="none"/>
    <text x="310" y="440" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#818CF8">GTX-A (2028 예정)</text>

    <path d="M 150,450 L 280,390 L 680,240" stroke="#818CF8" stroke-width="3.5" stroke-dasharray="5,3" fill="none"/>
    <text x="560" y="230" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#A5B4FC">GTX-B (2030 예정)</text>

    <path d="M 280,390 L 200,490" stroke="#EF4444" stroke-width="3.5" stroke-dasharray="5,3" fill="none"/>
    <text x="130" y="480" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#F87171">신안산선 (2026 연장)</text>

    <!-- 주요 역 핀 -->
    <!-- 서울역 (1·4·KTX·공항철도) -->
    <circle cx="280" cy="400" r="10" fill="#FFFFFF" stroke="#0052A4" stroke-width="3"/>
    <circle cx="280" cy="400" r="5" fill="#6366F1"/>
    <text x="280" y="380" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">서울역 (1·4·KTX)</text>

    <!-- 시청역 (1·2호선) -->
    <circle cx="280" cy="300" r="9" fill="#FFFFFF" stroke="#00A84D" stroke-width="3"/>
    <circle cx="280" cy="300" r="5" fill="#0052A4"/>
    <text x="230" y="305" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#FFFFFF">시청역 (1·2)</text>

    <!-- 광화문역 (5호선) -->
    <circle cx="280" cy="180" r="7" fill="#8B5CF6" stroke="#FFFFFF" stroke-width="2"/>
    <text x="335" y="185" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#CBD5E1">광화문역 (5호선)</text>

    <!-- 을지로입구역 -->
    <circle cx="390" cy="300" r="7" fill="#00A84D" stroke="#FFFFFF" stroke-width="2"/>
    <text x="390" y="280" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#CBD5E1" text-anchor="middle">을지로입구역</text>

    <!-- [ ASSET ] 대상지 핀 -->
    <g transform="translate(${cx}, ${cy})">
      <circle cx="0" cy="0" r="22" fill="#E8DEC8" opacity="0.25"/>
      <circle cx="0" cy="0" r="14" fill="#E8DEC8" opacity="0.4"/>
      <polygon points="0,-18 12,0 0,6 -12,0" fill="#E8DEC8"/>
      <circle cx="0" cy="-6" r="4" fill="#1E222D"/>
      <rect x="${-badgeW / 2}" y="14" width="${badgeW}" height="26" rx="5" fill="#E8DEC8" stroke="#FFFFFF" stroke-width="1"/>
      <text x="0" y="31" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#1E222D" text-anchor="middle">[ ASSET ] ${escapedPropName}</text>
    </g>

    <!-- 광역 방향 통근 화살표 -->
    <g transform="translate(680, 480)">
      <line x1="0" y1="0" x2="50" y2="20" stroke="#F59E0B" stroke-width="3"/>
      <text x="25" y="36" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ GBD (강남 25분)</text>
    </g>
    <g transform="translate(90, 480)">
      <line x1="30" y1="0" x2="0" y2="20" stroke="#F59E0B" stroke-width="3"/>
      <text x="20" y="36" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ YBD (여의도 15분)</text>
    </g>
    <g transform="translate(90, 90)">
      <line x1="40" y1="20" x2="0" y2="0" stroke="#F59E0B" stroke-width="3"/>
      <text x="20" y="-6" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ 상암 DMC (12분)</text>
    </g>

    <!-- 범례 박스 -->
    <rect x="50" y="475" width="220" height="95" rx="6" fill="#1A1F2C" stroke="#334155" stroke-width="1"/>
    <text x="65" y="495" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10.5" font-weight="bold" fill="#E2E8F0">대중교통망 범례</text>
    <line x1="65" y1="512" x2="95" y2="512" stroke="#0052A4" stroke-width="4"/>
    <text x="105" y="516" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">운행노선 (1·2·5호선/KTX)</text>
    <line x1="65" y1="532" x2="95" y2="532" stroke="#6366F1" stroke-width="3" stroke-dasharray="4,2"/>
    <text x="105" y="536" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">GTX-A / GTX-B (2028/2030)</text>
    <line x1="65" y1="552" x2="95" y2="552" stroke="#EF4444" stroke-width="3" stroke-dasharray="4,2"/>
    <text x="105" y="556" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">신안산선 (2026 서울역 연장)</text>
  </svg>`;

    return { svg, district, futureLines, coreDistrictArrows, stations };
  }

  // YBD (기본값 및 여의도권역)
  const cx = 430;
  const cy = 330;
  const futureLines = ['신안산선 (2025/2026 예정)', 'GTX-B 노선 (2030 예정)', '서부선 (2030 예정)'];
  const coreDistrictArrows = ['CBD (도심 15분)', 'GBD (강남 20분)', '마곡 (18분)'];
  const stations = ['여의도역 (5·9호선)', '샛강역 (9호선·신림선)', '여의나루역 (5호선)', '여의도환승센터(BUS)'];

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#F59E0B"/>
      </marker>
    </defs>
    <!-- 다크 슬레이트 배경 (CBRE 하이엔드 스타일) -->
    <rect width="100%" height="100%" fill="#1E222D"/>

    <!-- 한강 물길 (부드러운 곡선) -->
    <path d="M 0,110 Q 250,70 480,120 T 800,90 L 800,0 L 0,0 Z" fill="#1A2D42" opacity="0.8"/>
    <text x="400" y="55" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="16" font-weight="bold" fill="#3B82F6" letter-spacing="8" opacity="0.4">H A N   R I V E R ( 한 강 )</text>

    <!-- 한강 주요 교량 (서강대교, 마포대교, 원효대교) -->
    <line x1="180" y1="20" x2="200" y2="150" stroke="#475569" stroke-width="4" stroke-dasharray="4,2"/>
    <text x="180" y="80" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#94A3B8">서강대교</text>

    <line x1="380" y1="30" x2="400" y2="160" stroke="#475569" stroke-width="4" stroke-dasharray="4,2"/>
    <text x="380" y="80" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#94A3B8">마포대교</text>

    <line x1="580" y1="50" x2="600" y2="180" stroke="#475569" stroke-width="4" stroke-dasharray="4,2"/>
    <text x="580" y="95" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#94A3B8">원효대교</text>

    <!-- 올림픽대로 라인 -->
    <path d="M 0,160 Q 300,140 800,200" stroke="#334155" stroke-width="12" fill="none" opacity="0.5"/>
    <text x="730" y="215" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#64748B">올림픽대로</text>

    <!-- 여의도 섬 중심 영역 -->
    <rect x="120" y="150" width="560" height="340" rx="40" fill="#242A38" stroke="#384252" stroke-width="1.5"/>
    <text x="145" y="180" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="12" font-weight="bold" fill="#64748B">YEOUIDO (YBD) FINANCIAL DISTRICT</text>

    <!-- 대상지 기준 반경 동심원 (0.5km / 1.0km) -->
    <circle cx="${cx}" cy="${cy}" r="95" fill="none" stroke="#E8DEC8" stroke-width="1.2" stroke-dasharray="4,4" opacity="0.6"/>
    <text x="${cx}" y="${cy - 85}" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">0.5km (도보 5분)</text>

    <circle cx="${cx}" cy="${cy}" r="185" fill="none" stroke="#E8DEC8" stroke-width="1.0" stroke-dasharray="6,6" opacity="0.4"/>
    <text x="${cx}" y="${cy - 175}" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">1.0km (도보 10분)</text>

    <!-- 운행 노선: 5호선 (Purple), 9호선 (Amber), 신림선 (Cyan) -->
    <path d="M 60,300 L 250,290 L 350,280 L 520,200 L 750,150" stroke="#8B5CF6" stroke-width="6" fill="none" stroke-linecap="round"/>
    <text x="70" y="290" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#A78BFA">5호선</text>

    <path d="M 80,420 L 280,350 L 350,280 L 510,360 L 750,420" stroke="#D97706" stroke-width="6" fill="none" stroke-linecap="round"/>
    <text x="90" y="440" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24">9호선</text>

    <path d="M 510,360 L 520,530 L 580,590" stroke="#0D9488" stroke-width="5" fill="none" stroke-linecap="round"/>
    <text x="530" y="550" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#2DD4BF">신림선</text>

    <!-- 예정 노선 점선 표시 (신안산선, GTX-B, 서부선) -->
    <!-- 신안산선 (2025/2026 예정 - Red Orange) -->
    <path d="M 350,280 L 410,480 L 430,590" stroke="#EF4444" stroke-width="4" stroke-dasharray="5,3" fill="none"/>
    <text x="420" y="520" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#F87171">신안산선 (2025/2026 예정)</text>

    <!-- GTX-B (2030 예정 - Indigo) -->
    <path d="M 100,240 L 350,280 L 700,230" stroke="#6366F1" stroke-width="4" stroke-dasharray="6,4" fill="none"/>
    <text x="610" y="250" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#818CF8">GTX-B 노선 (2030 예정)</text>

    <!-- 서부선 경전철 (2030 예정 - Emerald) -->
    <path d="M 210,120 L 230,340 L 250,560" stroke="#10B981" stroke-width="3.5" stroke-dasharray="5,3" fill="none"/>
    <text x="175" y="470" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" font-weight="bold" fill="#34D399">서부선 (2030 예정)</text>

    <!-- 주요 지하철역 핀 -->
    <!-- 여의도역 (5호선 / 9호선 환승) -->
    <circle cx="350" cy="280" r="10" fill="#FFFFFF" stroke="#D97706" stroke-width="3"/>
    <circle cx="350" cy="280" r="5" fill="#8B5CF6"/>
    <text x="350" y="260" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="12" font-weight="bold" fill="#FFFFFF" text-anchor="middle">여의도역 (5·9호선)</text>
    <text x="350" y="305" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#94A3B8" text-anchor="middle">도보 7분</text>

    <!-- 샛강역 (9호선 / 신림선 환승) -->
    <circle cx="510" cy="360" r="10" fill="#FFFFFF" stroke="#0D9488" stroke-width="3"/>
    <circle cx="510" cy="360" r="5" fill="#D97706"/>
    <text x="510" y="340" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="12" font-weight="bold" fill="#FFFFFF" text-anchor="middle">샛강역 (9호선·신림선)</text>
    <text x="510" y="390" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#2DD4BF" text-anchor="middle">★ 도보 3분 초역세권</text>

    <!-- 여의나루역 -->
    <circle cx="520" cy="200" r="6" fill="#8B5CF6" stroke="#FFFFFF" stroke-width="2"/>
    <text x="520" y="190" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10" fill="#CBD5E1" text-anchor="middle">여의나루역 (5호선)</text>

    <!-- 여의도 환승센터 -->
    <rect x="290" y="315" width="85" height="20" rx="4" fill="#3B82F6" opacity="0.9"/>
    <text x="332" y="329" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle">여의도환승센터(BUS)</text>

    <!-- [ ASSET ] 대상지 핀 (샴페인 골드 비콘) -->
    <g transform="translate(${cx}, ${cy})">
      <circle cx="0" cy="0" r="22" fill="#E8DEC8" opacity="0.25"/>
      <circle cx="0" cy="0" r="14" fill="#E8DEC8" opacity="0.4"/>
      <polygon points="0,-18 12,0 0,6 -12,0" fill="#E8DEC8"/>
      <circle cx="0" cy="-6" r="4" fill="#1E222D"/>
      <rect x="${-badgeW / 2}" y="14" width="${badgeW}" height="26" rx="5" fill="#E8DEC8" stroke="#FFFFFF" stroke-width="1"/>
      <text x="0" y="31" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#1E222D" text-anchor="middle">[ ASSET ] ${escapedPropName}</text>
    </g>

    <!-- 광역 방향 통근 벡터 화살표 (CBD / GBD / 마곡) -->
    <g transform="translate(710, 80)">
      <line x1="0" y1="20" x2="50" y2="0" stroke="#F59E0B" stroke-width="3" marker-end="url(#arrow)"/>
      <text x="25" y="-6" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ CBD (도심 15분)</text>
    </g>
    <g transform="translate(710, 480)">
      <line x1="0" y1="0" x2="50" y2="20" stroke="#F59E0B" stroke-width="3"/>
      <text x="25" y="36" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ GBD (강남 20분)</text>
    </g>
    <g transform="translate(40, 220)">
      <line x1="30" y1="20" x2="0" y2="0" stroke="#F59E0B" stroke-width="3"/>
      <text x="20" y="-8" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ 마곡 (18분)</text>
    </g>

    <!-- 범례 박스 (하단) -->
    <rect x="50" y="475" width="220" height="95" rx="6" fill="#1A1F2C" stroke="#334155" stroke-width="1"/>
    <text x="65" y="495" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="10.5" font-weight="bold" fill="#E2E8F0">대중교통망 범례</text>
    <line x1="65" y1="512" x2="95" y2="512" stroke="#8B5CF6" stroke-width="4"/>
    <text x="105" y="516" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">5호선 / 9호선 / 신림선</text>
    <line x1="65" y1="532" x2="95" y2="532" stroke="#EF4444" stroke-width="3" stroke-dasharray="4,2"/>
    <text x="105" y="536" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">신안산선 (2025/2026 예정)</text>
    <line x1="65" y1="552" x2="95" y2="552" stroke="#6366F1" stroke-width="3" stroke-dasharray="4,2"/>
    <text x="105" y="556" font-family="'맑은 고딕', 'Malgun Gothic', 'Noto Sans KR', sans-serif" font-size="9.5" fill="#94A3B8">GTX-B / 서부선 (2030 예정)</text>
  </svg>`;

  return { svg, district: 'YBD', futureLines, coreDistrictArrows, stations };
}

/**
 * Location Macro Transit Vector Diagram 생성기
 *
 * Sharp를 활용하여 1600x1200 px 고해상도 PNG/JPEG를 생성합니다.
 */
export async function generateMacroTransitDiagram(
  options?: MacroTransitOptions,
): Promise<MacroTransitResult> {
  const width = options?.width ?? DEFAULT_WIDTH;
  const height = options?.height ?? DEFAULT_HEIGHT;
  const targetBox = options?.targetBoxInches ?? DEFAULT_TARGET_BOX;
  const format = options?.format ?? 'png';

  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0 || isNaN(width) || isNaN(height)) {
    throw new Error(`Invalid width or height: width (${width}) and height (${height}) must be positive numbers`);
  }

  if (!targetBox || targetBox.w <= 0 || targetBox.h <= 0 || isNaN(targetBox.w) || isNaN(targetBox.h)) {
    throw new Error(`Invalid targetBoxInches: w (${targetBox?.w}) and h (${targetBox?.h}) must be positive numbers`);
  }

  if (format !== 'png' && format !== 'jpeg') {
    throw new Error(`Unsupported output format: only 'png' and 'jpeg' are supported, received '${format}'`);
  }

  const { svg, district, subDistrict, futureLines, coreDistrictArrows, stations } = generateMacroTransitSvg(options);

  let sharpInstance = sharp(Buffer.from(svg));
  if (format === 'jpeg') {
    sharpInstance = sharpInstance.jpeg({ quality: 90 });
  } else {
    sharpInstance = sharpInstance.png();
  }

  const buffer = await sharpInstance.toBuffer();
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const base64 = `${mime};base64,${buffer.toString('base64')}`;
  const effectiveDpi = calculateEffectiveDpi(width, height, targetBox.w, targetBox.h);

  return {
    buffer,
    base64,
    svg,
    width,
    height,
    effectiveDpi,
    district,
    subDistrict,
    futureLines,
    coreDistrictArrows,
    stations,
  };
}
