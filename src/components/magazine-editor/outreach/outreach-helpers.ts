/**
 * 아웃리치 탭 순수 로직 (E-02 아웃리치, T1-22/T2-24b/T2-29a·b)
 * — UI 컴포넌트에서 분리해 jsdom 없이 단위테스트한다.
 */
import {
  ASSET_LABELS,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  REGION_LABELS,
  TAG_GROUP_KEYS,
  canonicalAsset,
  canonicalRegion,
  classifyTag,
  type TagGroupKey,
} from '@/lib/magazine/tags';
import { GENERIC_ERROR_MESSAGE, toUserMessage } from '@/lib/magazine/user-message';
import { digitsOnly, isPlausiblePhoneDigits } from '@/lib/magazine/phone-input';

// ─────────────────────────────────────────────────────────────
// API 오류 해석 (jsonError `{ok:false,error:{code,message}}` / `{error:'문자열', code}` / `{message}` 모두 수용)
// ─────────────────────────────────────────────────────────────

export interface ApiErrorInfo {
  code: string | null;
  message: string;
}

const KOREAN_RE = /[가-힣]/;

/** 서버가 준 사용자용(한글, 120자 이하) 문구만 그대로 쓰고, 그 외는 일반화한다(내부 오류 노출 금지). */
export function extractApiError(json: unknown, status: number): ApiErrorInfo {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  let code: string | null = typeof j.code === 'string' ? j.code : null;
  let cand = '';
  const err = j.error;
  if (typeof err === 'string') cand = err;
  else if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.code === 'string') code = e.code;
    if (typeof e.message === 'string') cand = e.message;
  }
  if (!cand && typeof j.message === 'string') cand = j.message;
  if (cand && KOREAN_RE.test(cand) && cand.length <= 120) return { code, message: cand };
  return { code, message: toUserMessage(null, status) };
}

/** fetch 자체가 실패(네트워크)한 경우 문구 */
export function networkErrorMessage(err: unknown): string {
  return toUserMessage(err);
}

export { GENERIC_ERROR_MESSAGE };

// ─────────────────────────────────────────────────────────────
// 구독자 상태 / 표시
// ─────────────────────────────────────────────────────────────

export type SubscriberStatus = 'active' | 'paused' | 'unsubscribed';

export const SUBSCRIBER_STATUS_LABEL: Record<string, string> = {
  active: '수신 중',
  paused: '일시정지',
  unsubscribed: '수신거부',
  purged: '삭제됨',
};

export function statusLabel(status: string | null | undefined): string {
  return SUBSCRIBER_STATUS_LABEL[status ?? ''] ?? '알 수 없음';
}

/** 수신거부(또는 삭제 처리)된 구독자 — 편집·재활성화·AutoIntent 대상 아님 */
export function isUnsubscribedLike(sub: { status?: string | null; unsubscribed_at?: string | null }): boolean {
  return sub.status === 'unsubscribed' || sub.status === 'purged' || !!sub.unsubscribed_at;
}

/** 확인 전(pending) 구독자의 사유 (서버 derivePendingReason 결과를 그대로 받는다) */
export const PENDING_REASON_BADGE = '확인 채널 없음';
export const PENDING_REASON_NOTICE =
  '이메일이 없어 수신 확인 링크를 보낼 수 없어요. 확인 전에는 발송되지 않아요. 이메일 주소를 받아 추가해 주세요.';

export function pendingReasonInfo(reason: unknown): { badge: string; notice: string } | null {
  if (reason === 'NO_EMAIL_CONFIRM_CHANNEL') return { badge: PENDING_REASON_BADGE, notice: PENDING_REASON_NOTICE };
  return null;
}

// ─────────────────────────────────────────────────────────────
// 태그 편집 (사전 + 자유 입력). 저장 위치는 interest_profile.tags (DC-9)
// ─────────────────────────────────────────────────────────────

export type TagRecord = Record<TagGroupKey, string[]>;

export const TAG_GROUP_LABELS: Record<TagGroupKey, string> = {
  regions: '관심 권역',
  assetTypes: '자산 유형',
  topics: '관심 토픽',
  hobbies: '취미',
};

/** 그룹별 프리셋(사전). topics/hobbies 는 자유 입력 위주 */
export const TAG_PRESETS: Record<TagGroupKey, readonly string[]> = {
  regions: REGION_LABELS,
  assetTypes: ASSET_LABELS,
  topics: ['경매', '공매', '재건축', '리모델링', '신축', 'NPL', '세금', '금리'],
  hobbies: ['골프', '와인', '미술', '자동차', '여행', '독서', '낚시'],
};

