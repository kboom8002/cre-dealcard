/**
 * C-01 수집기 단위테스트: 엔티티 디코드 · CDATA 제거 · 폴백 upsert 부재 · 가용성 · 펄스 라벨/지역
 * (운영 DB/네트워크 미접속 — supabase·fetch·LLM 모두 mock)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const callLLMMock = vi.hoisted(() => vi.fn());
vi.mock('@/ai/llm-client', () => ({ callLLM: (...args: unknown[]) => callLLMMock(...args) }));
vi.mock('@/lib/external/land-price-api', () => ({ fetchLandPrice: vi.fn(async () => null) }));
vi.mock('@/domain/external/youtube-crawler', () => ({ crawlYoutubeTrends: vi.fn(async () => []) }));

/** 어떤 체인 메서드를 호출해도 같은 thenable 을 돌려주고, await 하면 result 로 resolve 된다. */
function chain(result: unknown): any {
  const p: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res: any, rej: any) => Promise.resolve(result).then(res, rej);
      return () => p;
    },
  });
  return p;
}

function makeSupabase(opts: { upsertResult?: unknown; insertResult?: unknown } = {}) {
  const upsert = vi.fn(() => chain(opts.upsertResult ?? { data: [{ id: 1 }], error: null }));
  const insert = vi.fn(() => chain(opts.insertResult ?? { data: [{ id: 1 }], error: null }));
  const del = vi.fn(() => chain({ data: null, error: null }));
  const from = vi.fn(() => ({ upsert, insert, delete: del }));
  return { supabase: { from } as any, from, upsert, insert, del };
}

beforeEach(() => {
  vi.resetModules();
  callLLMMock.mockReset();
  callLLMMock.mockResolvedValue({ content: 'neutral' });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubNoKeys() {
  for (const k of ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'SEMAS_API_KEY', 'DATA_GO_KR_API_KEY', 'MOLIT_API_KEY', 'ENERGY_API_KEY']) {
    vi.stubEnv(k, '');
  }
}

describe('cleanNewsText / parseRSSItems (M2-17)', () => {
  it('&quot; 등 엔티티를 디코드하고 태그를 제거한다', async () => {
    const { cleanNewsText } = await import('@/domain/external/naver-search');
    expect(cleanNewsText('<b>꼬마빌딩</b> &quot;거래&quot; &amp; 공실')).toBe('꼬마빌딩 "거래" & 공실');
    expect(cleanNewsText('&amp;quot;이중&amp;quot;')).toBe('"이중"');
    expect(cleanNewsText(null)).toBe('');
  });

  it('RSS: CDATA 로 감싼 link/title/description 을 벗기고 엔티티를 디코드한다', async () => {
    const { parseRSSItems } = await import('@/domain/external/market-crawlers');
    const xml = `<rss><channel>
      <item>
        <title><![CDATA[성수 &quot;빌딩&quot; 거래 급증]]></title>
        <link><![CDATA[https://www.sedaily.com/NewsView/ABC?a=1&amp;b=2]]></link>
        <description><![CDATA[<p>공실률 &lt; 3% 로 하락</p>]]></description>
      </item>
      <item>
        <title>링크 없음</title>
        <description>skip</description>
      </item>
      <item>
        <title>이상한 링크</title>
        <link>javascript:alert(1)</link>
      </item>
    </channel></rss>`;
    const items = parseRSSItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe('https://www.sedaily.com/NewsView/ABC?a=1&b=2');
    expect(items[0].link).not.toContain('CDATA');
    expect(items[0].title).toBe('성수 "빌딩" 거래 급증');
    expect(items[0].description).not.toContain('&');
    expect(items[0].description).toContain('공실률');
  });
});

describe('computeNewsImportance — 고정 점수가 아닌 기사 단위 규칙', () => {
  it('CRE 직접 키워드/주거 키워드에 따라 같은 주제 사전점수도 달라진다', async () => {
    const { computeNewsImportance } = await import('@/domain/external/naver-search');
    const cre = computeNewsImportance('성수 꼬마빌딩 거래 급증', '임대 수요', 6);
    const resi = computeNewsImportance('아파트 분양 소식', '주택 시장', 6);
    const neutral = computeNewsImportance('금리 동결', '기준금리 유지', 6);
    expect(cre).toBe(7);
    expect(resi).toBe(3);
    expect(neutral).toBe(5);
    expect(computeNewsImportance('빌딩', '', 10)).toBe(10); // clamp
  });
});

describe('crawlNaverCRENews', () => {
  it('엔티티 디코드·가짜 URL 미생성·allowMock:false·근거 있는 importance', async () => {
    vi.stubEnv('NAVER_CLIENT_ID', 'id');
    vi.stubEnv('NAVER_CLIENT_SECRET', 'secret');
    const body = {
      total: 100,
      items: [
        { title: '<b>꼬마빌딩</b> &quot;거래&quot; 급증', link: 'https://n.news.naver.com/a1', description: '공실 &amp; 임대' },
        { title: '링크 없는/위험 링크 빌딩', originallink: 'javascript:alert(1)', description: '임대' },
        { title: '아파트 분양 소식', link: 'https://n.news.naver.com/a3', description: '주택 시장' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => body })));
    callLLMMock.mockResolvedValue({ content: '요약문' });

    const { crawlNaverCRENews } = await import('@/domain/external/naver-search');
    const { supabase, upsert } = makeSupabase();
    await crawlNaverCRENews(supabase);

    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = (upsert.mock.calls[0] as unknown[])[0] as any[];
    expect(rows.map((r) => r.url).sort()).toEqual(['https://n.news.naver.com/a1', 'https://n.news.naver.com/a3']);
    const r1 = rows.find((r) => r.url.endsWith('a1'))!;
    const r3 = rows.find((r) => r.url.endsWith('a3'))!;
    expect(r1.title).toBe('[네이버뉴스] 꼬마빌딩 "거래" 급증');
    expect(r1.title).not.toContain('&quot;');
    expect(r1.content).toBe('공실 & 임대');
    expect(r1.importance_score - r3.importance_score).toBe(4);
    // Mock LLM 응답은 저장하지 않는다
    expect(callLLMMock).toHaveBeenCalled();
    for (const call of callLLMMock.mock.calls) expect(call[1]).toEqual({ allowMock: false });
    // 프롬프트에서 "수치 반드시 포함" 제거
    const sys = (callLLMMock.mock.calls[0][0] as { systemPrompt: string }).systemPrompt;
    expect(sys).not.toContain('수치 반드시 포함');
    expect(sys).toContain('만들지 마세요');
  });
});

