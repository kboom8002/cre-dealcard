import { isDeterministicLLMMode } from '@/ai/llm-determinism';

export interface PromptTemplate {
  id: string;
  version: string;
  description: string;
  systemPrompt: string;
  isActive: boolean;
  isABTesting: boolean;
}

/**
 * Port interface for Prompt Registry (Rule 12 Domain Purity)
 */
export interface PromptRegistryPort {
  getActivePrompt(slotKey: string, generationId?: string): Promise<PromptTemplate | null> | PromptTemplate | null;
  register(slotKey: string, template: PromptTemplate): Promise<void> | void;
  listPrompts(slotKey?: string): Promise<PromptTemplate[]> | PromptTemplate[];
}

/**
 * 프롬프트 레지스트리
 * A/B 테스트 및 섹션별 프롬프트를 중앙에서 관리합니다.
 */
export class CrePromptRegistry implements PromptRegistryPort {
  private static instance: CrePromptRegistry;
  private templates: Map<string, PromptTemplate[]> = new Map();

  private constructor() {
    this.initializeDefaultTemplates();
  }

  public static getInstance(): CrePromptRegistry {
    if (!CrePromptRegistry.instance) {
      CrePromptRegistry.instance = new CrePromptRegistry();
    }
    return CrePromptRegistry.instance;
  }

  private initializeDefaultTemplates() {
    // 기본 작가 프롬프트 (v1)
    this.register("writer_system", {
      id: "writer_system_v1",
      version: "1.0",
      description: "Default writer system prompt",
      isActive: true,
      isABTesting: true,
      systemPrompt: `You are a highly professional Commercial Real Estate (CRE) Brokerage Analyst.
Your goal is to write a compelling, accurate, and easy-to-read section for a Mobile Information Memorandum (IM).
- Tone: Professional, persuasive, analytical, yet accessible on mobile devices.
- Format: Use bullet points, emojis where appropriate, and keep sentences concise.
- Rule: Do not invent any numbers. If data is missing, speak in general terms or state it needs verification.`
    });

    // A/B 테스트용 작가 프롬프트 (v2 - 감성 소구 강화)
    this.register("writer_system", {
      id: "writer_system_v2",
      version: "2.0",
      description: "Emotional & Storytelling writer system prompt",
      isActive: true,
      isABTesting: true,
      systemPrompt: `You are an elite Commercial Real Estate (CRE) Storyteller.
Your goal is to write a highly persuasive Mobile Information Memorandum (IM) section that appeals to the investor's emotions and vision.
- Tone: Visionary, confident, exclusive.
- Format: Use compelling narrative, bullet points, and relevant emojis.
- Rule: Do not invent facts, but highlight the "hidden value" and future potential of the asset.`
    });

    // 섹션별 전용 프롬프트: 재무 분석 (B-6 수정)
    this.register("section_income_analysis", {
      id: "section_income_analysis_v1",
      version: "1.0",
      description: "Income analysis specific prompt",
      isActive: true,
      isABTesting: false,
      systemPrompt: `You are a highly professional Commercial Real Estate (CRE) Financial Analyst.
Your goal is to write the Income Analysis section for a Mobile Information Memorandum (IM).
- Tone: Extremely precise, objective, data-driven.
- Format: Strictly use markdown tables for financials, emphasize key numbers (NOI, Cap Rate, WACC).
- Rule: DO NOT hallucinate any numbers. Present calculations transparently.`
    });

    // 섹션별 전용 프롬프트: 리스크 진단 (B-6 수정)
    this.register("section_risk_check", {
      id: "section_risk_check_v1",
      version: "1.0",
      description: "Risk check specific prompt",
      isActive: true,
      isABTesting: false,
      systemPrompt: `You are a highly professional Commercial Real Estate (CRE) Legal & Compliance Analyst.
Your goal is to write the Risk Check section for a Mobile Information Memorandum (IM).
- Tone: Conservative, cautious, compliant, clear.
- Format: Use clear bullet points for legal limits, zoning laws, and potential red flags.
- Rule: Always include standard disclaimers. Do not make definitive legal guarantees.`
    });

    // 섹션별 전용 프롬프트: 투자의견 (B-6 수정)
    this.register("section_investment_thesis", {
      id: "section_investment_thesis_v1",
      version: "1.0",
      description: "Investment thesis specific prompt",
      isActive: true,
      isABTesting: false,
      systemPrompt: `You are an elite Commercial Real Estate (CRE) Investment Director.
Your goal is to write the Investment Thesis section for a Mobile Information Memorandum (IM).
- Tone: Persuasive, visionary, authoritative.
- Format: Clear arguments, high-impact bullet points, concise summary.
- Rule: Highlight the asset's hidden value, value-add potential, and market positioning.`
    });

    // 뉴스레터 TaskFlow 8-Block (TF8) 프롬프트 슬롯 등록
    this.register("magazine_draft_tf8", {
      id: "magazine_draft_tf8_v3",
      version: "3.0",
      description: "TaskFlow TF8 cadence-aware (daily/weekly/monthly) newsletter cover & briefing draft prompt with [E] few-shot, [V] self-check and M11 no-slice repair",
      isActive: true,
      isABTesting: false,
      systemPrompt:
        "# TaskFlow TF8 Prompt Contract (magazine_draft_tf8 v3.0)\n[T] Task: 일간·주간·월간 주기별 공인중개사 권역·관심 분야 맞춤형 뉴스레터 표지(36자) 및 시장 브리핑 JSON 작성\n[W] Warnings: [No-LLM-Numbers] [No-Solicitation] [No-Internal-Labels] [No-Gossip] [No-Truncation] [Char-Budget] [Cadence-Consistency]\n[V] Self-check: 글자 수·완결 종결어미·미출처 숫자 0건",
    });

    this.register("magazine_axios_cluster_tf8", {
      id: "magazine_axios_cluster_tf8_v3",
      version: "3.0",
      description: "TaskFlow TF8 AXIOS 5-issue glass card-news clustering prompt (title <=36 chars + brief <=48 chars, no truncation)",
      isActive: true,
      isABTesting: false,
      systemPrompt:
        "# TaskFlow TF8 Prompt Contract (magazine_axios_cluster_tf8 v3.0)\n[T] Task: 5대 핵심 이슈를 카드뉴스형 제목(<=36자) + AXIOS 부제형 해설(<=48자, 완결 1문장)로 클러스터링 재작성\n[W] Warnings: [No-LLM-Numbers] [No-Internal-Labels] [No-Gossip] [No-Truncation] [Grounding]\n[V] Self-check: 5개 카드 글자 수·종결어미·id 보존",
    });

    this.register("magazine_comment_tf8", {
      id: "magazine_comment_tf8_v2",
      version: "2.0",
      description: "TaskFlow TF8 broker deal recommendation 1-line comment prompt",
      isActive: true,
      isABTesting: false,
      systemPrompt:
        "# TaskFlow TF8 Prompt Contract (magazine_comment_tf8 v2.0)\n[T] Task: 중개사 매물 추천 코멘트 1~2문장 정제\n[W] Warnings: [No-LLM-Numbers] [No-Solicitation]",
    });
  }

