/**
 * @file src/domain/building/mobile-im/workspace-ai-enhancer.ts
 * @description SOTA Neuro-Symbolic + Hybrid RAG + Golden Few-Shot + CRE Lexicon 엔진
 *
 * IM 작업공간([AI 장점 생성]), 10슬라이드 스튜디오([AI 문구 다듬기]), 빠른 IM 발행(quick-generate)이
 * Pro IM 파이프라인과 동일한 SOTA 도메인 규율(사전 연산 SSOT Fact Sheet, 5대 포스처 오버레이,
 * 동적 Golden Few-Shot + pgvector Hybrid RAG, 날조 브랜드 마스킹, 미근거 숫자 Pinpoint 자가 교정,
 * DB 기반 CRE 용어 정규화)을 공유하도록 통합한다.
 */

import type { InvestmentPosture } from '@/domain/ontology';
import type { MobileIMSectionType } from './types';
import { isDeterministicLLMMode } from '@/ai/llm-determinism';
import { findNumbersNotInContext } from '@/lib/magazine/ai-comment-schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getPosturePromptOverlay } from './posture-prompts';
import { buildIMFewShotBlock } from './golden-im-manager';
import { searchSimilarIMs } from './cre-rag-service';
import {
  normalizeTerminology,
  normalizeTerminologyAsync,
  protectBlock,
  sanitizeTextHygiene,
} from './terminology-normalizer';
import { maskFabricatedBrands } from './tenant-name-policy';

const PYEONG_FACTOR = 3.305785;

export interface WorkspaceImFactInput {
  address?: string;
  title?: string;
  posture?: string;
  askingPriceManwon?: number;
  gfaSqm?: number | string;
  landAreaSqm?: number | string;
  zoning?: string;
  completionDate?: string;
  rentRollSummary?: string;
  totalDepositManwon?: number;
  totalRentManwon?: number;
  calculatedYieldPct?: number;
  floorsAbove?: number;
  floorsBelow?: number;
  bcrPct?: number;
  farPct?: number;
  parkingSpaces?: number;
  elevators?: number;
  officialLandPriceWonSqm?: number;
  handoverNote?: string;
  parcelsCount?: number;
  landCategoryLabel?: string;
  tenantNames?: string[];
  vacantCount?: number;
  ownerUseCount?: number;
  nearbyStationText?: string;
}

export interface AuthoritativeImFactSheet {
  canonicalPosture: InvestmentPosture;
  goldenPriceBand: 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
  inferredAssetType: string;
  regionLabel: string;
  buildingTitle: string;
  askingPriceManwon: number;
  askingPriceEokText: string;
  landAreaSqm: number;
  landAreaPyeong: number;
  gfaSqm: number;
  gfaPyeong: number;
  totalDepositManwon: number;
  totalRentManwon: number;
  annualRentManwon: number;
  netInvestmentManwon: number;
  netInvestmentEokText: string;
  grossYieldPct: number;
  netYieldPct: number;
  landPricePerPyeongManwon: number;
  gfaPricePerPyeongManwon: number;
  officialLandCoveragePct: number;
  verifiedTenantNames: string[];
  tenantPoolObjects: Array<{ tenant_name: string }>;
  /** LLM에 주입할 결정론적 사전 연산 팩트 시트 (LLM 암산 금지) */
  factSheetPromptBlock: string;
  /** findNumbersNotInContext 검증용 본건 SSOT 허용 숫자 컨텍스트 (RAG/예시 숫자 제외) */
  numberAllowlistContext: string;
}

export interface ImCopyValidationResult {
  ok: boolean;
  ungroundedNumbers: string[];
  fabricatedBrands: string[];
  forbiddenHits: string[];
  exceedsLength: boolean;
}

/**
 * 작업공간/스튜디오 포스처 별칭을 표준 5대 포스처로 정규화한다.
 */
export function mapWorkspacePostureToCanonical(rawPosture?: string | null): InvestmentPosture {
  const normalized = String(rawPosture ?? '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'owner_occupied' ||
    normalized === 'owner_occupier' ||
    normalized === 'self_use'
  ) {
    return 'owner_occupied';
  }
  if (
    normalized === 'development' ||
    normalized === 'value_add' ||
    normalized === 'redevelopment' ||
    normalized === 'remodeling'
  ) {
    return 'development';
  }
  if (
    normalized === 'operating' ||
    normalized === 'hotel' ||
    normalized === 'hospital' ||
    normalized === 'logistics_operating'
  ) {
    return 'operating';
  }
  if (
    normalized === 'trading' ||
    normalized === 'capital_gain' ||
    normalized === 'short_term'
  ) {
    return 'trading';
  }
  return 'income';
}

