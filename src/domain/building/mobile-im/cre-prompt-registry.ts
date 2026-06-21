// src/domain/building/mobile-im/cre-prompt-registry.ts

export interface PromptTemplate {
  id: string;
  version: string;
  description: string;
  systemPrompt: string;
  isActive: boolean;
  isABTesting: boolean;
}

/**
 * 프롬프트 레지스트리
 * A/B 테스트 및 섹션별 프롬프트를 중앙에서 관리합니다.
 */
export class CrePromptRegistry {
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
  public getActivePrompt(slotKey: string): PromptTemplate | null {
    const activeTemplates = (this.templates.get(slotKey) || []).filter(t => t.isActive);
    if (activeTemplates.length === 0) return null;

    const abTestCandidates = activeTemplates.filter(t => t.isABTesting);
    if (abTestCandidates.length > 0) {
      const randomIndex = Math.floor(Math.random() * abTestCandidates.length);
      return abTestCandidates[randomIndex];
    }

    return activeTemplates[0];
  }
}