  public register(slotKey: string, template: PromptTemplate) {
    const existing = this.templates.get(slotKey) || [];
    // 같은 ID가 있으면 업데이트, 없으면 추가
    const index = existing.findIndex(t => t.id === template.id);
    if (index >= 0) {
      existing[index] = template;
    } else {
      existing.push(template);
    }
    this.templates.set(slotKey, existing);
  }

  /**
   * 해당 슬롯의 활성 프롬프트를 가져옵니다. A/B 테스트가 켜져 있으면 무작위로 하나를 반환합니다.
   */
  public getActivePrompt(slotKey: string, generationId?: string): PromptTemplate | null {
    const activeTemplates = (this.templates.get(slotKey) || []).filter(t => t.isActive);
    if (activeTemplates.length === 0) return null;

    const abTestCandidates = activeTemplates.filter(t => t.isABTesting);
    if (abTestCandidates.length > 0) {
      if (generationId) {
        let hash = 0;
        for (let i = 0; i < generationId.length; i++) {
          hash = ((hash << 5) - hash) + generationId.charCodeAt(i);
          hash |= 0;
        }
        return abTestCandidates[Math.abs(hash) % abTestCandidates.length];
      }
      // H4 결정성: 녹화/재생 모드에선 무작위 변형 선택 금지 (프롬프트 해시 고정)
      if (isDeterministicLLMMode()) return abTestCandidates[0];
      const randomIndex = Math.floor(Math.random() * abTestCandidates.length);
      return abTestCandidates[randomIndex];
    }

    return activeTemplates[0];
  }

  public listPrompts(slotKey?: string): PromptTemplate[] {
    if (slotKey) {
      return [...(this.templates.get(slotKey) || [])];
    }
    const all: PromptTemplate[] = [];
    for (const templates of this.templates.values()) {
      all.push(...templates);
    }
    return all;
  }
}