/**
 * 매매가(만원)를 Golden Set 유사 가격대 버킷(B1~B5)으로 매핑한다.
 */
export function askingPriceManwonToGoldenBand(
  askingPriceManwon?: number | null,
): 'B1' | 'B2' | 'B3' | 'B4' | 'B5' {
  const manwon = Number(askingPriceManwon ?? 0);
  if (!Number.isFinite(manwon) || manwon < 300_000) return 'B1'; // < 30억
  if (manwon < 700_000) return 'B2'; // 30억 ~ 70억
  if (manwon < 1_500_000) return 'B3'; // 70억 ~ 150억
  if (manwon < 3_000_000) return 'B4'; // 150억 ~ 300억
  return 'B5'; // 300억 이상
}

/**
 * 입력 제원으로부터 자산 유형 코드를 추론한다 (Golden Set / Hybrid RAG 필터링용).
 */
export function inferAssetTypeCode(
  zoning?: string,
  title?: string,
  rentSummary?: string,
): string {
  const combined = `${zoning ?? ''} ${title ?? ''} ${rentSummary ?? ''}`;
  if (/물류|창고|냉동|냉장|logistics|warehouse/i.test(combined)) return 'logistics';
  if (/병원|의원|메디컬|피부과|치과|내과|정형외과|클리닉/i.test(combined)) return 'medical';
  if (/숙박|호텔|모텔|스테이|레지던스/i.test(combined)) return 'hospitality';
  if (/오피스|업무시설|사옥|회계법인|법무법인|지식산업/i.test(combined)) return 'office';
  return '근린생활시설';
}

function parsePositiveNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  if (typeof v === 'string') {
    const cleaned = v.replace(/,/g, '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

function formatManwonAsEok(manwon: number): string {
  if (manwon <= 0) return '';
  const eok = Math.round((manwon / 10_000) * 100) / 100;
  const wholeEok = Math.floor(manwon / 10_000);
  const remManwon = Math.round(manwon % 10_000);
  if (wholeEok > 0 && remManwon > 0 && eok % 1 !== 0 && remManwon % 1000 !== 0) {
    return `${wholeEok}억 ${remManwon.toLocaleString()}만원`;
  }
  return `${eok}억 원`;
}

function extractRegionFromAddress(address?: string): string {
  const clean = String(address ?? '').trim();
  if (!clean) return '주요 상권';
  const tokens = clean.split(/\s+/).filter(Boolean);
  const guDong = tokens.filter((t) => /(?:시|군|구|동|읍|면|가|로|길)$/.test(t)).slice(0, 3);
  if (guDong.length >= 2) return guDong.slice(-2).join(' ');
  return tokens.slice(0, 2).join(' ') || clean;
}

/**
 * LLM 암산 오류를 원천 차단하기 위해 모든 면적 환산·수익률·실투자금·평당가를 결정론적으로 사전 계산한다.
 */
export function buildAuthoritativeImFactSheet(
  input: WorkspaceImFactInput,
): AuthoritativeImFactSheet {
  const canonicalPosture = mapWorkspacePostureToCanonical(input.posture);
  const askingPriceManwon = parsePositiveNum(input.askingPriceManwon);
  const goldenPriceBand = askingPriceManwonToGoldenBand(askingPriceManwon);
  const inferredAssetType = inferAssetTypeCode(
    input.zoning,
    input.title,
    input.rentRollSummary,
  );
  const regionLabel = extractRegionFromAddress(input.address);
  const buildingTitle = String(input.title || '').trim() || `${regionLabel} 근생·업무 빌딩`;

  const landAreaSqm = Math.round(parsePositiveNum(input.landAreaSqm) * 100) / 100;
  const landAreaPyeong =
    landAreaSqm > 0 ? Math.round((landAreaSqm / PYEONG_FACTOR) * 100) / 100 : 0;

  const gfaSqm = Math.round(parsePositiveNum(input.gfaSqm) * 100) / 100;
  const gfaPyeong = gfaSqm > 0 ? Math.round((gfaSqm / PYEONG_FACTOR) * 100) / 100 : 0;

  const totalDepositManwon = parsePositiveNum(input.totalDepositManwon);
  const totalRentManwon = parsePositiveNum(input.totalRentManwon);
  const annualRentManwon = Math.round(totalRentManwon * 12 * 10) / 10;

  const netInvestmentManwon =
    askingPriceManwon > 0 ? Math.max(0, askingPriceManwon - totalDepositManwon) : 0;

  const grossYieldPct =
    askingPriceManwon > 0 && annualRentManwon > 0
      ? Math.round(((annualRentManwon / askingPriceManwon) * 100) * 100) / 100
      : parsePositiveNum(input.calculatedYieldPct);

  const netYieldPct =
    netInvestmentManwon > 0 && annualRentManwon > 0
      ? Math.round(((annualRentManwon / netInvestmentManwon) * 100) * 100) / 100
      : parsePositiveNum(input.calculatedYieldPct);

  const landPricePerPyeongManwon =
    askingPriceManwon > 0 && landAreaPyeong > 0
      ? Math.round(askingPriceManwon / landAreaPyeong)
      : 0;
  const gfaPricePerPyeongManwon =
    askingPriceManwon > 0 && gfaPyeong > 0
      ? Math.round(askingPriceManwon / gfaPyeong)
      : 0;

  const officialLandPriceWonSqm = parsePositiveNum(input.officialLandPriceWonSqm);
  const officialLandTotalManwon =
    officialLandPriceWonSqm > 0 && landAreaSqm > 0
      ? Math.round((officialLandPriceWonSqm * landAreaSqm) / 10_000)
      : 0;
  const officialLandCoveragePct =
    officialLandTotalManwon > 0 && askingPriceManwon > 0
      ? Math.round(((officialLandTotalManwon / askingPriceManwon) * 100) * 10) / 10
      : 0;

  const askingPriceEokText = formatManwonAsEok(askingPriceManwon);
  const netInvestmentEokText = formatManwonAsEok(netInvestmentManwon);

  const genericTenantTokens = new Set([
    '공실',
    '자가사용',
    '자가',
    '임대중',
    '근린생활시설',
    '제1종근린생활시설',
    '제2종근린생활시설',
    '업무시설',
    '사무실',
    '상가',
    '점포',
    '기타',
    '-',
  ]);
  const rawNames = [
    ...(Array.isArray(input.tenantNames) ? input.tenantNames : []),
  ]
    .map((n) => String(n ?? '').trim())
    .filter((n) => n.length >= 2 && !genericTenantTokens.has(n));
  const verifiedTenantNames = Array.from(new Set(rawNames));
  const tenantPoolObjects: Array<{ tenant_name: string }> = [
    ...verifiedTenantNames.map((n) => ({ tenant_name: n })),
    ...(input.rentRollSummary ? [{ tenant_name: input.rentRollSummary }] : []),
  ];

  const lines: string[] = [];
  if (input.address) lines.push(`- 소재지: ${input.address} (권역: ${regionLabel})`);
  if (input.title) lines.push(`- 건물명: ${input.title}`);
  lines.push(`- 투자 포스처: ${canonicalPosture}`);
  if (askingPriceManwon > 0) {
    lines.push(
      `- 매매 희망가: ${askingPriceEokText} (${askingPriceManwon.toLocaleString()}만원)`,
    );
  }
  if (landAreaSqm > 0) {
    lines.push(
      `- 대지면적: ${landAreaSqm.toLocaleString()}㎡ (약 ${landAreaPyeong.toLocaleString()}평)${
        input.parcelsCount && input.parcelsCount >= 2
          ? ` · 총 ${input.parcelsCount}필지 합산`
          : ''
      }${input.landCategoryLabel ? ` · 지목 ${input.landCategoryLabel}` : ''}`,
    );
  }
  if (gfaSqm > 0) {
    lines.push(
      `- 연면적: ${gfaSqm.toLocaleString()}㎡ (약 ${gfaPyeong.toLocaleString()}평)`,
    );
  }
  if (input.zoning) lines.push(`- 용도지역: ${input.zoning}`);
  if (input.floorsAbove || input.floorsBelow !== undefined) {
    const below = Number(input.floorsBelow ?? 0);
    const above = Number(input.floorsAbove ?? 0);
    if (above > 0 || below > 0) {
      lines.push(`- 건축규모: 지하 ${below}층 / 지상 ${above}층`);
    }
  }
  if (input.bcrPct || input.farPct) {
    lines.push(
      `- 건폐율 / 용적률: ${input.bcrPct ? `${input.bcrPct}%` : '-'} / ${
        input.farPct ? `${input.farPct}%` : '-'
      }`,
    );
  }
  if (input.completionDate) lines.push(`- 사용승인일: ${input.completionDate}`);
  if (input.parkingSpaces || input.elevators) {
    lines.push(
      `- 주차 / 승강기: 주차 ${Number(input.parkingSpaces ?? 0)}대 / 승강기 ${Number(
        input.elevators ?? 0,
      )}대`,
    );
  }
  if (totalDepositManwon > 0 || totalRentManwon > 0) {
    lines.push(
      `- 현행 임대 합계: 총 보증금 ${totalDepositManwon.toLocaleString()}만원 (${formatManwonAsEok(
        totalDepositManwon,
      )}) / 월 임대료 ${totalRentManwon.toLocaleString()}만원 (연간 ${annualRentManwon.toLocaleString()}만원)`,
    );
  }
  if (netInvestmentManwon > 0 && totalDepositManwon > 0) {
    lines.push(
      `- 보증금 차감 실투자금(레버리지 전): ${netInvestmentEokText} (${netInvestmentManwon.toLocaleString()}만원)`,
    );
  }
  if (netYieldPct > 0 || grossYieldPct > 0) {
    lines.push(
      `- 사전 계산 수익률: 보증금 차감 연 수익률 ${netYieldPct.toFixed(2)}%${
        grossYieldPct > 0 ? ` / 총매매가 대비 연 수익률(Cap Rate) ${grossYieldPct.toFixed(2)}%` : ''
      }`,
    );
  }
  if (landPricePerPyeongManwon > 0) {
    lines.push(
      `- 토지 평당가: 평당 ${landPricePerPyeongManwon.toLocaleString()}만원${
        gfaPricePerPyeongManwon > 0
          ? ` / 연면적 평당가: 평당 ${gfaPricePerPyeongManwon.toLocaleString()}만원`
          : ''
      }`,
    );
  }
  if (officialLandPriceWonSqm > 0) {
    lines.push(
      `- 개별공시지가: ㎡당 ${officialLandPriceWonSqm.toLocaleString()}원${
        officialLandCoveragePct > 0
          ? ` (공시지가 합산액 매매가 대비 약 ${officialLandCoveragePct}%)`
          : ''
      }`,
    );
  }
  if (verifiedTenantNames.length > 0) {
    lines.push(`- 실제 렌트롤 확인 임차인/업종: ${verifiedTenantNames.join(', ')}`);
  }
  if (input.vacantCount !== undefined || input.ownerUseCount !== undefined) {
    lines.push(
      `- 공실/자가 현황: 공실 ${Number(input.vacantCount ?? 0)}개 호실 / 자가사용 ${Number(
        input.ownerUseCount ?? 0,
      )}개 호실`,
    );
  }
  if (input.handoverNote) lines.push(`- 명도·인도 조건: ${input.handoverNote}`);
  if (input.nearbyStationText) lines.push(`- 검증된 교통 여건: ${input.nearbyStationText}`);
  if (input.rentRollSummary) lines.push(`- 층별 임대 요약: ${input.rentRollSummary}`);

  const factSheetPromptBlock = lines.join('\n');

  // 숫자 허용 풀: 원본 입력 + 결정론적 사전 연산값(소수점 1·2자리 및 반올림 정수 표현 포함)
  const computedNumberVariants = [
    askingPriceManwon,
    Math.round((askingPriceManwon / 10_000) * 100) / 100,
    Math.round((askingPriceManwon / 10_000) * 10) / 10,
    landAreaSqm,
    Math.round(landAreaSqm * 10) / 10,
    Math.round(landAreaSqm),
    landAreaPyeong,
    Math.round(landAreaPyeong * 10) / 10,
    Math.round(landAreaPyeong),
    gfaSqm,
    Math.round(gfaSqm * 10) / 10,
    Math.round(gfaSqm),
    gfaPyeong,
    Math.round(gfaPyeong * 10) / 10,
    Math.round(gfaPyeong),
    totalDepositManwon,
    Math.round((totalDepositManwon / 10_000) * 100) / 100,
    Math.round((totalDepositManwon / 10_000) * 10) / 10,
    totalRentManwon,
    annualRentManwon,
    Math.round((annualRentManwon / 10_000) * 100) / 100,
    netInvestmentManwon,
    Math.round((netInvestmentManwon / 10_000) * 100) / 100,
    Math.round((netInvestmentManwon / 10_000) * 10) / 10,
    grossYieldPct,
    Number(grossYieldPct.toFixed(1)),
    netYieldPct,
    Number(netYieldPct.toFixed(1)),
    landPricePerPyeongManwon,
    Math.round((landPricePerPyeongManwon / 10_000) * 100) / 100,
    gfaPricePerPyeongManwon,
    officialLandPriceWonSqm,
    officialLandCoveragePct,
    Math.round(officialLandCoveragePct),
    1,
    2,
    3,
    100,
  ]
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => `${n} ${n.toLocaleString()}`)
    .join(' ');

  const numberAllowlistContext = [
    JSON.stringify(input),
    factSheetPromptBlock,
    computedNumberVariants,
  ].join('\n');

  return {
    canonicalPosture,
    goldenPriceBand,
    inferredAssetType,
    regionLabel,
    buildingTitle,
    askingPriceManwon,
    askingPriceEokText,
    landAreaSqm,
    landAreaPyeong,
    gfaSqm,
    gfaPyeong,
    totalDepositManwon,
    totalRentManwon,
    annualRentManwon,
    netInvestmentManwon,
    netInvestmentEokText,
    grossYieldPct,
    netYieldPct,
    landPricePerPyeongManwon,
    gfaPricePerPyeongManwon,
    officialLandCoveragePct,
    verifiedTenantNames,
    tenantPoolObjects,
    factSheetPromptBlock,
    numberAllowlistContext,
  };
}

/**
 * 동적 Golden Set Few-Shot + pgvector Hybrid RAG 문체 레퍼런스를 병렬 조회한다.
 * - 지연 상한(timeoutMs)을 초과하면 즉시 빈 레퍼런스로 폴백하여 UX 지연을 방지한다.
 * - RAG/Golden 예시는 오직 문체·논리 구조 참고용으로 격리 표기하며, 본건 숫자 검증 풀에는 절대 섞지 않는다.
 */
export async function fetchDynamicImReferenceBlock(params: {
  assetType: string;
  priceBand: string;
  posture: InvestmentPosture;
  sectionType: MobileIMSectionType;
  address?: string;
  buildingName?: string;
  timeoutMs?: number;
}): Promise<{
  postureOverlay: string;
  fewShotBlock: string;
  ragStyleSnippet: string;
  usedGoldenIds: string[];
}> {
  const postureOverlay =
    getPosturePromptOverlay(params.posture, params.sectionType) ??
    getPosturePromptOverlay(params.posture, 'investment_thesis') ??
    '';

  if (
    isDeterministicLLMMode() ||
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.VITEST)
  ) {
    return {
      postureOverlay,
      fewShotBlock: '',
      ragStyleSnippet: '',
      usedGoldenIds: [],
    };
  }

  const timeoutMs = params.timeoutMs ?? 1600;
  const fallback = { fewShotBlock: '', ragStyleSnippet: '', usedGoldenIds: [] as string[] };

  const fetched = await Promise.race([
    (async () => {
      const [goldenRes, ragDocs] = await Promise.all([
        buildIMFewShotBlock(
          params.assetType,
          params.priceBand,
          params.sectionType,
          2,
          params.posture,
        ).catch(() => ({ formatted: '', usedIds: [] as string[] })),
        (async () => {
          try {
            const sb = createServiceClient();
            const q = [params.posture, params.assetType, params.address]
              .filter(Boolean)
              .join(' ')
              .trim();
            if (!q) return [];
            return await searchSimilarIMs(
              sb as unknown as Parameters<typeof searchSimilarIMs>[0],
              q,
              {
                topK: 2,
                filterByAssetType: params.assetType,
                filterByPosture: params.posture,
              },
            );
          } catch {
            return [];
          }
        })(),
      ]);

      const ragStyleSnippet =
        ragDocs.length > 0
          ? [
              '=== 승인된 유사 CRE IM 문체·논리 구조 레퍼런스 (주의: 타 매물 사례이므로 아래 예시의 숫자·지명·상호를 본건에 절대 인용하지 말 것) ===',
              ...ragDocs.slice(0, 2).map((d, idx) => {
                const snippet = String(d.content ?? '')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 280);
                return `[레퍼런스 ${idx + 1}] ${snippet}`;
              }),
              '=== 레퍼런스 끝 ===',
            ].join('\n')
          : '';

      return {
        fewShotBlock: goldenRes.formatted || '',
        ragStyleSnippet,
        usedGoldenIds: goldenRes.usedIds || [],
      };
    })(),
    new Promise<typeof fallback>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);

  return {
    postureOverlay,
    ...fetched,
  };
}