export function emptyTagRecord(): TagRecord {
  return { regions: [], assetTypes: [], topics: [], hobbies: [] };
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** 구독자 행 → 편집용 태그. interest_profile.tags 우선, 레거시 interest_tags 폴백. */
export function readSubscriberTags(sub: {
  interest_profile?: unknown;
  interest_tags?: unknown;
}): TagRecord {
  const out = emptyTagRecord();
  const prof = sub.interest_profile && typeof sub.interest_profile === 'object' ? (sub.interest_profile as Record<string, unknown>) : {};
  const tagsRaw = prof.tags && typeof prof.tags === 'object' && !Array.isArray(prof.tags) ? (prof.tags as Record<string, unknown>) : null;
  const legacy =
    sub.interest_tags && typeof sub.interest_tags === 'object' && !Array.isArray(sub.interest_tags)
      ? (sub.interest_tags as Record<string, unknown>)
      : null;
  const src = tagsRaw ?? legacy ?? {};
  for (const k of TAG_GROUP_KEYS) out[k] = strArr(src[k]);
  return out;
}

export function countTags(rec: TagRecord): number {
  return TAG_GROUP_KEYS.reduce((n, k) => n + rec[k].length, 0);
}

export interface AddTagResult {
  record: TagRecord;
  added: boolean;
  group: TagGroupKey | null;
  /** 추가하지 않은 이유(사용자 표시용) */
  reason?: string;
}

/**
 * 태그 추가. group 을 주면 그 그룹에, 안 주면 사전(classifyTag)으로 권역/자산을 판별하고 사전에 없으면 topics 로 넣는다.
 * 권역·자산은 canonical 라벨로 저장해 속보 매칭(matchTags)에서 안정적으로 일치시킨다.
 */
export function addTag(rec: TagRecord, raw: string, group?: TagGroupKey): AddTagResult {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (!value) return { record: rec, added: false, group: null, reason: '태그를 입력해 주세요.' };
  if (value.length > MAX_TAG_LENGTH) {
    return { record: rec, added: false, group: null, reason: `태그는 ${MAX_TAG_LENGTH}자 이내로 입력해 주세요.` };
  }
  if (countTags(rec) >= MAX_TAGS) {
    return { record: rec, added: false, group: null, reason: `태그는 최대 ${MAX_TAGS}개까지 추가할 수 있어요.` };
  }

  let target: TagGroupKey;
  let stored = value;
  if (group === 'regions') {
    target = 'regions';
    stored = canonicalRegion(value) ?? value;
  } else if (group === 'assetTypes') {
    target = 'assetTypes';
    stored = canonicalAsset(value) ?? value;
  } else if (group) {
    target = group;
  } else {
    const c = classifyTag(value);
    if (c) {
      target = c.kind === 'region' ? 'regions' : 'assetTypes';
      stored = c.label;
    } else {
      target = 'topics';
    }
  }

  if (rec[target].includes(stored)) {
    return { record: rec, added: false, group: target, reason: '이미 추가된 태그예요.' };
  }
  return { record: { ...rec, [target]: [...rec[target], stored] }, added: true, group: target };
}

export function removeTag(rec: TagRecord, group: TagGroupKey, value: string): TagRecord {
  return { ...rec, [group]: rec[group].filter((t) => t !== value) };
}

export function tagRecordsEqual(a: TagRecord, b: TagRecord): boolean {
  return TAG_GROUP_KEYS.every((k) => a[k].length === b[k].length && a[k].every((t, i) => t === b[k][i]));
}

/** PATCH /api/broker/magazine/subscribers/[id] 본문 — 태그는 interest_profile.tags 로만 보낸다. */
export function buildTagsPatch(rec: TagRecord): { interest_profile: { tags: TagRecord } } {
  return { interest_profile: { tags: { regions: rec.regions, assetTypes: rec.assetTypes, topics: rec.topics, hobbies: rec.hobbies } } };
}

// ─────────────────────────────────────────────────────────────
// 구독자 추가 폼 검증 (동의 보증 필수)
// ─────────────────────────────────────────────────────────────

export const CONSENT_ATTEST_TEXT = '고객이 수신에 동의했음을 확인합니다';
export const CONSENT_ATTEST_HINT =
  '정보통신망법상 광고성 정보 수신 동의를 받은 고객만 추가할 수 있어요. 동의 보증은 기록으로 남습니다.';

export type AddChannel = 'kakao' | 'email' | 'both';

/** 채널 라벨 SSOT — 추가 폼·목록 필터·상세 모달이 모두 이 상수를 쓴다. */
export const CHANNEL_LABEL: Record<AddChannel, string> = {
  kakao: '카카오톡',
  email: '이메일',
  both: '둘 다',
};

export interface AddSubscriberInput {
  name: string;
  phone: string;
  email: string;
  channel: AddChannel;
  attested: boolean;
}

export type AddFieldErrors = Partial<Record<'name' | 'phone' | 'email' | 'attested', string>>;

/**
 * 입력이 바뀐 뒤 '이미 표시 중인 오류'만 현재 값 기준으로 재계산한다.
 *  - 해소된 오류는 사라지고(예: 채널을 '카카오톡'으로 바꾸면 '이메일 필요' 오류 해제),
 *  - 여전히 유효하지 않으면 최신 문구로 갱신된다(이메일 비움→형식 오류 등).
 *  - 아직 오류가 없던 필드는 건드리지 않는다(입력 중 조기 경고 방지).
 */
export function refreshAddErrors(next: AddSubscriberInput, prev: AddFieldErrors): AddFieldErrors {
  const v = validateAddSubscriber(next);
  const current: AddFieldErrors = v.ok ? {} : v.errors;
  const out: AddFieldErrors = {};
  for (const key of Object.keys(prev) as Array<keyof AddFieldErrors>) {
    if (prev[key] && current[key]) out[key] = current[key];
  }
  return out;
}

export interface AddSubscriberPayload {
  name: string;
  phone: string;
  email?: string;
  channel: AddChannel;
  consentAttested: true;
}

export type AddSubscriberValidation =
  | { ok: true; payload: AddSubscriberPayload }
  | { ok: false; errors: Partial<Record<'name' | 'phone' | 'email' | 'attested', string>> };

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

export function validateAddSubscriber(input: AddSubscriberInput): AddSubscriberValidation {
  const errors: Partial<Record<'name' | 'phone' | 'email' | 'attested', string>> = {};
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) errors.name = '이름을 입력해 주세요.';
  else if (name.length > 100) errors.name = '이름은 100자 이내로 입력해 주세요.';
  if (!isPlausiblePhoneDigits(input.phone)) errors.phone = '휴대폰 번호를 숫자 10~11자리로 입력해 주세요.';
  if (email && !EMAIL_RE.test(email)) errors.email = '이메일 형식을 확인해 주세요.';
  if ((input.channel === 'email' || input.channel === 'both') && !email) {
    errors.email = '이메일 수신을 선택하면 이메일 주소가 필요해요.';
  }
  if (!input.attested) errors.attested = '수신 동의 확인에 체크해 주세요.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      name,
      phone: digitsOnly(input.phone),
      ...(email ? { email } : {}),
      channel: input.channel,
      consentAttested: true,
    },
  };
}

