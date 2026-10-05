/**
 * 속보(E-06) 모달 순수 로직 — 타게팅 미리보기 파싱, 발행 가능 판정, 발송 결과 정직 보고.
 * UI(SpecialEditionModal)에서 분리해 jsdom 없이 단위테스트한다.
 */
import { extractApiError } from './outreach-helpers';

export interface SpecialPreview {
  building: {
    id: string;
    address: string | null;
    areaSignal: string | null;
    assetType: string | null;
    priceDisplay: string | null;
  };
  /** 활성 구독자 전체 */
  total: number;
  /** 권역·자산 태그가 모두 맞는 구독자(includeUntagged 반영) */
  matched: number;
  /** 매칭 구독자 중 🔥/📈 */
  hotLeads: number;
  /** 태그가 없는 구독자 */
  untagged: number;
  /** 매물에 권역·자산 정보가 있어 매칭 계산이 가능한지 */
  matchable: boolean;
  matchedPreview: Array<{ id: string; name: string; temperature: string; color: string }>;
  defaultHeadline: string | null;
}

function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}
function s(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/** GET /api/broker/magazine/special 응답 → 정규화. 형식이 다르면 null(= 불러오기 실패로 취급). */
export function parseSpecialPreview(json: unknown): SpecialPreview | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  const b = j.building && typeof j.building === 'object' ? (j.building as Record<string, unknown>) : null;
  if (!b || typeof j.total !== 'number' || typeof j.matched !== 'number') return null;
  const preview = Array.isArray(j.matchedPreview) ? j.matchedPreview : [];
  return {
    building: {
      id: s(b.id) ?? '',
      address: s(b.address),
      areaSignal: s(b.areaSignal),
      assetType: s(b.assetType),
      priceDisplay: s(b.priceDisplay),
    },
    total: n(j.total),
    matched: n(j.matched),
    hotLeads: n(j.hotLeads),
    untagged: n(j.untagged),
    matchable: j.matchable === true,
    matchedPreview: preview
      .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
      .map((m) => ({
        id: s(m.id) ?? '',
        name: s(m.name) ?? '이름 없음',
        temperature: s(m.temperature) ?? '',
        color: s(m.color) ?? '#64748b',
      })),
    defaultHeadline: s(j.defaultHeadline),
  };
}

export const MAX_HEADLINE_LENGTH = 80;

export interface PublishGateInput {
  loading: boolean;
  loadFailed: boolean;
  preview: SpecialPreview | null;
  headline: string;
  autoDistribute: boolean;
  publishing: boolean;
}

/** 발행 버튼 활성 여부와 비활성 사유. 로드 실패/미완료면 항상 비활성(U2-29). */
export function evaluatePublishGate(input: PublishGateInput): { canPublish: boolean; reason: string | null } {
  if (input.publishing) return { canPublish: false, reason: null };
  if (input.loading) return { canPublish: false, reason: '매물·구독자 정보를 불러오는 중이에요.' };
  if (input.loadFailed || !input.preview) {
    return { canPublish: false, reason: '매물 정보를 불러오지 못해 발행할 수 없어요. 다시 시도해 주세요.' };
  }
  const headline = input.headline.trim();
  if (!headline) return { canPublish: false, reason: '속보 헤드라인을 입력해 주세요.' };
  if (headline.length > MAX_HEADLINE_LENGTH) {
    return { canPublish: false, reason: `헤드라인은 ${MAX_HEADLINE_LENGTH}자 이내로 입력해 주세요.` };
  }
  if (input.autoDistribute) {
    if (!input.preview.matchable) {
      return { canPublish: false, reason: '매물의 권역·자산유형 정보가 없어 발송 대상을 계산할 수 없어요. 발송 없이 발행만 할 수 있어요.' };
    }
    if (input.preview.matched === 0) {
      return { canPublish: false, reason: '발송 대상이 0명이에요. 대상을 넓히거나 발송 없이 발행만 해 주세요.' };
    }
  }
  return { canPublish: true, reason: null };
}

/** 4칸 타게팅 미리보기(전체/매칭/핫리드/태그없음) */
export function targetingTiles(p: SpecialPreview): Array<{ key: 'total' | 'matched' | 'hot' | 'untagged'; label: string; count: number; hint: string }> {
  return [
    { key: 'total', label: '전체 구독자', count: p.total, hint: '수신 중인 구독자' },
    { key: 'matched', label: '매칭 대상', count: p.matched, hint: '권역·자산유형이 모두 맞는 구독자' },
    { key: 'hot', label: '핫리드', count: p.hotLeads, hint: '매칭 대상 중 적극검토·관심' },
    { key: 'untagged', label: '태그 없음', count: p.untagged, hint: '관심 태그가 없어 기본 제외' },
  ];
}

