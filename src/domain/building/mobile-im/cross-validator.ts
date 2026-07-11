// src/domain/building/mobile-im/cross-validator.ts
// ──────────────────────────────────────────────────────────────────────────────
// 섹션 간 교차 검증 — 7개 Mobile IM 섹션의 수치 일관성 검사
//
// 각 섹션에서 핵심 수치를 추출하고, 동일 지표가 여러 섹션에 등장할 때
// 불일치를 탐지한다. LLM이 섹션별로 독립 생성하면서 수치가 어긋나는
// 환각(hallucination) 패턴을 포착하는 것이 주 목적.
//
// 검증 대상: 공실률, 면적, 건물 노후도, 역세권 거리, 월세, Cap Rate
// ──────────────────────────────────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────────────────

/** 교차 검증 결과 */
export interface CrossValidationResult {
  /** 모든 검증 통과 여부 (critical이 없으면 true) */
  passed: boolean;
  /** 발견된 불일치 목록 */
  inconsistencies: CrossValidationInconsistency[];
}

/** 개별 불일치 항목 */
export interface CrossValidationInconsistency {
  /** 불일치 필드명 (e.g. "vacancy_pct") */
  field: string;
  /** 첫 번째 등장 섹션 */
  section1: { type: string; value: string };
  /** 두 번째 등장 섹션 (불일치하는) */
  section2: { type: string; value: string };
  /** 심각도: critical=재생성 필요, warning=검토 권장 */
  severity: "critical" | "warning";
}

/**
 * 핵심 수치 앵커 — 섹션 순회 중 최초 발견된 수치를 기준값으로 저장
 *
 * 후속 섹션에서 동일 지표가 다른 값으로 등장하면 불일치로 판정한다.
 */
