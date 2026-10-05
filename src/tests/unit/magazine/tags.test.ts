/**
 * 관심 태그 사전/매칭 (I-03, DC-9) — 튜토리얼 예시 포함
 */
import { describe, expect, it } from 'vitest';
import {
  ASSET_LABELS,
  REGION_LABELS,
  canonicalAsset,
  canonicalRegion,
  matchTags,
  mergeInterestProfile,
  normalizeTagGroups,
  normalizeTags,
  sanitizeTagRecord,
  validateTagList,
} from '@/lib/magazine/tags';

describe('태그 사전', () => {
  it('구독 폼·에디터의 기존 옵션이 모두 사전에 포함된다(합집합)', () => {
    // SubscribeFormClient
    for (const r of ['강남·서초', '성수·성동', '마포·홍대', '종로·중구', '송파·잠실', '기타 수도권']) {
      expect(REGION_LABELS, r).toContain(r);
    }
    for (const a of ['꼬마빌딩', '상가·근생', '사옥용 빌딩', '재건축·개발부지', '오피스텔']) {
      expect(ASSET_LABELS, a).toContain(a);
    }
    // EditorOutreachTab (세부 값은 canonical로 해석되어야 함)
    for (const r of ['강남', '서초', '마포', '종로', '영등포', '성동', '용산', '송파', '강동', '관악']) {
      expect(canonicalRegion(r), r).not.toBeNull();
    }
    for (const a of ['꼬마빌딩', '오피스텔', '상가', '지식산업센터', '토지', '다가구', '근생']) {
      expect(canonicalAsset(a), a).not.toBeNull();
    }
    // 스펙 예시
    expect(REGION_LABELS).toEqual(expect.arrayContaining(['여의도·영등포', '판교·분당']));
  });

  it('canonical 변환: 세부 값/주소 문자열', () => {
    expect(canonicalRegion('강남')).toBe('강남·서초');
    expect(canonicalRegion('서초구')).toBe('강남·서초');
    expect(canonicalRegion('성수동2가')).toBe('성수·성동');
    expect(canonicalRegion('서울 마포구 합정동')).toBe('마포·홍대');
    expect(canonicalRegion('여의도')).toBe('여의도·영등포');
    expect(canonicalRegion('판교')).toBe('판교·분당');
    expect(canonicalRegion('화성시')).toBeNull();
    expect(canonicalAsset('사옥')).toBe('사옥용 빌딩');
    expect(canonicalAsset('근생')).toBe('상가·근생');
    expect(canonicalAsset('비행기')).toBeNull();
  });

  it('normalizeTags: 중복 제거·canonical·사전 외 값 제외', () => {
    expect(normalizeTags(['강남', '강남·서초', '꼬마빌딩', '외계행성', '  꼬마빌딩 '])).toEqual(['강남·서초', '꼬마빌딩']);
    expect(normalizeTags({ regions: ['마포'], assetTypes: ['사옥'] })).toEqual(['마포·홍대', '사옥용 빌딩']);
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags('강남')).toEqual([]); // 문자열 단독 입력은 지원하지 않음
  });

  it('normalizeTagGroups: 평탄 배열을 권역/자산으로 분류', () => {
    expect(normalizeTagGroups(['성수·성동', '오피스텔', '강동'])).toEqual({
      regions: ['성수·성동', '강동'],
      assetTypes: ['오피스텔'],
    });
  });

  it('validateTagList: 사전 외 태그·과다 개수는 거부 (ValidateDeps 어댑터 시그니처)', () => {
    expect(validateTagList(['강남·서초', '꼬마빌딩'])).toEqual({ ok: true, tags: ['강남·서초', '꼬마빌딩'] });
    const bad = validateTagList(['강남·서초', '<script>']);
    expect(bad.ok).toBe(false);
    const many = validateTagList(Array.from({ length: 31 }, () => '강남'));
    expect(many.ok).toBe(false);
  });
});

