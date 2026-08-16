// src/domain/building/mobile-im/financials.ts
// 모바일 IM용 고급 재무 계산 엔진 (Strategy Pattern 포스처 대응 지원).
// 5종 포스처(income, development, operating, owner_occupied, trading)별 산출 전략 구현.

import type { InvestmentPosture } from "@/domain/ontology";
import { generateDCFSensitivity, calculateWACC, calculateIRR, type DCFOutputs } from "./dcf-sensitivity";

export interface FinancialInputs {
  posture?: InvestmentPosture;
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

  // ── Development 전용 파라미터 ──
  /** 평당 공사비 (만원/평) */
  constructionCostPerPyeong?: number;
  /** 목표 연면적 (평) */
  targetGrossAreaPyeong?: number;
  /** 예상 분양/매각가 (만원/평) */
  expectedSalesPricePerPyeong?: number;

  // ── Operating 전용 파라미터 ──
  /** 연간 총 매출 (원) */
  annualRevenueKrw?: number;
  /** GOP 마진 (%) */
  gopMarginPct?: number;
  /** 객단가/ADR (원) */
  adrKrw?: number;
  /** 가동률/OCC (%) */
  occPct?: number;

  // ── OwnerOccupied 전용 파라미터 ──
  /** 주변 시장 평당 임대료 (원/평) */
  marketRentPerPyeongKrw?: number;
  /** 자가 사용 면적 (평) */
  selfUseAreaPyeong?: number;

  // ── Trading 전용 파라미터 ──
  /** 인근 비교 사례 평당가 (원/평) */
  comparablePricePerPyeongKrw?: number;
  /** 목표 매각가 (원) */
  targetExitPriceKrw?: number;
}

export interface FinancialOutputs {
  annualNoi: { best: number; base: number; worst: number };
  capRate: { best: number; base: number; worst: number } | null;
  irr5Year: { best: number; base: number; worst: number } | null;
  pricePerSqm: number | null;
  pricePerPyeong: number | null;
  landValueRatio: number | null;
  landValueRatioNote: string | null;
  yieldOnCost: number | null;
  totalDepositBil: number | null;
  loanAmountBil: number | null;
  equityRequired: number | null;
  leveragedYield: number | null;
  dcf10Year: DCFOutputs | null;
  wacc: number | null;
  disclaimer: string;

  // ── 포스처 확장 필드 ──
  posture?: InvestmentPosture;
  /** 개발형: 예상 총 사업비 (억원) */
  totalProjectCostBil?: number | null;
  /** 개발형: 예상 분양/매각 수입 (억원) */
  expectedSalesRevenueBil?: number | null;
  /** 개발형: 개발 이익률 (%) */
  devProfitMarginPct?: number | null;
  /** 개발형: 평당 토지비 (만원/평) */
  landPricePerPyeong?: number | null;
  /** 개발형: 토지비 비중 (%) */
  landCostRatioPct?: number | null;

  /** 운영형: 연간 GOP (억원) */
  annualGopBil?: number | null;
  /** 운영형: GOP 마진 (%) */
  gopMarginPct?: number | null;
  /** 운영형: 객단가/ADR (원) */
  adrKrw?: number | null;
  /** 운영형: 가동률/OCC (%) */
  occPct?: number | null;
  /** 운영형: RevPAR (원) */
  revparKrw?: number | null;
  /** 운영형: GOP Cap Rate (%) */
  gopCapRatePct?: number | null;

  /** 자가사용형: 가상 임대료 절감액 (억원/년) */
  ownVsLeaseSavingsBil?: number | null;
  /** 자가사용형: 손익분기 기간 (년) */
  breakevenYears?: number | null;
  /** 자가사용형: 평당 실점유 비용 (원/평/월) */
  occupancyCostPerPyeongMonthly?: number | null;