describe('trackNaverCommunity (social_sentiment)', () => {
  it('키가 없으면 [] 반환, DB 미접근 (더미 감성 적재 없음)', async () => {
    stubNoKeys();
    const { trackNaverCommunity } = await import('@/domain/external/naver-search');
    const { supabase, from } = makeSupabase();
    expect(await trackNaverCommunity(supabase)).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('mention_count 는 API 실측 total 을 그대로 쓴다(×34 추정 금지), total 이 없으면 미적재', async () => {
    vi.stubEnv('NAVER_CLIENT_ID', 'id');
    vi.stubEnv('NAVER_CLIENT_SECRET', 'secret');
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      n += 1;
      // 첫 키워드만 total 제공, 나머지는 total 누락
      const body = n === 1
        ? { total: 12345, items: [{ title: '공실 급증 &quot;상승&quot;', description: '돌파', link: 'x', cafename: '카페A' }] }
        : { items: [{ title: '하락', description: '공실', link: 'x', cafename: '카페B' }] };
      return { ok: true, json: async () => body };
    }));
    callLLMMock.mockRejectedValue(new Error('no llm')); // 휴리스틱 경로

    const { trackNaverCommunity } = await import('@/domain/external/naver-search');
    const { supabase, insert } = makeSupabase();
    await trackNaverCommunity(supabase);

    expect(insert).toHaveBeenCalledTimes(1);
    const rows = (insert.mock.calls[0] as unknown[])[0] as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].mention_count).toBe(12345);
    expect(rows[0].mention_count).not.toBe(10 * 34);
    expect(rows[0].analysis_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('fetchCommercialDistrict — 폴백 upsert 부재 (M2-05, 함정 15)', () => {
  it('SEMAS 키가 없으면 null, supabase.upsert 호출 0회', async () => {
    stubNoKeys();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { fetchCommercialDistrict } = await import('@/domain/external/gov-premium-apis');
    const { supabase, upsert, from } = makeSupabase();
    for (const code of ['D001', 'D002', 'D003', 'D999']) {
      expect(await fetchCommercialDistrict(supabase, code)).toBeNull();
    }
    expect(upsert).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('키가 있어도 API 실패/점포수 없음이면 null, upsert 호출 0회', async () => {
    stubNoKeys();
    vi.stubEnv('SEMAS_API_KEY', 'k');
    const { fetchCommercialDistrict } = await import('@/domain/external/gov-premium-apis');
    const { supabase, upsert } = makeSupabase();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect(await fetchCommercialDistrict(supabase, 'D001')).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    expect(await fetchCommercialDistrict(supabase, 'D002')).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ body: { totalCount: 0 } }) })));
    expect(await fetchCommercialDistrict(supabase, 'D003')).toBeNull();

    expect(upsert).not.toHaveBeenCalled();
  });

  it('실측 점포수가 있으면 그 값에서만 파생한 지수를 upsert 한다 (양성 대조)', async () => {
    stubNoKeys();
    vi.stubEnv('SEMAS_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ body: { totalCount: 1000 } }) })));
    const { fetchCommercialDistrict } = await import('@/domain/external/gov-premium-apis');
    const { supabase, upsert } = makeSupabase({ upsertResult: { data: { id: 'row' }, error: null } });
    const out = await fetchCommercialDistrict(supabase, 'D001');
    expect(out).toEqual({ id: 'row' });
    expect(upsert).toHaveBeenCalledTimes(1);
    const payload = (upsert.mock.calls[0] as unknown[])[0] as any;
    expect(payload.sales_volume_index).toBe(2);
    expect(payload.footfall_index).toBe(2.5);
  });

  it('DB upsert 오류도 throw 하지 않고 null (크론 Promise.all 보호) + 폴백 재시도 없음', async () => {
    stubNoKeys();
    vi.stubEnv('SEMAS_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ body: { totalCount: 1000 } }) })));
    const { fetchCommercialDistrict } = await import('@/domain/external/gov-premium-apis');
    const { supabase, upsert } = makeSupabase({ upsertResult: { data: null, error: { message: 'boom', code: 'XX' } } });
    expect(await fetchCommercialDistrict(supabase, 'D001')).toBeNull();
    expect(upsert).toHaveBeenCalledTimes(1); // 실데이터 1회만, 폴백 2회차 upsert 없음
  });
});

