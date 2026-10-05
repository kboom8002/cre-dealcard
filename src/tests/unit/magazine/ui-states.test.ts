import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { TouchTarget } from '@/components/ui/touch-target';
import { Skeleton, SkeletonGroup, SkeletonText } from '@/components/ui/Skeleton';

const h = React.createElement;

describe('EmptyState / ErrorState — 접근성 역할', () => {
  it('EmptyState 는 role=status, 제목·설명·액션 렌더', () => {
    const html = renderToStaticMarkup(
      h(EmptyState, {
        title: '아직 구독자가 없어요',
        description: 'QR을 공유해 보세요',
        action: { label: 'QR 보기', onClick: () => {} },
      }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('아직 구독자가 없어요');
    expect(html).toContain('QR을 공유해 보세요');
    expect(html).toContain('QR 보기');
    expect(html).toContain('min-h-11');
  });

  it('ErrorState 는 role=alert, onRetry 가 있을 때만 다시 시도 버튼', () => {
    const withRetry = renderToStaticMarkup(
      h(ErrorState, { title: '불러오지 못했어요', onRetry: () => {} }),
    );
    expect(withRetry).toContain('role="alert"');
    expect(withRetry).toContain('다시 시도');
    const without = renderToStaticMarkup(h(ErrorState, { title: '불러오지 못했어요' }));
    expect(without).not.toContain('<button');
  });
});

describe('TouchTarget', () => {
  it('기본: 44px 최소 크기 + 확장 히트 영역 클래스', () => {
    const html = renderToStaticMarkup(h(TouchTarget, null, 'x'));
    expect(html).toContain('min-h-11');
    expect(html).toContain('min-w-11');
    expect(html).toContain('after:-inset-2');
  });
  it('asChild: 자식 요소에 클래스를 병합(래퍼 span 없음)', () => {
    const html = renderToStaticMarkup(
      h(TouchTarget, {
        asChild: true,
        className: 'extra',
        children: h('a', { href: '/x', className: 'mine' }, 'go'),
      }),
    );
    expect(html.startsWith('<a ')).toBe(true);
    expect(html).toContain('mine');
    expect(html).toContain('extra');
    expect(html).toContain('min-h-11');
  });
});

describe('Skeleton', () => {
  it('Skeleton 은 aria-hidden, 그룹은 role=status aria-busy', () => {
    expect(renderToStaticMarkup(h(Skeleton, { className: 'h-4' }))).toContain('aria-hidden="true"');
    const g = renderToStaticMarkup(
      h(SkeletonGroup, { label: '구독자 불러오는 중', children: h(SkeletonText, { lines: 2 }) }),
    );
    expect(g).toContain('role="status"');
    expect(g).toContain('aria-busy="true"');
    expect(g).toContain('구독자 불러오는 중');
  });
  it('SkeletonText 는 줄 수만큼 생성, 마지막 줄은 짧음', () => {
    const html = renderToStaticMarkup(h(SkeletonText, { lines: 3 }));
    expect((html.match(/animate-pulse/g) ?? []).length).toBe(3);
    expect(html).toContain('w-2/3');
  });
});
