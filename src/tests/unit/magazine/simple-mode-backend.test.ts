/**
 * src/tests/unit/magazine/simple-mode-backend.test.ts
 * 매거진 '간단 모드(골디락스 미니멈 포맷)' 백엔드·저장·요약 생성기·발행·프로필 API 단위 테스트 (S1)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, filterRows, rowVisibleTo, type FakeCall } from './authz-fake-db';

const UA = '11111111-1111-4111-8111-111111111111';
const UB = '22222222-2222-4222-8222-222222222222';

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; calls: FakeCall[] },
  ctx: null as unknown,
  unauth: false,
  llmFn: null as null | ((req: unknown) => Promise<unknown>),
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db.client }));
vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async () => {
    if (h.unauth) {
      return {
        user: null,
        error: new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 }),
      };
    }
    return {
      user: { id: UA, email: 'kim@credeal.net' },
      error: null,
    };
  },
}));
vi.mock('@/domain/subscription/tier-gate', () => ({
  getBrokerSubscriptionTier: async () => ({ tier: 'pro', isPaid: true }),
}));
vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return {
    ...actual,
    requireBrokerContext: async () => {
      if (h.unauth) return { ctx: null, error: actual.jsonError('UNAUTHORIZED', '로그인이 필요합니다.', 401) };
      return { ctx: h.ctx, error: null };
    },
  };
});
vi.mock('@/lib/magazine/llm-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/llm-guard')>();
  return {
    ...actual,
    callMagazineLlm: async (req: unknown) => {
      if (!h.llmFn) throw new actual.MagazineLlmError('LLM_FAILED', 'no mock configured');
      return h.llmFn(req);
    },
  };
});

import {
  buildContentFromForm,
  buildPatchPayload,
  EMPTY_FIELD_NOTE,
  formFromEdition,
  normalizeContentForPublish,
  type EditorForm,
  type PublishBrokerIdentity,
} from '@/lib/magazine/edition-save';
import { getOrCreateDraftEdition } from '@/lib/magazine/edition-draft';
import { generateSimpleEditionSummary } from '@/domain/magazine/simple-edition-generator';
import { MagazineLlmError } from '@/lib/magazine/llm-guard';
import { POST as SIMPLE_SUMMARY } from '@/app/api/magazine/editions/[id]/simple-summary/route';
import { POST as PUBLISH } from '@/app/api/magazine/editions/[id]/publish/route';
import { GET as PROFILE_GET, PUT as PROFILE_PUT } from '@/app/api/broker/profile/route';

const ctxA = { userId: UA, slug: 'broker-a', displayName: '김중개', brokerKeys: ['broker-a', UA] };

const brokerIdentity: PublishBrokerIdentity = {
  name: '김중개',
  slug: 'broker-a',
  company: '성수공인',
  phone: '010-1234-5678',
  photoUrl: null,
  tagline: '성수 빌딩 전문',
  specialtyRegions: ['성수동'],
  specialtyAssets: ['꼬마빌딩'],
};

const makeForm = (over: Partial<EditorForm> = {}): EditorForm => ({
  headline: '',
  briefing: '',
  marketTemp: '선별 매수',
  coverKeywords: ['', '', ''],
  coverImageUrl: null,
  fieldNote: {
    ...EMPTY_FIELD_NOTE,
    comment: '이번 주 성수동 현장에서는 50억대 역세권 꼬마빌딩 실수요 문의가 꾸준히 이어지고 있습니다.',
  },
  themeTitle: '',
  themeBodyMd: '',
  themeColor: '#6366f1',
  selectedDealIds: ['d1', 'd2', 'd3', 'd4'],
  selectedNewsIds: ['n1', 'n2', 'n3', 'n4'],
  topNews: [
    { id: 'n1', title: '뉴스1' },
    { id: 'n2', title: '뉴스2' },
    { id: 'n3', title: '뉴스3' },
    { id: 'n4', title: '뉴스4' },
  ],
  dealHighlights: [
    { id: 'd1', title: '매물1' },
    { id: 'd2', title: '매물2' },
    { id: 'd3', title: '매물3' },
    { id: 'd4', title: '매물4' },
  ],
  pollQuestion: '',
  pollOptions: [],
  taxQuestion: '',
  taxAnswer: '',
  taxSource: '',
  sectionOrder: ['ai_briefing', 'field_note'],
  sectionsEnabled: {},
  targetSegment: 'all',
  ...over,
});

describe('edition-save 간단 모드(format=simple) 저장·복원·발행 정규화', () => {
  it('formFromEdition: content.format(simple/full)을 복원하고 없으면 undefined', () => {
    const simpleForm = formFromEdition({ id: 'e1', content: { format: 'simple', headline: 'H' } });
    expect(simpleForm.format).toBe('simple');

    const fullForm = formFromEdition({ id: 'e2', content: { format: 'full', headline: 'H' } });
    expect(fullForm.format).toBe('full');

    const legacyForm = formFromEdition({ id: 'e3', content: { headline: 'H' } });
    expect(legacyForm.format).toBeUndefined();
  });

  it('buildContentFromForm: format=simple 명시 시 헤드라인 폴백, 뉴스/매물 3건 제한, 6개 핵심 섹션 활성화를 적용한다', () => {
    const content = buildContentFromForm(
      { broker: { name: '김중개' } },
      makeForm({ format: 'simple' }),
    );
    expect(content.format).toBe('simple');
    expect(typeof content.headline).toBe('string');
    expect((content.headline as string).length).toBeGreaterThan(5);
    expect(content.selected_news_ids).toEqual(['n1', 'n2', 'n3']);
    expect(content.topNews).toHaveLength(3);
    expect(content.featured_deal_ids).toEqual(['d1', 'd2', 'd3']);
    expect(content.dealHighlights).toHaveLength(3);

    const sections = content.sections as Array<{ id: string; enabled: boolean }>;
    expect(sections.find((s) => s.id === 'roi_calculator')?.enabled).toBe(true);
    expect(sections.find((s) => s.id === 'poll')?.enabled).toBe(false);
    expect(sections.find((s) => s.id === 'theme_of_week')?.enabled).toBe(false);
  });

  it('buildContentFromForm: format=simple 이더라도 이미 작성된 테마/투표가 있으면 보존(enabled=true)한다', () => {
    const content = buildContentFromForm(
      {},
      makeForm({
        format: 'simple',
        themeTitle: '금리 인하 영향',
        themeBodyMd: '상세 분석 본문입니다.',
        pollQuestion: '지금 매수 적기인가요?',
        pollOptions: [{ label: '예' }, { label: '아니오' }],
      }),
    );
    const sections = content.sections as Array<{ id: string; enabled: boolean }>;
    expect(sections.find((s) => s.id === 'theme_of_week')?.enabled).toBe(true);
    expect(sections.find((s) => s.id === 'poll')?.enabled).toBe(true);
  });

  it('buildPatchPayload: format=simple 이고 headline 이 비어 있으면 폴백 헤드라인을 title 컬럼에도 반영한다', () => {
    const patch = buildPatchPayload({}, makeForm({ format: 'simple', headline: '' }));
    expect(patch.title.length).toBeGreaterThan(5);
    expect(patch.featured_deal_ids).toEqual(['d1', 'd2', 'd3']);
  });

  it('normalizeContentForPublish: format=simple 이면 헤드라인·브리핑이 비어 있어도 field_note.comment 로 자동 보충해 통과시킨다', () => {
    const res = normalizeContentForPublish({
      content: {
        format: 'simple',
        headline: '',
        briefing: '',
        market_temp: '선별 매수',
        field_note: {
          ...EMPTY_FIELD_NOTE,
          comment: '이번 주 역세권 꼬마빌딩 매수 문의가 크게 늘었습니다. 급매물 위주로 검토해 보세요.',
        },
        featured_deal_ids: ['d1', 'd2', 'd3', 'd4'],
        topNews: [{ title: '상업용 부동산 금리 동향' }, { title: '뉴스2' }, { title: '뉴스3' }, { title: '뉴스4' }],
      },
      broker: brokerIdentity,
      kind: 'weekly',
      issueDate: '2026-10-16',
      weekLabel: 'W42-2026',
      nowIso: '2026-10-16T00:00:00.000Z',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.content.format).toBe('simple');
    expect(res.content.headline).toBe('이번 주 역세권 꼬마빌딩 매수 문의가 크게 늘었습니다');
    expect(String(res.content.briefing)).toContain('선별 매수');
    expect(res.content.featured_deal_ids).toHaveLength(3);
    expect(res.content.topNews).toHaveLength(3);
  });
});

describe('generateSimpleEditionSummary (요약 생성기 + 결정론적 폴백)', () => {
  beforeEach(() => {
    h.llmFn = null;
  });

  it('LLM 정상 응답 + 근거 수치 일치 시 usedFallback=false 로 결과를 반환한다', async () => {
    h.llmFn = async () => ({
      content: JSON.stringify({
        headline: '성수동 50억대 꼬마빌딩 실수요 문의 지속',
        briefing:
          '이번 주 성수동 현장에서는 50억대 꼬마빌딩을 찾는 실수요 문의가 꾸준히 이어지고 있습니다. 추천 매물 2건과 주요 시장 뉴스를 함께 정리했습니다.',
        marketTemp: '선별 매수',
        keywords: ['성수동', '꼬마빌딩'],
      }),
      tokens: 210,
      model: 'gemini-test',
      latencyMs: 120,
      isMock: false,
    });

    const out = await generateSimpleEditionSummary({
      comment: '이번 주 성수동 현장에서는 50억대 꼬마빌딩 실수요 문의가 이어지고 있습니다.',
      brokerName: '김중개',
      marketTemp: '선별 매수',
      deals: [
        { title: '성수역 코너 빌딩', assetType: '꼬마빌딩', price: '50억' },
        { title: '뚝섬역 근생 빌딩', assetType: '근생빌딩', price: '45억' },
      ],
      newsTitles: ['성수동 오피스 임차 수요 강세'],
    });

    expect(out.usedFallback).toBe(false);
    expect(out.headline).toBe('성수동 50억대 꼬마빌딩 실수요 문의 지속');
    expect(out.briefing).toContain('50억');
    expect(out.marketTemp).toBe('선별 매수');
    expect(out.keywords).toEqual(['성수동', '꼬마빌딩']);
  });

  it('LLM 이 입력에 없는 수치(예: 공실률 14.8%)를 지어내면 QG 가 차단하고 결정론적 폴백을 반환한다', async () => {
    h.llmFn = async () => ({
      content: JSON.stringify({
        headline: '성수동 공실률 14.8% 급등 속 선별 매수',
        briefing: '성수동 공실률이 14.8%로 치솟았으며 평균 수익률은 7.9%를 기록했습니다.',
        marketTemp: '선별 매수',
        keywords: ['성수동'],
      }),
      tokens: 180,
      model: 'gemini-test',
      latencyMs: 100,
      isMock: false,
    });

    const out = await generateSimpleEditionSummary({
      comment: '이번 주 현장에서는 안정적인 임대수익 매물을 찾는 문의가 많습니다.',
      brokerName: '김중개',
      marketTemp: '선별 매수',
      deals: [{ title: '역세권 빌딩', assetType: '꼬마빌딩' }],
      newsTitles: ['상업용 부동산 시장 동향'],
    });

    expect(out.usedFallback).toBe(true);
    expect(out.reason).toContain('QUALITY_GATE_FAILED');
    expect(out.briefing).not.toContain('14.8%');
    expect(out.briefing).toContain('안정적인 임대수익 매물을 찾는 문의가 많습니다');
  });

  it('LLM 호출 실패 또는 Mock 응답 시 예외를 던지지 않고 결정론적 폴백을 반환한다', async () => {
    h.llmFn = async () => {
      throw new MagazineLlmError('MOCK_RESPONSE', 'Mock 차단');
    };

    const out = await generateSimpleEditionSummary({
      comment: '보유 건물의 재계약이나 매각 타이밍이 고민되신다면 편하게 연락 주시기 바랍니다.',
      brokerName: '김중개',
      marketTemp: '관망',
    });

    expect(out.usedFallback).toBe(true);
    expect(out.reason).toBe('MOCK_RESPONSE');
    expect(out.headline).toContain('보유 건물의 재계약이나 매각 타이밍이 고민되신다면');
    expect(out.briefing).toContain('관망');
  });
});

describe('초안 생성 / simple-summary API / 발행 API / 프로필 editor_mode API', () => {
  type Row = Record<string, unknown>;
  let editions: Row[] = [];
  let settingsRow: Row | null = null;
  let editorModeColumnMissing = false;

  beforeEach(() => {
    h.unauth = false;
    h.ctx = ctxA;
    h.llmFn = null;
    editorModeColumnMissing = false;
    settingsRow = {
      broker_user_id: UA,
      broker_slug: 'broker-a',
      title: '김중개의 성수 브리핑',
      theme_color: '#6366f1',
      editor_mode: 'simple',
    };
    editions = [
      {
        id: 'ed-simple-1',
        broker_id: 'broker-a',
        status: 'draft',
        edition_type: 'weekly',
        edition_label: 'W42-2026',
        title: '',
        market_temp: '선별 매수',
        theme_color: '#6366f1',
        published_at: null,
        content: {
          schemaVersion: 1,
          kind: 'weekly',
          format: 'simple',
          issueDate: '2026-10-16',
          weekLabel: 'W42-2026',
          headline: '',
          briefing: '',
          field_note: {
            ...EMPTY_FIELD_NOTE,
            comment: '이번 주 현장에서는 실수요 매수 문의가 꾸준히 이어지고 있습니다. 특히 역세권 매물이 인기입니다.',
          },
          featured_deal_ids: ['d1', 'd2', 'd3', 'd4'],
          topNews: [{ title: '뉴스1' }, { title: '뉴스2' }, { title: '뉴스3' }, { title: '뉴스4' }],
        },
      },
      {
        id: 'ed-other',
        broker_id: 'broker-b',
        status: 'draft',
        edition_type: 'weekly',
        edition_label: 'W42-2026',
        content: {},
      },
    ];

    h.db = createFakeDb((call: FakeCall) => {
      if (call.table === 'profiles') {
        return {
          data: {
            id: UA,
            role: 'broker',
            display_name: '김중개',
            phone: '010-1234-5678',
            company: '성수공인',
            tagline: '성수 빌딩 전문',
            photo_url: null,
          },
        };
      }
      if (call.table === 'broker_profiles') {
        return {
          data: {
            user_id: UA,
            slug: 'broker-a',
            bio: null,
            specialty_regions: ['성수동'],
            specialty_assets: ['꼬마빌딩'],
            is_public: true,
          },
        };
      }
      if (call.table === 'magazine_settings') {
        if (call.op === 'select') {
          const selectCols = String(call.filters.find((f) => f[0] === 'select')?.[1] ?? '');
          if (editorModeColumnMissing && selectCols.includes('editor_mode')) {
            return {
              data: null,
              error: { code: '42703', message: 'column magazine_settings.editor_mode does not exist' },
            };
          }
          if (editorModeColumnMissing && settingsRow) {
            const { editor_mode: _omitted, ...withoutMode } = settingsRow;
            return { data: withoutMode };
          }
          return { data: settingsRow };
        }
        if (call.op === 'upsert') {
          const payload = call.payload as Row;
          if (editorModeColumnMissing && 'editor_mode' in payload) {
            return {
              data: null,
              error: { code: 'PGRST204', message: "Could not find the 'editor_mode' column of 'magazine_settings' in the schema cache" },
            };
          }
          settingsRow = { ...(settingsRow ?? {}), ...payload };
          return { data: settingsRow, error: null };
        }
      }
      if (call.table === 'magazine_issues') {
        return { data: null, error: null };
      }
      if (call.table === 'magazine_editions') {
        if (call.op === 'insert') {
          const row = { id: `new-${editions.length + 1}`, created_at: '2026-10-16T00:00:00.000Z', ...(call.payload as Row) };
          editions.push(row);
          return { data: row };
        }
        if (call.op === 'update') {
          const row = rowVisibleTo(editions, call);
          if (!row) return { data: null };
          Object.assign(row, call.payload as Row);
          return { data: { ...row } };
        }
        if (call.op === 'select' && call.filters.some((f) => f[0] === 'eq' && f[1] === 'id')) {
          const found = rowVisibleTo(editions, call);
          return { data: found ? { ...found } : null };
        }
        return { data: filterRows(editions, call) };
      }
      return { data: null };
    }) as never;
  });

  it('getOrCreateDraftEdition: 신규 초안 생성 시 기본 content.format = "simple" 을 기록한다', async () => {
    const { edition, created } = await getOrCreateDraftEdition(
      h.db.client as never,
      { slug: 'broker-a', brokerKeys: ['broker-a', UA] },
      { editionType: 'weekly', editionLabel: 'W43-2026' },
    );
    expect(created).toBe(true);
    expect((edition.content as { format?: string }).format).toBe('simple');
  });

  it('POST /api/magazine/editions/[id]/simple-summary: 소유권 확인(타 브로커 404), 글자수 검증(400), 폴백 안전 응답(200)', async () => {
    const req = (id: string, body: unknown) =>
      new NextRequest(`https://credeal.net/api/magazine/editions/${id}/simple-summary`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    // 타 브로커 소유 에디션 → 404
    const resOther = await SIMPLE_SUMMARY(req('ed-other', { comment: '충분히 긴 이번 주 현장 한마디입니다.' }), {
      params: Promise.resolve({ id: 'ed-other' }),
    });
    expect(resOther.status).toBe(404);

    // 10자 미만 → 400
    const resShort = await SIMPLE_SUMMARY(req('ed-simple-1', { comment: '짧은글' }), {
      params: Promise.resolve({ id: 'ed-simple-1' }),
    });
    expect(resShort.status).toBe(400);

    // 정상 호출 (LLM 미설정 시 폴백으로 200 OK)
    const resOk = await SIMPLE_SUMMARY(
      req('ed-simple-1', {
        comment: '이번 주 현장에서는 실수요 매수 문의가 꾸준히 이어지고 있습니다. 특히 역세권 매물이 인기입니다.',
        marketTemp: '선별 매수',
      }),
      { params: Promise.resolve({ id: 'ed-simple-1' }) },
    );
    expect(resOk.status).toBe(200);
    const json = await resOk.json();
    expect(json.ok).toBe(true);
    expect(json.usedFallback).toBe(true);
    expect(json.headline).toContain('이번 주 현장에서는 실수요 매수 문의가 꾸준히 이어지고 있습니다');
    expect(json.briefing).toContain('선별 매수');
  });

  it('POST /api/magazine/editions/[id]/publish: 간단 모드 에디션은 헤드라인이 비어 있어도 한마디에서 자동 생성하여 200 발행된다', async () => {
    const req = new NextRequest('https://credeal.net/api/magazine/editions/ed-simple-1/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await PUBLISH(req, { params: Promise.resolve({ id: 'ed-simple-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.edition.status).toBe('published');
    expect(json.edition.title).toBe('이번 주 현장에서는 실수요 매수 문의가 꾸준히 이어지고 있습니다');
    expect(json.edition.content.format).toBe('simple');
    expect(json.edition.content.featured_deal_ids).toHaveLength(3);
    expect(json.edition.content.topNews).toHaveLength(3);
  });

  it('GET/PUT /api/broker/profile: magazine_editor_mode 조회·저장 및 컬럼 미적용(42703/PGRST204) 시 무오류 폴백', async () => {
    // 1) 정상 조회
    const getRes1 = await PROFILE_GET(new NextRequest('https://credeal.net/api/broker/profile'));
    expect(getRes1.status).toBe(200);
    const getJson1 = await getRes1.json();
    expect(getJson1.data.magazine_editor_mode).toBe('simple');

    // 2) 정상 PUT (full 로 변경)
    const putRes1 = await PROFILE_PUT(
      new NextRequest('https://credeal.net/api/broker/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ magazine_editor_mode: 'full' }),
      }),
    );
    expect(putRes1.status).toBe(200);
    expect((await putRes1.json()).settingsSaved).toBe(true);
    expect(settingsRow?.editor_mode).toBe('full');

    // 3) editor_mode 컬럼 미적용 상태에서 GET/PUT 모두 500 없이 폴백 동작
    editorModeColumnMissing = true;
    const getRes2 = await PROFILE_GET(new NextRequest('https://credeal.net/api/broker/profile'));
    expect(getRes2.status).toBe(200);
    const getJson2 = await getRes2.json();
    expect(getJson2.data.magazine_title).toBe('김중개의 성수 브리핑');
    expect(getJson2.data.magazine_editor_mode).toBeNull();

    const putRes2 = await PROFILE_PUT(
      new NextRequest('https://credeal.net/api/broker/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ magazine_title: '새 매거진 타이틀', magazine_editor_mode: 'simple' }),
      }),
    );
    expect(putRes2.status).toBe(200);
    const putJson2 = await putRes2.json();
    expect(putJson2.ok).toBe(true);
    expect(putJson2.settingsSaved).toBe(true);
    expect(settingsRow?.title).toBe('새 매거진 타이틀');
  });
});