const EXPLICIT_PERSONA_RE =
  /(?:\d{2}대\s*자산가|은퇴\s*(?:부부|자산가|세대)|법인\s*대표\s*맞춤|병원장\s*맞춤|초보\s*투자자용|가업\s*승계용)/g;

const GUARANTEE_OR_HYPE_RE =
  /(?:원금\s*보장|확실한\s*수익|수익\s*보장|무조건\s*상승|100%\s*수익|반드시\s*오르|대박\s*매물)/g;

const EVASION_POISON_RE =
  /(?:추후\s*제공|별도\s*문의\s*요망|미확인\s*항목|데이터\s*부족|\bundefined\b|\bnull\b|\bNaN\b|\bInfinity\b)/gi;

/**
 * 생성된 IM 문구의 수치 정합성·날조 상호·금칙어(노골적 페르소나/수익보장/회피문구)를 검증한다.
 */
export function validateImGeneratedCopy(
  text: string,
  opts: {
    numberContext: string;
    tenantPoolSource?: ReadonlyArray<unknown>;
    maxChars?: number;
  },
): ImCopyValidationResult {
  const ungroundedNumbers = findNumbersNotInContext(text, opts.numberContext);
  const brandCheck = maskFabricatedBrands(text, opts.tenantPoolSource ?? []);
  const forbiddenHits: string[] = [];

  for (const m of text.matchAll(EXPLICIT_PERSONA_RE)) {
    forbiddenHits.push(`노골적 페르소나 지칭("${m[0]}")`);
  }
  for (const m of text.matchAll(GUARANTEE_OR_HYPE_RE)) {
    forbiddenHits.push(`수익보장·단정적 과장("${m[0]}")`);
  }
  for (const m of text.matchAll(EVASION_POISON_RE)) {
    forbiddenHits.push(`회피·결측 토큰("${m[0]}")`);
  }

  const charLen = Array.from(text.trim()).length;
  const exceedsLength = typeof opts.maxChars === 'number' ? charLen > opts.maxChars : false;

  return {
    ok:
      ungroundedNumbers.length === 0 &&
      brandCheck.flagged.length === 0 &&
      forbiddenHits.length === 0 &&
      !exceedsLength,
    ungroundedNumbers,
    fabricatedBrands: brandCheck.flagged,
    forbiddenHits,
    exceedsLength,
  };
}

