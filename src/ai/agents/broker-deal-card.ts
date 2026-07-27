/**
 * BrokerDealCardAgent — Chained pipeline:
 * 1. MemoParser → extract structured fields
 * 2. BuildingMiniTruth → create SSoT Lite
 * 3. BlindTeaser → create safe shareable card
 *
 * Source: docs/09-ai-agent-contracts.md sections 7-10
 */
import { callLLM } from "@/ai/llm-client";
import { sanitizeMemo, desanitizeOutput } from "@/ai/sanitizer/memo-sanitizer";
import {
  MemoParserOutputSchema,
  BlindTeaserOutputSchema,
  type MemoParserOutput,
  type BlindTeaserOutput,
} from "@/ai/schemas/broker-deal-card";
import {
  BuildingMiniTruthOutputSchema,
  type BuildingMiniTruthOutput,
} from "@/ai/schemas/building-mini-truth";
import {
  MEMO_PARSER_SYSTEM,
  MEMO_PARSER_USER_TEMPLATE,
  MEMO_PARSER_PROMPT_ID,
  BUILDING_MINI_TRUTH_SYSTEM,
  BUILDING_MINI_TRUTH_USER_TEMPLATE,
  BUILDING_MINI_TRUTH_PROMPT_ID,
  BLIND_TEASER_SYSTEM,
  BLIND_TEASER_USER_TEMPLATE,
  BLIND_TEASER_PROMPT_ID,
} from "@/ai/prompts/broker-deal-card";
import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";

/** AI 응답에서 ```json ... ``` 코드블록을 제거하여 순수 JSON 문자열 추출 */
function extractJsonString(raw: string): string {
  let s = raw.trim();
  // Remove markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) s = fenceMatch[1].trim();
  return s;
}

export interface BrokerDealCardInput {
  memo: string;
  visibilityPreference?: "blind" | "internal";
}

