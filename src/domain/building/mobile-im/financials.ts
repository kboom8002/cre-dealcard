// src/domain/building/mobile-im/financials.ts
// 모바일 IM용 고급 재무 계산 엔진.
// NOI · Cap Rate · IRR(5년) · 평당가 · 대지가치비중 · Gross Yield 산출.

import { generateDCFSensitivity, calculateWACC, calculateIRR, type DCFOutputs } from "./dcf-sensitivity";

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
  /** 대지면적 (㎡) — 대지 가치 비중 계산용 */
  platAreaSqm?: number;
  /** 자산 유형 — 한국어 포함 */
  assetType?: string;
  totalDepositManwon?: number;
  mgmtFeeTotalManwon?: number;
  loanAmountManwon?: number;
}

export interface FinancialOutputs {
  annualNoi: { best: number; base: number; worst: number };
  capRate: { best: number; base: number; worst: number } | null;
  irr5Year: { best: number; base: number; worst: number } | null;
  pricePerSqm: number | null;
  pricePerPyeong: number | null;
  landValueRatio: number | null;
  yieldOnCost: number | null;
  totalDepositBil: number | null;
  loanAmountBil: number | null;
  equityRequired: number | null;
  leveragedYield: number | null;
  dcf10Year: DCFOutputs | null;
  wacc: number | null;
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

// calculateIRR is imported from dcf-sensitivity.ts (DRY — B-6 수정)

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
    platAreaSqm,
    assetType,
    totalDepositManwon,
    mgmtFeeTotalManwon,
    loanAmountManwon,
  } = inputs;

  const opexRatio = inputs.opexRatioPct != null
    ? inputs.opexRatioPct / 100
    : getOpexRatio(assetType);
  const vacancyRate = vacancyRatePct / 100;
  const rentGrowth = rentGrowthPctPerYear / 100;

  // 관리비를 연간 운영비에 반영 (만원 → 원)
  const annualMgmtFee = (mgmtFeeTotalManwon ?? 0) * 10000 * 12;

  const annualGross = monthlyRentKrw * 12;

  // 관리비가 입력된 경우, opex 대신 실제 관리비 사용
  const effectiveOpex = annualMgmtFee > 0
    ? annualMgmtFee
    : annualGross * opexRatio;
  const effectiveOpexHigh = annualMgmtFee > 0
    ? annualMgmtFee * 1.15  // 관리비 15% 증가 시나리오
    : annualGross * (opexRatio + 0.03);

  const noiBest  = annualGross - (annualMgmtFee > 0 ? annualMgmtFee * 0.9 : annualGross * Math.max(0, opexRatio - 0.02));
  const noiBase  = annualGross * (1 - vacancyRate) - effectiveOpex;
  const noiWorst = annualGross * (1 - Math.min(0.20, vacancyRate * 2)) - effectiveOpexHigh;

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
    // Exit cap rate: entry cap + 50bp spread (시장 관행 반영)
    const exitCapRate = capRate ? (capRate.base + 0.5) / 100 : 0.04;
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
  // platAreaSqm(대지면적)이 없으면 산정 불가 (연면적으로 폴백 시 과대산정 방지)
  const landPriceTotal = platAreaSqm && landPricePerSqm
    ? platAreaSqm * landPricePerSqm
    : 0;
  const landValueRatio = (purchasePriceKrw > 0 && landPriceTotal > 0 && platAreaSqm)
    ? parseFloat(((landPriceTotal / purchasePriceKrw) * 100).toFixed(1))
    : null;

  // 총 수익률 (Gross Yield)
  const yieldOnCost = (purchasePriceKrw > 0 && monthlyRentKrw > 0)
    ? parseFloat(((annualGross / purchasePriceKrw) * 100).toFixed(2))
    : null;

  // 보증금/융자 기반 레버리지 분석
  const depositKrw = (totalDepositManwon ?? 0) * 10000;
  const loanKrw = (loanAmountManwon ?? 0) * 10000;
  const totalDepositBil = depositKrw > 0 ? parseFloat((depositKrw / 1e8).toFixed(1)) : null;
  const loanAmountBil = loanKrw > 0 ? parseFloat((loanKrw / 1e8).toFixed(1)) : null;
  const equityKrw = purchasePriceKrw - depositKrw - loanKrw;
  const equityRequired = equityKrw > 0 ? parseFloat((equityKrw / 1e8).toFixed(1)) : null;
  const leveragedYield = (equityKrw > 0 && noiBase > 0)
    ? parseFloat(((noiBase / equityKrw) * 100).toFixed(2))
    : null;

  // WACC 산출 (자기자본비용 8%, 타인자본비용 5%, 법인세 22% 가정)
  // B-9 수정: debtRatio가 1을 초과하지 않도록 클램핑 (과도 레버리지 방어)
  let wacc: number | null = null;
  const rawDebtRatio = purchasePriceKrw > 0 ? (loanKrw + depositKrw) / purchasePriceKrw : 0;
  const debtRatio = Math.min(Math.max(rawDebtRatio, 0), 1);
  const equityRatio = Math.max(1 - debtRatio, 0);
  if (purchasePriceKrw > 0) {
    wacc = calculateWACC(equityRatio, 0.08, debtRatio, 0.05, 0.22);
  }

  // 10년 DCF 모델과 민감도 분석
  let dcf10Year: DCFOutputs | null = null;
  if (purchasePriceKrw > 0 && noiBase > 0 && wacc !== null) {
    const exitCapRate = capRate ? (capRate.base + 0.5) / 100 : 0.045;
    dcf10Year = generateDCFSensitivity({
      purchasePriceKrw,
      initialNoiKrw: noiBase,
      holdYears: 10,
      rentGrowthRate: rentGrowth,
      baseExitCapRate: exitCapRate,
      baseDiscountRate: wacc,
    });
  }

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
    totalDepositBil,
    loanAmountBil,
    equityRequired,
    leveragedYield,
    dcf10Year,
    wacc,
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
  if (f.totalDepositBil !== null) {
    rows.push(`| **보증금 합계** | **${f.totalDepositBil}억 원** | 브로커 제공 |`);
  }
  if (f.loanAmountBil !== null) {
    rows.push(`| **융자(채권최고액)** | **${f.loanAmountBil}억 원** | 브로커 제공 |`);
  }
  if (f.equityRequired !== null) {
    rows.push(`| **자기자본 소요 추정** | **약 ${f.equityRequired}억 원** | AI 추정 |`);
  }
  if (f.wacc !== null) {
    rows.push(`| **추정 WACC(자본비용)** | **${pct(f.wacc * 100)}** | LTV 반영 |`);
  }
  if (f.dcf10Year) {
    rows.push(`| **10년 DCF (NPV)** | **${f.dcf10Year.npvBase > 0 ? '+' : ''}${bil(f.dcf10Year.npvBase)}** | 기준 시나리오 |`);
  }
  if (f.leveragedYield !== null) {
    rows.push(`| **레버리지 수익률** | **${f.leveragedYield}%** | NOI/자기자본, AI 추정 |`);
  }

  if (rows.length === 0) return '';

  return `### 수익 지표 (AI 추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
${rows.join('\n')}

> ⚠️ **면책**: ${f.disclaimer}`;
}