export interface NumericalAnchors {
  /** 총 면적 (㎡) */
  totalAreaSqm?: number;
  /** 공실률 (%) */
  vacancyPct?: number;
  /** 월세 총액 (원) */
  monthlyRentKrw?: number;
  /** 기준 Cap Rate (%) */
  capRateBase?: number;
  /** 건물 연식 (년) */
  buildingAge?: number;
  /** 역 도보 거리 (분) */
  stationDistance?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * 불일치 임계값
 * - 공실률: 10%p 이상 차이 → critical
 * - 면적: 20% 이상 차이 → critical
 * - 일반 수치: 15% 이상 상대 차이 → warning
 */
const THRESHOLDS = {
  /** 공실률 절대 차이 임계값 (%p) */
  VACANCY_CRITICAL_PP: 10,
  /** 면적 상대 차이 임계값 (%) */
  AREA_CRITICAL_PCT: 20,
  /** 월세 상대 차이 임계값 (%) */
  RENT_WARNING_PCT: 15,
  /** Cap Rate 절대 차이 임계값 (%p) */
  CAP_RATE_WARNING_PP: 2,
  /** 역 도보 거리 절대 차이 임계값 (분) */
  STATION_WARNING_MIN: 3,
  /** 건물 연식 절대 차이 임계값 (년) */
  AGE_WARNING_YEARS: 3,
} as const;

// ─── Section Types (검증 대상 매핑) ──────────────────────────────────────────

/**
 * 각 수치 지표가 등장할 수 있는 섹션 유형 매핑
 * 교차 검증 시 해당 섹션들 간에만 비교를 수행
 */
const VACANCY_SECTIONS = ["lease_status", "income_analysis", "investment_thesis"] as const;
const AREA_SECTIONS = ["property_overview", "income_analysis"] as const;
const STATION_SECTIONS = ["location_access", "investment_thesis"] as const;

// ─── Regex Patterns ──────────────────────────────────────────────────────────

/**
 * 한국어 CRE 마크다운에서 수치를 추출하기 위한 정규식 패턴
 *
 * 꼬마빌딩 IM에 자주 등장하는 표현 패턴을 반영:
 * - "연면적 450.2㎡", "총 면적 약 350 ㎡"
 * - "공실률 15%", "공실 약 30%"
 * - "월세 총액 1,200만 원", "월 임대료 2.5억 원"
 * - "Cap Rate 4.5%", "환원이율 5.2%"
 * - "준공 1998년", "건축년도 2005년", "준공 25년"
 * - "도보 5분", "역까지 도보 약 7분"
 */
const PATTERNS = {
  // 면적: 숫자 + ㎡ 또는 m² (콤마 허용)
  area: /(?:면적|연면적|총\s*면적)[\s:약]*([0-9,]+(?:\.\d+)?)\s*(?:㎡|m²|평)/g,
  // 공실률: 숫자 + %
  vacancy: /(?:공실률?|공실\s*율)[\s:약]*([0-9]+(?:\.\d+)?)\s*%/g,
  // 월세: 숫자 + 만원/억원
  monthlyRent: /(?:월세|월\s*임대료|월\s*수입|월\s*임대\s*수입)[\s:총액약]*([0-9,]+(?:\.\d+)?)\s*(만\s*원|억\s*원)/g,
  // Cap Rate: 숫자 + %
  capRate: /(?:Cap\s*Rate|캡레이트|환원이율|수익률)[\s:약]*([0-9]+(?:\.\d+)?)\s*%/gi,
  // 준공년도: 4자리 또는 "준공 N년"
  buildYear: /(?:준공|건축년도|사용승인)[\s:]*(\d{4})\s*년/g,
  buildAge: /(?:준공|건물\s*연식|노후도?)[\s:약]*(\d+)\s*년/g,
  // 역 도보 거리: "도보 N분"
  stationWalk: /(?:도보|걸어서)[\s:약]*(\d+)\s*분/g,
} as const;

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * 문자열에서 숫자 추출 (콤마 제거)
 */
function parseNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

/**
 * 정규식으로 첫 번째 매칭 숫자 추출
 *
 * @param text - 검색 대상 텍스트
 * @param pattern - 캡처 그룹이 있는 정규식 (g 플래그)
 * @returns 첫 번째 캡처 그룹의 숫자값, 없으면 undefined
 */
function extractFirstNumber(text: string, pattern: RegExp): number | undefined {
  // 정규식 lastIndex 초기화 (g 플래그 사용 시 필수)
  const freshPattern = new RegExp(pattern.source, pattern.flags);
  const match = freshPattern.exec(text);
  if (!match?.[1]) return undefined;
  return parseNumber(match[1]);
}

/**
 * 현재 연도 기준으로 건물 연식 계산
 */
function computeBuildingAge(buildYear: number): number {
  const currentYear = new Date().getFullYear();
  return currentYear - buildYear;
}

/**
 * 두 수치의 절대 차이
 */
function absoluteDiff(a: number, b: number): number {
  return Math.abs(a - b);
}

/**
 * 두 수치의 상대 차이 (기준값 대비 %)
 */
function relativeDiffPct(anchor: number, value: number): number {
  if (anchor === 0) return value === 0 ? 0 : 100;
  return (Math.abs(anchor - value) / Math.abs(anchor)) * 100;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * 마크다운에서 주요 사실(fact)을 짧은 문자열로 추출
 *
 * 각 섹션의 핵심 수치/정보를 간결한 한국어 문구로 변환하여
 * 디버깅이나 로그 분석에 활용한다.
 *
 * @param markdown - 섹션 마크다운 텍스트
 * @param _sectionType - 섹션 유형 (향후 섹션별 특화 추출에 활용)
 * @returns 핵심 사실 문자열 배열 (e.g. ["준공 25년", "공실 30%", "역세권 도보 5분"])
 *
 * @example
 * ```ts
 * const facts = extractKeyFacts(overviewMd, "property_overview");
 * // ["면적 450㎡", "준공 1998년", "도보 5분"]
 * ```
 */
export function extractKeyFacts(markdown: string, _sectionType: string): string[] {
  const facts: string[] = [];

  // 면적 추출
  const areaPattern = new RegExp(PATTERNS.area.source, PATTERNS.area.flags);
  let match: RegExpExecArray | null;
  while ((match = areaPattern.exec(markdown)) !== null) {
    facts.push(`면적 ${match[1]}㎡`);
  }

  // 공실률 추출
  const vacancyPattern = new RegExp(PATTERNS.vacancy.source, PATTERNS.vacancy.flags);
  while ((match = vacancyPattern.exec(markdown)) !== null) {
    facts.push(`공실 ${match[1]}%`);
  }

  // 월세 추출
  const rentPattern = new RegExp(PATTERNS.monthlyRent.source, PATTERNS.monthlyRent.flags);
  while ((match = rentPattern.exec(markdown)) !== null) {
    facts.push(`월세 ${match[1]}${match[2]}`);
  }

  // Cap Rate 추출
  const capPattern = new RegExp(PATTERNS.capRate.source, PATTERNS.capRate.flags);
  while ((match = capPattern.exec(markdown)) !== null) {
    facts.push(`Cap Rate ${match[1]}%`);
  }

  // 준공년도/연식 추출
  const yearPattern = new RegExp(PATTERNS.buildYear.source, PATTERNS.buildYear.flags);
  while ((match = yearPattern.exec(markdown)) !== null) {
    facts.push(`준공 ${match[1]}년`);
  }

  // 도보 거리 추출
  const walkPattern = new RegExp(PATTERNS.stationWalk.source, PATTERNS.stationWalk.flags);
  while ((match = walkPattern.exec(markdown)) !== null) {
    facts.push(`도보 ${match[1]}분`);
  }

  return facts;
}

/**
 * 마크다운에서 수치를 파싱하여 NumericalAnchors 업데이트
 *
 * 최초로 발견된 값만 앵커에 기록한다 (이미 값이 있으면 건너뜀).
 * 이를 통해 첫 섹션의 값이 기준값(ground truth)이 되고,
 * 후속 섹션의 동일 지표가 이와 비교된다.
 *
 * @param anchors - 업데이트 대상 앵커 객체 (in-place 변경)
 * @param markdown - 파싱 대상 마크다운 텍스트
 * @param _sectionType - 섹션 유형
 *
 * @example
 * ```ts
 * const anchors: NumericalAnchors = {};
 * updateNumericalAnchors(anchors, overviewMd, "property_overview");
 * updateNumericalAnchors(anchors, incomeMd, "income_analysis");
 * // anchors에 property_overview에서 추출한 값이 기준으로 저장됨
 * ```
 */
export function updateNumericalAnchors(
  anchors: NumericalAnchors,
  markdown: string,
  _sectionType: string
): void {
  // 면적 (㎡ → 숫자, 평 → ㎡ 변환)
  if (anchors.totalAreaSqm == null) {
    const areaPattern = new RegExp(PATTERNS.area.source, PATTERNS.area.flags);
    const areaMatch = areaPattern.exec(markdown);
    if (areaMatch?.[1]) {
      const rawValue = parseNumber(areaMatch[1]);
      // "평" 단위면 ㎡로 변환 (1평 ≈ 3.306㎡)
      const unit = areaMatch[0];
      anchors.totalAreaSqm = unit.includes("평") ? rawValue * 3.306 : rawValue;
    }
  }

  // 공실률 (%)
  if (anchors.vacancyPct == null) {
    anchors.vacancyPct = extractFirstNumber(markdown, PATTERNS.vacancy);
  }

  // 월세 (만원/억원 → 원 변환)
  if (anchors.monthlyRentKrw == null) {
    const rentPattern = new RegExp(PATTERNS.monthlyRent.source, PATTERNS.monthlyRent.flags);
    const rentMatch = rentPattern.exec(markdown);
    if (rentMatch?.[1]) {
      const rawValue = parseNumber(rentMatch[1]);
      const unit = rentMatch[2];
      // 억원이면 ×1억, 만원이면 ×1만
      if (unit.includes("억")) {
        anchors.monthlyRentKrw = rawValue * 100_000_000;
      } else {
        anchors.monthlyRentKrw = rawValue * 10_000;
      }
    }
  }

  // Cap Rate (%)
  if (anchors.capRateBase == null) {
    anchors.capRateBase = extractFirstNumber(markdown, PATTERNS.capRate);
  }

  // 건물 연식 — 준공년도에서 계산 또는 직접 "N년" 추출
  if (anchors.buildingAge == null) {
    const buildYear = extractFirstNumber(markdown, PATTERNS.buildYear);
    if (buildYear && buildYear > 1900 && buildYear <= new Date().getFullYear()) {
      anchors.buildingAge = computeBuildingAge(buildYear);
    } else {
      // "준공 25년" 같은 직접 표현 시도
      const directAge = extractFirstNumber(markdown, PATTERNS.buildAge);
      if (directAge && directAge > 0 && directAge < 200) {
        anchors.buildingAge = directAge;
      }
    }
  }

  // 역 도보 거리 (분)
  if (anchors.stationDistance == null) {
    anchors.stationDistance = extractFirstNumber(markdown, PATTERNS.stationWalk);
  }
}

/**
 * 7개 섹션 간 수치 교차 검증 실행
 *
 * 각 섹션에서 추출한 수치를 앵커 기준값과 비교하여 불일치를 탐지한다.
 * 핵심 지표(공실률, 면적)의 큰 차이는 critical로,
 * 보조 지표(월세, Cap Rate, 역거리, 연식)의 차이는 warning으로 분류한다.
 *
 * @param sections - 생성된 7개 섹션 배열
 * @param anchors - SSoT 또는 첫 섹션에서 추출한 기준 수치
 * @returns 교차 검증 결과 (passed=true면 critical 불일치 없음)
 *
 * @example
 * ```ts
 * const result = runCrossValidation(
 *   generatedSections.map(s => ({ section_type: s.section_type, markdown: s.markdown })),
 *   anchors
 * );
 * if (!result.passed) {
 *   // critical 불일치 → 해당 섹션 재생성 필요
 * }
 * ```
 */
export function runCrossValidation(
  sections: Array<{ section_type: string; markdown: string }>,
  anchors: NumericalAnchors
): CrossValidationResult {
  const inconsistencies: CrossValidationInconsistency[] = [];

  // ── 1. 공실률 교차 검증 ───────────────────────────────────────────────────
  // lease_status, income_analysis, investment_thesis 간 비교
  if (anchors.vacancyPct != null) {
    const vacancySections = sections.filter((s) =>
      (VACANCY_SECTIONS as readonly string[]).includes(s.section_type)
    );

    for (const section of vacancySections) {
      const sectionVacancy = extractFirstNumber(section.markdown, PATTERNS.vacancy);
      if (sectionVacancy != null && anchors.vacancyPct != null) {
        const diff = absoluteDiff(anchors.vacancyPct, sectionVacancy);
        if (diff > THRESHOLDS.VACANCY_CRITICAL_PP) {
          inconsistencies.push({
            field: "vacancy_pct",
            section1: { type: "anchor", value: `${anchors.vacancyPct}%` },
            section2: { type: section.section_type, value: `${sectionVacancy}%` },
            severity: "critical",
          });
        } else if (diff > 0) {
          inconsistencies.push({
            field: "vacancy_pct",
            section1: { type: "anchor", value: `${anchors.vacancyPct}%` },
            section2: { type: section.section_type, value: `${sectionVacancy}%` },
            severity: "warning",
          });
        }
      }
    }
  }

  // ── 2. 면적 교차 검증 ─────────────────────────────────────────────────────
  // property_overview, income_analysis 간 비교
  if (anchors.totalAreaSqm != null) {
    const areaSections = sections.filter((s) =>
      (AREA_SECTIONS as readonly string[]).includes(s.section_type)
    );

    for (const section of areaSections) {
      const sectionArea = extractFirstNumber(section.markdown, PATTERNS.area);
      if (sectionArea != null && anchors.totalAreaSqm != null) {
        const diffPct = relativeDiffPct(anchors.totalAreaSqm, sectionArea);
        if (diffPct > THRESHOLDS.AREA_CRITICAL_PCT) {
          inconsistencies.push({
            field: "total_area_sqm",
            section1: { type: "anchor", value: `${anchors.totalAreaSqm}㎡` },
            section2: { type: section.section_type, value: `${sectionArea}㎡` },
            severity: "critical",
          });
        } else if (diffPct > 0) {
          inconsistencies.push({
            field: "total_area_sqm",
            section1: { type: "anchor", value: `${anchors.totalAreaSqm}㎡` },
            section2: { type: section.section_type, value: `${sectionArea}㎡` },
            severity: "warning",
          });
        }
      }
    }
  }

  // ── 3. 건물 연식 vs 리스크 언급 교차 검증 ──────────────────────────────────
  // 앵커에 연식이 있으면 risk_check 섹션에서 추출한 연식과 비교
  if (anchors.buildingAge != null) {
    const riskSection = sections.find((s) => s.section_type === "risk_check");
    if (riskSection) {
      const riskBuildYear = extractFirstNumber(riskSection.markdown, PATTERNS.buildYear);
      let riskAge: number | undefined;

      if (riskBuildYear && riskBuildYear > 1900) {
        riskAge = computeBuildingAge(riskBuildYear);
      } else {
        riskAge = extractFirstNumber(riskSection.markdown, PATTERNS.buildAge);
      }

      if (riskAge != null && absoluteDiff(anchors.buildingAge, riskAge) > THRESHOLDS.AGE_WARNING_YEARS) {
        inconsistencies.push({
          field: "building_age",
          section1: { type: "anchor", value: `${anchors.buildingAge}년` },
          section2: { type: "risk_check", value: `${riskAge}년` },
          severity: "warning",
        });
      }
    }
  }

  // ── 4. 역 도보 거리 교차 검증 ─────────────────────────────────────────────
  // location_access, investment_thesis 간 비교
  if (anchors.stationDistance != null) {
    const stationSections = sections.filter((s) =>
      (STATION_SECTIONS as readonly string[]).includes(s.section_type)
    );

    for (const section of stationSections) {
      const sectionDist = extractFirstNumber(section.markdown, PATTERNS.stationWalk);
      if (sectionDist != null && anchors.stationDistance != null) {
        const diff = absoluteDiff(anchors.stationDistance, sectionDist);
        if (diff > THRESHOLDS.STATION_WARNING_MIN) {
          inconsistencies.push({
            field: "station_distance",
            section1: { type: "anchor", value: `도보 ${anchors.stationDistance}분` },
            section2: { type: section.section_type, value: `도보 ${sectionDist}분` },
            severity: "warning",
          });
        }
      }
    }
  }

  // ── 5. Cap Rate 교차 검증 (보조) ──────────────────────────────────────────
  if (anchors.capRateBase != null) {
    for (const section of sections) {
      const sectionCap = extractFirstNumber(section.markdown, PATTERNS.capRate);
      if (sectionCap != null && anchors.capRateBase != null) {
        const diff = absoluteDiff(anchors.capRateBase, sectionCap);
        if (diff > THRESHOLDS.CAP_RATE_WARNING_PP) {
          inconsistencies.push({
            field: "cap_rate",
            section1: { type: "anchor", value: `${anchors.capRateBase}%` },
            section2: { type: section.section_type, value: `${sectionCap}%` },
            severity: "warning",
          });
        }
      }
    }
  }

  // ── 6. 월세 교차 검증 (보조) ──────────────────────────────────────────────
  if (anchors.monthlyRentKrw != null) {
    for (const section of sections) {
      const rentPattern = new RegExp(PATTERNS.monthlyRent.source, PATTERNS.monthlyRent.flags);
      const rentMatch = rentPattern.exec(section.markdown);
      if (rentMatch?.[1]) {
        const rawValue = parseNumber(rentMatch[1]);
        const unit = rentMatch[2];
        const sectionRent = unit.includes("억")
          ? rawValue * 100_000_000
          : rawValue * 10_000;

        const diffPct = relativeDiffPct(anchors.monthlyRentKrw, sectionRent);
        if (diffPct > THRESHOLDS.RENT_WARNING_PCT) {
          // 원→만원 포맷으로 가독성 향상
          const anchorDisplay = `${(anchors.monthlyRentKrw / 10_000).toLocaleString()}만원`;
          const sectionDisplay = `${(sectionRent / 10_000).toLocaleString()}만원`;
          inconsistencies.push({
            field: "monthly_rent_krw",
            section1: { type: "anchor", value: anchorDisplay },
            section2: { type: section.section_type, value: sectionDisplay },
            severity: "warning",
          });
        }
      }
    }
  }

  // ── 결과 종합 ──────────────────────────────────────────────────────────────
  // critical 불일치가 하나라도 있으면 passed=false
  const hasCritical = inconsistencies.some((i) => i.severity === "critical");

  if (inconsistencies.length > 0) {
    const criticalCount = inconsistencies.filter((i) => i.severity === "critical").length;
    const warningCount = inconsistencies.filter((i) => i.severity === "warning").length;
    console.warn(
      `[cross-validator] 교차 검증 결과 — ` +
        `critical: ${criticalCount}, warning: ${warningCount}, ` +
        `fields: [${inconsistencies.map((i) => i.field).join(", ")}]`
    );
  }

  return {
    passed: !hasCritical,
    inconsistencies,
  };
}

// ─── [B2] Narrative ↔ Financials 교차 검증 ──────────────────────────────────

/**
 * AI가 서술한 income_analysis 섹션의 수치와 financials.ts 계산 결과를 직접 비교합니다.
 *
 * 문제: AI는 LLM context로 전달된 financialsMarkdown을 참조하지만,
 *       때로는 자체 추론으로 다른 수치를 서술하여 inconsistency 발생.
 *
 * 감지 대상:
 * - Cap Rate (critical: ±0.5%p 초과)
 * - 연 임대 수입 (warning: ±15% 초과)
 *
 * @param incomeMarkdown - income_analysis 섹션의 마크다운 텍스트
 * @param calculatedCapRate - financials.ts의 capRate.base 값 (%)
 * @param calculatedAnnualNoi - financials.ts의 annualNoi.base 값 (원)
 * @returns 발견된 불일치 목록
 */
export function runFinancialsNarrativeValidation(
  incomeMarkdown: string,
  calculatedCapRate: number | null,
  calculatedAnnualNoi: number | null
): CrossValidationInconsistency[] {
  const issues: CrossValidationInconsistency[] = [];

  // Cap Rate 교차 검증
  if (calculatedCapRate !== null) {
    const capRatePattern = /(?:Cap\s*Rate|캡레이트|환원이율|수익률)[\s:약]*([0-9]+(?:\.[0-9]+)?)\s*%/gi;
    const matches = [...incomeMarkdown.matchAll(capRatePattern)];
    for (const match of matches) {
      const narrativeCapRate = parseFloat(match[1]);
      if (!isNaN(narrativeCapRate)) {
        const diff = Math.abs(narrativeCapRate - calculatedCapRate);
        if (diff > 0.5) {
          issues.push({
            field: "cap_rate_narrative_vs_calc",
            section1: { type: "financials_engine",          value: `${calculatedCapRate.toFixed(2)}%` },
            section2: { type: "income_analysis_narrative",  value: `${narrativeCapRate}%` },
            severity: "critical",
          });
          break; // 첫 번째 불일치만 보고
        }
      }
    }
  }

  // 연 임대 수입 교차 검증 (억원 단위 매칭)
  if (calculatedAnnualNoi !== null && calculatedAnnualNoi > 0) {
    const calcBil = calculatedAnnualNoi / 100_000_000;
    const noiPattern = /(?:연\s*임대\s*수입|NOI|순영업소득)[\s:약]*([0-9]+(?:\.[0-9]+)?)\s*억/gi;
    const matches = [...incomeMarkdown.matchAll(noiPattern)];
    for (const match of matches) {
      const narrativeNoi = parseFloat(match[1]);
      if (!isNaN(narrativeNoi) && calcBil > 0) {
        const relativeDiff = Math.abs(narrativeNoi - calcBil) / calcBil;
        if (relativeDiff > 0.15) {
          issues.push({
            field: "noi_narrative_vs_calc",
            section1: { type: "financials_engine",         value: `${calcBil.toFixed(2)}억` },
            section2: { type: "income_analysis_narrative", value: `${narrativeNoi}억` },
            severity: "warning",
          });
          break;
        }
      }
    }
  }

  return issues;
}

