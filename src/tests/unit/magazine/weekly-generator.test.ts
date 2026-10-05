/**
 * 주간 생성기 회귀 테스트 (B3a, C-01: D2-02/03/04/17/18/27, M2-03/17/18 + C-02: Mock·QG·저장 오류)
 *  - 실제 컬럼/날짜 회귀 (social_sentiment.analysis_date, auction_listings, cre_pulses 라벨 등)
 *  - Mock/LLM 실패/근거 없음 → 저장 0건, 저장 오류 전파(23514), 기존 published 비덮어쓰기
 *  - 공개 테이블(magazine_issues) 쓰기 없음, 데이터 없는 섹션은 키 자체가 없음
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, eqValue, inKeys, type FakeCall } from './authz-fake-db';

const UA = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-05T03:00:00Z'); // KST 2026-10-05 12:00 (월요일, ISO W41)
const ISSUE_DATE = '2026-10-05';

const h = vi.hoisted(() => ({
  llmCalls: 0,
  llm: null as null | (() => unknown),
}));

vi.mock('@/domain/external/monthly-transaction-summary', () => ({
  summarizeMonthlyTransactions: async () => [],
}));
vi.mock('@/domain/magazine/tax-clinic-generator', () => ({
  generateSharedTaxClinic: async () => null,
}));
vi.mock('@/lib/magazine/llm-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/llm-guard')>();
  return {
    ...actual,
    callMagazineJson: async () => {
      h.llmCalls += 1;
      if (!h.llm) throw new Error('llm not set');
      return h.llm();
    },
  };
});

import {
  InsufficientSourceDataError,
  buildWeeklyCoverData,
  formatEok,
  generatePersonalizedInsert,
  generateWeeklyMagazine,
  sentimentStatusLabel,
  __resetInsertCacheForTests,
} from '@/domain/magazine/weekly-generator';
import { EditionSaveError } from '@/domain/magazine/types';
import { isoWeekLabel } from '@/lib/magazine/kst';
import { MagazineLlmError } from '@/lib/magazine/llm-guard';
import { pulsePeriodLabelCandidates } from '@/lib/magazine/period-label';

interface Scenario {
  news?: unknown[];
  transactions?: unknown[];
  pulse?: unknown[];
  sentiment?: unknown[];
  auctions?: unknown[];
  reports?: unknown[];
  rental?: unknown[];
  commercial?: unknown[];
  existing?: Array<{ id: string; status: string }>;
  insertError?: { code: string; message: string } | null;
}

const FULL: Scenario = {
  news: [
    { id: 'n1', title: '성수동 오피스 수요 증가', summary: '핵심 팩트: 임차 문의 증가 | 브로커 임플리케이션: 선별 검토', source: '한경', sentiment: 'positive', importance_score: 80, topic: 'office', created_at: '2026-10-03T00:00:00Z' },
  ],
  transactions: [
    { address: '서울 성동구 성수동2가 1-1', dong: '성수동2가', district: '성동구', transaction_price: 1_230_000_000, usage_type: '근린생활', building_area: 99.17, transaction_date: '2026-09-20' },
    { address: '서울 강남구 역삼동 2-2', dong: '역삼동', district: '강남구', transaction_price: 9_900_000_000, usage_type: '업무', building_area: 300, transaction_date: '2026-09-21' },
  ],
  pulse: [{ pulse_score: 72, trend: 'up', summary_ko: '성수 시장이 개선되고 있습니다.', key_findings: ['임대 수요'], signals: {} }],
  sentiment: [{ keyword: '성수', sentiment_score: 60, mention_count: 10, analysis_date: '2026-10-04' }],
  auctions: [{ case_number: '2026타경1', court: '서울동부', address: '서울 성동구 성수동 3-3', minimum_bid: 800_000_000, appraised_value: 1_000_000_000, status: '진행', auction_date: '2026-10-20' }],
  reports: [{ institution: '리서치A', title: '2026 3분기 리포트', summary: '요약', url: 'https://example.com/r', published_date: '2026-09-30' }],
  rental: [{ region: 'seongsu', quarter: '2026Q2', vacancy_rate: 4.5, rental_index: 101.2 }],
  commercial: [{ district_name: '성수 상권', sales_volume_index: 110, footfall_index: 120 }],
  existing: [],
  insertError: null,
};

let db: ReturnType<typeof createFakeDb>;

function setupDb(s: Scenario = FULL) {
  db = createFakeDb((call: FakeCall) => {
    switch (call.table) {
      case 'broker_profiles':
        return eqValue(call, 'slug') === 'broker-a'
          ? { data: { user_id: UA, slug: 'broker-a', bio: null, specialty_regions: ['성수동'], specialty_assets: ['꼬마빌딩'], total_deal_count_self: 3, deal_size_range: null, magazine_cover_image: null } }
          : { data: null };
      case 'profiles':
        return { data: { id: UA, display_name: '홍길동', company: 'ABC부동산', phone: '010-0000-0000', photo_url: null, tagline: '성수 전문' } };
      case 'building_ssot_lite':
        return { data: [], count: 2 };
      case 'cre_pulses':
        return { data: s.pulse ?? [] };
      case 'external_news':
        return { data: s.news ?? [] };
      case 'external_transactions':
        return { data: s.transactions ?? [] };
      case 'social_sentiment':
        return { data: s.sentiment ?? [] };
      case 'auction_listings':
        return { data: s.auctions ?? [] };
      case 'external_reports':
        return { data: s.reports ?? [] };
      case 'rental_trend_data':
        return { data: s.rental ?? [] };
      case 'commercial_district':
        return { data: s.commercial ?? [] };
      case 'magazine_editions':
        if (call.op === 'insert') {
          return s.insertError ? { data: null, error: s.insertError } : { data: { id: 'ed-new', ...(call.payload as object) } };
        }
        if (call.op === 'update') return { data: { id: s.existing?.[0]?.id, ...(call.payload as object) } };
        return { data: s.existing ?? [] };
      default:
        return { data: null };
    }
  });
}

const writes = (table?: string) => db.calls.filter((c) => ['insert', 'update', 'upsert', 'delete'].includes(c.op) && (!table || c.table === table));
const selectOf = (table: string) => db.calls.find((c) => c.table === table && c.op === 'select')?.filters.find((f) => f[0] === 'select')?.[1] as string | undefined;

const GOOD_LLM = () => ({
  data: {
    ai_briefing: '성수 시장 펄스는 72점으로 개선 흐름이며, 최근 실거래는 12.3억이었습니다. 투자 심리 지수는 60점입니다.',
    theme_title: '성수 임대 수요 점검',
    theme_body_md: '성수 지역에서는 임차 문의가 늘고 있다는 보도가 있었습니다. 공실률은 4.5%입니다. 선별적인 접근이 필요합니다.',
    poll: { question: '이번 주 성수 시장은 어떻게 보시나요?', choices: ['상승', '보합', '하락'] },
    matchedDealIds: [],
  },
  response: { content: '{}', tokens: 777, model: 'test-model', latencyMs: 1, isMock: false },
});

const run = (over: Partial<Parameters<typeof generateWeeklyMagazine>[0]> = {}) =>
  generateWeeklyMagazine({ supabase: db.client, brokerId: 'broker-a', issueDate: ISSUE_DATE, now: NOW, ...over });

beforeEach(() => {
  h.llmCalls = 0;
  h.llm = GOOD_LLM;
  __resetInsertCacheForTests();
  setupDb();
});

describe('컬럼/날짜 회귀 (C-01)', () => {
  it('social_sentiment 는 analysis_date 로 조회·정렬하고 created_at 을 쓰지 않는다 (D2-02)', async () => {
    await run();
    const call = db.calls.find((c) => c.table === 'social_sentiment')!;
    expect(selectOf('social_sentiment')).toContain('analysis_date');
    expect(JSON.stringify(call.filters)).not.toContain('created_at');
    expect(call.filters.some((f) => f[0] === 'order' && f[1] === 'analysis_date')).toBe(true);
  });

  it('auction_listings: 실제 컬럼, 입찰일 ≥ 발행일(과거 제외), 오름차순 (D2-27)', async () => {
    await run();
    const call = db.calls.find((c) => c.table === 'auction_listings')!;
    const cols = selectOf('auction_listings')!.split(',').map((s) => s.trim());
    expect(cols).toEqual(['case_number', 'court', 'address', 'minimum_bid', 'appraised_value', 'status', 'auction_date']);
    expect(call.filters).toContainEqual(['gte', 'auction_date', ISSUE_DATE]);
    expect(call.filters).toContainEqual(['order', 'auction_date', { ascending: true }]);
  });

  it('external_reports / rental_trend_data / commercial_district 는 실제 컬럼만 선택한다', async () => {
    await run();
    expect(selectOf('external_reports')).toBe('institution, title, summary, url, published_date');
    expect(selectOf('rental_trend_data')).toBe('region, quarter, vacancy_rate, rental_index');
    expect(selectOf('commercial_district')).toBe('district_name, sales_volume_index, footfall_index');
    // 임대 동향은 권역 코드로 필터 (무필터 전국 최신 행 금지)
    const rental = db.calls.find((c) => c.table === 'rental_trend_data')!;
    expect(eqValue(rental, 'region')).toBe('seongsu');
    // 상권은 지역 키워드로 매칭 (무필터 maybeSingle 금지)
    const commercial = db.calls.find((c) => c.table === 'commercial_district')!;
    expect(commercial.filters.some((f) => f[0] === 'ilike' && f[1] === 'district_name')).toBe(true);
  });

  it('cre_pulses 는 권역 코드 + 표준 ISO 주차(및 과거 적재 형식) 라벨로 조회한다 (함정 #18)', async () => {
    await run();
    const call = db.calls.find((c) => c.table === 'cre_pulses')!;
    expect(eqValue(call, 'region')).toBe('seongsu');
    const labels = inKeys(call, 'period_label')!;
    expect(labels).toContain(isoWeekLabel(ISSUE_DATE));
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(labels).toEqual(pulsePeriodLabelCandidates(ISSUE_DATE));
  });

  it('뉴스는 최근 7일만, 실거래는 지역 키워드로 필터 (M2-17/18)', async () => {
    const ed = await run();
    const news = db.calls.find((c) => c.table === 'external_news')!;
    const gte = news.filters.find((f) => f[0] === 'gte' && f[1] === 'created_at')!;
    expect(new Date(gte[2] as string).getTime()).toBe(NOW.getTime() - 7 * 86_400_000);
    const content = ed.content as Record<string, unknown>;
    const txs = content.recentTransactions as Array<{ district: string }>;
    expect(txs.map((t) => t.district)).toEqual(['성동구']); // 강남구 거래는 제외
  });

  it('발행일/주차 라벨은 KST 단일 구현을 따른다 (D2-17/18)', async () => {
    const ed = await run();
    expect(ed.edition_label).toBe('W41-2026');
    const content = ed.content as Record<string, unknown>;
    expect(content.issueDate).toBe(ISSUE_DATE);
    expect(content.weekLabel).toBe('W41-2026');
    // UTC 일요일 23:30 = KST 월요일 08:30 → 새 주차
    setupDb();
    const edKst = await generateWeeklyMagazine({ supabase: db.client, brokerId: 'broker-a', now: new Date('2026-10-04T23:30:00Z') });
    expect(edKst.edition_label).toBe('W41-2026');
  });
});

describe('저장 동작', () => {
  it('정상: draft 로 magazine_editions 에만 insert, magazine_issues(공개) 쓰기 없음 (D2-06)', async () => {
    const ed = await run();
    expect(ed.status).toBe('draft');
    expect(writes('magazine_editions')).toHaveLength(1);
    expect(writes('magazine_editions')[0].op).toBe('insert');
    expect(writes('magazine_issues')).toHaveLength(0);
    expect(db.calls.some((c) => c.table === 'magazine_issues')).toBe(false);
    const row = writes('magazine_editions')[0].payload as Record<string, unknown>;
    expect(row.broker_id).toBe('broker-a');
    expect(row.edition_type).toBe('weekly');
    const content = row.content as Record<string, unknown>;
    expect(content.schemaVersion).toBe(1);
    expect((content.generation as { totalTokens: number }).totalTokens).toBe(777); // 비용 실측 기록 (Rule 48)
    expect(h.llmCalls).toBe(1);
  });

  it('데이터 없는 섹션은 키 자체가 없다 (가짜 기본값 금지)', async () => {
    setupDb({ ...FULL, auctions: [], reports: [], rental: [], commercial: [], sentiment: [] });
    const ed = await run();
    const content = ed.content as Record<string, unknown>;
    for (const k of ['auctionPicks', 'reports', 'rentalTrend', 'commercialDistrict', 'sentiment', 'tax_clinic']) {
      expect(k in content).toBe(false);
    }
    expect(content.topNews).toBeDefined();
  });

  it('QG 불합격(날조 수치) → needs_review 로 저장', async () => {
    h.llm = () => {
      const o = GOOD_LLM();
      o.data.ai_briefing = '성수 시장 펄스는 72점이며 최근 실거래는 999억이었습니다. 심리는 60점입니다.';
      return o;
    };
    const ed = await run();
    expect(ed.status).toBe('needs_review');
    const gen = (ed.content as { generation: { qualityGate: { passed: boolean; failureReasons: string[] } } }).generation;
    expect(gen.qualityGate.passed).toBe(false);
    expect(gen.qualityGate.failureReasons).toContain('UNMATCHED_CLAIMS');
  });

  it('저장 오류(예: 23514 needs_review CHECK 미적용)를 삼키지 않고 EditionSaveError 로 던진다 (함정 #11)', async () => {
    h.llm = () => {
      const o = GOOD_LLM();
      o.data.ai_briefing = '성수 시장 펄스는 72점이며 최근 실거래는 999억이었습니다.';
      return o;
    };
    setupDb({ ...FULL, insertError: { code: '23514', message: 'violates check constraint "magazine_editions_status_check"' } });
    const p = run();
    await expect(p).rejects.toBeInstanceOf(EditionSaveError);
    await expect(run()).rejects.toMatchObject({ code: '23514', needsMigration: true });
  });

  it('이미 published 인 같은 라벨 에디션은 덮어쓰지 않는다', async () => {
    setupDb({ ...FULL, existing: [{ id: 'ed-old', status: 'published' }] });
    await expect(run()).rejects.toMatchObject({ code: 'EDITION_EXISTS' });
    expect(writes('magazine_editions')).toHaveLength(0);
  });

  it('기존 draft 는 update 로 갱신 (insert 중복 없음)', async () => {
    setupDb({ ...FULL, existing: [{ id: 'ed-old', status: 'draft' }] });
    await run();
    expect(writes('magazine_editions').map((c) => c.op)).toEqual(['update']);
  });
});

describe('Mock / 실패 / 근거 없음 → 저장 0건', () => {
  it('LLM Mock 차단 오류는 그대로 전파되고 insert 가 없다 (cron /mock/i 호환)', async () => {
    h.llm = async () => {
      throw new MagazineLlmError('MOCK_RESPONSE', 'AI 생성 실패: 실제 AI 응답을 받지 못했습니다 (Mock 응답 차단)');
    };
    await expect(run()).rejects.toThrow(/mock/i);
    expect(writes()).toHaveLength(0);
  });

  it('뉴스·실거래·펄스가 모두 없으면 LLM 호출 없이 InsufficientSourceDataError', async () => {
    setupDb({ existing: [] });
    await expect(run()).rejects.toBeInstanceOf(InsufficientSourceDataError);
    expect(h.llmCalls).toBe(0);
    expect(writes()).toHaveLength(0);
  });

  it('브로커를 찾지 못하면 오류 (DB 쓰기 없음)', async () => {
    await expect(run({ brokerId: 'no-such-broker' })).rejects.toThrow(/찾을 수 없습니다/);
    expect(writes()).toHaveLength(0);
  });

  it('형식이 이상한 brokerId 는 DB 조회 없이 거부 (.or() 보간 금지)', async () => {
    await expect(run({ brokerId: 'a,user_id.eq.x' })).rejects.toThrow();
    // 쿼리 빌더는 만들어도 되지만 필터(.eq/.or)가 실행되어 DB 로 나가면 안 된다
    expect(db.calls.filter((c) => c.table === 'broker_profiles').every((c) => !c.filters.some((f) => f[0] === 'eq' || f[0] === 'or'))).toBe(true);
    expect(db.calls.flatMap((c) => c.filters).some((f) => f[0] === 'or')).toBe(false);
  });
});

describe('순수 함수', () => {
  it('buildWeeklyCoverData: 근거가 없으면 온도 null·키워드 빈 배열 (50점 관망/더미 키워드 폴백 제거)', () => {
    expect(buildWeeklyCoverData(null, null)).toEqual({ marketTemp: null, coverKeywords: [] });
  });

  it('buildWeeklyCoverData: 펄스 점수로 5단계 온도를 결정한다', () => {
    const p = (score: number) => ({ pulse_score: score, trend: 'up', summary_ko: '', key_findings: [], signals: {} });
    expect(buildWeeklyCoverData(p(85), null).marketTemp).toBe('적극 매수');
    expect(buildWeeklyCoverData(p(70), null).marketTemp).toBe('선별 매수');
    expect(buildWeeklyCoverData(p(50), null).marketTemp).toBe('관망');
    expect(buildWeeklyCoverData(p(30), null).marketTemp).toBe('조정 대기');
    expect(buildWeeklyCoverData(p(10), null).marketTemp).toBe('위기 경계');
  });

  it('심리 라벨 임계값은 단일 정의 (M2-03) / formatEok', () => {
    expect(sentimentStatusLabel(70)).toBe('과열');
    expect(sentimentStatusLabel(55)).toBe('낙관');
    expect(sentimentStatusLabel(45)).toBe('중립');
    expect(sentimentStatusLabel(30)).toBe('위축');
    expect(sentimentStatusLabel(29)).toBe('침체');
    expect(formatEok(1_230_000_000)).toBe('12.3억');
  });
});

describe('generatePersonalizedInsert (M2-16)', () => {
  it('근거 뉴스가 없으면 LLM 호출 없이 인서트를 생략한다', async () => {
    const out = await generatePersonalizedInsert({ regions: ['성수동'], assetTypes: ['꼬마빌딩'] }, { theme_title: 'T' }, []);
    expect(out).toBe('');
    expect(h.llmCalls).toBe(0);
  });

  it('관심 태그가 전혀 없으면 LLM 호출 없음', async () => {
    const out = await generatePersonalizedInsert({}, { theme_title: 'T' }, [{ title: '뉴스' }]);
    expect(out).toBe('');
    expect(h.llmCalls).toBe(0);
  });

  it('같은 세그먼트는 구독자 수와 무관하게 LLM 1회만 호출하고, 매칭 점수·등급은 노출하지 않는다', async () => {
    h.llm = () => ({
      data: { insight: '성수 지역 오피스 수요 증가 소식이 있어 관련 동향을 살펴보시길 권합니다.' },
      response: { content: '{}', tokens: 50, model: 'm', latencyMs: 1, isMock: false },
    });
    const tags = { regions: ['성수동'], assetTypes: ['꼬마빌딩'] };
    const summary = { theme_title: 'T' };
    const news = [{ title: '성수동 오피스 수요 증가' }];
    const deals = [{ blindName: '성수 A급 건물', grade: 'A', score: 93 }];
    const a = await generatePersonalizedInsert(tags, summary, news, deals);
    const b = await generatePersonalizedInsert(tags, summary, news, deals);
    expect(h.llmCalls).toBe(1);
    expect(a).toBe(b);
    expect(a).toContain('성수 A급 건물');
    expect(a).not.toMatch(/93|A급\s*\(|등급|점수/);
  });

  it('Mock 응답이면 인서트를 쓰지 않는다', async () => {
    h.llm = () => ({
      data: { insight: '모의 응답으로 생성된 문장입니다 사용하면 안 됩니다.' },
      response: { content: '{}', tokens: 1, model: 'm', latencyMs: 1, isMock: true },
    });
    const out = await generatePersonalizedInsert({ regions: ['성수동'] }, { theme_title: 'T' }, [{ title: '성수동 뉴스' }]);
    expect(out).toBe('');
  });
});