/** POST subscribers 응답 → 사용자 안내 */
export function describeAddResponse(
  status: number,
  json: unknown,
): { kind: 'created' | 'existing' | 'unsubscribed' | 'error'; message: string } {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  if (status >= 200 && status < 300 && j.success !== false) {
    if (j.existing === true) return { kind: 'existing', message: '이미 등록된 구독자예요. 기존 정보를 그대로 유지했어요.' };
    if (j.consentRecorded === false) {
      return { kind: 'created', message: '구독자를 추가했어요. 단, 동의 기록 저장 기능이 아직 준비되지 않아 동의 이력은 남지 않았어요.' };
    }
    return { kind: 'created', message: '구독자를 추가했어요.' };
  }
  const info = extractApiError(json, status);
  if (status === 409 && info.code === 'UNSUBSCRIBED') {
    return { kind: 'unsubscribed', message: '수신거부한 고객이에요. 고객 본인이 구독 페이지에서 직접 다시 구독해야 합니다.' };
  }
  return { kind: 'error', message: info.message };
}

// ─────────────────────────────────────────────────────────────
// AutoIntent 응답 (count 기준 — created 의존 제거, T2-29b)
// ─────────────────────────────────────────────────────────────

export function describeIntentResult(
  ok: boolean,
  status: number,
  json: unknown,
): { tone: 'success' | 'info' | 'error'; message: string } {
  if (!ok) return { tone: 'error', message: extractApiError(json, status).message };
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const count = typeof j.count === 'number' && Number.isFinite(j.count) ? j.count : 0;
  if (count > 0) {
    const failed = typeof j.failed === 'number' && j.failed > 0 ? ` (${j.failed}건은 만들지 못했어요)` : '';
    return { tone: 'success', message: `${count}건의 매수 의향서 초안을 만들었어요.${failed}` };
  }
  if (j.reason === 'NO_EVIDENCE') {
    return {
      tone: 'info',
      message: '관심 권역·자산·예산 정보가 부족해 의향서를 만들지 않았어요. 구독자 태그와 예산 입력이 필요합니다.',
    };
  }
  const dup = typeof j.skippedDuplicates === 'number' ? j.skippedDuplicates : 0;
  if (dup > 0) return { tone: 'info', message: `이미 만들어진 의향서 ${dup}건이 있어 새로 만들지 않았어요.` };
  return { tone: 'info', message: '새로 만들 매수 의향서가 없어요.' };
}