  /** 매매형: 인근 시세 대비 갭/할인율 (%) */
  marketDiscountPct?: number | null;
  /** 매매형: 목표 보유기간 수익률 HPR (%) */
  targetHprPct?: number | null;
  /** 매매형: 목표 시세차익 (억원) */
  targetCapitalGainBil?: number | null;
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

// ── Strategy Pattern 인터페이스 ──
export interface PostureFinancialStrategy {
  calculate(inputs: FinancialInputs): FinancialOutputs;
  formatMarkdown(outputs: FinancialOutputs, grade?: string): string;
}

// ── 1. Income Strategy (임대수익형) ──
class IncomeFinancialStrategy implements PostureFinancialStrategy {
  calculate(inputs: FinancialInputs): FinancialOutputs {
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

    const annualMgmtFee = (mgmtFeeTotalManwon ?? 0) * 10000 * 12;
    const annualGross = monthlyRentKrw * 12;

    const effectiveOpex = annualMgmtFee > 0
      ? annualMgmtFee
      : annualGross * opexRatio;
    const effectiveOpexHigh = annualMgmtFee > 0
      ? annualMgmtFee * 1.15
      : annualGross * (opexRatio + 0.03);

    const noiBest  = annualGross - (annualMgmtFee > 0 ? annualMgmtFee * 0.9 : annualGross * Math.max(0, opexRatio - 0.02));
    const noiBase  = annualGross * (1 - vacancyRate) - effectiveOpex;
    const noiWorst = annualGross * (1 - Math.min(0.20, vacancyRate * 2)) - effectiveOpexHigh;

    let capRate: { best: number; base: number; worst: number } | null = null;
    if (purchasePriceKrw > 0 && noiBase > 0) {
      capRate = {
        best:  parseFloat(((noiBest  / purchasePriceKrw) * 100).toFixed(2)),
        base:  parseFloat(((noiBase  / purchasePriceKrw) * 100).toFixed(2)),
        worst: parseFloat(((noiWorst / purchasePriceKrw) * 100).toFixed(2)),
      };
    }

    let irr5Year: { best: number; base: number; worst: number } | null = null;
    if (purchasePriceKrw > 0 && noiBase > 0) {
      const entryCapBase = capRate ? capRate.base / 100 : 0.04;
      const exitCapBest  = entryCapBase + 0.0025;
      const exitCapBase  = entryCapBase + 0.005;
      const exitCapWorst = entryCapBase + 0.01;

      const buildCFs = (startNoi: number, growth: number, exitCap: number): number[] => {
        const cfs = [-purchasePriceKrw];
        for (let y = 1; y <= holdYears; y++) {
          const periodNoi = startNoi * Math.pow(1 + growth, y - 1);
          const exitValue = y === holdYears ? periodNoi / exitCap : 0;
          cfs.push(periodNoi + exitValue);
        }
        return cfs;
      };

      const irrBase  = calculateIRR(buildCFs(noiBase,  rentGrowth,          exitCapBase));
      const irrBest  = calculateIRR(buildCFs(noiBest,  rentGrowth + 0.01,   exitCapBest));
      const irrWorst = calculateIRR(buildCFs(noiWorst, Math.max(0, rentGrowth - 0.01), exitCapWorst));

      if (irrBase !== null) {
        irr5Year = {
          best:  irrBest  ?? irrBase + 1.5,
          base:  irrBase,
          worst: irrWorst ?? Math.max(0, irrBase - 2.0),
        };
      }
    }

    const pricePerSqm = (purchasePriceKrw > 0 && totalAreaSqm && totalAreaSqm > 0)
      ? Math.round(purchasePriceKrw / totalAreaSqm) : null;
    const pricePerPyeong = pricePerSqm ? Math.round(pricePerSqm * 3.30578) : null;

    const landPriceTotal = platAreaSqm && landPricePerSqm ? platAreaSqm * landPricePerSqm : 0;
    const landValueRatio = (purchasePriceKrw > 0 && landPriceTotal > 0 && platAreaSqm)
      ? parseFloat(((landPriceTotal / purchasePriceKrw) * 100).toFixed(1))
      : null;
    const landValueRatioNote: string | null = landValueRatio === null
      ? !platAreaSqm ? "대지가치 미산출 — 대지면적(공부 확인 필요)" : !landPricePerSqm ? "대지가치 미산출 — 공시지가 데이터 확인 필요" : null
      : null;

    const yieldOnCost = (purchasePriceKrw > 0 && monthlyRentKrw > 0)
      ? parseFloat(((annualGross / purchasePriceKrw) * 100).toFixed(2))
      : null;

    const depositKrw = (totalDepositManwon ?? 0) * 10000;
    const loanKrw = (loanAmountManwon ?? 0) * 10000;
    const totalDepositBil = depositKrw > 0 ? parseFloat((depositKrw / 1e8).toFixed(1)) : null;
    const loanAmountBil = loanKrw > 0 ? parseFloat((loanKrw / 1e8).toFixed(1)) : null;
    const equityKrw = purchasePriceKrw - depositKrw - loanKrw;
    const equityRequired = equityKrw > 0 ? parseFloat((equityKrw / 1e8).toFixed(1)) : null;
    const leveragedYield = (equityKrw > 0 && noiBase > 0)
      ? parseFloat(((noiBase / equityKrw) * 100).toFixed(2))
      : null;

    let wacc: number | null = null;
    const rawDebtRatio = purchasePriceKrw > 0 ? (loanKrw + depositKrw) / purchasePriceKrw : 0;
    const debtRatio = Math.min(Math.max(rawDebtRatio, 0), 1);
    const equityRatio = Math.max(1 - debtRatio, 0);
    if (purchasePriceKrw > 0) {
      wacc = calculateWACC(equityRatio, 0.08, debtRatio, 0.05, 0.22);
    }

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
      posture: 'income',
      annualNoi: { best: Math.round(noiBest), base: Math.round(noiBase), worst: Math.round(noiWorst) },
      capRate,
      irr5Year,
      pricePerSqm,
      pricePerPyeong,
      landValueRatio,
      landValueRatioNote,
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

  formatMarkdown(f: FinancialOutputs, grade?: string): string {
    const bil = (n: number) => `약 ${(n / 100_000_000).toFixed(1)}억 원`;
    const pct = (n: number) => `${n.toFixed(1)}%`;
    const rows: string[] = [];

    if (f.annualNoi.base > 0) rows.push(`| **연 순영업소득(남는 돈 NOI)** | ${bil(f.annualNoi.worst)}~**${bil(f.annualNoi.best)}** | 운영비 차감 후 실질 순수익 |`);
    if (f.capRate) rows.push(`| **연 순수익률(Cap Rate)** | ${pct(f.capRate.worst)}–**${pct(f.capRate.best)}** | 매매가 대비 구간 추정 |`);
    if (f.irr5Year) rows.push(`| **5년 보유 시 투자수익률(IRR)** | ${pct(f.irr5Year.worst)}–**${pct(f.irr5Year.best)}** | 시나리오 추정, 참고용 |`);
    if (f.yieldOnCost !== null) rows.push(`| **총 수익률(Gross Yield)** | **${pct(f.yieldOnCost)}** | 연 임대수입/매매가 |`);
    if (f.pricePerPyeong !== null) rows.push(`| **평당 매매가** | **${f.pricePerPyeong.toLocaleString()}원/평** | 참고용 |`);
    if (f.landValueRatio !== null) rows.push(`| **땅값 비중(원금 안전판)** | **${f.landValueRatio}%** | 높을수록 원금 하방 경직성 확보 |`);
    else if (f.landValueRatioNote) rows.push(`| **땅값 비중(원금 안전판)** | ⚠️ ${f.landValueRatioNote} | 공부 원본 확인 후 산출 |`);
    if (f.totalDepositBil !== null) rows.push(`| **임대 보증금 합계** | **${f.totalDepositBil}억 원** | 중개인 제공 |`);
    if (f.loanAmountBil !== null) rows.push(`| **선순위 대출 잔액** | **${f.loanAmountBil}억 원** | 중개인 제공 |`);
    if (f.equityRequired !== null) rows.push(`| **실투자금(내 돈)** | **약 ${f.equityRequired}억 원** | 대출·보증금 제외 필요자본 |`);
    if (f.wacc !== null) rows.push(`| **추정 자본비용(WACC)** | **${pct(f.wacc * 100)}** | LTV 및 금리 반영 |`);
    if (f.dcf10Year) rows.push(`| **10년 현금흐름 현재가치(NPV)** | **${f.dcf10Year.npvBase > 0 ? '+' : ''}${bil(f.dcf10Year.npvBase)}** | 기준 시나리오 |`);
    if (f.leveragedYield !== null) rows.push(`| **내 돈 대비 수익률(자기자본수익률)** | **${f.leveragedYield}%** | 대출 활용 시 연 수익률 |`);

    if (rows.length === 0) return '';

    let markdown = `### 수익 지표 (AI 추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
${rows.join('\n')}

> ⚠️ **면책**: ${f.disclaimer}`;

    if (grade === 'B' && f.dcf10Year) {
      f.dcf10Year = undefined as any;
      markdown += '\n\n> ⚠️ **B등급 데이터**: DCF 분석은 A등급 이상에서 제공됩니다. 데이터를 보강하여 등급을 높여주세요.';
    }
    if (grade === 'C' || grade === 'D') {
      markdown = markdown.replace(/\|.*총수익률.*\|.*\|.*\|\n?/g, '');
      markdown += '\n\n> ⚠️ **C등급 데이터**: 총수익률 분석은 B등급 이상에서 제공됩니다.';
    }

    return markdown;
  }
}

// ── 2. Development Strategy (개발형) ──
class DevelopmentFinancialStrategy implements PostureFinancialStrategy {
  calculate(inputs: FinancialInputs): FinancialOutputs {
    const purchasePrice = inputs.purchasePriceKrw || 0;
    const platArea = inputs.platAreaSqm || 0;
    const platPyeong = platArea / 3.30578;

    // 평당 토지 매입가
    const landPricePerPyeong = (purchasePrice > 0 && platPyeong > 0)
      ? Math.round((purchasePrice / 10000) / platPyeong)
      : null;

    // 공사비 및 신축 규모
    const constCostPerPyeong = inputs.constructionCostPerPyeong ?? 800; // 기본 800만원/평
    const targetGrossPyeong = inputs.targetGrossAreaPyeong ?? (platPyeong > 0 ? platPyeong * 4 : 500); // FAR 400% 기본
    const estConstructionCostKrw = targetGrossPyeong * constCostPerPyeong * 10000;
    const otherProjectCostKrw = (purchasePrice + estConstructionCostKrw) * 0.15; // 기타비용 15%
    const totalProjectCostKrw = purchasePrice + estConstructionCostKrw + otherProjectCostKrw;
    const totalProjectCostBil = totalProjectCostKrw > 0 ? parseFloat((totalProjectCostKrw / 1e8).toFixed(1)) : null;

    // 예상 분양/매각 수입
    const salesPricePerPyeong = inputs.expectedSalesPricePerPyeong ?? (landPricePerPyeong ? landPricePerPyeong * 1.4 : 3500);
    const expectedSalesRevenueKrw = targetGrossPyeong * salesPricePerPyeong * 10000;
    const expectedSalesRevenueBil = expectedSalesRevenueKrw > 0 ? parseFloat((expectedSalesRevenueKrw / 1e8).toFixed(1)) : null;

    // 개발 이익률
    const devProfitMarginPct = (totalProjectCostKrw > 0 && expectedSalesRevenueKrw > 0)
      ? parseFloat((((expectedSalesRevenueKrw - totalProjectCostKrw) / totalProjectCostKrw) * 100).toFixed(1))
      : null;

    // 토지비 비중
    const landCostRatioPct = (totalProjectCostKrw > 0 && purchasePrice > 0)
      ? parseFloat(((purchasePrice / totalProjectCostKrw) * 100).toFixed(1))
      : null;

    const pricePerSqm = (purchasePrice > 0 && inputs.totalAreaSqm && inputs.totalAreaSqm > 0)
      ? Math.round(purchasePrice / inputs.totalAreaSqm) : null;
    const pricePerPyeong = pricePerSqm ? Math.round(pricePerSqm * 3.30578) : null;

    const loanKrw = (inputs.loanAmountManwon ?? 0) * 10000;
    const loanAmountBil = loanKrw > 0 ? parseFloat((loanKrw / 1e8).toFixed(1)) : null;
    const equityKrw = purchasePrice - loanKrw;
    const equityRequired = equityKrw > 0 ? parseFloat((equityKrw / 1e8).toFixed(1)) : null;

    return {
      posture: 'development',
      annualNoi: { best: 0, base: 0, worst: 0 },
      capRate: null,
      irr5Year: null,
      pricePerSqm,
      pricePerPyeong,
      landValueRatio: null,
      landValueRatioNote: "개발형 자산 — 사업수지(개발이익률) 분석 적용",
      yieldOnCost: null,
      totalDepositBil: null,
      loanAmountBil,
      equityRequired,
      leveragedYield: null,
      dcf10Year: null,
      wacc: null,
      totalProjectCostBil,
      expectedSalesRevenueBil,
      devProfitMarginPct,
      landPricePerPyeong,
      landCostRatioPct,
      disclaimer: 'AI 개발 사업수지 추정값 (참고용). 공사비·인허가·분양가 변동에 따라 상이할 수 있습니다.',
    };
  }

