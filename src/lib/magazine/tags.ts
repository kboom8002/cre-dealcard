/**
 * src/lib/magazine/tags.ts — 관심 태그 사전 단일 출처 (I-03, G-03/E-06 속보 타깃 매칭)
 *
 * 합집합 출처:
 *  - 구독 폼 `(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx` REGION_OPTIONS/ASSET_OPTIONS
 *  - 에디터 `EditorOutreachTab.tsx` 태그 목록(강남·서초·마포·종로·영등포·성동·용산·송파·강동·관악 / 꼬마빌딩·오피스텔·상가·지식산업센터·토지·다가구·근생)
 *
 * 저장 규칙(DC-9): 구독자의 태그는 `interest_profile.tags = { regions: string[], assetTypes: string[], topics?, hobbies? }`.
 * 레거시 입력(에디터의 '강남' 같은 세부 값)은 **저장은 원문 유지, 매칭은 정규화** 한다 → matchTags가 양쪽을 canonical 라벨로 변환해 비교.
 */

export interface TagDef {
  /** 화면/저장에 쓰는 canonical 라벨 */
  label: string;
  /** canonical로 취급할 별칭(부분 포함 매칭, 2자 이상) */
  aliases: readonly string[];
}

/** 권역 사전 */
export const REGION_TAGS: readonly TagDef[] = [
  { label: '강남·서초', aliases: ['강남', '서초', '역삼', '논현', '삼성동', '반포', '방배', '압구정', '청담'] },
  { label: '마포·홍대', aliases: ['마포', '홍대', '합정', '상수', '연남', '망원', '서교'] },
  { label: '성수·성동', aliases: ['성수', '성동', '왕십리', '행당', '금호'] },
  { label: '여의도·영등포', aliases: ['여의도', '영등포', '문래', '당산'] },
  { label: '종로·중구', aliases: ['종로', '중구', '을지로', '광화문', '명동', '충무로'] },
  { label: '송파·잠실', aliases: ['송파', '잠실', '문정', '가락', '석촌'] },
  { label: '판교·분당', aliases: ['판교', '분당', '성남', '정자'] },
  { label: '용산', aliases: ['용산', '이태원', '한남', '삼각지'] },
  { label: '강동', aliases: ['강동', '천호', '길동', '둔촌'] },
  { label: '관악', aliases: ['관악', '신림', '봉천', '서울대입구'] },
  { label: '기타 수도권', aliases: [] },
];

/** 자산 유형 사전 */
export const ASSET_TAGS: readonly TagDef[] = [
  { label: '꼬마빌딩', aliases: ['꼬마빌딩', '꼬마 빌딩', '소형빌딩', '소형 빌딩'] },
  { label: '상가·근생', aliases: ['상가', '근생', '근린생활', '리테일'] },
  { label: '사옥용 빌딩', aliases: ['사옥', '오피스빌딩', '오피스 빌딩'] },
  { label: '오피스텔', aliases: ['오피스텔'] },
  { label: '재건축·개발부지', aliases: ['재건축', '개발부지', '개발 부지', '리모델링'] },
  { label: '지식산업센터', aliases: ['지식산업센터', '지산'] },
  { label: '토지', aliases: ['토지', '대지'] },
  { label: '다가구', aliases: ['다가구', '다세대'] },
];

export const REGION_LABELS: readonly string[] = REGION_TAGS.map((t) => t.label);
export const ASSET_LABELS: readonly string[] = ASSET_TAGS.map((t) => t.label);

/** 한 구독자가 가질 수 있는 최대 태그 수 / 태그 최대 길이 */
export const MAX_TAGS = 30;
export const MAX_TAG_LENGTH = 30;

export type TagKind = 'region' | 'asset';

