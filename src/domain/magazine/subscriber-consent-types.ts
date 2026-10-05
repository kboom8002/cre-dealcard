/**
 * src/domain/magazine/subscriber-consent-types.ts — 공개 구독 요청 계약·입력 검증 (G-01 / E-05)
 *
 * 프론트(SubscribeFormClient / SubscribeCard)와 서버가 공유하는 요청 형태:
 *   { brokerId, name?, phone?, email?, channel:'kakao'|'email'|'both', tags?, referrer?, source?,
 *     consent:{ privacy, marketing, age14, night? } }
 * 응답: { ok:true, status:'pending'|'confirmed', message } | { ok:false, error:{code,message} }
 */
import { z } from 'zod';
import { safePersonName } from '@/lib/magazine/escape';
import { normalizeKrPhone, toE164Kr } from '@/lib/magazine/pii';

export type SubscribeChannel = 'kakao' | 'email' | 'both';

/** 공개 구독 출처 화이트리스트 (T2-09c: qr_card 추가). 목록 밖 값은 'magazine'으로 대체. */
export const SUBSCRIBE_SOURCES = ['magazine', 'manual', 'vibe_card', 'im', 'qr_card'] as const;
export type SubscribeSource = (typeof SUBSCRIBE_SOURCES)[number];

export const CONSENT_VERSION = 'v1';
export const CONSENT_CHANNEL_WEB = 'web_form';

export const MAX_NAME_RAW = 60;
export const MAX_REFERRER = 200;
export const MAX_TAGS = 20;
export const MAX_TAG_LEN = 40;

export interface SubscribeConsent {
  privacy: boolean;
  marketing: boolean;
  age14: boolean;
  night?: boolean;
}

export interface SubscribeRequest {
  brokerId: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  channel: SubscribeChannel;
  tags?: string[];
  referrer?: string | null;
  source?: string | null;
  consent?: Partial<SubscribeConsent>;
}

/** 서버 정제를 끝낸 구독 입력. */
export interface ValidatedSubscribeInput {
  brokerParam: string;
  name: string | null;
  /** 국내 형식 숫자(01012345678) — magazine_subscribers.subscriber_phone */
  phone: string | null;
  /** +821012345678 — phone_e164 */
  phoneE164: string | null;
  /** 소문자 정규화 이메일 */
  email: string | null;
  channel: SubscribeChannel;
  tags: string[];
  referrer: string | null;
  source: SubscribeSource;
  consent: { privacy: true; marketing: true; age14: true; night: boolean };
}

export type SubscribeValidationResult =
  | { ok: true; value: ValidatedSubscribeInput }
  | { ok: false; status: 400; code: string; message: string };

/** zod 스키마: 형태·길이만 본다(의미 검증은 validateSubscribeInput). 메시지는 사용자용 한국어. */
export const subscribeRequestSchema = z.object({
  brokerId: z
    .string({ error: '중개사 정보가 올바르지 않습니다.' })
    .trim()
    .min(1, '중개사 정보가 올바르지 않습니다.')
    .max(80, '중개사 정보가 올바르지 않습니다.'),
  name: z.string({ error: '이름 형식이 올바르지 않습니다.' }).max(MAX_NAME_RAW, '이름은 30자 이내로 입력해 주세요.').nullish(),
  phone: z.string({ error: '전화번호 형식이 올바르지 않습니다.' }).max(30, '전화번호 형식이 올바르지 않습니다.').nullish(),
  email: z.string({ error: '이메일 형식이 올바르지 않습니다.' }).max(254, '이메일 형식이 올바르지 않습니다.').nullish(),
  channel: z.enum(['kakao', 'email', 'both'], { error: '수신 채널을 선택해 주세요.' }),
  tags: z
    .array(z.string({ error: '관심 태그 형식이 올바르지 않습니다.' }).max(MAX_TAG_LEN, '관심 태그 형식이 올바르지 않습니다.'))
    .max(MAX_TAGS, '관심 태그는 20개까지 선택할 수 있습니다.')
    .optional(),
  referrer: z.string({ error: '요청 형식이 올바르지 않습니다.' }).max(MAX_REFERRER, '요청 형식이 올바르지 않습니다.').nullish(),
  source: z.string({ error: '요청 형식이 올바르지 않습니다.' }).max(30, '요청 형식이 올바르지 않습니다.').nullish(),
  consent: z
    .object({
      privacy: z.boolean().optional(),
      marketing: z.boolean().optional(),
      age14: z.boolean().optional(),
      night: z.boolean().optional(),
    })
    .optional(),
});

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** 이메일 형식 검증 + 소문자 정규화. 유효하지 않으면 null. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) return null;
  return e;
}

