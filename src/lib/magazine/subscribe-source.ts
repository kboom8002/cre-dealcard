/**
 * 구독 페이지 진입 출처 매핑 (실습6/Part2 ⑥).
 *
 * 구독 API 의 source 화이트리스트(`SUBSCRIBE_SOURCES`)에 맞는 값만 돌려준다.
 *  - `?source=` 가 화이트리스트 값이면 그대로 (QR 은 `?source=qr_card`), 그 밖의 값은 'magazine'
 *  - `?ref=forward` 같은 레퍼럴 진입은 QR 이 아니다 → 'magazine' (referrer 는 별도 필드로 따로 저장)
 *  - 아무 파라미터도 없는 진입은 기존 기본값 'qr_card' 를 유지한다 (e2e 계약)
 */
import { SUBSCRIBE_SOURCES, type SubscribeSource } from '@/domain/magazine/subscriber-consent-types';

export function resolveSubscribeSource(
  source: string | null | undefined,
  ref: string | null | undefined,
): SubscribeSource {
  const s = (source ?? '').trim();
  if (s) return (SUBSCRIBE_SOURCES as readonly string[]).includes(s) ? (s as SubscribeSource) : 'magazine';
  if ((ref ?? '').trim()) return 'magazine';
  return 'qr_card';
}