function clean(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

function compact(s: string): string {
  return s.replace(/[\s·・,/]/g, '');
}

function findCanonical(defs: readonly TagDef[], raw: string): string | null {
  const t = clean(raw);
  if (!t || t.length > MAX_TAG_LENGTH * 2) return null;
  // 1) canonical 라벨 정확 일치
  const exact = defs.find((d) => d.label === t || compact(d.label) === compact(t));
  if (exact) return exact.label;
  // 2) 별칭 정확 일치
  const aliasExact = defs.find((d) => d.aliases.some((a) => a === t));
  if (aliasExact) return aliasExact.label;
  // 3) 입력 안에 별칭 포함 ('강남구 역삼동' → 강남·서초). 긴 별칭 우선으로 오탐 감소.
  let best: { label: string; len: number } | null = null;
  for (const d of defs) {
    for (const a of d.aliases) {
      if (a.length >= 2 && t.includes(a) && (!best || a.length > best.len)) best = { label: d.label, len: a.length };
    }
  }
  return best?.label ?? null;
}

export function canonicalRegion(raw: unknown): string | null {
  return findCanonical(REGION_TAGS, clean(raw));
}

export function canonicalAsset(raw: unknown): string | null {
  return findCanonical(ASSET_TAGS, clean(raw));
}

/** 태그 문자열이 어느 사전에 속하는지 판정 (권역 우선). 사전에 없으면 null. */
export function classifyTag(raw: unknown): { kind: TagKind; label: string } | null {
  const r = canonicalRegion(raw);
  if (r) return { kind: 'region', label: r };
  const a = canonicalAsset(raw);
  if (a) return { kind: 'asset', label: a };
  return null;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return [];
}

export interface TagGroups {
  regions: string[];
  assetTypes: string[];
}

/**
 * 태그 입력(평탄 배열 또는 `{regions, assetTypes}` 구조)을 canonical 권역/자산 그룹으로 변환.
 * 사전에 없는 값은 버린다. 순서는 입력 순, 중복 제거.
 */
export function normalizeTagGroups(input: unknown): TagGroups {
  const regions: string[] = [];
  const assets: string[] = [];
  const push = (arr: string[], v: string | null) => {
    if (v && !arr.includes(v)) arr.push(v);
  };
  if (Array.isArray(input)) {
    for (const raw of input) {
      const c = classifyTag(raw);
      if (!c) continue;
      push(c.kind === 'region' ? regions : assets, c.label);
    }
  } else if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    for (const raw of toStringArray(o.regions)) push(regions, canonicalRegion(raw));
    for (const raw of toStringArray(o.assetTypes)) push(assets, canonicalAsset(raw));
  }
  return { regions, assetTypes: assets };
}

/** canonical 평탄 태그 목록 (권역 먼저, 자산 다음). 사전에 없는 값은 제외. */
export function normalizeTags(input: unknown): string[] {
  const g = normalizeTagGroups(input);
  return [...g.regions, ...g.assetTypes].slice(0, MAX_TAGS);
}

/**
 * 공개 구독 등 외부 입력 검증용 어댑터 — `validateSubscribeInput`의 `deps.normalizeTags` 시그니처와 동일.
 * 사전에 없는 태그가 하나라도 있으면 실패.
 */
export function validateTagList(tags: string[]): { ok: true; tags: string[] } | { ok: false; message: string } {
  if (!Array.isArray(tags)) return { ok: false, message: '관심 태그 형식이 올바르지 않습니다.' };
  if (tags.length > MAX_TAGS) return { ok: false, message: `관심 태그는 최대 ${MAX_TAGS}개까지 선택할 수 있습니다.` };
  for (const t of tags) {
    if (typeof t !== 'string' || t.length > MAX_TAG_LENGTH || !classifyTag(t)) {
      return { ok: false, message: '지원하지 않는 관심 태그가 포함되어 있습니다.' };
    }
  }
  return { ok: true, tags: normalizeTags(tags) };
}

/**
 * 저장용 정리: 원문 값을 유지하되 문자열만 trim·중복 제거·길이/개수 제한 (에디터 레거시 세부 값 보존).
 */
