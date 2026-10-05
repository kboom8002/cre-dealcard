/**
 * Wave 3 UI 정적 렌더 테스트 (jsdom 없이 renderToStaticMarkup)
 *  - U-03: 에디터 컴포넌트에 text-[Npx](<12px) 없음 / label↔input 연결 / aria
 *  - U-02: 미리보기 격리 스타일 + iframe 모드 선택
 *  - U-04/U-05: EmptyState, 한글 topic, 시장 온도 아이콘
 */
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EditorCoverTab } from '@/components/magazine-editor/EditorCoverTab';
import { EditorFieldNoteTab } from '@/components/magazine-editor/EditorFieldNoteTab';
import { EditorThemeDealsTab } from '@/components/magazine-editor/EditorThemeDealsTab';
import { NewsCurationPanel } from '@/components/magazine-editor/NewsCurationPanel';
import {
  MagazinePhonePreview,
  PHONE_FRAME_ISOLATION_STYLE,
  resolvePreviewMode,
} from '@/components/magazine-editor/MagazinePhonePreview';
import { EMPTY_FIELD_NOTE } from '@/lib/magazine/edition-save';

const noop = () => {};
const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

describe('에디터 소스 가드 (U-03)', () => {
  const editorFiles = [
    ...walk(join(ROOT, 'src/components/magazine-editor')),
    join(ROOT, 'src/app/(broker)/broker/magazine-editor/page.tsx'),
    join(ROOT, 'src/app/(broker)/broker/magazine-editor/loading.tsx'),
    join(ROOT, 'src/app/(broker)/broker/magazine-editor/error.tsx'),
  ];

  it('text-[7~11px] (12px 미만 고정 글자 크기)가 없다', () => {
    const offenders: string[] = [];
    for (const f of editorFiles) {
      const text = readFileSync(f, 'utf8');
      const m = text.match(/text-\[(?:[0-9]|10|11)px\]/g);
      if (m) offenders.push(`${f.replace(ROOT, '')}: ${m.length}`);
    }
    expect(offenders).toEqual([]);
  });

  it('에디터는 sonner toast 를 직접 쓰지 않고 editorToast 단일 큐를 쓴다 (모달 제외)', () => {
    const offenders: string[] = [];
    for (const f of editorFiles) {
      if (f.endsWith('editor-toaster.ts')) continue;
      const text = readFileSync(f, 'utf8');
      // E2/E4 소유(outreach/analytics/Share/Qr/Special) 는 제외
      if (/[\\/](outreach|analytics)[\\/]/.test(f)) continue;
      if (/(EditorOutreachTab|EditorAnalyticsTab|SpecialEditionModal|MagazineQrModal|MagazineShareModal)\.tsx$/.test(f)) continue;
      if (/from ['"]sonner['"]/.test(text)) offenders.push(f.replace(ROOT, ''));
    }
    expect(offenders).toEqual([]);
  });
});

describe('EditorCoverTab (U-03/U-05)', () => {
  const html = renderToStaticMarkup(
    React.createElement(EditorCoverTab, {
      marketTemp: '관망',
      setMarketTemp: noop,
      coverKeywords: ['a', '', ''],
      updateKeyword: noop,
      headline: 'H',
      setHeadline: noop,
      briefing: 'B',
      setBriefing: noop,
      coverImageUrl: 'https://example.com/x.png',
      setCoverImageUrl: noop,
    }),
  );

  it('헤드라인/브리핑 label 이 input 과 htmlFor/id 로 연결된다', () => {
    const forIds = Array.from(html.matchAll(/<label[^>]*for="([^"]+)"/g)).map((m) => m[1]);
    expect(forIds.length).toBeGreaterThanOrEqual(3); // 헤드라인, 브리핑, 파일 업로드
    for (const id of forIds) expect(html).toContain(`id="${id}"`);
  });

  it('키워드 입력/이미지 제거 버튼에 aria-label, 시장 온도 버튼에 aria-pressed', () => {
    expect(html).toContain('aria-label="키워드 1"');
    expect(html).toContain('aria-label="커버 이미지 제거"');
    expect(html).toMatch(/aria-pressed="true"/);
    expect(html).toMatch(/aria-pressed="false"/);
  });

  it('시장 온도는 색 사각형 아이콘 — 구독자 온도 이모지(🔥📈⏸️❄️)가 없다', () => {
    expect(html).toContain('🟦');
    for (const e of ['🔥', '📈', '⏸️', '❄️']) expect(html).not.toContain(e);
  });

  it('터치 타깃 44px(min-h-11) 클래스가 있다', () => {
    expect(html).toContain('min-h-11');
  });
});

describe('EditorFieldNoteTab (U-03)', () => {
  it('모든 textarea 가 label 과 연결되고 도움말 버튼에 aria-label/aria-expanded', () => {
    const html = renderToStaticMarkup(
      React.createElement(EditorFieldNoteTab, {
        fieldNote: { ...EMPTY_FIELD_NOTE },
        updateFieldNote: noop,
        activeTooltip: null,
        setActiveTooltip: noop,
      }),
    );
    const forIds = Array.from(html.matchAll(/<label[^>]*for="([^"]+)"/g)).map((m) => m[1]);
    expect(forIds).toHaveLength(5);
    for (const id of forIds) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('aria-label="독자에게 한마디 작성 도움말"');
    expect(html).toContain('aria-expanded="false"');
  });
});

describe('EditorThemeDealsTab (U-03/U-04)', () => {
  const base = {
    themeTitle: '',
    setThemeTitle: noop,
    themeBodyMd: '',
    setThemeBodyMd: noop,
    selectedDealIds: new Set<string>(),
    toggleDeal: noop,
    fmt: (n: number) => String(n),
  };

  it('매물이 없으면 EmptyState(role=status) 를 보여준다', () => {
    const html = renderToStaticMarkup(React.createElement(EditorThemeDealsTab, { ...base, allDeals: [] }));
    expect(html).toContain('role="status"');
    expect(html).toContain('등록된 매물이 없습니다');
  });

  it('label↔input 연결 + 매물 토글은 aria-pressed', () => {
    const html = renderToStaticMarkup(
      React.createElement(EditorThemeDealsTab, {
        ...base,
        selectedDealIds: new Set(['d1']),
        allDeals: [
          { id: 'd1', assetType: '꼬마빌딩', address: '서울', price: 0 },
          { id: 'd2', assetType: '상가', address: '부산', price: 0 },
        ],
      }),
    );
    const forIds = Array.from(html.matchAll(/<label[^>]*for="([^"]+)"/g)).map((m) => m[1]);
    expect(forIds).toHaveLength(2);
    for (const id of forIds) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });
});

describe('NewsCurationPanel (U-04/U-05)', () => {
  it('topic 은 한글 라벨로 표시된다 (영문 키 노출 금지)', () => {
    const html = renderToStaticMarkup(
      React.createElement(NewsCurationPanel, {
        allNews: [
          { id: 'n1', title: '금리 동결', topic: 'interest_rate', source: '연합', sentiment: 'neutral' },
          { id: 'n2', title: '신규 공급', topic: 'weird_key' },
        ],
        selectedNewsIds: new Set(['n1']),
        toggleNews: noop,
      }),
    );
    expect(html).toContain('금리');
    expect(html).toContain('기타');
    expect(html).not.toContain('interest_rate');
    expect(html).not.toContain('weird_key');
    expect(html).toContain('(1/6 선택)');
    expect(html).toContain('aria-pressed="true"');
  });

  it('뉴스가 없으면 EmptyState', () => {
    const html = renderToStaticMarkup(
      React.createElement(NewsCurationPanel, { allNews: [], selectedNewsIds: new Set<string>(), toggleNews: noop }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('선택할 뉴스가 없습니다');
  });
});

describe('MagazinePhonePreview (U-02)', () => {
  it('인라인 폴백: 프레임에 translateZ(0) + contain: layout paint 격리 스타일', () => {
    expect(PHONE_FRAME_ISOLATION_STYLE).toEqual({ transform: 'translateZ(0)', contain: 'layout paint' });
    const html = renderToStaticMarkup(
      React.createElement(MagazinePhonePreview, { previewData: null, brokerSlug: 'kim', today: '2026-10-06' }),
    );
    expect(html).toContain('data-preview-mode="inline"');
    expect(html).toContain('transform:translateZ(0)');
    expect(html).toContain('contain:layout paint');
    expect(html).not.toContain('<iframe');
  });

  it('resolvePreviewMode: 플래그가 꺼져 있으면 auto 는 inline, 켜지면 iframe', () => {
    expect(resolvePreviewMode('auto', { editionId: 'e', brokerSlug: 's', iframeEnabled: false })).toBe('inline');
    expect(resolvePreviewMode('auto', { editionId: 'e', brokerSlug: 's', iframeEnabled: true })).toBe('iframe');
    expect(resolvePreviewMode('iframe', { editionId: 'e', brokerSlug: 's', iframeEnabled: false })).toBe('iframe');
    expect(resolvePreviewMode('inline', { editionId: 'e', brokerSlug: 's', iframeEnabled: true })).toBe('inline');
    // edition/slug 이 없으면 항상 inline
    expect(resolvePreviewMode('iframe', { editionId: null, brokerSlug: 's' })).toBe('inline');
    expect(resolvePreviewMode('iframe', { editionId: 'e', brokerSlug: null })).toBe('inline');
  });

  it('iframe 모드: ?preview=1&edition= src + title, 프레임 격리 유지', () => {
    const html = renderToStaticMarkup(
      React.createElement(MagazinePhonePreview, {
        previewData: null,
        brokerSlug: 'kim',
        today: '2026-10-06',
        editionId: 'ed-1',
        mode: 'iframe',
      }),
    );
    expect(html).toContain('data-preview-mode="iframe"');
    expect(html).toContain('<iframe');
    expect(html).toContain('/magazine/kim/2026-10-06?preview=1&amp;edition=ed-1');
    expect(html).toContain('title="매거진 실시간 미리보기"');
    expect(html).toContain('contain:layout paint');
  });
});
