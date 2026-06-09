// src/domain/building/mobile-im/financials.ts
// 모바일 IM용 고급 재무 계산 엔진.
// NOI · Cap Rate · IRR(5년) · 평당가 · 대지가치비중 · Gross Yield 산출.

export interface FinancialInputs {
  monthlyRentKrw: number;
  purchasePriceKrw: number;
  /** 운영비율 (%) — 미입력 시 자산 유형별 자동 산출 */
  opexRatioPct?: number;
  /** 보유 기간 (년) — 기본 5년 */
  holdYears?: number;
  /** 공실률 (%) — 기본 5% */
  vacancyRatePct?: number;
  /** 연 임대료 상승률 (%) — 기본 2% */
  rentGrowthPctPerYear?: number;
  /** ㎡당 개별공시지가 (원) */
  landPricePerSqm?: number;
  /** 건물 연면적 (㎡) */
  totalAreaSqm?: number;
  /** 자산 유형 — 한국어 포함 */
  assetType?: string;
}

export interface FinancialOutputs {
  annualNoi: { best: number; base: number; worst: number };
  capRate: { best: number; base: number; worst: number } | null;
  irr5Year: { best: number; base: number; worst: number } | null;
  pricePerSqm: number | null;
  pricePerPyeong: number | null;
  landValueRatio: number | null;
  yieldOnCost: number | null;
  disclaimer: string;
}

/**
 * 한국 CRE 시장 기준 자산 유형별 운영비율 (관리비·세금·보험·유지보수 합산)
 */
function getOpexRatio(assetType?: string): number {
  if (!assetType) return 0.18;
  const t = assetType.toLowerCase();
  if (t.includes('오피스') || t.includes('office')) return 0.15;
  if (t.includes('상가') || t.includes('근린')) return 0.20;
  if (t.includes('지식산업') || t.includes('지산')) return 0.22;
  if (t.includes('물류') || t.includes('창고')) return 0.12;
  if (t.includes('꼬마') || t.includes('빌딩') || t.includes('주상복합')) return 0.18;
  if (t.includes('호텔') || t.includes('숙박')) return 0.35;
  return 0.18;
}

/**
 * Newton-Raphson 반복법으로 IRR을 근사 계산
 * cash_flows = [-price, NOI_y1, NOI_y2, ..., NOI_yn + exit_value]
 * @returns IRR in percentage (e.g. 8.5 for 8.5%), or null if diverged
 */
function calculateIRR(cashFlows: number[]): number | null {
  let rate = 0.08; // 초기 추정치 8%
  for (let iter = 0; iter < 150; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const pv = cashFlows[t] / Math.pow(1 + rate, t);
      npv += pv;
      dnpv -= (t * pv) / (1 + rate);
    }
    if (Math.abs(npv) < 1) {
      // 소수점 1자리 %
      return Math.round(rate * 1000) / 10;
    }
    if (Math.abs(dnpv) < 0.001) break;
    const next = rate - npv / dnpv;
    if (next < -0.99 || next > 20) return null; // 발산
    rate = next;
  }
  return null;
}

/**
 * 고급 재무 지표를 계산합니다.
 * 모든 수치는 AI 추정값이며 면책 조항이 포함됩니다.
 */