export const BLOCK_REASON_LABEL: Record<string, string> = {
  SEND_DISABLED: '발송 기능 중지',
  NOT_ALLOWLISTED: '허용 목록 외 수신자',
  NO_CONSENT: '수신 동의 기록 없음',
  CHANNEL_NOT_CONSENTED: '해당 채널 동의 없음',
  CHANNEL_NOT_AVAILABLE: '사용할 수 없는 채널(알림톡은 유료 요금제)',
  QUIET_HOURS: '야간 발송 제한 시간',
  MISSING_UNSUB_LINK: '수신거부 링크 누락',
  MISSING_AD_LABEL: '광고 표기 누락',
  MISSING_SENDER: '발신자 정보 누락',
  DUPLICATE: '이미 발송됨',
  DAILY_CAP: '발송 상한 초과(속보는 주 2회까지)',
  PENDING_CONFIRM: '수신 확인 대기 중',
  UNSUBSCRIBED: '수신거부',
  NO_PROVIDER: '발송 수단 미설정',
  LEDGER_UNAVAILABLE: '발송 기록 저장소 사용 불가',
};

export function summarizeBlocked(blocked: unknown): string {
  if (!blocked || typeof blocked !== 'object') return '';
  const parts = Object.entries(blocked as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'number' && v > 0)
    .map(([k, v]) => `${BLOCK_REASON_LABEL[k] ?? k} ${v}건`);
  return parts.join(', ');
}

export type SpecialOutcomeKind = 'published_only' | 'send_stopped' | 'dry_run' | 'sent' | 'none_sent' | 'error';

export interface SpecialOutcome {
  kind: SpecialOutcomeKind;
  /** 발행(에디션 생성)이 완료되었는가 */
  published: boolean;
  /** 실제로 독자에게 전달된 건수 */
  sent: number;
  title: string;
  detail: string;
}

/**
 * POST /api/broker/magazine/special 응답을 사용자에게 정직하게 설명한다.
 *  - 발행과 발송은 별개: 발송이 중지돼도 발행은 완료일 수 있다(blocked: SEND_DISABLED, published).
 *  - dry-run 이면 "기록만 남기고 실제 발송 없음"을 명시한다(발송 성공으로 위장 금지).
 */
export function describeSpecialResult(args: {
  ok: boolean;
  status: number;
  json: unknown;
  autoDistribute: boolean;
}): SpecialOutcome {
  const j = (args.json && typeof args.json === 'object' ? args.json : {}) as Record<string, unknown>;

  if ((!args.ok || j.success === false) && j.blocked !== 'SEND_DISABLED') {
    return { kind: 'error', published: false, sent: 0, title: '속보 발행에 실패했어요', detail: extractApiError(args.json, args.status).message };
  }

  const edition = (j.edition && typeof j.edition === 'object' ? j.edition : null) as Record<string, unknown> | null;
  const editionPublished = edition ? edition.status === 'published' : true;

  if (j.blocked === 'SEND_DISABLED') {
    const published = j.published === true || editionPublished;
    return {
      kind: 'send_stopped',
      published,
      sent: 0,
      title: published ? '속보는 발행되었지만 발송은 중지되어 있어요' : '속보 발송이 중지되어 있어요',
      detail: '현재 발송 기능이 꺼져 있어 독자에게 보내지 않았어요. 발송이 켜지면 다시 발송할 수 있어요.',
    };
  }

  if (!args.autoDistribute) {
    return {
      kind: 'published_only',
      published: editionPublished,
      sent: 0,
      title: '속보를 발행했어요',
      detail: '독자에게는 발송하지 않았어요. 매거진 페이지에서만 볼 수 있어요.',
    };
  }

  const dist = (j.distributionResult && typeof j.distributionResult === 'object' ? j.distributionResult : {}) as Record<string, unknown>;
  const sent = n(j.sent ?? dist.sent);
  const failed = n(j.failed ?? dist.failed);
  const recorded = n(dist.recorded);
  const blockedText = summarizeBlocked(j.blocked ?? dist.blocked);
  const extra = [failed > 0 ? `실패 ${failed}건` : '', blockedText ? `차단: ${blockedText}` : ''].filter(Boolean).join(' · ');

  if (j.dryRun === true) {
    return {
      kind: 'dry_run',
      published: editionPublished,
      sent: 0,
      title: '시험 발송(dry-run)만 진행했어요 — 실제 발송은 없어요',
      detail: [`발송 대상 ${recorded}건을 기록만 했어요.`, extra].filter(Boolean).join(' '),
    };
  }
  if (sent > 0) {
    return {
      kind: 'sent',
      published: editionPublished,
      sent,
      title: `속보를 발행하고 ${sent}건을 발송했어요`,
      detail: extra,
    };
  }
  return {
    kind: 'none_sent',
    published: editionPublished,
    sent: 0,
    title: '속보는 발행되었지만 발송된 건은 없어요',
    detail: extra || '발송 대상이 없거나 모두 발송 조건에서 제외되었어요.',
  };
}