// ─────────────────────────────────────────────────────────────
// 열람 이력 (analytics GET ?subscriberId 응답 — E4가 확장해도 방어적으로 읽는다)
// ─────────────────────────────────────────────────────────────

export interface HistoryEvent {
  type: string;
  at: string | null;
  sectionId: string | null;
  dwellSeconds: number | null;
}

export interface SubscriberHistory {
  totalViews: number;
  avgDwellSeconds: number;
  lastActivityAt: string | null;
  sections: string[];
  events: HistoryEvent[];
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function parseSubscriberHistory(json: unknown): SubscriberHistory | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  const a = (root.analytics && typeof root.analytics === 'object' ? root.analytics : root.history && typeof root.history === 'object' ? root.history : null) as
    | Record<string, unknown>
    | null;
  if (!a) return null;
  const rawEvents = Array.isArray(a.recentEvents) ? a.recentEvents : Array.isArray(a.events) ? a.events : [];
  const events: HistoryEvent[] = rawEvents
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({
      type: typeof e.event_type === 'string' ? e.event_type : typeof e.type === 'string' ? e.type : 'unknown',
      at: typeof e.created_at === 'string' ? e.created_at : typeof e.at === 'string' ? e.at : null,
      sectionId: typeof e.section_id === 'string' ? e.section_id : typeof e.sectionId === 'string' ? e.sectionId : null,
      dwellSeconds: typeof e.dwell_seconds === 'number' ? e.dwell_seconds : typeof e.dwellSeconds === 'number' ? e.dwellSeconds : null,
    }));
  return {
    totalViews: num(a.totalViews),
    avgDwellSeconds: num(a.avgDwellSeconds),
    lastActivityAt: typeof a.lastActivityAt === 'string' ? a.lastActivityAt : null,
    sections: strArr(a.viewedSections ?? a.sections),
    events,
  };
}

const EVENT_LABELS: Record<string, string> = {
  page_view: '매거진 열람',
  dwell: '체류',
  click: '클릭',
  cta_click: 'CTA 클릭',
  phone_click: '전화 클릭',
  listing_click: '매물 클릭',
  im_request: 'IM 열람 신청',
  scroll: '스크롤',
};

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

// ─────────────────────────────────────────────────────────────
// 목록 필터
// ─────────────────────────────────────────────────────────────

export interface FilterableSubscriber {
  subscriber_name?: string | null;
  subscriber_phone?: string | null;
  subscriber_email?: string | null;
  buyerTemperature?: string;
}

export function filterSubscribers<T extends FilterableSubscriber>(subs: T[], query: string, temp: string | null): T[] {
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  return subs.filter((s) => {
    if (q) {
      const hitName = !!s.subscriber_name?.toLowerCase().includes(q);
      const hitEmail = !!s.subscriber_email?.toLowerCase().includes(q);
      const hitPhone = !!s.subscriber_phone && (s.subscriber_phone.includes(q) || (qDigits.length >= 3 && s.subscriber_phone.replace(/\D/g, '').includes(qDigits)));
      if (!hitName && !hitEmail && !hitPhone) return false;
    }
    if (temp && s.buyerTemperature !== temp) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────
// 발송 요일 라벨 (props.sendDayLabel 은 '화요일' 또는 '매주 화요일' 모두 가능 — 중복 "매주 매주" 방지)
// ─────────────────────────────────────────────────────────────

/** '매주 화요일' → '화요일' (QR 모달 sendDayLabel 형식) */
export function stripWeekly(label: string): string {
  return label.replace(/^\s*매주\s*/, '').trim();
}

/** '화요일' → '매주 화요일' (표시용). 이미 '매주'가 있으면 그대로. */
export function withWeekly(label: string): string {
  const base = stripWeekly(label);
  return base ? `매주 ${base}` : '';
}
