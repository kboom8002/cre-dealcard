import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InitialAvatar, getInitial, avatarColorIndex } from '@/components/magazine/InitialAvatar';

describe('InitialAvatar (T3-18)', () => {
  it('getInitial: 한글/영문/공백/기호', () => {
    expect(getInitial('김부동')).toBe('김');
    expect(getInitial('  john doe')).toBe('J');
    expect(getInitial('(주)크레')).toBe('주');
    expect(getInitial('')).toBe('?');
    expect(getInitial(null)).toBe('?');
    expect(getInitial('...')).toBe('?');
  });

  it('avatarColorIndex: 안정적(결정적)이며 범위 내', () => {
    expect(avatarColorIndex('김부동')).toBe(avatarColorIndex('김부동'));
    for (const n of ['a', '김', 'zzzz', '', null]) {
      const i = avatarColorIndex(n);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(7);
    }
  });

  it('role=img + aria-label (기본) / decorative 시 aria-hidden', () => {
    const a = renderToStaticMarkup(React.createElement(InitialAvatar, { name: '김부동', size: 48 }));
    expect(a).toContain('role="img"');
    expect(a).toContain('aria-label="김부동 프로필"');
    expect(a).toContain('>김<');
    expect(a).toContain('width:48px');
    const b = renderToStaticMarkup(React.createElement(InitialAvatar, { name: '김부동', decorative: true }));
    expect(b).toContain('aria-hidden="true"');
    expect(b).not.toContain('role="img"');
  });
});