  formatMarkdown(f: FinancialOutputs): string {
    const rows: string[] = [];
    if (f.landPricePerPyeong != null) rows.push(`| **토지 평당가** | **${f.landPricePerPyeong.toLocaleString()}만원/평** | 대지면적 기준 |`);
    if (f.totalProjectCostBil != null) rows.push(`| **총 사업비 추정** | **약 ${f.totalProjectCostBil}억 원** | 토지비 + 공사비 + 기타비용 |`);
    if (f.expectedSalesRevenueBil != null) rows.push(`| **예상 분양/매각 수입** | **약 ${f.expectedSalesRevenueBil}억 원** | 목표 연면적 기준 |`);
    if (f.devProfitMarginPct != null) rows.push(`| **개발 이익률 추정** | **${f.devProfitMarginPct}%** | 총 사업비 대비 이익 |`);
    if (f.landCostRatioPct != null) rows.push(`| **토지비 비중** | **${f.landCostRatioPct}%** | 총 사업비 내 비중 |`);
    if (f.equityRequired != null) rows.push(`| **토지 매입 실투자금(내 돈)** | **약 ${f.equityRequired}억 원** | 브릿지 대출 제외 초기자금 |`);

    if (rows.length === 0) return '';

    return `### 개발 사업수지 지표 (AI 추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
${rows.join('\n')}

> ⚠️ **면책**: ${f.disclaimer}`;
  }
}

// ── 3. Operating Strategy (운영형) ──
class OperatingFinancialStrategy implements PostureFinancialStrategy {
  calculate(inputs: FinancialInputs): FinancialOutputs {
    const purchasePrice = inputs.purchasePriceKrw || 0;
    const annualRevenue = inputs.annualRevenueKrw ?? (inputs.monthlyRentKrw * 12);
    const gopMargin = (inputs.gopMarginPct ?? 35) / 100;

    const annualGopKrw = annualRevenue * gopMargin;
    const annualGopBil = annualGopKrw > 0 ? parseFloat((annualGopKrw / 1e8).toFixed(1)) : null;
    const gopMarginPct = inputs.gopMarginPct ?? 35;

    const gopCapRatePct = (purchasePrice > 0 && annualGopKrw > 0)
      ? parseFloat(((annualGopKrw / purchasePrice) * 100).toFixed(2))
      : null;

    const adrKrw = inputs.adrKrw ?? null;
    const occPct = inputs.occPct ?? null;
    const revparKrw = (adrKrw && occPct) ? Math.round(adrKrw * (occPct / 100)) : null;

    const pricePerSqm = (purchasePrice > 0 && inputs.totalAreaSqm && inputs.totalAreaSqm > 0)
      ? Math.round(purchasePrice / inputs.totalAreaSqm) : null;
    const pricePerPyeong = pricePerSqm ? Math.round(pricePerSqm * 3.30578) : null;

    const loanKrw = (inputs.loanAmountManwon ?? 0) * 10000;
    const loanAmountBil = loanKrw > 0 ? parseFloat((loanKrw / 1e8).toFixed(1)) : null;
    const equityKrw = purchasePrice - loanKrw;
    const equityRequired = equityKrw > 0 ? parseFloat((equityKrw / 1e8).toFixed(1)) : null;

    return {
      posture: 'operating',
      annualNoi: { best: Math.round(annualGopKrw * 1.1), base: Math.round(annualGopKrw), worst: Math.round(annualGopKrw * 0.85) },
      capRate: gopCapRatePct ? { best: gopCapRatePct * 1.1, base: gopCapRatePct, worst: gopCapRatePct * 0.85 } : null,
      irr5Year: null,
      pricePerSqm,
      pricePerPyeong,
      landValueRatio: null,
      landValueRatioNote: "운영형 자산 — GOP 및 객단가/가동률 분석 적용",
      yieldOnCost: null,
      totalDepositBil: null,
      loanAmountBil,
      equityRequired,
      leveragedYield: null,
      dcf10Year: null,
      wacc: null,
      annualGopBil,
      gopMarginPct,
      adrKrw,
      occPct,
      revparKrw,
      gopCapRatePct,
      disclaimer: 'AI 직영 운영 지표 추정값 (참고용). 매출·가동률·운영비에 따라 변동될 수 있습니다.',
    };
  }

