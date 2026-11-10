/**
 * @file src/components/broker/deal-card/DealCardLineText.tsx
 * @description 딜카드 18자 문구(한 줄 제목 · 장점 3줄) 공용 렌더러.
 *
 * - 편집기 미리보기(KakaoBubblePreview)와 고객 화면(/dc/[id])이 같은 컴포넌트 · 같은 교정기를 쓴다.
 * - 절대 한 줄 말줄임(truncate / line-clamp-1 / whitespace-nowrap / text-ellipsis)을 쓰지 않는다.
 *   18자는 기본 폭에서 한 줄에 들어가며, 좁은 화면에서도 최대 2줄로 어절 단위 줄바꿈되어 숨겨지는 글자가 없다.
 * - Server/Client 공용 (훅·이벤트 없음).
 */
import React from 'react';
import { repairDealCardLine } from '@/lib/deal-card/copy-limits';

/** 줄바꿈 안전망 클래스 — 클리핑 계열 클래스 금지 (테스트로 고정). */
export const DEAL_CARD_LINE_SAFE_CLASS =
  'min-w-0 whitespace-normal break-keep [overflow-wrap:anywhere] leading-snug';

export const FORBIDDEN_LINE_CLIP_CLASSES = [
  'truncate',
  'line-clamp-1',
  'whitespace-nowrap',
  'text-ellipsis',
  'overflow-hidden',
] as const;

export interface DealCardLineTextProps {
  text: string | null | undefined;
  /** 교정 결과가 비었을 때 표시할 문구 */
  placeholder?: string;
  as?: 'p' | 'h1' | 'h4' | 'span';
  className?: string;
  testId?: string;
  /** 이미 교정된 문구면 true (중복 교정 방지 — 결과는 멱등이라 생략해도 무방) */
  preRepaired?: boolean;
}

export function DealCardLineText({
  text,
  placeholder = '—',
  as = 'p',
  className = '',
  testId,
  preRepaired = false,
}: DealCardLineTextProps) {
  const value = (preRepaired ? String(text ?? '').trim() : repairDealCardLine(text)) || placeholder;
  const Tag = as;
  return (
    <Tag
      data-testid={testId}
      data-single-line-title="true"
      data-line-safe="wrap"
      title={value}
      className={`${DEAL_CARD_LINE_SAFE_CLASS} ${className}`.trim()}
    >
      {value}
    </Tag>
  );
}
