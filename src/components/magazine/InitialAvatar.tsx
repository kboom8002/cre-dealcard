/**
 * InitialAvatar (C-04, T3-18)
 *
 * 존재하지 않는 `/default-avatar.png` 대신 이니셜(중개사 이름 첫 글자)로 그리는 아바타.
 * - 사진 URL 이 없거나 로드 실패 시 폴백으로 사용한다.
 * - 이름 해시로 배경색을 고정(같은 사람은 항상 같은 색) — 접근성: 대비 4.5:1 이상 팔레트.
 * - 장식용(이름이 옆에 표시되는 경우)이면 `decorative` 로 aria-hidden 처리, 아니면 role="img" + aria-label.
 */
import React from 'react';

const PALETTE = [
  { bg: '#1e3a8a', fg: '#ffffff' }, // blue-900
  { bg: '#065f46', fg: '#ffffff' }, // emerald-800
  { bg: '#7c2d12', fg: '#ffffff' }, // orange-900
  { bg: '#581c87', fg: '#ffffff' }, // purple-900
  { bg: '#134e4a', fg: '#ffffff' }, // teal-900
  { bg: '#831843', fg: '#ffffff' }, // pink-900
  { bg: '#374151', fg: '#ffffff' }, // gray-700
] as const;

/** 이름에서 표시할 이니셜 1글자 (공백·기호 제외, 없으면 '?') */
export function getInitial(name: string | null | undefined): string {
  const cleaned = (name ?? '').replace(/[\s\p{P}\p{S}]/gu, '');
  if (!cleaned) return '?';
  const first = Array.from(cleaned)[0];
  return first.toUpperCase();
}

/** 이름 → 팔레트 인덱스 (안정적 해시) */
export function avatarColorIndex(name: string | null | undefined): number {
  const s = (name ?? '').trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % PALETTE.length;
}

export interface InitialAvatarProps {
  name: string | null | undefined;
  /** px (기본 40) */
  size?: number;
  className?: string;
  /** 이름이 바로 옆에 텍스트로 표시되는 경우 true → 스크린리더에서 숨김 */
  decorative?: boolean;
}

export function InitialAvatar({ name, size = 40, className = '', decorative = false }: InitialAvatarProps) {
  const color = PALETTE[avatarColorIndex(name)];
  const initial = getInitial(name);
  const a11y = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': name ? `${name} 프로필` : '프로필' } as const);
  return (
    <span
      {...a11y}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color.bg,
        color: color.fg,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
      }}
      data-testid="initial-avatar"
    >
      {initial}
    </span>
  );
}

export default InitialAvatar;