  formatMarkdown(f: FinancialOutputs): string {
    const rows: string[] = [];
    if (f.annualGopBil != null) rows.push(`| **연간 실질 영업이익(GOP)** | **약 ${f.annualGopBil}억 원** | 운영 매출 기준 |`);
    if (f.gopMarginPct != null) rows.push(`| **GOP 마진율** | **${f.gopMarginPct}%** | 총매출 대비 실질 마진 |`);
    if (f.gopCapRatePct != null) rows.push(`| **GOP 환원율(Cap Rate)** | **${f.gopCapRatePct}%** | 매매가 대비 GOP 비율 |`);
    if (f.revparKrw != null) rows.push(`| **RevPAR (객실당 매출)** | **약 ${(f.revparKrw / 10000).toFixed(1)}만원** | ADR × OCC |`);
    if (f.pricePerPyeong != null) rows.push(`| **평당 매매가** | **${f.pricePerPyeong.toLocaleString()}원/평** | 참고용 |`);
    if (f.equityRequired != null) rows.push(`| **필요 실투자금(내 돈)** | **약 ${f.equityRequired}억 원** | 대출 제외 초기자금 |`);

    if (rows.length === 0) return '';

    return `### 운영 재무 지표 (GOP 기반)
| 항목 | 추정값 | 비고 |
|------|--------|------|
${rows.join('\n')}

> ⚠️ **면책**: ${f.disclaimer}`;
  }
}

// ── 4. OwnerOccupied Strategy (자가사용형) ──
class OwnerOccupiedFinancialStrategy implements PostureFinancialStrategy {
  calculate(inputs: FinancialInputs): FinancialOutputs {
    const purchasePrice = inputs.purchasePriceKrw || 0;
    const totalAreaPyeong = (inputs.totalAreaSqm || 0) / 3.30578;
    const selfUseAreaPyeong = inputs.selfUseAreaPyeong ?? (totalAreaPyeong > 0 ? totalAreaPyeong : 100);

    const marketRentPerPyeong = inputs.marketRentPerPyeongKrw ?? 70000; // 기본 평당 7만원
    const virtualAnnualRentKrw = marketRentPerPyeong * selfUseAreaPyeong * 12;

    const loanKrw = (inputs.loanAmountManwon ?? 0) * 10000;
    const annualDebtServiceKrw = loanKrw * 0.052; // 금리 5.2% 기준
    const ownVsLeaseSavingsKrw = virtualAnnualRentKrw - annualDebtServiceKrw;
    const ownVsLeaseSavingsBil = parseFloat((ownVsLeaseSavingsKrw / 1e8).toFixed(1));

    const equityKrw = purchasePrice - loanKrw;
    const equityRequired = equityKrw > 0 ? parseFloat((equityKrw / 1e8).toFixed(1)) : null;
    const breakevenYears = (equityKrw > 0 && ownVsLeaseSavingsKrw > 0)
      ? parseFloat((equityKrw / ownVsLeaseSavingsKrw).toFixed(1))
      : null;

    const monthlyMgmtFeeKrw = (inputs.mgmtFeeTotalManwon ?? 0) * 10000;
    const occupancyCostPerPyeongMonthly = selfUseAreaPyeong > 0
      ? Math.round((annualDebtServiceKrw / 12 + monthlyMgmtFeeKrw) / selfUseAreaPyeong)
      : null;

    const pricePerSqm = (purchasePrice > 0 && inputs.totalAreaSqm && inputs.totalAreaSqm > 0)
      ? Math.round(purchasePrice / inputs.totalAreaSqm) : null;
    const pricePerPyeong = pricePerSqm ? Math.round(pricePerSqm * 3.30578) : null;

    const loanAmountBil = loanKrw > 0 ? parseFloat((loanKrw / 1e8).toFixed(1)) : null;

    return {
      posture: 'owner_occupied',
      annualNoi: { best: 0, base: 0, worst: 0 },
      capRate: null,
      irr5Year: null,
      pricePerSqm,
      pricePerPyeong,
      landValueRatio: null,
      landValueRatioNote: "자가사용형 자산 — 사옥 실입주 임차 대비 절감액 분석 적용",
      yieldOnCost: null,
      totalDepositBil: null,
      loanAmountBil,
      equityRequired,
      leveragedYield: null,
      dcf10Year: null,
      wacc: null,
      ownVsLeaseSavingsBil,
      breakevenYears,
      occupancyCostPerPyeongMonthly,
      disclaimer: 'AI 사옥용 비용비교 추정값 (참고용). 시장 임대료 및 금융 조건에 따라 상이할 수 있습니다.',
    };
  }

