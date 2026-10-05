/**
 * PreviewReceiver (에디터 iframe 미리보기 수신기) — SSR 스모크 + 소스 가드.
 * 서버/최상위 창에서는 초안 없이 대기 문구만 보이고(공개 데이터 노출 없음), 수신 로직은 브리지 헬퍼만 사용한다.
 * (메시지 파싱/origin/seq 로직 자체는 preview-bridge 테스트가 검증한다.)
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

vi.mock('next/script', () => ({ default: () => null }));
vi.mock('@/hooks/use-magazine-analytics', () => ({
  useMagazineAnalytics: () => ({
    trackSectionView: vi.fn(),
    trackSection: vi.fn(),
    trackClick: vi.fn(),
    trackInteraction: vi.fn(),
  }),
}));
vi.mock('@/components/magazine/LazyIslands', () => ({
  LazyRoiCalculator: () => null,
  LazyForwardSection: () => null,
}));

import { PreviewReceiver } from '@/components/magazine/PreviewReceiver';

const props = { brokerId: 'kim', brokerSlug: 'kim', date: '2026-09-20', dateLabel: '2026년 9월 20일 (일)' };

describe('PreviewReceiver SSR', () => {
  it('edition 이 있으면 초안 대기 문구만 렌더 (초안/공개 콘텐츠 없음)', () => {
    const html = renderToStaticMarkup(React.createElement(PreviewReceiver, { ...props, editionId: 'ed-1' }));
    expect(html).toContain('매거진 미리보기');
    expect(html).toContain('role="status"');
    expect(html).toContain('초안을 불러오는 중');
    expect(html).not.toContain('data-section-id');
  });

  it('edition 이 없으면 안내 문구', () => {
    const html = renderToStaticMarkup(React.createElement(PreviewReceiver, { ...props, editionId: null }));
    expect(html).toContain('에디션이 지정되지 않았습니다');
  });
});

describe('PreviewReceiver 소스 가드', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../components/magazine/PreviewReceiver.tsx'), 'utf-8');
  it('브리지 헬퍼로 origin·seq·형식을 검증하고 부모 프레임에서 온 메시지만 받는다', () => {
    expect(src).toContain('isAllowedOrigin(');
    expect(src).toContain('parsePreviewMessage(');
    expect(src).toContain('shouldApplyDraft(');
    expect(src).toMatch(/ev\.source\s*!==\s*parent/);
    expect(src).toContain('buildReadyMessage(');
    expect(src).toContain('buildAckMessage(');
    expect(src).not.toMatch(/postMessage\([^)]*"\*"/);
  });

  it('초안은 preview 모드(분석 비콘·제출 비활성)로만 렌더한다', () => {
    expect(src).toMatch(/<MagazineView[\s\S]*?\bpreview\b[\s\S]*?\/>/);
  });

  it('페이지: preview=1 은 noindex 이고 서버 공개 데이터 경로를 바꾸지 않는다', () => {
    const page = fs.readFileSync(
      path.resolve(__dirname, '../../../app/(magazine)/magazine/[brokerId]/[date]/page.tsx'),
      'utf-8',
    );
    expect(page).toMatch(/readPreviewParams\(await searchParams\)\.preview[\s\S]{0,200}robots:\s*\{\s*index:\s*false/);
    expect(page).toContain('<PreviewReceiver');
    // 초안 content 를 서버가 DB 에서 읽어 렌더하는 경로가 없어야 한다 (edition 은 식별자로만 전달)
    expect(page).not.toMatch(/\.eq\(["']id["'],\s*edition/);
  });
});