describe('fetchRentalTrend / fetchLandUsePlan / fetchRegisterSummary — 가짜 기본값 제거', () => {
  it('응답에 분기·공실률·임대지수가 없으면 아무것도 저장하지 않는다 (2.5 / 100 / "2026 Q1" 금지)', async () => {
    stubNoKeys();
    vi.stubEnv('MOLIT_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '<response><body></body></response>' })));
    const { fetchRentalTrend } = await import('@/domain/external/gov-premium-apis');
    const { supabase, insert, del, from } = makeSupabase();
    expect(await fetchRentalTrend(supabase, 'gbd')).toBeNull();
    expect(insert).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('용도지역 더미 upsert 제거, 등기부 스텁은 가짜 소유자/근저당 없이 unavailable', async () => {
    stubNoKeys();
    const { fetchLandUsePlan, fetchRegisterSummary } = await import('@/domain/external/gov-premium-apis');
    const { supabase, upsert } = makeSupabase();
    expect(await fetchLandUsePlan(supabase, '1168010100101230045')).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
    const reg = await fetchRegisterSummary('b-1');
    expect(reg.ok).toBe(false);
    expect(reg.summary).toBeNull();
    expect(JSON.stringify(reg)).not.toMatch(/신한은행|김\*수|cleannessScore/);
  });
});

describe('fetchCommercialDistrictFull (SEMAS full)', () => {
  it('키 없음 → null, DB 미접근', async () => {
    stubNoKeys();
    const { fetchCommercialDistrictFull } = await import('@/lib/external/semas-commercial-api');
    const { supabase, from } = makeSupabase();
    expect(await fetchCommercialDistrictFull(supabase, '1168010800000000000')).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('목록 API 가 점포수를 주지 않으면 500 등 기본값으로 지어내지 않고 null', async () => {
    stubNoKeys();
    vi.stubEnv('SEMAS_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    const { fetchCommercialDistrictFull } = await import('@/lib/external/semas-commercial-api');
    const { supabase, from } = makeSupabase();
    expect(await fetchCommercialDistrictFull(supabase, '1168010800000000000')).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('실측 점포수가 있어도 시뮬레이션 값이 섞인 분석을 commercial_district 에 캐시 upsert 하지 않는다', async () => {
    stubNoKeys();
    vi.stubEnv('SEMAS_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ body: { totalCount: 800, items: [] } }) })));
    const { fetchCommercialDistrictFull } = await import('@/lib/external/semas-commercial-api');
    const { supabase, from, upsert } = makeSupabase();
    const out = await fetchCommercialDistrictFull(supabase, '1168010800000000000');
    expect(out?.storeCount).toBe(800);
    expect(out?.topCategories).toEqual([]); // 가짜 음식40%/소매30% 금지
    expect(upsert).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe('getSourceAvailability / evaluateAvailability (M2-18)', () => {
  it('evaluateAvailability: 0건→no_rows, 오래됨→stale, 최신→available', async () => {
    const { evaluateAvailability } = await import('@/domain/external/market-crawlers');
    expect(evaluateAvailability(0, null, 14, '2026-10-05')).toMatchObject({ available: false, reason: 'no_rows' });
    expect(evaluateAvailability(5, '2026-08-01T00:00:00Z', 14, '2026-10-05')).toMatchObject({ available: false, reason: 'stale' });
    expect(evaluateAvailability(5, '2026-10-04T00:00:00Z', 14, '2026-10-05')).toMatchObject({ available: true });
    expect(evaluateAvailability(3, null, undefined, '2026-10-05')).toMatchObject({ available: true });
  });

  it('소스별 가용성: 실거래 0건은 가용 아님, 쿼리 오류는 query_error, 오래된 감성은 stale', async () => {
    const { getSourceAvailability } = await import('@/domain/external/market-crawlers');
    const results: Record<string, any> = {
      external_news: { count: 5, data: [{ created_at: '2026-10-04T01:00:00Z' }], error: null },
      external_transactions: { count: 0, data: [], error: null },
      auction_listings: { count: 2, data: [], error: null },
      external_reports: { count: 0, data: [], error: null },
      rental_trend_data: { count: null, data: null, error: { message: 'relation missing', code: '42P01' } },
      commercial_district: { count: 3, data: [], error: null },
      social_sentiment: { count: 605, data: [{ analysis_date: '2026-07-01' }], error: null },
      cre_pulses: { count: 8, data: [{ created_at: '2026-06-10T00:00:00Z' }], error: null },
    };
    const from = vi.fn((table: string) => ({ select: () => chain(results[table]) }));
    const av = await getSourceAvailability({ from } as any, new Date('2026-10-05T03:00:00Z'));

    expect(av.news).toMatchObject({ available: true, count: 5 });
    expect(av.transactions).toMatchObject({ available: false, count: 0, reason: 'no_rows' });
    expect(av.auctions).toMatchObject({ available: true, count: 2 });
    expect(av.reports.available).toBe(false);
    expect(av.rental).toMatchObject({ available: false, reason: 'query_error:42P01' });
    expect(av.commercial.available).toBe(true);
    expect(av.sentiment).toMatchObject({ available: false, reason: 'stale' });
    expect(av.pulse).toMatchObject({ available: false, reason: 'stale' });
  });
});

describe('CRESignalAggregator — 라벨/지역 통일 (D2-04, 함정 18)', () => {
  const NOW = new Date('2026-10-05T03:00:00Z'); // KST 2026-10-05 월요일 → ISO W41

  it('period 는 ISO `W41-2026`, 한글 지역은 코드로 정규화', async () => {
    const { CRESignalAggregator, getWeekLabel } = await import('@/domain/pulse/cre-signal-aggregator');
    const supabase = { from: () => chain({ count: 0, data: [], error: null }) } as any;
    const snap = await new CRESignalAggregator(supabase).generateWeeklySnapshot('강남구', NOW);
    expect(snap.period).toBe('W41-2026');
    expect(snap.region).toBe('gbd');
    expect(getWeekLabel(NOW)).toBe('W41-2026');
    expect(getWeekLabel(NOW)).not.toMatch(/^\d{4}-W/);
  });

  it('매핑 불가 지역은 기본 권역으로 대체하지 않고 오류', async () => {
    const { CRESignalAggregator } = await import('@/domain/pulse/cre-signal-aggregator');
    const supabase = { from: () => chain({ count: 0, data: [], error: null }) } as any;
    await expect(new CRESignalAggregator(supabase).generateWeeklySnapshot('??', NOW)).rejects.toThrow(/Unmapped pulse region/);
  });

  it('집계 쿼리 오류를 0 으로 삼키지 않는다', async () => {
    const { CRESignalAggregator, SignalQueryError } = await import('@/domain/pulse/cre-signal-aggregator');
    const supabase = { from: () => chain({ count: null, data: null, error: { message: 'bad column', code: '42703' } }) } as any;
    await expect(new CRESignalAggregator(supabase).generateWeeklySnapshot('gbd', NOW)).rejects.toBeInstanceOf(SignalQueryError);
  });
});