/**
 * 1차 생성 실패 사유를 짚어주는 Pinpoint 자가 교정 프롬프트 블록을 생성한다.
 */
export function buildImRepairFeedback(issues: {
  ungroundedNumbers: string[];
  fabricatedBrands: string[];
  forbiddenHits: string[];
  lengthNote?: string;
}): string {
  const lines: string[] = [
    '[자가 교정 지시 — 직전 생성문에서 아래 결함이 검출되었으므로 즉시 교정하여 다시 작성하세요]',
  ];
  if (issues.ungroundedNumbers.length > 0) {
    lines.push(
      `- 미근거 숫자 삭제/교체 필수: [${issues.ungroundedNumbers.join(', ')}] → 본건 SSOT 팩트 시트에 명시된 수치만 사용하세요.`,
    );
  }
  if (issues.fabricatedBrands.length > 0) {
    lines.push(
      `- 렌트롤 미등재 브랜드 삭제 필수: [${issues.fabricatedBrands.join(', ')}] → 실제 렌트롤에 없는 유명 상호를 절대 창작하지 마세요.`,
    );
  }
  if (issues.forbiddenHits.length > 0) {
    lines.push(
      `- CRE 금칙어 제거 필수: [${issues.forbiddenHits.join(', ')}] → 암묵적 페르소나(Rule 1) 및 표준 CRE 금융 어휘(예상 현금흐름, 가치개선 여력)로 대체하세요.`,
    );
  }
  if (issues.lengthNote) {
    lines.push(`- 글자 수 준수 필수: ${issues.lengthNote}`);
  }
  return lines.join('\n');
}

