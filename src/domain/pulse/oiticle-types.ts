/**
 * CRE Oiticle Types — 8유형 인사이트 콘텐츠 정의
 *
 * aihompyhub의 oiticleTypes.ts (12유형 follow-up + 7축 루브릭) 패턴을
 * CRE 도메인으로 전환.
 */

// ── 오이티클 8유형 ────────────────────────────────────────────────
export type OiticleTypeCode = "MA" | "CS" | "LG" | "TX" | "PM" | "IA" | "TR" | "PS";

export interface OiticleTypeDef {
  code: OiticleTypeCode;
  label: string;
  emoji: string;
  description: string;
  targetAudience: string;
  seoKeywords: string[];
  promptTemplate: string; // LLM 프롬프트 골자
}

export const OITICLE_TYPES: Record<OiticleTypeCode, OiticleTypeDef> = {
  MA: {
    code: "MA",
    label: "시세 분석",
    emoji: "📊",
    description: "권역별 시세 변동·추세·비교 분석 리포트",
    targetAudience: "투자자, 건물주, 중개인",
    seoKeywords: ["상업용부동산 시세", "오피스 시세", "빌딩 가격 동향"],
    promptTemplate: `당신은 상업용 부동산 시세 분석 전문 리서처입니다.
다음 시장 데이터를 기반으로 {{region}} 지역의 {{period}} 시세 분석 리포트를 작성하세요.

[시장 데이터]
{{dataSnapshot}}

[작성 지침]
- 제목은 SEO 최적화된 한국어로 작성
- 핵심 수치와 전주/전월 대비 변화를 반드시 포함
- 매수/임차 관점의 액션 포인트 제시
- 면책 조항: "본 분석은 AI가 집계 데이터를 기반으로 자동 생성한 것으로, 투자 조언이 아닙니다."
- 마크다운 형식으로 2000~3000자 분량
`,
  },
  CS: {
    code: "CS",
    label: "거래 사례",
    emoji: "🏢",
    description: "블라인드 거래 케이스 스터디 — 성공/실패 요인 분석",
    targetAudience: "중개인, 투자자",
    seoKeywords: ["상업용부동산 거래사례", "빌딩 매매 사례", "CRE 케이스스터디"],
    promptTemplate: `당신은 상업용 부동산 거래 분석가입니다.
다음 거래 데이터를 블라인드 처리하여 케이스 스터디를 작성하세요.

[거래 데이터]
{{dataSnapshot}}

[작성 지침]
- 건물 이름, 주소, 당사자 정보는 반드시 블라인드 처리
- 거래 성사/무산 요인 분석
- 유사 거래 시 참고할 교훈 제시
- 마크다운 형식 1500~2500자
`,
  },
  LG: {
    code: "LG",
    label: "법률 가이드",
    emoji: "⚖️",
    description: "상업용 부동산 법률 실무 가이드",
    targetAudience: "건물주, 임차인, 중개인",
    seoKeywords: ["상업용부동산 법률", "상가 임대차", "부동산 법무"],
    promptTemplate: `당신은 상업용 부동산 전문 법률 자문가입니다.
다음 주제에 대한 실무 법률 가이드를 작성하세요.

[주제]
{{topic}}

[작성 지침]
- 관련 법조문 명시 (상가건물 임대차보호법 등)
- 실무 체크리스트 포함
- 면책 조항: "법률 자문은 반드시 변호사와 상담하세요."
- 마크다운 형식 2000~3000자
`,
  },
  TX: {
    code: "TX",
    label: "세무 전략",
    emoji: "🧮",
    description: "양도세·취득세·법인세 절세 전략",
    targetAudience: "건물주, 투자자",
    seoKeywords: ["부동산 세금", "양도세 절세", "취득세 절감"],
    promptTemplate: `당신은 부동산 세무 전문가입니다.
다음 세무 주제에 대해 전략 가이드를 작성하세요.

[주제]
{{topic}}

[작성 지침]
- 구체적 세율과 계산 예시 포함
- 절세 시나리오 비교
- 면책 조항: "세무 상담은 세무사와 반드시 상의하세요."
- 마크다운 형식 2000~3000자
`,
  },
  PM: {
    code: "PM",
    label: "관리 인사이트",
    emoji: "🔧",
    description: "PM/FM 운영 노하우·공실 관리·에너지 최적화",
    targetAudience: "건물주, PM사, 벤더",
    seoKeywords: ["건물관리", "공실관리", "FM 운영"],
    promptTemplate: `당신은 상업용 건물 관리(PM/FM) 전문가입니다.
다음 데이터를 기반으로 건물 관리 인사이트 리포트를 작성하세요.

[데이터]
{{dataSnapshot}}

[작성 지침]
- 실행 가능한 관리 개선 액션 제시
- ROI 추정 포함
- 마크다운 형식 1500~2500자
`,
  },
  IA: {
    code: "IA",
    label: "투자 분석",
    emoji: "📈",
    description: "수익률 분석·투자 시나리오·비교",
    targetAudience: "투자자, 건물주",
    seoKeywords: ["CRE 투자분석", "상업용부동산 수익률", "부동산 투자"],
    promptTemplate: `당신은 상업용 부동산 투자 분석가입니다.
다음 시장 데이터로 투자 분석 리포트를 작성하세요.

[시장 데이터]
{{dataSnapshot}}

[작성 지침]
- Cap Rate, NOI, IRR 등 핵심 지표 포함
- 3개 시나리오(보수/기본/낙관) 비교
- 면책 조항: "본 분석은 투자 조언이 아닙니다."
- 마크다운 형식 2000~3000자
`,
  },
  TR: {
    code: "TR",
    label: "트렌드 전망",
    emoji: "🔮",
    description: "거시 트렌드·시장 전망·예측",
    targetAudience: "전체",
    seoKeywords: ["CRE 시장전망", "상업용부동산 트렌드", "부동산 전망"],
    promptTemplate: `당신은 상업용 부동산 시장 전략 분석가입니다.
다음 데이터를 기반으로 시장 트렌드 전망을 작성하세요.

[데이터]
{{dataSnapshot}}

[작성 지침]
- 거시경제 연계 분석 (금리, GDP 등)
- 권역별 차별화된 전망
- 3~6개월 단기 + 12개월 중기 전망
- 마크다운 형식 2500~4000자
`,
  },
  PS: {
    code: "PS",
    label: "파트너 스포트라이트",
    emoji: "🤝",
    description: "인증 파트너 심층 인터뷰·서비스 소개",
    targetAudience: "서비스 파트너, 잠재 이용자",
    seoKeywords: ["CRE 서비스파트너", "상업용부동산 인테리어", "빌딩관리 파트너"],
    promptTemplate: `당신은 CRE 서비스 파트너 인터뷰 기자입니다.
다음 파트너 정보를 기반으로 스포트라이트 기사를 작성하세요.

[파트너 정보]
{{dataSnapshot}}

[작성 지침]
- 전문 분야, 차별점, 실적 강조
- 파트너의 서비스 카드 자연스럽게 연결
- 마크다운 형식 1500~2500자
`,
  },
};

