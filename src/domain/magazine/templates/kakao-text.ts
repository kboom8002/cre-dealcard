/**
 * src/domain/magazine/templates/kakao-text.ts — 광고성 알림톡 본문 (G-05, 시행령 §61 / 카카오 비즈메시지 정책)
 * `(광고)` 접두 + 발신(전송자) + 수신거부 안내를 반드시 포함하고, 본문 길이 한도(1,000자) 이내로 맞춘다.
 * (승인된 템플릿 변수 치환 방식은 B1/notification-service 담당 — 여기서는 최종 본문 텍스트 계약만 제공)
 */
import { decodeEntities, safePersonName, safeTemplateVar, stripTags } from '@/lib/magazine/escape';
import { clip } from './format';
import { MagazineRenderError, type MagazineEmailInput, type MagazineKakaoRendered } from './types';
import { assertAbsoluteHttpsUrl, toTelHref } from './url-guard';

export const KAKAO_MAX_LENGTH = 1000;

function plain(s: unknown, max: number): string {
  return clip(safeTemplateVar(stripTags(decodeEntities(typeof s === 'string' ? s : '')), { max: max * 2 }), max);
}

export function renderMagazineKakaoText(input: MagazineEmailInput): MagazineKakaoRendered {
  if (input.isAd !== true) throw new MagazineRenderError('MISSING_AD_FLAG', 'isAd must be true');
  const broker = safeTemplateVar(input.brokerName, { max: 40 });
  if (!broker) throw new MagazineRenderError('MISSING_SENDER', '전송자 명칭이 없습니다');

  let viewUrl: string;
  let unsubUrl: string;
  try {
    viewUrl = assertAbsoluteHttpsUrl(input.edition.url, 'edition.url');
    unsubUrl = assertAbsoluteHttpsUrl(input.unsubscribeUrl, 'unsubscribeUrl');
  } catch (e) {
    throw new MagazineRenderError('INVALID_URL', e instanceof Error ? e.message : 'invalid url');
  }

  const who = safePersonName(input.subscriberName);
  const contact = safeTemplateVar(input.brokerContact, { max: 40 });
  const title = plain(input.edition.title, 50);

  // 고정부(헤더+링크+푸터)를 먼저 만들고, 남는 길이만큼 요약 본문을 넣는다
  const head = [`(광고) ${broker}`, who ? `${who}님, 이번 주 매거진이 도착했습니다.` : '이번 주 매거진이 도착했습니다.', title];
  const tail: string[] = [`▶ 매거진 보기: ${viewUrl}`];
  if (contact && toTelHref(contact)) tail.push(`▶ 전화 상담: ${contact}`);
  tail.push('', `발신: ${broker}${contact ? ` (${contact})` : ''}`, '수신 동의하신 분께 발송됩니다.', `수신거부: ${unsubUrl}`);

  const fixedLen = [...head, '', ...tail].join('\n').length + 2; // 요약 앞뒤 개행 여유
  const room = Math.max(0, Math.min(160, KAKAO_MAX_LENGTH - fixedLen - 10));
  const summary = room >= 20 ? plain(input.edition.headline, room) : '';

  const text = [...head, ...(summary ? ['', summary] : []), '', ...tail].join('\n');
  if (text.length > KAKAO_MAX_LENGTH) {
    // URL이 비정상적으로 길어 한도를 넘으면 잘라서 링크를 깨뜨리는 대신 발송 거부
    throw new MagazineRenderError('INVALID_URL', '알림톡 본문이 길이 한도를 초과합니다(링크가 너무 깁니다)');
  }

  return {
    text,
    hasUnsubscribeLink: text.includes(unsubUrl),
    hasAdLabel: text.startsWith('(광고)'),
  };
}