function scrubResidualForbiddenPhrases(text: string): string {
  return text
    .replace(/\b(undefined|null|NaN|Infinity)\b/g, '')
    .replace(/추후\s*제공|별도\s*문의\s*요망|미확인\s*항목|데이터\s*부족/g, '')
    .replace(/(?:\d{2}대|은퇴)\s*자산가(?:를\s*위한|용|맞춤)?/g, '전문 투자자')
    .replace(/은퇴\s*(?:부부|세대)(?:를\s*위한|용|맞춤)?/g, '안정 배당 선호 매수자')
    .replace(/법인\s*대표\s*맞춤/g, '법인 실수요자 검토')
    .replace(/병원장\s*맞춤/g, '메디컬 개원 수요 검토')
    .replace(/원금\s*보장/g, '하방 안정성')
    .replace(/확실한\s*수익|수익\s*보장/g, '예상 현금흐름')
    .replace(/무조건\s*상승|반드시\s*오르[는며]/g, '가치 상승 여력')
    .replace(/수익률\s*극대화|수익\s*극대화/g, '수익성 제고');
}

function protectCompactPyeongForHeadline(text: string): string {
  // 짧은 소제목(<=28자)에서 "120평"이 "120평(약 396.7㎡)"로 불어나 길이 한도를 넘지 않도록 보호
  return text.replace(/(\d[\d,.]*\s*평)(?!\s*\()/g, (m) => protectBlock(m));
}

/**
 * 비동기 DB 용어사전(`im_terminology_rules`) + 날조 상호 마스킹 + CRE 문체 위생을 적용한다.
 */
export async function polishImCopyWithLexicon(
  rawText: string,
  opts: {
    tenantPoolSource?: ReadonlyArray<unknown>;
    isCompactHeadline?: boolean;
    preserveLinesAndMarkdown?: boolean;
    maxChars?: number;
  } = {},
): Promise<string> {
  if (!rawText || !rawText.trim()) return '';

  // 1. 렌트롤에 없는 날조 유명 브랜드 치환 (실제 렌트롤 상호는 그대로 보존)
  let working = maskFabricatedBrands(rawText, opts.tenantPoolSource ?? []).text;
  working = scrubResidualForbiddenPhrases(working);

  // 2. 마크다운 표(| ... |) 보호 또는 헤드라인 평수 보호
  if (opts.preserveLinesAndMarkdown) {
    working = working
      .split('\n')
      .map((line) => (/^\s*\|.*\|\s*$/.test(line) ? protectBlock(line) : line))
      .join('\n');
  } else if (opts.isCompactHeadline) {
    working = protectCompactPyeongForHeadline(working);
  }

  // 3. DB 기반 CRE 용어사전 정규화 (5분 메모리 캐시)
  const normRes = await normalizeTerminologyAsync(working);
  working = normRes.text;

  // 4. 줄바꿈/마크다운 보존 여부에 따른 마무리 정제
  if (opts.preserveLinesAndMarkdown) {
    working = working
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } else {
    working = sanitizeTextHygiene(working);
  }

  if (typeof opts.maxChars === 'number' && Array.from(working).length > opts.maxChars) {
    const tokens = working.split(/\s+/).filter(Boolean);
    while (tokens.length > 1 && Array.from(tokens.join(' ')).length > opts.maxChars) {
      tokens.pop();
    }
    working = tokens.join(' ').replace(/[,·—–-]+$/u, '').trim();
    if (Array.from(working).length > opts.maxChars) {
      working = Array.from(working).slice(0, opts.maxChars).join('').trim();
    }
  }

  return working;
}

/**
 * 동기 컨텍스트(`quick-generate`, 결정론적 폴백)를 위한 CRE 용어 정규화 + 날조 상호 마스킹.
 */
export function polishImCopyWithLexiconSync(
  rawText: string,
  opts: {
    tenantPoolSource?: ReadonlyArray<unknown>;
    isCompactHeadline?: boolean;
    preserveLinesAndMarkdown?: boolean;
  } = {},
): string {
  if (!rawText || !rawText.trim()) return '';

  let working = maskFabricatedBrands(rawText, opts.tenantPoolSource ?? []).text;
  working = scrubResidualForbiddenPhrases(working);

  if (opts.preserveLinesAndMarkdown) {
    working = working
      .split('\n')
      .map((line) => (/^\s*\|.*\|\s*$/.test(line) ? protectBlock(line) : line))
      .join('\n');
  } else if (opts.isCompactHeadline) {
    working = protectCompactPyeongForHeadline(working);
  }

  working = normalizeTerminology(working).text;

  if (opts.preserveLinesAndMarkdown) {
    return working
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return sanitizeTextHygiene(working);
}

/**
 * LLM 장애/오프라인/모의 환경에서도 502 에러 없이 즉시 반환되는 포스처 맞춤형 SSOT 결정론적 3대 장점 생성기.
 */
export function buildDeterministicImPointsFallback(
  input: WorkspaceImFactInput,
  factSheet: AuthoritativeImFactSheet,
): Array<{ title: string; body: string }> {
  const {
    canonicalPosture,
    regionLabel,
    askingPriceEokText,
    landAreaSqm,
    landAreaPyeong,
    gfaSqm,
    gfaPyeong,
    totalDepositManwon,
    totalRentManwon,
    netYieldPct,
    grossYieldPct,
    landPricePerPyeongManwon,
    verifiedTenantNames,
    tenantPoolObjects,
  } = factSheet;

  const zoningLabel = input.zoning || '핵심 용도지역';
  const stationPrefix = input.nearbyStationText ? `${input.nearbyStationText} · ` : '';
  const multiParcelBadge =
    input.parcelsCount && input.parcelsCount >= 2 ? ` (${input.parcelsCount}필지 합산)` : '';

  let rawPoints: Array<{ title: string; body: string }>;

  if (canonicalPosture === 'owner_occupied') {
    rawPoints = [
      {
        title: `${regionLabel} 사옥 적격 단독 건물`,
        body: `${stationPrefix}${regionLabel} 핵심 동선에 위치해 임직원 출퇴근 및 내방객 접근성이 우수합니다.${
          gfaSqm > 0
            ? ` 연면적 ${gfaSqm.toLocaleString()}㎡(약 ${gfaPyeong}평) 규모로 법인 사옥 활용에 적합합니다.`
            : ''
        }`,
      },
      {
        title: `${input.handoverNote ? '명도 협의 용이' : '즉시 입주·공간 구성 유리'} · 설비 양호`,
        body: `${
          input.handoverNote
            ? `${input.handoverNote} 조건으로 계획적인 사옥 이전 일정 수립이 가능합니다.`
            : '층별 독립적 공간 구획과 설비 여건을 갖추어 사옥 입주 및 일부 층 임대 병행에 유리합니다.'
        }${
          input.parkingSpaces
            ? ` 자주식·전용 주차 ${input.parkingSpaces}대를 확보하고 있습니다.`
            : ''
        }`,
      },
      {
        title: `${zoningLabel} 토지 자산가치 확보`,
        body: `${
          landAreaSqm > 0
            ? `대지면적 ${landAreaSqm.toLocaleString()}㎡(약 ${landAreaPyeong}평)${multiParcelBadge} 기반의 `
            : ''
        }${
          askingPriceEokText ? `매매 희망가 ${askingPriceEokText} 자산으로, ` : ''
        }임차료 절감 효과와 중장기 기업 자산 확보를 동시에 충족합니다.`,
      },
    ];
  } else if (canonicalPosture === 'development') {
    rawPoints = [
      {
        title: `${regionLabel} ${zoningLabel} 개발·가치개선 입지`,
        body: `${stationPrefix}${zoningLabel} 내 ${
          landAreaSqm > 0
            ? `대지 ${landAreaSqm.toLocaleString()}㎡(약 ${landAreaPyeong}평)${multiParcelBadge}`
            : '우수 필지'
        }를 확보하여 리모델링 또는 신축 개발 타당성이 뛰어납니다.`,
      },
      {
        title: `${
          input.farPct ? `현행 용적률 ${input.farPct}% · ` : ''
        }공간 재구조화 업사이드`,
        body: `${
          input.bcrPct || input.farPct
            ? `건축물대장 기준 건폐율 ${input.bcrPct ?? '-'}%·용적률 ${input.farPct ?? '-'}% 제원으로, `
            : ''
        }외관 리노베이션 및 우량 업종 리테넌팅(Re-tenanting)을 통한 임대료 현실화 여력이 풍부합니다.`,
      },
      {
        title: `${
          landPricePerPyeongManwon > 0
            ? `토지 평당 ${landPricePerPyeongManwon.toLocaleString()}만원 가격 경쟁력`
            : `${regionLabel} 핵심 상권 토지 하방 안정성`
        }`,
        body: `${
          askingPriceEokText ? `매매 희망가 ${askingPriceEokText} 기준 ` : ''
        }인근 상권 대비 합리적인 토지 단가를 형성하고 있어 사업비 통제 및 향후 매각(Exit) 시 자본차익 확보에 유리합니다.`,
      },
    ];
  } else {
    const tenantHighlight =
      verifiedTenantNames.length > 0
        ? `${verifiedTenantNames.slice(0, 2).join('·')} 등 임차 운용`
        : `${regionLabel} 핵심 상권 임차 수요 견고`;
    const activeYield = netYieldPct > 0 ? netYieldPct : grossYieldPct;

    rawPoints = [
      {
        title: `${regionLabel} 가시성·접근성 우수 입지`,
        body: `${stationPrefix}${zoningLabel} 상권 동선에 접한 ${
          gfaSqm > 0
            ? `연면적 ${gfaSqm.toLocaleString()}㎡(약 ${gfaPyeong}평) `
            : ''
        }근생·업무 빌딩으로 상시 배후 유동수요 흡입력이 우수합니다.`,
      },
      {
        title: tenantHighlight.slice(0, 26),
        body: `${
          totalRentManwon > 0
            ? `현행 보증금 ${totalDepositManwon.toLocaleString()}만원, 월 임대료 ${totalRentManwon.toLocaleString()}만원(연 ${(
                totalRentManwon * 12
              ).toLocaleString()}만원) 규모의 안정적인 임대 현금흐름을 창출 중입니다.`
            : '다층 근린생활·업무 임차 구성으로 공실 위험을 분산하며 안정적인 임대 운용이 가능합니다.'
        }`,
      },
      {
        title:
          activeYield > 0
            ? `연 수익률 ${activeYield.toFixed(2)}% · 토지 가치 겸비`
            : `${zoningLabel} 토지 하방 안정성 확보`,
        body: `${
          askingPriceEokText ? `매매 희망가 ${askingPriceEokText}` : '본건 매매 조건'
        }${
          landPricePerPyeongManwon > 0
            ? `(토지 평당 ${landPricePerPyeongManwon.toLocaleString()}만원)`
            : ''
        } 기준 임대 배당 수익과 중장기 토지 자산가치 보존을 동시에 기대할 수 있습니다.`,
      },
    ];
  }

  return rawPoints.map((pt) => ({
    title: polishImCopyWithLexiconSync(pt.title, {
      tenantPoolSource: tenantPoolObjects,
      isCompactHeadline: true,
    }).slice(0, 28),
    body: polishImCopyWithLexiconSync(pt.body, {
      tenantPoolSource: tenantPoolObjects,
      isCompactHeadline: false,
    }).slice(0, 140),
  }));
}