// ── 작성자 유형 ────────────────────────────────────────────────────
export type OiticleAuthorType = "ai" | "broker" | "vendor" | "admin";

export const AUTHOR_TYPE_META: Record<OiticleAuthorType, { label: string; badge: string }> = {
  ai:     { label: "DealCard AI", badge: "🤖 AI 리서치" },
  broker: { label: "전문 중개인", badge: "🏢 Expert Broker" },
  vendor: { label: "인증 파트너", badge: "✨ Verified Partner" },
  admin:  { label: "편집국",     badge: "📰 Editorial" },
};

// ── 품질 기준 (7축 루브릭 — aihompyhub 패턴) ─────────────────────
export interface QualityRubric {
  accuracy: number;       // 데이터 정확성 (1~5)
  depth: number;          // 분석 깊이
  actionability: number;  // 실행 가능성
  timeliness: number;     // 시의성
  readability: number;    // 가독성
  seoValue: number;       // SEO 기여도
  engagement: number;     // 참여 유발도
}

export function computeQualityScore(rubric: QualityRubric): number {
  const weights = {
    accuracy: 0.2,
    depth: 0.15,
    actionability: 0.2,
    timeliness: 0.15,
    readability: 0.1,
    seoValue: 0.1,
    engagement: 0.1,
  };
  let score = 0;
  for (const [k, w] of Object.entries(weights)) {
    score += (rubric[k as keyof QualityRubric] / 5) * 100 * w;
  }
  return Math.round(score);
}

// ── slug 생성 유틸 ────────────────────────────────────────────────
export function generateOiticleSlug(
  type: OiticleTypeCode,
  title: string,
  region?: string,
): string {
  const typeLabel = OITICLE_TYPES[type].label.replace(/\s/g, "-");
  const clean = title
    .replace(/[^\w가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  const suffix = region ? `-${region}` : "";
  const date = new Date().toISOString().slice(0, 10);
  return `${type.toLowerCase()}-${clean}${suffix}-${date}`;
}
