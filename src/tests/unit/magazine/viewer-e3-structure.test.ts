/**
 * U-06/U-07 구조 가드 (소스 스캔):
 *  - 뷰어 셸·섹션·프리미티브·GlossaryText 는 Server Component 호환(훅/'use client'/이벤트 핸들러 없음)
 *  - 클라이언트 섬은 zod / supabase / node: 내장 / 도메인(값) 을 import 하지 않아 독자 번들에 들어가지 않는다
 *  - 클라이언트 섬은 서버 전용 DOMPurify 를 끌어오는 viewer-primitives 를 import 하지 않는다
 *  - next/dynamic 은 클라이언트 래퍼(LazyIslands)에서만 호출한다 (Server Component 에서는 코드 분할 안 됨)
 *  - (magazine) 라우트 그룹 레이아웃: PublicBottomNav·ThemeToggle·PageTransition 제외, color-scheme dark, 스킵 링크
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../../');
const read = (rel: string) => fs.readFileSync(path.resolve(SRC, rel), 'utf-8');
const exists = (rel: string) => fs.existsSync(path.resolve(SRC, rel));

const SHELL = 'app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx';
const SERVER_FILES = [
  SHELL,
  'components/magazine/viewer-sections.tsx',
  'components/magazine/viewer-primitives.tsx',
  'components/magazine/GlossaryText.tsx',
];
const USE_CLIENT = /^\s*['"]use client['"]/m;

describe('U-06 서버 셸 / 클라이언트 섬 분리', () => {
  it.each(SERVER_FILES)('%s 는 서버 호환 (use client·훅·이벤트 핸들러 없음)', (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(USE_CLIENT);
    expect(src).not.toMatch(/\buse(State|Effect|Ref|Memo|Callback|Id|Context|LayoutEffect)\b\s*[(<]/);
    expect(src).not.toMatch(/\bon(Click|Change|Error|Submit|Toggle)\s*=\s*\{/);
    expect(src).not.toMatch(/from ['"]motion\/react['"]/);
  });

  const CLIENT_ISLANDS = [
    'components/magazine/viewer-track.tsx',
    'components/magazine/SectionCard.tsx',
    'components/magazine/GlossaryTerm.tsx',
    'components/magazine/BrokerAvatar.tsx',
    'components/magazine/ForwardSection.tsx',
    'components/magazine/PollSection.tsx',
    'components/magazine/RoiIsland.tsx',
    'components/magazine/RoiCalculator.tsx',
    'components/magazine/LazyIslands.tsx',
    'components/magazine/ViewerBottomBar.tsx',
    'components/magazine/SubscribeCard.tsx',
    'components/magazine/MagazineRouteEffects.tsx',
    'components/magazine/PreviewReceiver.tsx',
    'hooks/use-magazine-analytics.ts',
  ];

  it.each(CLIENT_ISLANDS)('%s 는 클라이언트 섬이며 번들 금지 의존(zod/supabase/node:/도메인 값)이 없다', (rel) => {
    const src = read(rel);
    expect(src).toMatch(USE_CLIENT);
    const imports = Array.from(src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm));
    for (const m of imports) {
      const isTypeOnly = !!m[1];
      const spec = m[2];
      expect(spec, `${rel}: ${spec}`).not.toMatch(/^zod($|\/)/);
      expect(spec, `${rel}: ${spec}`).not.toMatch(/supabase/);
      expect(spec, `${rel}: ${spec}`).not.toMatch(/^node:/);
      expect(spec, `${rel}: ${spec}`).not.toBe('isomorphic-dompurify');
      expect(spec, `${rel}: ${spec}`).not.toBe('@/components/magazine/viewer-primitives');
      if (!isTypeOnly) expect(spec, `${rel}: ${spec}`).not.toMatch(/^@\/domain/);
    }
  });

  it('next/dynamic 은 클라이언트 래퍼(LazyIslands)에서만 호출한다', () => {
    const lazy = read('components/magazine/LazyIslands.tsx');
    expect(lazy).toMatch(USE_CLIENT);
    expect(lazy).toMatch(/from ['"]next\/dynamic['"]/);
    expect(lazy).toMatch(/LazyRoiCalculator/);
    expect(lazy).toMatch(/LazyForwardSection/);
    for (const rel of SERVER_FILES) expect(read(rel)).not.toMatch(/from ['"]next\/dynamic['"]/);
    expect(read(SHELL)).toMatch(/@\/components\/magazine\/LazyIslands/);
  });

  it('함수 props 를 서버→클라이언트 경계로 넘기지 않는다 (셸에 onTrack/onToggle/onInteract 없음)', () => {
    const shell = read(SHELL);
    expect(shell).not.toMatch(/onTrack\s*=/);
    expect(shell).not.toMatch(/onToggle\s*=/);
    expect(shell).not.toMatch(/onInteract\s*=/);
  });

  it('독자 이미지는 크기를 명시한 지연 로드 <img> 다 (배경 이미지 url() 직접 주입 없음)', () => {
    const shell = read(SHELL);
    expect(shell).not.toMatch(/url\(\\?"\$\{(deal\.photoUrl|coverImageUrl)\}/);
    expect(shell).toMatch(/loading="lazy"/);
    expect(shell).toMatch(/fetchPriority="high"/);
  });
});

describe('U-07 (magazine) 라우트 그룹', () => {
  it('(public)/magazine 은 사라졌고 (magazine)/magazine 에 모든 라우트가 있다', () => {
    expect(exists('app/(public)/magazine')).toBe(false);
    for (const rel of [
      'app/(magazine)/magazine/error.tsx',
      'app/(magazine)/magazine/[brokerId]/page.tsx',
      'app/(magazine)/magazine/[brokerId]/subscribe/page.tsx',
      'app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx',
      'app/(magazine)/magazine/[brokerId]/[date]/page.tsx',
      'app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx',
    ]) expect(exists(rel), rel).toBe(true);
    // loading.tsx 는 응답을 스트리밍해 notFound()/permanentRedirect 를 HTTP 200 으로 만든다 — 두지 않는다.
    expect(exists('app/(magazine)/magazine/loading.tsx')).toBe(false);
  });

  it('/privacy·/terms 는 (public) 에 남는다 (이동 대상 아님)', () => {
    expect(exists('app/(public)/privacy')).toBe(true);
    expect(exists('app/(public)/terms')).toBe(true);
  });

  it('그룹 레이아웃: 하단 내비·테마 토글·전환 효과 제외, color-scheme dark, 스킵 링크, <style> 우회 없음', () => {
    const layout = read('app/(magazine)/layout.tsx');
    expect(layout).not.toMatch(/import[^;]*PublicBottomNav/);
    expect(layout).not.toMatch(/import[^;]*ThemeToggle/);
    expect(layout).not.toMatch(/import[^;]*PageTransition/);
    expect(layout).not.toMatch(/<style[\s>]/);
    expect(layout).toMatch(/colorScheme:\s*["']dark["']/);
    expect(layout).toMatch(/href="#magazine-main"/);
    expect(layout).toMatch(/template:\s*["']%s \| DealCard["']/);
    // (public) 의 홈 canonical 상속이 사라졌으므로 그룹 기본 canonical 은 두지 않는다 (페이지별 지정)
    expect(layout).not.toMatch(/canonical\s*:/);
    expect(exists('app/(magazine)/template.tsx')).toBe(false);
  });

  it('[date] 페이지는 canonical·noindex·미발행 가드를 유지한다', () => {
    const page = read('app/(magazine)/magazine/[brokerId]/[date]/page.tsx');
    expect(page).toMatch(/alternates:\s*\{\s*canonical/);
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});
