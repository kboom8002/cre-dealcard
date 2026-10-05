/**
 * Special Edition Generator (속보 매거진 생성기)
 *
 * 신규 딜카드 승인 시 1-매물 중심의 속보(special) 에디션을 생성합니다.
 * 블라인드 티저 프로젝터(projectToTeaser)를 연동하여 보안을 유지합니다.
 *
 * 원칙 (B3a, C-02):
 *  - Mock/실패 LLM 응답은 저장하지 않는다(throw). 폴백 문구로 발행하지 않는다.
 *  - 입력에 없는 사실(급매·수익률·가격 메리트 등)을 만들지 않는다. 브로커 정보 기본값(가짜 이름/회사)도 없다.
 *  - QG(fail-closed)를 통과해야만 published. 불합격이면 needs_review 로 저장(마이그레이션 000002 필요).
 *  - 날짜는 KST 단일 구현(@/lib/magazine/kst). 라벨에는 buildingId 전체를 사용(충돌 방지).
 *  - magazine_issues 듀얼 쓰기 제거 — 공개 행은 발행 플로우만 쓴다(D2-06).
 */

import { z } from 'zod';
import {
  type MagazineEdition,
  type MagazineDbClient,
  type EditionContentV1,
  EditionSaveError,
  EDITION_STATUS_NEEDS_REVIEW,
  EDITION_STATUS_PUBLISHED,
} from './types';
import { generateMagazineTeaserCards } from './magazine-teaser-cards';
import { runMagazineQualityGate } from './quality-gate';
import { callMagazineJson, zReaderText } from '@/lib/magazine/llm-guard';
import { todayKst } from '@/lib/magazine/kst';
import { SLUG_RE, isUuid } from '@/lib/magazine/slug';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('special-edition-generator');

export interface GenerateSpecialEditionParams {
  supabase: MagazineDbClient;
  brokerId: string; // user_id 또는 slug
  buildingId: string;
  urgentHeadline?: string;
  urgentNote?: string;
}

const SPECIAL_THEME_COLOR = '#ef4444'; // 속보 테마 (Rose/Red)

const specialOutputSchema = z.object({
  headline: zReaderText(4, 80),
  briefing: zReaderText(30, 2500),
});

interface BrokerRow {
  user_id: string;
  slug: string | null;
  specialty_regions: string[] | null;
  specialty_assets: string[] | null;
  bio: string | null;
  magazine_cover_image: string | null;
}

interface ProfileRow {
  display_name: string | null;
  company: string | null;
  phone: string | null;
  photo_url: string | null;
  tagline: string | null;
}

const BROKER_COLS = 'user_id, slug, specialty_regions, specialty_assets, bio, magazine_cover_image';