export function sanitizeTagStrings(input: unknown, max = MAX_TAGS): string[] {
  const out: string[] = [];
  for (const raw of toStringArray(input)) {
    const t = clean(raw);
    if (!t || t.length > MAX_TAG_LENGTH || out.includes(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function overlaps(a: readonly string[], b: readonly string[]): boolean {
  return a.some((x) => b.includes(x));
}

/**
 * 구독자 태그 ↔ 타깃(권역·자산) 매칭.
 *  - subscriberTags: 평탄 `string[]` 또는 `{ regions, assetTypes }`(= interest_profile.tags)
 *  - 규칙: (권역 교집합) AND (자산 교집합). 태그가 아예 없는 구독자는 제외.
 *  - 타깃의 한쪽 차원이 비어 있으면 그 차원은 제약하지 않는다. 단 두 차원 모두 비면 false(무제한 발송 방지).
 *  - 제약 차원에서 구독자가 해당 차원 태그를 하나도 안 가졌으면 false.
 *  - 타깃·구독자 양쪽 모두 canonical 라벨로 변환해 비교한다('강남' ≡ '강남·서초').
 */
export function matchTags(
  subscriberTags: unknown,
  targetRegions: readonly string[] | null | undefined,
  targetAssets: readonly string[] | null | undefined,
): boolean {
  const sub = normalizeTagGroups(subscriberTags);
  if (sub.regions.length === 0 && sub.assetTypes.length === 0) return false;

  const tRegions = normalizeTagGroups({ regions: targetRegions ?? [] }).regions;
  const tAssets = normalizeTagGroups({ assetTypes: targetAssets ?? [] }).assetTypes;
  // 타깃에 값은 있는데 사전으로 해석되지 않으면(알 수 없는 권역) 안전하게 비매칭 처리
  const regionConstrained = (targetRegions ?? []).length > 0;
  const assetConstrained = (targetAssets ?? []).length > 0;
  if (!regionConstrained && !assetConstrained) return false;

  if (regionConstrained && !overlaps(sub.regions, tRegions)) return false;
  if (assetConstrained && !overlaps(sub.assetTypes, tAssets)) return false;
  return true;
}

/** 저장 허용 태그 그룹 키 (에디터 UI 호환: regions/assetTypes/topics/hobbies). */
export const TAG_GROUP_KEYS = ['regions', 'assetTypes', 'topics', 'hobbies'] as const;
export type TagGroupKey = (typeof TAG_GROUP_KEYS)[number];

/**
 * `{regions, assetTypes, topics, hobbies}` 레코드 정리: 허용 키만, 각 값은 sanitizeTagStrings.
 * 입력에 없는 그룹은 결과에도 없다(= 병합 시 기존 값 보존).
 */
export function sanitizeTagRecord(input: unknown): Partial<Record<TagGroupKey, string[]>> {
  const out: Partial<Record<TagGroupKey, string[]>> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const o = input as Record<string, unknown>;
  for (const k of TAG_GROUP_KEYS) {
    if (k in o) out[k] = sanitizeTagStrings(o[k]);
  }
  return out;
}

/**
 * interest_profile 병합 업데이트 (T2-10): 기존 필드를 보존하고, 입력된 키만 덮어쓴다.
 *  - 태그는 `interest_profile.tags` 로 통일. 입력 tags(또는 레거시 interest_tags)에 있는 그룹만 교체, 나머지 그룹은 유지.
 *  - incomingProfile.tags 가 있으면 레거시 interest_tags 보다 먼저 적용, interest_tags 가 우선.
 *  - 객체가 아닌 기존/입력 값은 {} 로 취급.
 */
export function mergeInterestProfile(
  existing: unknown,
  incomingProfile?: unknown,
  incomingTags?: unknown,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {};
  const baseTags =
    base.tags && typeof base.tags === 'object' && !Array.isArray(base.tags) ? { ...(base.tags as Record<string, unknown>) } : {};

  let tags: Record<string, unknown> = baseTags;
  if (incomingProfile && typeof incomingProfile === 'object' && !Array.isArray(incomingProfile)) {
    const { tags: profTags, ...rest } = incomingProfile as Record<string, unknown>;
    Object.assign(base, rest);
    if (profTags !== undefined) tags = { ...tags, ...sanitizeTagRecord(profTags) };
  }
  if (incomingTags !== undefined) tags = { ...tags, ...sanitizeTagRecord(incomingTags) };

  base.tags = tags;
  return base;
}
