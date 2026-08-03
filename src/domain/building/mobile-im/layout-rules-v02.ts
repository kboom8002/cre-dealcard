export interface LayoutContext {
  capRateSpreadPp: number;
  hasLeverageSlide: boolean;
  parcelCount: number;
  totalExclusionAreaM2: number;
  zoningItemCount: number;
  hasLocationSection: boolean;
  leaseMode: 'standard' | 'precise';
  disclosure: { dcf: string };
}

export interface LayoutRule {
  code: string;
  condition: (ctx: LayoutContext) => boolean;
  action: string;
}

export const LAYOUT_RULES_V02: LayoutRule[] = [
  { code: 'L08', condition: ctx => ctx.capRateSpreadPp > 0.3, action: 'Cap Rate 두 값 병기 + 차이 사유 블록 강제' },
  { code: 'L09', condition: ctx => ctx.hasLeverageSlide, action: '지가 시나리오 4개(하락 포함) 강제. 상승만 표시 금지' },
  { code: 'L10', condition: ctx => ctx.parcelCount >= 2, action: '필지 명세 슬라이드 추가' },
  { code: 'L11', condition: ctx => ctx.totalExclusionAreaM2 > 0, action: '유효 대지면적·유효 용적률 강조, 대장 면적과 병기' },
  { code: 'L12', condition: ctx => ctx.zoningItemCount > 0, action: '매수 목적별 relevance 필터, 전체 목록 부록' },
  { code: 'L13', condition: ctx => ctx.hasLocationSection, action: '공법·감정평가·접근성 3블록 분리' },
  { code: 'L14', condition: ctx => ctx.leaseMode === 'precise', action: '확장 표 + 상임법 판정 열 + 인상 여력 컨럼' },
  { code: 'L15', condition: ctx => ctx.disclosure.dcf !== 'hidden', action: '용어 해설 박스 동반 배치' },
];