export function sanitizeSource(raw: unknown): SubscribeSource {
  return typeof raw === 'string' && (SUBSCRIBE_SOURCES as readonly string[]).includes(raw) ? (raw as SubscribeSource) : 'magazine';
}

/** referrer: 제어문자 제거 + 길이 제한. 비면 null. */
export function sanitizeReferrer(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const t = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_REFERRER);
  return t || null;
}

export interface ValidateDeps {
  /**
   * 관심 태그 사전 검증(tags.ts `normalizeTags` 어댑터). 없으면 길이·중복만 정리.
   * 실패 시 { ok:false, message } 반환 → 400.
   */
  normalizeTags?: (tags: string[]) => { ok: true; tags: string[] } | { ok: false; message?: string };
}

function fail(code: string, message: string): SubscribeValidationResult {
  return { ok: false, status: 400, code, message };
}

/**
 * 의미 검증: 동의 3종 필수 → 연락처 정규화 → 채널별 필수 연락처 → 이름/태그/출처 정제.
 * (형태 검증은 subscribeRequestSchema가 withPublicGuard에서 선행)
 */
export function validateSubscribeInput(raw: SubscribeRequest, deps: ValidateDeps = {}): SubscribeValidationResult {
  const c = raw.consent;
  if (!(c?.privacy === true && c?.marketing === true && c?.age14 === true)) {
    return fail('CONSENT_REQUIRED', '개인정보 수집·이용, 광고성 정보 수신, 만 14세 이상 확인에 모두 동의해 주세요.');
  }

  const phoneRaw = typeof raw.phone === 'string' ? raw.phone.trim() : '';
  const emailRaw = typeof raw.email === 'string' ? raw.email.trim() : '';

  let phone: string | null = null;
  let phoneE164: string | null = null;
  if (phoneRaw) {
    phone = normalizeKrPhone(phoneRaw);
    phoneE164 = phone ? toE164Kr(phone) : null;
    if (!phone || !phoneE164) return fail('INVALID_PHONE', '휴대폰 번호 형식을 확인해 주세요.');
  }

  let email: string | null = null;
  if (emailRaw) {
    email = normalizeEmail(emailRaw);
    if (!email) return fail('INVALID_EMAIL', '이메일 형식을 확인해 주세요.');
  }

  if ((raw.channel === 'kakao' || raw.channel === 'both') && !phone) {
    return fail('PHONE_REQUIRED', '카카오 알림톡 수신에는 휴대폰 번호가 필요합니다.');
  }
  if ((raw.channel === 'email' || raw.channel === 'both') && !email) {
    return fail('EMAIL_REQUIRED', '이메일 수신에는 이메일 주소가 필요합니다.');
  }

  // 이름: URL/제어문자/꺾쇠 제거 + 30자 (S2-09). 정제 후 비면 null.
  const name = typeof raw.name === 'string' ? safePersonName(raw.name) || null : null;

  // 태그
  let tags = Array.from(new Set((raw.tags ?? []).map((t) => t.trim()).filter(Boolean)));
  if (deps.normalizeTags) {
    const r = deps.normalizeTags(tags);
    if (!r.ok) return fail('INVALID_TAGS', r.message || '관심 태그를 확인해 주세요.');
    tags = r.tags;
  }

  return {
    ok: true,
    value: {
      brokerParam: raw.brokerId.trim(),
      name,
      phone,
      phoneE164,
      email,
      channel: raw.channel,
      tags,
      referrer: sanitizeReferrer(raw.referrer),
      source: sanitizeSource(raw.source),
      consent: { privacy: true, marketing: true, age14: true, night: c.night === true },
    },
  };
}