export function calculateFinancials(inputs: FinancialInputs): FinancialOutputs {
  const {
    monthlyRentKrw,
    purchasePriceKrw,
    holdYears = 5,
    vacancyRatePct = 5,
    rentGrowthPctPerYear = 2,
    landPricePerSqm,
    totalAreaSqm,
    assetType,
  } = inputs;

  const opexRatio = inputs.opexRatioPct != null
    ? inputs.opexRatioPct / 100
    : getOpexRatio(assetType);
  const vacancyRate = vacancyRatePct / 100;
  const rentGrowth = rentGrowthPctPerYear / 100;

  const annualGross = monthlyRentKrw * 12;

  // NOI 시나리오 (80% 신뢰구간)
  // 최적: 공실 0%, 운영비 -2pp
  // 기본: 입력 공실률, 기본 운영비
  // 최악: 공실 최대 20%, 운영비 +3pp
  const noiBest  = annualGross * 1.0 * (1 - Math.max(0, opexRatio - 0.02));
  const noiBase  = annualGross * (1 - vacancyRate) * (1 - opexRatio);
  const noiWorst = annualGross * (1 - Math.min(0.20, vacancyRate * 2)) * (1 - (opexRatio + 0.03));

  // Cap Rate
  let capRate: { best: number; base: number; worst: number } | null = null;
  if (purchasePriceKrw > 0) {
    capRate = {
      best:  parseFloat(((noiBest  / purchasePriceKrw) * 100).toFixed(2)),
      base:  parseFloat(((noiBase  / purchasePriceKrw) * 100).toFixed(2)),
      worst: parseFloat(((noiWorst / purchasePriceKrw) * 100).toFixed(2)),
    };
  }

  // 5년 IRR (진입 Cap Rate로 매각가 추정)
  let irr5Year: { best: number; base: number; worst: number } | null = null;
  if (purchasePriceKrw > 0 && noiBase > 0) {
    const exitCapRate = capRate ? capRate.base / 100 : 0.035;
    const buildCFs = (startNoi: number, growth: number): number[] => {
      const cfs = [-purchasePriceKrw];
      for (let y = 1; y <= holdYears; y++) {
        const periodNoi = startNoi * Math.pow(1 + growth, y - 1);
        const exitValue = y === holdYears ? periodNoi / exitCapRate : 0;
        cfs.push(periodNoi + exitValue);
      }
      return cfs;
    };

    const irrBase  = calculateIRR(buildCFs(noiBase,  rentGrowth));
    const irrBest  = calculateIRR(buildCFs(noiBest,  rentGrowth + 0.01));
    const irrWorst = calculateIRR(buildCFs(noiWorst, Math.max(0, rentGrowth - 0.01)));

    if (irrBase !== null) {
      irr5Year = {
        best:  irrBest  ?? irrBase + 1.5,
        base:  irrBase,
        worst: irrWorst ?? Math.max(0, irrBase - 2.0),
      };
    }
  }

  // 평당·㎡당 매매가
  const pricePerSqm = (purchasePriceKrw > 0 && totalAreaSqm && totalAreaSqm > 0)
    ? Math.round(purchasePriceKrw / totalAreaSqm) : null;
  const pricePerPyeong = pricePerSqm ? Math.round(pricePerSqm * 3.30578) : null;

  // 대지 가치 비중 (공시지가 × 대지면적 / 매매가)
  const landValueRatio = (landPricePerSqm && totalAreaSqm && purchasePriceKrw > 0)
    ? parseFloat(((landPricePerSqm * totalAreaSqm / purchasePriceKrw) * 100).toFixed(1))
    : null;

  // 총 수익률 (Gross Yield)
  const yieldOnCost = (purchasePriceKrw > 0 && monthlyRentKrw > 0)
    ? parseFloat(((annualGross / purchasePriceKrw) * 100).toFixed(2))
    : null;

  return {
    annualNoi: {
      best:  Math.round(noiBest),
      base:  Math.round(noiBase),
      worst: Math.round(noiWorst),
    },
    capRate,
    irr5Year,
    pricePerSqm,
    pricePerPyeong,
    landValueRatio,
    yieldOnCost,
    disclaimer: 'AI 추정값 (참고용). 실제 수익은 임대차 조건·공실률·세금에 따라 상이합니다.',
  };
}

/**
 * 재무 지표를 IM income_analysis 섹션용 마크다운 테이블로 포맷합니다.
 */
export function formatFinancialsMarkdown(f: FinancialOutputs): string {
  const bil = (n: number) => `약 ${(n / 100_000_000).toFixed(1)}억 원`;
  const pct = (n: number) => `${n.toFixed(1)}%`;
  const rows: string[] = [];

  if (f.annualNoi.base > 0) {
    rows.push(`| **연 순영업소득(NOI)** | ${bil(f.annualNoi.worst)}~**${bil(f.annualNoi.best)}** | 80% 신뢰구간 추정 |`);
  }
  if (f.capRate) {
    rows.push(`| **Cap Rate** | ${pct(f.capRate.worst)}–**${pct(f.capRate.best)}** | 매각가 기준 구간 추정 |`);
  }
  if (f.irr5Year) {
    rows.push(`| **IRR (5년 보유)** | ${pct(f.irr5Year.worst)}–**${pct(f.irr5Year.best)}** | 시나리오 추정, 참고용 |`);
  }
  if (f.yieldOnCost !== null) {
    rows.push(`| **총 수익률(Gross Yield)** | **${pct(f.yieldOnCost)}** | 연 임대수입/매각가 |`);
  }
  if (f.pricePerPyeong !== null) {
    rows.push(`| **평당 매매가** | **${f.pricePerPyeong.toLocaleString()}원/평** | 참고용 |`);
  }
  if (f.landValueRatio !== null) {
    rows.push(`| **대지 지분 가치 비중** | **${f.landValueRatio}%** | 하방 경직성 지표 |`);
  }

  if (rows.length === 0) return '';

  return `### 수익 지표 (AI 추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
${rows.join('\n')}

> ⚠️ **면책**: ${f.disclaimer}`;
}