/** slug/uuid 형식별 개별 쿼리 (.or() 문자열 보간 금지). 형식 불일치는 DB 호출 없이 null. */
async function fetchBroker(supabase: MagazineDbClient, brokerParam: string): Promise<BrokerRow | null> {
  let q = supabase.from('broker_profiles').select(BROKER_COLS);
  if (isUuid(brokerParam)) q = q.eq('user_id', brokerParam);
  else if (SLUG_RE.test(brokerParam)) q = q.eq('slug', brokerParam);
  else return null;
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`브로커 조회 실패: ${error.message}`);
  return (data as BrokerRow | null) ?? null;
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const nonEmpty = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export async function generateSpecialEdition(params: GenerateSpecialEditionParams): Promise<MagazineEdition> {
  const { supabase, brokerId, buildingId, urgentHeadline, urgentNote } = params;

  // 1. 브로커 프로필
  const bp = await fetchBroker(supabase, brokerId);
  if (!bp) throw new Error(`브로커를 찾을 수 없습니다: ${brokerId}`);

  let profile: ProfileRow | null = null;
  {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, company, phone, photo_url, tagline')
      .eq('id', bp.user_id)
      .maybeSingle();
    if (error) log.warn('[SpecialEditionGenerator] profiles 조회 실패 — 브로커 표시정보 생략', error.message);
    else profile = (data as ProfileRow | null) ?? null;
  }
  const brokerSlug = bp.slug ?? brokerId;

  // 2. 매물 데이터 (소유 검증은 호출부 API 가드 책임 — 여기서는 해당 브로커 매물만 허용)
  const { data: rawData, error: bError } = await supabase
    .from('building_ssot_lite')
    .select('id, raw_address, area_signal, asset_type, price_band, status, layers, owner_id')
    .eq('id', buildingId)
    .maybeSingle();
  if (bError) throw new Error(`매물 조회 실패: ${bError.message}`);
  if (!rawData) throw new Error(`매물을 찾을 수 없습니다: ${buildingId}`);
  if (rawData.owner_id && rawData.owner_id !== bp.user_id) {
    // 존재 여부를 노출하지 않도록 동일 메시지
    throw new Error(`매물을 찾을 수 없습니다: ${buildingId}`);
  }

  const layers = (rawData.layers ?? {}) as Record<string, unknown>;
  const photoUrls = arr(((layers.photos ?? {}) as { urls?: unknown }).urls);
  const building = {
    id: rawData.id as string,
    address: nonEmpty(rawData.raw_address),
    areaSignal: nonEmpty(rawData.area_signal),
    assetType: nonEmpty(rawData.asset_type),
    priceDisplay: nonEmpty(rawData.price_band) ?? nonEmpty(layers.askingPriceDisplay),
  };

  // 3. 블라인드 티저 카드
  const teaserCards = generateMagazineTeaserCards([{ id: building.id, attrs: layers }]);
  const primaryTeaser = teaserCards[0]?.teaserView;

  // 근거 사실 — 비어 있는 항목은 프롬프트에서 아예 제외한다 (가짜 기본값 금지)
  const factLines: string[] = [];
  if (building.areaSignal) factLines.push(`권역: ${building.areaSignal}`);
  if (building.assetType) factLines.push(`자산 유형: ${building.assetType}`);
  if (building.priceDisplay) factLines.push(`가격대: ${building.priceDisplay}`);
  if (primaryTeaser?.hookCopy) factLines.push(`티저 카피: ${primaryTeaser.hookCopy}`);
  if (primaryTeaser?.bandedPrice) factLines.push(`가격 밴드: ${primaryTeaser.bandedPrice}`);
  if (primaryTeaser?.bandedCapRate) factLines.push(`수익률 밴드: ${primaryTeaser.bandedCapRate}`);
  const signals = (primaryTeaser?.structuralSignals ?? []).filter((s: unknown) => typeof s === 'string' && s.trim());
  if (signals.length) factLines.push(`구조적 시그널: ${signals.join(', ')}`);
  const brokerNote = nonEmpty(urgentNote);
  if (brokerNote) factLines.push(`브로커 메모: ${brokerNote}`);

  if (factLines.length < 2) {
    throw new Error('속보 생성에 필요한 매물 정보가 부족합니다 (권역/자산유형/가격 중 2개 이상 필요)');
  }

  // 4. LLM — Mock/실패/스키마 불일치는 MagazineLlmError 로 전파(저장 없음)
  const { data: out, response } = await callMagazineJson(
    {
      label: 'special.briefing',
      tier: 'terra',
      temperature: 0.5,
      maxTokens: 900,
      systemPrompt: `당신은 대한민국 상업용 부동산(CRE) 브로커의 속보 에디터입니다.
새로 접수된 매물 1건에 대해 신중하고 정확한 속보 헤드라인과 짧은 브리핑을 작성하세요.

작성 가이드:
1. headline: "[단독 속보]" 또는 "[신규 매물]" 머리말 + 권역·자산유형 중심, 18~40자.
2. briefing: 2~3문단 존댓말(~합니다). 입력 사실만 사용하고, 입력에 없으면 해당 내용은 쓰지 않습니다.
3. 지번·상세 주소·건물명은 비공개이므로 언급하지 않습니다.
4. "급매", "수익 보장", "저평가" 등 입력에 없는 가치 판단 표현을 쓰지 않습니다.

반환 JSON: {"headline": "...", "briefing": "..."}`,
      userPrompt: factLines.join('\n'),
    },
    specialOutputSchema,
  );

  const headline = nonEmpty(urgentHeadline) ?? out.headline;
  const briefing = out.briefing;

  // 5. 품질 게이트 — 입력 사실에 없는 숫자는 불합격
  const qg = runMagazineQualityGate(`${headline}\n${briefing}`, { facts: factLines });
  const passed = qg.passed && !response.isMock;
  if (!passed) log.warn(`[SpecialEditionGenerator] QG 불합격 → needs_review (${buildingId.slice(0, 8)})`, qg.issues.slice(0, 3));

  // 6. 에디션 라벨 / 콘텐츠
  const issueDate = todayKst();
  const editionLabel = `FLASH-${issueDate.replace(/-/g, '')}-${buildingId}`;
  const keywords = ['단독속보', building.areaSignal, building.assetType].filter((k): k is string => !!k);
  const assetTypes = building.assetType ? [building.assetType] : [];
  const coverImage = photoUrls[0] ?? bp.magazine_cover_image ?? null;

  const content: EditionContentV1 & Record<string, unknown> = {
    schemaVersion: 1,
    kind: 'special',
    issueDate,
    headline,
    briefing,
    ai_briefing: briefing,
    broker: {
      name: profile?.display_name ?? '',
      slug: brokerSlug,
      company: profile?.company ?? '',
      phone: profile?.phone ?? '',
      photoUrl: profile?.photo_url ?? null,
      tagline: profile?.tagline ?? bp.bio ?? '',
      specialtyRegions: arr(bp.specialty_regions),
      specialtyAssets: arr(bp.specialty_assets),
      totalDeals: 0,
      activeDeals: 0,
    },
    market_temp: null, // 속보는 시장 온도를 판단하지 않는다 (이전: '적극 매수' 하드코딩)
    cover_keywords: keywords,
    cover_image_url: coverImage,
    theme_title: building.areaSignal ? `${building.areaSignal} 신규 매물 속보` : '신규 매물 속보',
    theme_body_md: briefing,
    theme_asset_types: assetTypes,
    featured_deal_ids: [buildingId],
    theme_color: SPECIAL_THEME_COLOR,
    teaserCards,
    generation: {
      model: response.model,
      isMock: response.isMock,
      totalTokens: response.tokens,
      llmCalls: 1,
      generatedAt: new Date().toISOString(),
      qualityGate: {
        passed: qg.passed,
        status: qg.status,
        score: qg.score,
        totalClaims: qg.totalClaims,
        matchedClaims: qg.matchedClaims,
        failureReasons: qg.failureReasons,
        issues: qg.issues.slice(0, 10),
      },
      sources: { building: true, teaser: !!primaryTeaser },
      sourceErrors: [],
    },
    // 뷰어 하위호환 키
    specialDeal: {
      id: building.id,
      areaSignal: building.areaSignal,
      assetType: building.assetType,
      price: building.priceDisplay,
      photoUrl: photoUrls[0] ?? null,
      teaser: primaryTeaser ?? null,
    },
    urgentNote: brokerNote,
    isSpecial: true,
  };

  const editionRow = {
    broker_id: brokerSlug,
    edition_type: 'special' as const,
    edition_label: editionLabel,
    title: headline,
    market_temp: null,
    cover_keywords: keywords,
    cover_image_url: coverImage,
    theme_title: content.theme_title,
    theme_body_md: briefing,
    theme_asset_types: assetTypes,
    content,
    featured_deal_ids: [buildingId],
    target_segments: [building.assetType, building.areaSignal].filter((k): k is string => !!k),
    status: passed ? EDITION_STATUS_PUBLISHED : EDITION_STATUS_NEEDS_REVIEW,
    published_at: passed ? new Date().toISOString() : null,
    theme_color: SPECIAL_THEME_COLOR,
    version: 1,
  };

  // 7. 저장 — 기존 draft/needs_review 만 갱신, 그 외 상태는 덮어쓰지 않는다. 오류는 삼키지 않는다.
  const { data: existing, error: exErr } = await supabase
    .from('magazine_editions')
    .select('id, status')
    .eq('broker_id', editionRow.broker_id)
    .eq('edition_type', 'special')
    .eq('edition_label', editionLabel)
    .limit(1);
  if (exErr) throw new EditionSaveError(`기존 속보 조회 실패: ${exErr.message}`, exErr.code ?? null);

  const ex = (existing ?? [])[0] as { id: string; status: string } | undefined;
  let saved: MagazineEdition;
  if (ex) {
    if (!['draft', 'needs_review'].includes(ex.status)) {
      throw new EditionSaveError(`이미 '${ex.status}' 상태의 속보(${editionLabel})가 있어 덮어쓰지 않습니다`, 'EDITION_EXISTS');
    }
    const { data, error } = await supabase
      .from('magazine_editions')
      .update({ ...editionRow, updated_at: new Date().toISOString() })
      .eq('id', ex.id)
      .select()
      .single();
    if (error) throw new EditionSaveError(`속보 매거진 저장 실패: ${error.message}`, error.code ?? null);
    saved = data as MagazineEdition;
  } else {
    const { data, error } = await supabase.from('magazine_editions').insert(editionRow).select().single();
    if (error) throw new EditionSaveError(`속보 매거진 저장 실패: ${error.message}`, error.code ?? null);
    saved = data as MagazineEdition;
  }

  log.info(`[SpecialEditionGenerator] ${passed ? 'published' : 'needs_review'}: ${editionLabel} for ${brokerSlug}`);
  return saved;
}
