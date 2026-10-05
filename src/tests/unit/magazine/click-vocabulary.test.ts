/**
 * E3 뷰어 클릭 어휘 ↔ 온도 점수표 정합 (E-04)
 * 뷰어가 보내는 모든 target 이 가중치 있는 이벤트로 귀속되거나, 명시적 0점으로 처리됨을 고정한다.
 */
import { describe, expect, it } from 'vitest';
import {
  CLICK_TARGETS,
  CLICK_TARGET_ALIASES,
  buildClickPayload,
  canonicalClickTarget,
  normalizeClickTarget,
} from '@/lib/magazine/visitor-id';
import {
  EVENT_RULES,
  ZERO_SCORE_CLICK_TARGETS,
  classifyEvent,
  computeCrossChannelScore,
  type EventKind,
} from '@/domain/magazine/buyer-temperature';

const NOW = Date.parse('2026-10-06T03:00:00Z');

/** E3 magazine-view 가 trackClick/trackInteraction 으로 보내는 어휘 전체 → (정식 타깃, 점수 종류 | null=0점) */
const E3_VOCAB: Array<[string, string, EventKind | null]> = [
  ['listing_click', 'listing_click', 'listing_click'],
  ['im_request', 'im_request', 'im_request'],
  ['bottom_im_request', 'im_request', 'im_request'],
  ['bottom_call', 'phone_click', 'phone_click'],
  ['bottom_kakao', 'inquiry', 'inquiry'],
  ['bottom_contact', 'inquiry', 'inquiry'],
  ['tax_inquiry', 'inquiry', 'inquiry'],
  ['poll_consult', 'inquiry', 'inquiry'],
  ['bottom_share', 'share', null],
  ['referral_forward', 'share', null],
  // trackInteraction 어휘
  ['poll_vote', 'poll_vote', 'poll_vote'],
  ['calc_simulate', 'calc_simulate', 'calc_simulate'],
  ['referral_copy', 'referral_copy', null],
];

describe('E3 클릭 어휘 흡수', () => {
  it.each(E3_VOCAB)('%s → 정식 타깃 %s, 점수 종류 %s', (raw, canonical, kind) => {
    expect(normalizeClickTarget(raw)).toBe(canonical);
    expect(canonicalClickTarget(raw)).toBe(canonical);

    // 클라이언트 전송 페이로드: 정식 타깃으로 보내고, 별칭이면 원문을 보존
    const payload = buildClickPayload(raw, { url: 'https://credeal.net/x' });
    expect(payload?.target_param).toBe(canonical);
    if (raw !== canonical) expect(payload?.meta?.target_raw).toBe(raw);
    else expect(payload?.meta?.target_raw).toBeUndefined();

    // 점수 분류: 원문(구버전 클라이언트가 저장한 행)·정식 모두 같은 결과
    const asRaw = classifyEvent({ event_type: 'click', created_at: '2026-10-05T00:00:00Z', target_param: raw });
    const asCanonical = classifyEvent({ event_type: 'click', created_at: '2026-10-05T00:00:00Z', target_param: canonical });
    expect(asRaw).toBe(kind);
    expect(asCanonical).toBe(kind);
  });

  it('별칭 맵의 모든 값은 정식 어휘(CLICK_TARGETS)로만 귀속된다', () => {
    const canonicals = new Set<string>(Object.values(CLICK_TARGETS));
    for (const [alias, target] of Object.entries(CLICK_TARGET_ALIASES)) {
      expect(canonicals.has(target), `${alias} → ${target}`).toBe(true);
    }
    expect(Object.keys(CLICK_TARGET_ALIASES).sort()).toEqual(
      ['bottom_call', 'bottom_contact', 'bottom_im_request', 'bottom_kakao', 'bottom_share', 'poll_consult', 'referral_forward', 'tax_inquiry'],
    );
  });

  it('가중치가 있는 클릭은 0점이 아니고, 0점 타깃은 명시 목록과 일치', () => {
    for (const [raw, , kind] of E3_VOCAB) {
      if (kind) {
        const score = computeCrossChannelScore(
          [{ event_type: 'click', created_at: '2026-10-05T00:00:00Z', target_param: raw }],
          NOW,
        ).score;
        expect(score, raw).toBe(EVENT_RULES[kind].points);
        expect(score, raw).toBeGreaterThan(0);
      } else {
        const r = computeCrossChannelScore([{ event_type: 'click', created_at: '2026-10-05T00:00:00Z', target_param: raw }], NOW);
        expect(r.score, raw).toBe(0);
        expect(ZERO_SCORE_CLICK_TARGETS, raw).toContain(canonicalClickTarget(raw));
      }
    }
  });

  it('bottom_call → 전화 행동 하한(최근 14일), 문의(inquiry)는 하한 없음', () => {
    const call = computeCrossChannelScore([{ event_type: 'click', created_at: '2026-10-05T00:00:00Z', target_param: 'bottom_call' }], NOW);
    expect(call.hasRecentIntent).toBe(true);
    const inq = computeCrossChannelScore([{ event_type: 'click', created_at: '2026-10-05T00:00:00Z', target_param: 'bottom_kakao' }], NOW);
    expect(inq.hasRecentIntent).toBe(false);
    expect(inq.counts.inquiry).toBe(1);
    expect(inq.score).toBe(20);
  });

  it('문의 클릭은 상한 20 (여러 번 눌러도 점수 폭주 없음)', () => {
    const ev = Array.from({ length: 6 }, () => ({ event_type: 'click', created_at: '2026-10-05T00:00:00Z', target_param: 'tax_inquiry' }));
    expect(computeCrossChannelScore(ev, NOW).score).toBe(20);
  });

  it('미지의 타깃·대소문자 변형: 형식이 맞으면 소문자로 통과(0점), 형식 불가는 null', () => {
    expect(normalizeClickTarget('Bottom_Call')).toBe('phone_click');
    expect(classifyEvent({ event_type: 'click', created_at: '2026-10-05T00:00:00Z', target_param: 'something_new' })).toBeNull();
    expect(normalizeClickTarget('bad token!')).toBeNull();
  });
});
