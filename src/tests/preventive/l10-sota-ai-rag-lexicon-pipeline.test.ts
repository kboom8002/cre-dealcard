/**
 * @file src/tests/preventive/l10-sota-ai-rag-lexicon-pipeline.test.ts
 * @description Preventive Suite L10 (PT-1001 ~ PT-1004):
 *   SOTA Neuro-Symbolic AI Content Generation, Hybrid RAG / Golden Few-Shot Isolation,
 *   CRE Lexicon Normalization, Fabricated Brand Masking, and Closed-Loop RAG Hygiene.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireBroker = vi.fn();
const mockCallLLM = vi.fn();
const mockAssertStudioDealOwner = vi.fn();
const mockGetProject = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock('@/ai/llm-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ai/llm-client')>();
  return {
    ...actual,
    callLLM: (...args: unknown[]) => mockCallLLM(...args),
  };
});

vi.mock('@/lib/authz/studio-owner', () => ({
  assertStudioDealOwner: (...args: unknown[]) => mockAssertStudioDealOwner(...args),
}));

vi.mock('@/domain/building/pptx-studio/studio-service', () => ({
  studioService: {
    getProject: (...args: unknown[]) => mockGetProject(...args),
    findProjectByDealId: (...args: unknown[]) => mockGetProject(...args),
  },
}));

import { LLMMockNotAllowedError } from '@/ai/llm-client';
import {
  askingPriceManwonToGoldenBand,
  buildAuthoritativeImFactSheet,
  mapWorkspacePostureToCanonical,
  polishImCopyWithLexicon,
  polishImCopyWithLexiconSync,
  validateImGeneratedCopy,
} from '@/domain/building/mobile-im/workspace-ai-enhancer';
import { evaluateRAGIndexingEligibility } from '@/domain/building/mobile-im/rag-hygiene';
import { POST as postImAiPoints } from '@/app/api/broker/im/ai-points/route';
import { POST as postStudioAiText } from '@/app/api/broker/basic-im-studio/[id]/ai-text/route';
import { POST as postQuickGenerate } from '@/app/api/broker/im-lite/quick-generate/route';
import { getQuickImRecord } from '@/lib/im-lite/quick-generate-store';

describe('Preventive Suite L10 — SOTA AI Content Pipeline (Neuro-Symbolic + CRE Lexicon + RAG Hygiene)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireBroker.mockResolvedValue({
      user: { id: 'broker-sota-tester' },
      role: 'broker',
    });
    mockAssertStudioDealOwner.mockResolvedValue(null);
  });

  it('[PT-1001] workspace-ai-enhancer: deterministic SSOT math, posture/band mapping, brand policy, and CRE lexicon', async () => {
    expect(mapWorkspacePostureToCanonical('core_income')).toBe('income');
    expect(mapWorkspacePostureToCanonical('value_add')).toBe('development');
    expect(mapWorkspacePostureToCanonical('self_use')).toBe('owner_occupied');

    expect(askingPriceManwonToGoldenBand(250_000)).toBe('B1');
    expect(askingPriceManwonToGoldenBand(550_000)).toBe('B2');
    expect(askingPriceManwonToGoldenBand(980_000)).toBe('B3');
    expect(askingPriceManwonToGoldenBand(2_200_000)).toBe('B4');
    expect(askingPriceManwonToGoldenBand(3_500_000)).toBe('B5');

    const sheet = buildAuthoritativeImFactSheet({
      address: '서울특별시 성동구 성수동2가 315-10',
      title: '성수 브릭타워',
      posture: 'value_add',
      askingPriceManwon: 850_000, // 85억
      landAreaSqm: 330.58, // ~100평
      gfaSqm: 991.74, // ~300평
      totalDepositManwon: 50_000, // 5억 → 실투자금 80억
      totalRentManwon: 2_800, // 월 2,800만원 → 연 33,600만원
      zoning: '준공업지역',
      parcelsCount: 2,
      tenantNames: ['올리브영 성수점', '디자인스튜디오'],
    });

    expect(sheet.canonicalPosture).toBe('development');
    expect(sheet.landAreaPyeong).toBeCloseTo(100, 1);
    expect(sheet.gfaPyeong).toBeCloseTo(300, 1);
    expect(sheet.netInvestmentManwon).toBe(800_000);
    expect(sheet.netYieldPct).toBeCloseTo(4.2, 2); // 33,600 / 800,000 = 4.20%
    expect(sheet.grossYieldPct).toBeCloseTo(3.95, 2);
    expect(sheet.factSheetPromptBlock).toContain('총 2필지 합산');
    expect(sheet.factSheetPromptBlock).toContain('올리브영 성수점');

    // Validation catches ungrounded number (9.99%), fabricated brand (스타벅스), and explicit persona (60대 자산가용)
    const badVal = validateImGeneratedCopy(
      '60대 자산가용으로 스타벅스 입점 및 연 9.99% 확실한 수익이 보장됩니다.',
      {
        numberContext: sheet.numberAllowlistContext,
        tenantPoolSource: sheet.tenantPoolObjects,
      },
    );
    expect(badVal.ok).toBe(false);
    expect(badVal.ungroundedNumbers).toContain('9.99');
    expect(badVal.fabricatedBrands).toContain('스타벅스');
    expect(badVal.forbiddenHits.length).toBeGreaterThanOrEqual(2);

    // Real rent-roll brand (올리브영) is preserved while fabricated brand (스타벅스) is masked, colloquialisms normalized, and Korean postpositions harmonized
    const polished = await polishImCopyWithLexicon(
      '올리브영 성수점 및 스타벅스 세입자가 입점한 60대 자산가용으로 확실한 수익 매물입니다.',
      {
        tenantPoolSource: sheet.tenantPoolObjects,
        isCompactHeadline: false,
      },
    );
    expect(polished).toContain('올리브영 성수점');
    expect(polished).not.toContain('스타벅스');
    expect(polished).toContain('임차 업체');
    expect(polished).toContain('임차인이');
    expect(polished).not.toContain('임차인가');
    expect(polished).toContain('전문 투자자로');
    expect(polished).not.toContain('전문 투자자으로');
    expect(polished).not.toContain('세입자');
    expect(polished).not.toContain('60대 자산가');
    expect(polished).not.toContain('확실한 수익');

    // Compact headline keeps "100평" compact without expanding to "100평(약 330.6㎡)"
    const compactHl = await polishImCopyWithLexicon('성수동 대지 100평 우량 세입자 만실', {
      tenantPoolSource: sheet.tenantPoolObjects,
      isCompactHeadline: true,
      maxChars: 28,
    });
    expect(compactHl).toContain('100평');
    expect(compactHl).not.toContain('330.6㎡');
    expect(Array.from(compactHl).length).toBeLessThanOrEqual(28);

    // Markdown pipe table rows remain completely untouched
    const mdWithTable = [
      '세입자 구성이 안정적인 근생 빌딩입니다.',
      '| 1F | 101호 | 올리브영 | 45평 | 10,000 | 650 |',
    ].join('\n');
    const polishedMd = polishImCopyWithLexiconSync(mdWithTable, {
      tenantPoolSource: [{ tenant_name: '올리브영' }],
      preserveLinesAndMarkdown: true,
    });
    expect(polishedMd).toContain('임차인 구성이 안정적인');
    expect(polishedMd).toContain('| 1F | 101호 | 올리브영 | 45평 | 10,000 | 650 |');
  });

  it('[PT-1002] POST /api/broker/im/ai-points: 2-attempt pinpoint self-repair + Golden Benchmark + Zero-502 fallback', async () => {
    // A. Golden Benchmark match
    const goldenReq = new NextRequest('http://localhost:3000/api/broker/im/ai-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '서울특별시 마포구 동교동 148-9',
        title: '동교동 더파크빌딩',
      }),
    });
    const goldenRes = await postImAiPoints(goldenReq);
    const goldenJson = await goldenRes.json();
    expect(goldenRes.status).toBe(200);
    expect(goldenJson.source).toBe('golden_benchmark');
    expect(goldenJson.result.points).toHaveLength(3);
    expect(mockCallLLM).not.toHaveBeenCalled();

    // B. 2-Attempt Neuro-Symbolic Self-Repair when Attempt 1 hallucinates ungrounded numbers & fabricated brand
    mockCallLLM
      .mockResolvedValueOnce({
        content: JSON.stringify({
          points: [
            {
              title: '스타벅스 입점 60대 자산가용 빌딩',
              body: '연 9.85% 확실한 수익이 보장되는 역세권 빌딩입니다.',
            },
            {
              title: '준공업지역 대지 100평 정형 필지',
              body: '대지면적 330.58㎡ 기반의 공간 활용도가 우수합니다.',
            },
            {
              title: '보증금 5억 · 월임대료 2,800만원',
              body: '실투자금 80억 원 기준 연 수익률 4.2% 현금흐름을 창출합니다.',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          points: [
            {
              title: '성수동2가 준공업지역 핵심 입지',
              body: '성동구 성수동2가 상권 동선에 위치해 세입자 선호도가 높습니다.',
            },
            {
              title: '대지 100평 · 연면적 300평 규모',
              body: '대지면적 330.58㎡, 연면적 991.74㎡ 제원의 우량 근생 건물입니다.',
            },
            {
              title: '연 수익률 4.2% 안정적 현금흐름',
              body: '보증금 50,000만원, 월 임대료 2,800만원으로 안정 운용 중입니다.',
            },
          ],
        }),
      });

    const repairReq = new NextRequest('http://localhost:3000/api/broker/im/ai-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '서울특별시 성동구 성수동2가 315-10',
        title: '성수 코너빌딩',
        posture: 'core_income',
        askingPriceManwon: 850_000,
        landAreaSqm: 330.58,
        gfaSqm: 991.74,
        zoning: '준공업지역',
        totalDepositManwon: 50_000,
        totalRentManwon: 2_800,
      }),
    });
    const repairRes = await postImAiPoints(repairReq);
    const repairJson = await repairRes.json();

    expect(repairRes.status).toBe(200);
    expect(repairJson.ok).toBe(true);
    expect(repairJson.source).toBe('llm');
    expect(mockCallLLM).toHaveBeenCalledTimes(2);

    // Verify Attempt 2 prompt received pinpoint self-repair feedback naming 9.85, 스타벅스, 60대 자산가
    const secondCallArg = mockCallLLM.mock.calls[1][0] as { userPrompt: string };
    expect(secondCallArg.userPrompt).toContain('[자가 교정 지시');
    expect(secondCallArg.userPrompt).toContain('9.85');
    expect(secondCallArg.userPrompt).toContain('스타벅스');
    expect(secondCallArg.userPrompt).toContain('60대 자산가');

    // Verify post-processed output normalized "세입자" -> "임차인"
    expect(repairJson.result.points[0].body).toContain('임차인');
    expect(repairJson.result.points[0].body).not.toContain('세입자');

    // C. Zero-502 Deterministic SSOT Fallback when LLM throws LLMMockNotAllowedError
    mockCallLLM.mockRejectedValueOnce(new LLMMockNotAllowedError('No API key'));
    const fallbackReq = new NextRequest('http://localhost:3000/api/broker/im/ai-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '서울특별시 강남구 논현동 120-5',
        title: '논현 사옥빌딩',
        posture: 'owner_occupied',
        askingPriceManwon: 1_200_000,
        landAreaSqm: 297.52,
        gfaSqm: 826.45,
        zoning: '제3종일반주거지역',
        handoverNote: '잔금 시 전 층 명도 협의 완료',
        parkingSpaces: 8,
      }),
    });
    const fallbackRes = await postImAiPoints(fallbackReq);
    const fallbackJson = await fallbackRes.json();
    expect(fallbackRes.status).toBe(200);
    expect(fallbackJson.ok).toBe(true);
    expect(fallbackJson.source).toBe('deterministic_fallback');
    expect(fallbackJson.result.points).toHaveLength(3);
    expect(fallbackJson.result.points[0].title).toContain('사옥');
    expect(fallbackJson.result.points[1].body).toContain('잔금 시 전 층 명도 협의 완료');
  });

  it('[PT-1003] POST /api/broker/basic-im-studio/[id]/ai-text: preserves broker custom facts in LLM mode + clean deterministic fallback', async () => {
    mockGetProject.mockResolvedValue({
      id: 'proj-sota-01',
      dealId: 'deal-sota-01',
      title: '신사 메디컬타워 Basic IM',
      buildingContext: {
        buildingName: '신사 메디컬타워',
        address: '서울특별시 강남구 신사동 540-12',
        askingPriceManwon: 1_450_000,
        posture: 'income',
      },
      slides: [
        {
          id: 'slide-rentroll',
          dataKey: 'rentroll',
          slideOverrides: {
            askingPrice: '145억 원',
            depositTotal: '8억 원',
            monthlyRentTotal: '4,800만 원',
            occupancyRate: '100%',
            zoning: '제3종일반주거지역',
          },
        },
      ],
    });

    mockCallLLM.mockResolvedValueOnce({
      content: JSON.stringify({
        refinedText:
          '유명 피부과 의원과 7년 장기 임대차 계약이 확정되어 세입자 이탈 위험이 낮으며, 현행 임대 가동률 100%(월임대료 4,800만 원) 기반의 안정적인 현금흐름을 확보하고 있습니다.',
      }),
    });

    const llmReq = new NextRequest('http://localhost:3000/api/broker/basic-im-studio/proj-sota-01/ai-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slideId: 'slide-rentroll',
        dataKey: 'rentroll',
        fieldKey: 'rentrollNotes',
        currentText: '유명 피부과 의원 7년 장기계약 확정됨! 세입자 안정적임',
        tone: 'balanced',
      }),
    });

    const llmRes = await postStudioAiText(llmReq, {
      params: Promise.resolve({ id: 'proj-sota-01' }),
    });
    const llmJson = await llmRes.json();

    expect(llmRes.status).toBe(200);
    expect(llmJson.ok).toBe(true);
    expect(llmJson.source).toBe('llm');
    // Broker's custom fact ("피부과 의원", "7년") is preserved AND "세입자" normalized to "임차인"!
    expect(llmJson.refinedText).toContain('피부과 의원');
    expect(llmJson.refinedText).toContain('7년');
    expect(llmJson.refinedText).toContain('임차인');
    expect(llmJson.refinedText).not.toContain('세입자');

    // Deterministic bypass mode (x-test-bypass in NODE_ENV=test) uses zero LLM calls and respects CRE lexicon
    mockCallLLM.mockClear();
    const bypassReq = new NextRequest('http://localhost:3000/api/broker/basic-im-studio/proj-sota-01/ai-text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-bypass': '1',
      },
      body: JSON.stringify({
        slideId: 'slide-rentroll',
        dataKey: 'rentroll',
        fieldKey: 'turnaroundStrategy',
        currentText: '',
        tone: 'aggressive',
      }),
    });
    const bypassRes = await postStudioAiText(bypassReq, {
      params: Promise.resolve({ id: 'proj-sota-01' }),
    });
    const bypassJson = await bypassRes.json();
    expect(bypassRes.status).toBe(200);
    expect(bypassJson.source).toBe('deterministic_fallback');
    expect(bypassJson.refinedText).not.toContain('극대화');
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it('[PT-1004] quick-generate lexicon/brand hygiene & S0-T3 RAG indexing eligibility gate', async () => {
    const req = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '서울특별시 마포구 서교동 395-20',
        title: '서교 브릭스퀘어',
        askingPriceManwon: 680_000,
        landAreaSqm: 231.4,
        gfaSqm: 661.16,
        zoning: '제2종일반주거지역',
        rentRoll: [
          {
            floor: '1F',
            unit: '101호',
            tenantName: '올리브영 서교점',
            use: '소매점',
            depositManwon: 15000,
            monthlyRentManwon: 950,
            status: 'occupied',
          },
          {
            floor: '2F',
            unit: '201호',
            tenantName: '디자인랩',
            use: '사무실',
            depositManwon: 5000,
            monthlyRentManwon: 450,
            status: 'occupied',
          },
        ],
        axiosHighlights: [
          {
            headline: '올리브영 입점 · 우량 세입자 만실',
            brief: '60대 자산가용으로 스타벅스 및 올리브영 세입자가 입점해 확실한 수익을 창출합니다.',
            tone: 'amber',
          },
        ],
        closingLine: '60대 자산가용 원금 보장 매물이오니 즉시 문의 바랍니다.',
      }),
    });

    const res = await postQuickGenerate(req);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);

    const saved = getQuickImRecord(json.buildingId);
    expect(saved).toBeTruthy();

    const savedHl = saved?.fullDocBody?.axios_highlights?.[0];
    expect(savedHl?.headline).toContain('올리브영');
    expect(savedHl?.headline).toContain('임차인');
    expect(savedHl?.headline).not.toContain('세입자');

    // Real tenant "올리브영" preserved, fabricated brand "스타벅스" masked, explicit persona/guarantee scrubbed
    expect(savedHl?.brief).toContain('올리브영');
    expect(savedHl?.brief).not.toContain('스타벅스');
    expect(savedHl?.brief).not.toContain('60대 자산가');
    expect(savedHl?.brief).not.toContain('확실한 수익');

    expect(saved?.fullDocBody?.closingLine).not.toContain('60대 자산가');
    expect(saved?.fullDocBody?.closingLine).not.toContain('원금 보장');

    // Rent-roll markdown pipe table in lease_status preserved intact
    const leaseSec = saved?.fullDocBody?.sections?.find(
      (s: { section_type: string }) => s.section_type === 'lease_status',
    );
    expect(leaseSec?.markdown).toContain('올리브영 서교점');
    expect(leaseSec?.markdown).toContain('| 1F | 101호 |');

    // S0-T3 RAG Indexing Gate: draft rejected, published broker-approved accepted
    const draftCheck = evaluateRAGIndexingEligibility({
      id: 'doc-draft-1',
      buildingId: json.buildingId,
      status: 'draft',
      isBrokerApproved: false,
      content: '초안 텍스트',
    });
    expect(draftCheck.eligibleForIndexing).toBe(false);

    const pubCheck = evaluateRAGIndexingEligibility({
      id: json.documentId,
      buildingId: json.buildingId,
      status: 'published',
      isBrokerApproved: true,
      content: leaseSec?.markdown || '승인된 IM 본문',
    });
    expect(pubCheck.eligibleForIndexing).toBe(true);
  });
});