  formatMarkdown(f: FinancialOutputs): string {
    const rows: string[] = [];
    if (f.ownVsLeaseSavingsBil != null) rows.push(`| **임차 대비 연 절감액** | **약 ${f.ownVsLeaseSavingsBil}억 원/년** | 주변 임대시세 대비 절감 |`);
    if (f.breakevenYears != null) rows.push(`| **자가전환 손익분기** | **약 ${f.breakevenYears}년** | 임대료 절감으로 투자금 회수 |`);
    if (f.occupancyCostPerPyeongMonthly != null) rows.push(`| **실사용 평당 점유비용** | **월 ${f.occupancyCostPerPyeongMonthly.toLocaleString()}원/평** | 금융비용 + 관리비 합산 |`);
    if (f.pricePerPyeong != null) rows.push(`| **평당 매매가** | **${f.pricePerPyeong.toLocaleString()}원/평** | 사옥 자산가치 |`);
    if (f.equityRequired != null) rows.push(`| **사옥 매입 실투자금(내 돈)** | **약 ${f.equityRequired}억 원** | 시설자금 대출 제외 초기자금 |`);

    if (rows.length === 0) return '';

    return `### 자가사용 비용 비교 지표 (AI 추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
${rows.join('\n')}

> ⚠️ **면책**: ${f.disclaimer}`;
  }
}

// ── 5. Trading Strategy (단기매매형) ──
class TradingFinancialStrategy implements PostureFinancialStrategy {
  calculate(inputs: FinancialInputs): FinancialOutputs {
    const purchasePrice = inputs.purchasePriceKrw || 0;
    const totalAreaPyeong = (inputs.totalAreaSqm || 0) / 3.30578;

    const pricePerSqm = (purchasePrice > 0 && inputs.totalAreaSqm && inputs.totalAreaSqm > 0)
      ? Math.round(purchasePrice / inputs.totalAreaSqm) : null;
    const pricePerPyeong = pricePerSqm ? Math.round(pricePerSqm * 3.30578) : null;

    const comparablePricePerPyeong = inputs.comparablePricePerPyeongKrw
      ? Math.round(inputs.comparablePricePerPyeongKrw / 10000)
      : (pricePerPyeong ? Math.round((pricePerPyeong / 10000) * 1.15) : null);

    const marketDiscountPct = (pricePerPyeong && comparablePricePerPyeong && comparablePricePerPyeong > 0)
      ? parseFloat((((comparablePricePerPyeong * 10000 - pricePerPyeong) / (comparablePricePerPyeong * 10000)) * 100).toFixed(1))
      : null;

    const targetExitPrice = inputs.targetExitPriceKrw ?? (purchasePrice > 0 ? purchasePrice * 1.2 : 0);
    const targetCapitalGainKrw = targetExitPrice - purchasePrice;
    const targetCapitalGainBil = targetCapitalGainKrw > 0 ? parseFloat((targetCapitalGainKrw / 1e8).toFixed(1)) : null;

    const loanKrw = (inputs.loanAmountManwon ?? 0) * 10000;
    const equityKrw = purchasePrice - loanKrw;
    const targetHprPct = (equityKrw > 0 && targetCapitalGainKrw > 0)
      ? parseFloat(((targetCapitalGainKrw / equityKrw) * 100).toFixed(1))
      : null;

    const loanAmountBil = loanKrw > 0 ? parseFloat((loanKrw / 1e8).toFixed(1)) : null;
    const equityRequired = equityKrw > 0 ? parseFloat((equityKrw / 1e8).toFixed(1)) : null;

    return {
      posture: 'trading',
      annualNoi: { best: 0, base: 0, worst: 0 },
      capRate: null,
      irr5Year: null,
      pricePerSqm,
      pricePerPyeong,
      landValueRatio: null,
      landValueRatioNote: "단기매매형 자산 — 비교사례 및 마켓 갭(할인율) 분석 적용",
      yieldOnCost: null,
      totalDepositBil: null,
      loanAmountBil,
      equityRequired,
      leveragedYield: null,
      dcf10Year: null,
      wacc: null,
      marketDiscountPct,
      targetHprPct,
      targetCapitalGainBil,
      disclaimer: 'AI 매매 시세차익 추정값 (참고용). 부동산 시장 주기 및 거래 시점에 따라 상이할 수 있습니다.',
    };
  }