export interface BrokerDealCardResult {
  parsedMemo: MemoParserOutput;
  buildingTruth: BuildingMiniTruthOutput;
  blindTeaser: BlindTeaserOutput;
  model: string;
  promptVersions: {
    memoParser: string;
    buildingMiniTruth: string;
    blindTeaser: string;
  };
  usage: {
    totalTokens: number;
  };
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<{ content: string; tokens: number }> {
  const result = await callLLM({
    model,
    systemPrompt,
    userPrompt,
    responseFormat: "json_object",
    temperature: 0.7,
    maxTokens: 4096,
  });

  return {
    content: result.content,
    tokens: result.tokens,
  };
}

export async function runBrokerDealCard(
  input: BrokerDealCardInput,
): Promise<BrokerDealCardResult> {
  const model = process.env.AI_DEFAULT_MODEL || "gpt-5.4";
  let totalTokens = 0;

  // Apply PII Sanitization
  const sanitizationMap = sanitizeMemo(input.memo);
  const { sanitizedText } = sanitizationMap;

  // Step 1: Parse memo using sanitized input
  const memoPrompt = MEMO_PARSER_USER_TEMPLATE.replace("{memo}", sanitizedText);
  const memoResult = await callOpenAI(MEMO_PARSER_SYSTEM, memoPrompt, model);
  totalTokens += memoResult.tokens;
  
  // Desanitize response before Zod parsing
  const restoredMemoContent = desanitizeOutput(memoResult.content, sanitizationMap);
  let parsedMemo: MemoParserOutput;
  const cleanedMemoJson = extractJsonString(restoredMemoContent);
  let parsedMemoObj: Record<string, unknown>;
  try {
    parsedMemoObj = JSON.parse(cleanedMemoJson);
  } catch (jsonErr) {
    console.error("[broker-deal-card] MemoParser JSON.parse failed. Raw (first 800 chars):", restoredMemoContent.slice(0, 800));
    throw new Error("AI가 메모를 분석하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

  const memoZodResult = MemoParserOutputSchema.safeParse(parsedMemoObj);
  if (memoZodResult.success) {
    parsedMemo = memoZodResult.data;
  } else {
    console.warn("[broker-deal-card] MemoParser Zod validation failed, recovering from raw fields:", JSON.stringify(memoZodResult.error.issues, null, 2), "\nParsed keys:", Object.keys(parsedMemoObj));
    // Zod 실패 시, 가능한 필드를 수동으로 복구 (안티프래질 폴백)
    const rawFacts = (parsedMemoObj.extractedFacts || parsedMemoObj.extracted_facts || {}) as Record<string, unknown>;
    parsedMemo = {
      extractedFacts: {
        region: rawFacts.region != null ? String(rawFacts.region) : null,
        exactAddressCandidate: rawFacts.exactAddressCandidate != null ? String(rawFacts.exactAddressCandidate) : (rawFacts.exact_address_candidate != null ? String(rawFacts.exact_address_candidate) : null),
        assetType: rawFacts.assetType != null ? String(rawFacts.assetType) : (rawFacts.asset_type != null ? String(rawFacts.asset_type) : null),
        priceText: rawFacts.priceText != null ? String(rawFacts.priceText) : (rawFacts.price_text != null ? String(rawFacts.price_text) : null),
        sizeText: rawFacts.sizeText != null ? String(rawFacts.sizeText) : (rawFacts.size_text != null ? String(rawFacts.size_text) : null),
        currentUse: rawFacts.currentUse != null ? String(rawFacts.currentUse) : (rawFacts.current_use != null ? String(rawFacts.current_use) : null),
        leaseSignal: rawFacts.leaseSignal != null ? String(rawFacts.leaseSignal) : (rawFacts.lease_signal != null ? String(rawFacts.lease_signal) : null),
        vacancySignal: rawFacts.vacancySignal != null ? String(rawFacts.vacancySignal) : (rawFacts.vacancy_signal != null ? String(rawFacts.vacancy_signal) : null),
        tenantNames: Array.isArray(rawFacts.tenantNames || rawFacts.tenant_names) ? (rawFacts.tenantNames || rawFacts.tenant_names) as string[] : [],
        unitRentTexts: Array.isArray(rawFacts.unitRentTexts || rawFacts.unit_rent_texts) ? (rawFacts.unitRentTexts || rawFacts.unit_rent_texts) as string[] : [],
        sellerMotivationText: rawFacts.sellerMotivationText != null ? String(rawFacts.sellerMotivationText) : (rawFacts.seller_motivation_text != null ? String(rawFacts.seller_motivation_text) : null),
        brokerNotes: Array.isArray(rawFacts.brokerNotes || rawFacts.broker_notes) ? (rawFacts.brokerNotes || rawFacts.broker_notes) as string[] : [],
      },
      detectedSensitiveFields: Array.isArray(parsedMemoObj.detectedSensitiveFields || parsedMemoObj.detected_sensitive_fields)
        ? ((parsedMemoObj.detectedSensitiveFields || parsedMemoObj.detected_sensitive_fields) as string[]).filter(f => ["exact_address", "tenant_name", "unit_rent", "seller_motivation", "negotiation_memo", "owner_identity", "buyer_identity"].includes(f)) as MemoParserOutput["detectedSensitiveFields"]
        : [],
      ambiguousFields: Array.isArray(parsedMemoObj.ambiguousFields || parsedMemoObj.ambiguous_fields)
        ? (parsedMemoObj.ambiguousFields || parsedMemoObj.ambiguous_fields) as string[]
        : [],
      warnings: Array.isArray(parsedMemoObj.warnings) ? parsedMemoObj.warnings as string[] : [],
    };
  }

  // Step 2: Build Mini Truth using sanitized raw memo
  const truthPrompt = BUILDING_MINI_TRUTH_USER_TEMPLATE.replace(
    "{raw_memo}",
    sanitizedText,
  ).replace("{parsed_memo}", JSON.stringify(parsedMemo, null, 2));
  const truthResult = await callOpenAI(
    BUILDING_MINI_TRUTH_SYSTEM,
    truthPrompt,
    model,
  );
  totalTokens += truthResult.tokens;
  
  // Desanitize response before Zod parsing
  const restoredTruthContent = desanitizeOutput(truthResult.content, sanitizationMap);
  let buildingTruth: BuildingMiniTruthOutput;
  const cleanedTruthJson = extractJsonString(restoredTruthContent);
  let parsedTruthObj: Record<string, unknown>;
  try {
    parsedTruthObj = JSON.parse(cleanedTruthJson);
  } catch (jsonErr) {
    console.error("[broker-deal-card] BuildingMiniTruth JSON.parse failed. Raw (first 800 chars):", restoredTruthContent.slice(0, 800));
    throw new Error("AI가 건물 정보를 구성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

  const truthZodResult = BuildingMiniTruthOutputSchema.safeParse(parsedTruthObj);
  if (truthZodResult.success) {
    buildingTruth = truthZodResult.data;
  } else {
    console.warn("[broker-deal-card] BuildingMiniTruth Zod validation failed, recovering from raw fields:", JSON.stringify(truthZodResult.error.issues, null, 2), "\nParsed keys:", Object.keys(parsedTruthObj));
    // Zod 실패 시, 가능한 필드를 수동으로 채워서 복구 시도 (BlindTeaser와 동일한 안티프래질 패턴)
    const validHiddenFields = ["exact_address", "tenant_name", "unit_rent", "seller_motivation", "negotiation_memo", "owner_identity", "buyer_identity", "registry_detail", "lease_contract_raw_text"];
    const rawHidden = Array.isArray(parsedTruthObj.hiddenFields || parsedTruthObj.hidden_fields)
      ? (parsedTruthObj.hiddenFields || parsedTruthObj.hidden_fields) as string[]
      : [];
    buildingTruth = {
      areaSignal: String(parsedTruthObj.areaSignal || parsedTruthObj.area_signal || parsedMemo.extractedFacts.region || ""),
      assetType: String(parsedTruthObj.assetType || parsedTruthObj.asset_type || parsedMemo.extractedFacts.assetType || ""),
      priceBand: parsedTruthObj.priceBand != null ? String(parsedTruthObj.priceBand) : (parsedTruthObj.price_band != null ? String(parsedTruthObj.price_band) : null),
      sizeSignal: parsedTruthObj.sizeSignal != null ? String(parsedTruthObj.sizeSignal) : (parsedTruthObj.size_signal != null ? String(parsedTruthObj.size_signal) : null),
      currentUseSignal: parsedTruthObj.currentUseSignal != null ? String(parsedTruthObj.currentUseSignal) : (parsedTruthObj.current_use_signal != null ? String(parsedTruthObj.current_use_signal) : null),
      vacancySignal: parsedTruthObj.vacancySignal != null ? String(parsedTruthObj.vacancySignal) : (parsedTruthObj.vacancy_signal != null ? String(parsedTruthObj.vacancy_signal) : null),
      fitSummary: String(parsedTruthObj.fitSummary || parsedTruthObj.fit_summary || ""),
      cautionSummary: String(parsedTruthObj.cautionSummary || parsedTruthObj.caution_summary || ""),
      hiddenFields: rawHidden.filter((f): f is typeof validHiddenFields[number] => validHiddenFields.includes(f)) as BuildingMiniTruthOutput["hiddenFields"],
      confidence: {
        areaSignal: "ai_hypothesis",
        assetType: "ai_hypothesis",
        priceBand: "needs_verification",
        fitSummary: "ai_hypothesis",
      },
      missingData: Array.isArray(parsedTruthObj.missingData || parsedTruthObj.missing_data)
        ? (parsedTruthObj.missingData || parsedTruthObj.missing_data) as string[]
        : [],
      boundaryNote: String(parsedTruthObj.boundaryNote || parsedTruthObj.boundary_note || "이 자료는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다."),
    };
  }

  // Step 3: Generate Blind Teaser
  const teaserPrompt = BLIND_TEASER_USER_TEMPLATE.replace(
    "{building_truth}",
    JSON.stringify(buildingTruth, null, 2),
  ).replace("{hidden_fields}", buildingTruth.hiddenFields.join(", "));
  const teaserResult = await callOpenAI(
    BLIND_TEASER_SYSTEM,
    teaserPrompt,
    model,
  );
  totalTokens += teaserResult.tokens;
  
  // Desanitize teaser output to restore any placeholders
  const restoredTeaserContent = desanitizeOutput(teaserResult.content, sanitizationMap);
  let blindTeaser: BlindTeaserOutput;
  const cleanedJson = extractJsonString(restoredTeaserContent);
  let parsedObj: Record<string, unknown>;
  try {
    parsedObj = JSON.parse(cleanedJson);
  } catch (jsonErr) {
    console.error("[broker-deal-card] BlindTeaser JSON.parse failed. Raw (first 800 chars):", restoredTeaserContent.slice(0, 800));
    throw new Error("AI 응답이 유효한 JSON이 아닙니다. 잠시 후 다시 시도해주세요.");
  }
  
  const zodResult = BlindTeaserOutputSchema.safeParse(parsedObj);
  if (zodResult.success) {
    blindTeaser = zodResult.data;
  } else {
    console.error("[broker-deal-card] BlindTeaser Zod validation failed:", JSON.stringify(zodResult.error.issues, null, 2), "\nParsed keys:", Object.keys(parsedObj));
    // Zod 실패 시, 가능한 필드를 수동으로 채워서 복구 시도
    blindTeaser = {
      title: String(parsedObj.title || "블라인드 딜카드"),
      shortSummary: String(parsedObj.shortSummary || parsedObj.short_summary || ""),
      dealPoints: Array.isArray(parsedObj.dealPoints || parsedObj.deal_points)
        ? (parsedObj.dealPoints || parsedObj.deal_points) as string[]
        : ["투자 매력 포인트"],
      cautionPoints: Array.isArray(parsedObj.cautionPoints || parsedObj.caution_points)
        ? (parsedObj.cautionPoints || parsedObj.caution_points) as string[]
        : ["실사 확인 필요"],
      hiddenInfoNotice: Array.isArray(parsedObj.hiddenInfoNotice || parsedObj.hidden_info_notice)
        ? (parsedObj.hiddenInfoNotice || parsedObj.hidden_info_notice) as string[]
        : [],
      gateMessage: String(parsedObj.gateMessage || parsedObj.gate_message || ""),
      kakaoText: String(parsedObj.kakaoText || parsedObj.kakao_text || ""),
      boundaryNote: String(parsedObj.boundaryNote || parsedObj.boundary_note || ""),
    };
  }

  // Apply safe-language guardrails to public-facing text
  const guardedTeaser = { ...blindTeaser };
  if (guardedTeaser.title) {
    guardedTeaser.title = rewriteUnsafeText(guardedTeaser.title).safeText;
  }
  if (guardedTeaser.shortSummary) {
    guardedTeaser.shortSummary = rewriteUnsafeText(guardedTeaser.shortSummary).safeText;
  }

  return {
    parsedMemo,
    buildingTruth,
    blindTeaser: guardedTeaser,
    model,
    promptVersions: {
      memoParser: MEMO_PARSER_PROMPT_ID,
      buildingMiniTruth: BUILDING_MINI_TRUTH_PROMPT_ID,
      blindTeaser: BLIND_TEASER_PROMPT_ID,
    },
    usage: { totalTokens },
  };
}