describe('matchTags — 권역 교집합 AND 자산 교집합', () => {
  it('튜토리얼 예: 강남·서초 + 꼬마빌딩 구독자는 (강남, 꼬마빌딩) 속보 수신', () => {
    expect(matchTags({ regions: ['강남·서초'], assetTypes: ['꼬마빌딩'] }, ['강남구 역삼동'], ['꼬마빌딩'])).toBe(true);
  });

  it('튜토리얼 예: 마포·홍대 + 사옥 구독자는 (강남, 꼬마빌딩) 속보 미수신', () => {
    expect(matchTags({ regions: ['마포·홍대'], assetTypes: ['사옥용 빌딩'] }, ['강남'], ['꼬마빌딩'])).toBe(false);
  });

  it('권역만 일치/자산만 일치 → 미수신 (AND)', () => {
    expect(matchTags({ regions: ['강남·서초'], assetTypes: ['오피스텔'] }, ['강남'], ['꼬마빌딩'])).toBe(false);
    expect(matchTags({ regions: ['마포·홍대'], assetTypes: ['꼬마빌딩'] }, ['강남'], ['꼬마빌딩'])).toBe(false);
  });

  it('태그 없는 구독자는 제외', () => {
    expect(matchTags({}, ['강남'], ['꼬마빌딩'])).toBe(false);
    expect(matchTags({ regions: [], assetTypes: [] }, ['강남'], ['꼬마빌딩'])).toBe(false);
    expect(matchTags([], ['강남'], ['꼬마빌딩'])).toBe(false);
    expect(matchTags(null, ['강남'], ['꼬마빌딩'])).toBe(false);
  });

  it('평탄 배열 입력과 에디터 레거시 세부 값(강남)도 매칭된다', () => {
    expect(matchTags(['강남·서초', '꼬마빌딩'], ['강남'], ['꼬마빌딩'])).toBe(true);
    expect(matchTags({ regions: ['강남'], assetTypes: ['꼬마빌딩'] }, ['강남·서초'], ['꼬마빌딩'])).toBe(true);
  });

  it('구독자가 자산 태그만 있으면 권역 제약 시 미수신', () => {
    expect(matchTags({ assetTypes: ['꼬마빌딩'] }, ['강남'], ['꼬마빌딩'])).toBe(false);
  });

  it('타깃 양쪽이 모두 비면 false (무제한 발송 방지), 한쪽만 지정하면 그 차원만 비교', () => {
    expect(matchTags({ regions: ['강남·서초'], assetTypes: ['꼬마빌딩'] }, [], [])).toBe(false);
    expect(matchTags({ regions: ['강남·서초'], assetTypes: ['꼬마빌딩'] }, ['강남'], [])).toBe(true);
    expect(matchTags({ regions: ['강남·서초'], assetTypes: ['꼬마빌딩'] }, [], ['꼬마빌딩'])).toBe(true);
  });

  it('해석할 수 없는 타깃 권역은 비매칭', () => {
    expect(matchTags({ regions: ['강남·서초'], assetTypes: ['꼬마빌딩'] }, ['알수없는동네'], ['꼬마빌딩'])).toBe(false);
  });
});

describe('interest_profile 병합 (T2-10)', () => {
  const existing = {
    budgetRange: { min: 2_000_000_000, max: 5_000_000_000 },
    readArticleCount: 4,
    tags: { regions: ['강남'], assetTypes: ['꼬마빌딩'], topics: ['세금'] },
  };

  it('태그 일부 그룹만 갱신하면 기존 다른 필드·그룹이 보존된다', () => {
    const merged = mergeInterestProfile(existing, undefined, { regions: ['마포', '마포', ' 성수 '] });
    expect(merged.budgetRange).toEqual(existing.budgetRange);
    expect(merged.readArticleCount).toBe(4);
    expect(merged.tags).toEqual({ regions: ['마포', '성수'], assetTypes: ['꼬마빌딩'], topics: ['세금'] });
  });

  it('interest_profile 입력은 얕게 병합, tags 키는 그룹 단위 병합, 알 수 없는 그룹 키는 버린다', () => {
    const merged = mergeInterestProfile(existing, { readArticleCount: 9, tags: { assetTypes: ['오피스텔'], evil: ['x'] } });
    expect(merged.readArticleCount).toBe(9);
    expect(merged.budgetRange).toEqual(existing.budgetRange);
    expect(merged.tags).toEqual({ regions: ['강남'], assetTypes: ['오피스텔'], topics: ['세금'] });
  });

  it('기존 값이 null/비객체여도 안전', () => {
    expect(mergeInterestProfile(null, undefined, { regions: ['강남'] })).toEqual({ tags: { regions: ['강남'] } });
    expect(mergeInterestProfile('oops', undefined, undefined)).toEqual({ tags: {} });
  });

  it('sanitizeTagRecord: 허용 키만, 문자열만, 길이/중복 정리', () => {
    expect(sanitizeTagRecord({ regions: ['강남', '강남', 3, ''], hobbies: ['골프'], x: ['y'] })).toEqual({
      regions: ['강남'],
      hobbies: ['골프'],
    });
    expect(sanitizeTagRecord('nope')).toEqual({});
    expect(sanitizeTagRecord({ regions: ['가'.repeat(31)] })).toEqual({ regions: [] });
  });
});