  formatMarkdown(f: FinancialOutputs): string {
    const rows: string[] = [];
    if (f.pricePerPyeong != null) rows.push(`| **평당 매매 희망가** | **${f.pricePerPyeong.toLocaleString()}원/평** | 희망가 기준 |`);
    if (f.marketDiscountPct != null) rows.push(`| **인근 시세 대비 할인율(저평가 갭)** | **${f.marketDiscountPct}%** | 주변 거래사례 대비 |`);
    if (f.targetCapitalGainBil != null) rows.push(`| **목표 시세차익** | **약 ${f.targetCapitalGainBil}억 원** | 목표 매각가 기준 |`);
    if (f.targetHprPct != null) rows.push(`| **자기자본 수익률(HPR)** | **${f.targetHprPct}%** | 보유기간 총수익률 |`);
    if (f.equityRequired != null) rows.push(`| **필요 실투자금(내 돈)** | **약 ${f.equityRequired}억 원** | 초기 투입 자금 |`);

    if (rows.length === 0) return '';

    return `### 매매 시세 분석 지표 (AI 추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
${rows.join('\n')}

> ⚠️ **면책**: ${f.disclaimer}`;
  }
}

// ── 전략 레지스트리 ──
const STRATEGIES: Record<InvestmentPosture, PostureFinancialStrategy> = {
  income: new IncomeFinancialStrategy(),
  development: new DevelopmentFinancialStrategy(),
  operating: new OperatingFinancialStrategy(),
  owner_occupied: new OwnerOccupiedFinancialStrategy(),
  trading: new TradingFinancialStrategy(),
};

/**
 * 포스처별 고급 재무 지표를 계산합니다. (Strategy Pattern 적용)
 */
export function calculateFinancials(inputs: FinancialInputs): FinancialOutputs {
  const posture = inputs.posture ?? 'income';
  const strategy = STRATEGIES[posture] ?? STRATEGIES.income;
  return strategy.calculate(inputs);
}

/**
 * 재무 지표를 IM 섹션용 마크다운 테이블로 포맷합니다.
 */
export function formatFinancialsMarkdown(f: FinancialOutputs, grade?: string): string {
  const posture = f.posture ?? 'income';
  const strategy = STRATEGIES[posture] ?? STRATEGIES.income;
  return strategy.formatMarkdown(f, grade);
}
