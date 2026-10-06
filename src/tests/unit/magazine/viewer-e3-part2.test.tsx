/**
 * E3 Part2 골든 결함 수정 단위 테스트
 *  ① loading.tsx 로 인한 소프트 404/리다이렉트 방지(구조)  ② 아카이브·랜딩 통합 읽기  ③ 공개 표시명 SSOT
 *  ④ 중첩 button 없음  ⑥ 구독 source 매핑
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/script', () => ({ default: () => null }));

import {
  buildLegacyIssueEntries,
  findLatestIssueDate,
  isNonPublicMarker,
  isUnpublishedContent,
  listPublishedEntries,
  mergeArchiveEntries,
  publicBrokerDisplayName,
  resolvePublicDisplayName,
  type ArchiveEntry,
} from '@/lib/magazine/public-page-data';
import { isUnpublishedContent as isUnpublishedFromIssue } from '@/lib/magazine/get-published-issue';
import { resolveSubscribeSource } from '@/lib/magazine/subscribe-source';
import { SUBSCRIBE_SOURCES } from '@/domain/magazine/subscriber-consent-types';
import { AuctionSection } from '@/components/magazine/viewer-sections';

const NOW = new Date('2026-10-06T03:00:00Z'); // KST 2026-10-06 12:00
const ROOT = path.resolve(__dirname, '../../../..');

describe('① 소프트 404/리다이렉트 — 세그먼트 loading.tsx 없음', () => {
  it('(magazine) 라우트 그룹 어디에도 loading.tsx 가 없다 (notFound/permanentRedirect 가 스트리밍으로 200 이 되는 원인)', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      );
    const files = walk(path.join(ROOT, 'src/app/(magazine)'));
    expect(files.filter((f) => /loading\.(t|j)sx?$/.test(f))).toEqual([]);
  });

  it('notFound/permanentRedirect 를 호출하는 페이지는 Suspense 경계 안에서 호출하지 않는다', () => {
    for (const rel of ['[brokerId]/page.tsx', '[brokerId]/subscribe/page.tsx', '[brokerId]/[date]/page.tsx']) {
      const src = fs.readFileSync(path.join(ROOT, 'src/app/(magazine)/magazine', rel), 'utf8');
      expect(src).not.toContain('<Suspense');
    }
  });
});

// ── 최소 supabase 체인 목 (테이블별 rows 반환, thenable) ─────────────────
function mockDb(tables: Record<string, unknown[] | { error: string }>) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      calls.push(table);
      const entry = tables[table];
      const result = Array.isArray(entry)
        ? { data: entry, error: null }
        : { data: null, error: { message: (entry as { error: string }).error } };
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'in', 'eq', 'lte', 'gte', 'lt', 'not', 'order', 'limit']) chain[m] = () => chain;
      chain.maybeSingle = async () => ({
        data: Array.isArray(entry) ? (entry[0] ?? null) : null,
        error: result.error,
      });
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return chain;
    },
  };
  return { db, calls };
}

const BROKER = { user_id: 'u1', slug: 'test-broker-kim' };

describe('② 아카이브·랜딩 통합 읽기 (published editions + 레거시 published issues)', () => {
  it('buildLegacyIssueEntries: 초안·검수대기·미래·잘못된 날짜 제외, 같은 날짜는 최신 갱신 1건', () => {
    const out = buildLegacyIssueEntries(
      [
        { id: 'a', issue_date: '2026-09-20', updated_at: '2026-09-20T01:00:00Z', headline: '9/20 호', market_temp: '선별 매수', cover_keywords: ['강남', 7, '성수'] },
        { id: 'a2', issue_date: '2026-09-20', updated_at: '2026-09-21T01:00:00Z', headline: '9/20 수정본' },
        { id: 'b', issue_date: '2026-09-13', updated_at: 'x', status: 'draft', headline: '초안' },
        { id: 'c', issue_date: '2026-09-06', updated_at: 'x', qg_passed: 'false', headline: '검수 전' },
        { id: 'd', issue_date: '2026-12-31', updated_at: 'x', headline: '미래' },
        { id: 'e', issue_date: '2026-13-45', updated_at: 'x', headline: '잘못된 날짜' },
        { id: 'f', issue_date: '2026-08-30', updated_at: 'x', status: 'published', qg_passed: 'true', headline: '  ' },
      ],
      NOW,
    );
    expect(out.map((e) => `${e.date}:${e.id}`)).toEqual(['2026-09-20:a2', '2026-08-30:f']);
    expect(out[0].title).toBe('9/20 수정본');
    expect(out[1].title).toBeNull();
  });

  it('mergeArchiveEntries: 같은 날짜는 에디션 우선, 에디션 없는 날짜는 레거시 포함, 최신순', () => {
    const ed: ArchiveEntry[] = [{ id: 'ed1', date: '2026-09-27', label: '2026-09-27', title: '에디션', marketTemp: null, keywords: [] }];
    const legacy: ArchiveEntry[] = [
      { id: 'is1', date: '2026-09-27', label: '2026-09-27', title: '레거시(중복)', marketTemp: null, keywords: [] },
      { id: 'is2', date: '2026-09-20', label: '2026-09-20', title: '레거시', marketTemp: null, keywords: [] },
    ];
    const merged = mergeArchiveEntries(ed, legacy);
    expect(merged.map((e) => `${e.date}:${e.id}`)).toEqual(['2026-09-27:ed1', '2026-09-20:is2']);
  });

  it('listPublishedEntries: 에디션 없이 레거시 issue 만 있어도 아카이브에 나온다 (빈 아카이브 방지)', async () => {
    const { db } = mockDb({
      magazine_editions: [],
      magazine_issues: [{ id: 'is-0920', issue_date: '2026-09-20', updated_at: '2026-09-20T00:00:00Z', headline: '레거시 호' }],
    });
    const out = await listPublishedEntries(db, BROKER, 50, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: '2026-09-20', title: '레거시 호' });
  });

  it('findLatestIssueDate 는 아카이브와 같은 목록에서 도출 — 초안 issue 는 최신호가 되지 않는다', async () => {
    const { db } = mockDb({
      magazine_editions: [],
      magazine_issues: [
        { id: 'draft', issue_date: '2026-10-04', updated_at: 'x', status: 'needs_review' },
        { id: 'ok', issue_date: '2026-09-27', updated_at: 'x', headline: '발행본' },
      ],
    });
    expect(await findLatestIssueDate(db, BROKER, NOW)).toBe('2026-09-27');
    const empty = mockDb({ magazine_editions: [], magazine_issues: [] });
    expect(await findLatestIssueDate(empty.db, BROKER, NOW)).toBeNull();
  });

  it('DB 오류는 삼키지 않고 throw (빈 목록으로 위장 금지)', async () => {
    const { db } = mockDb({ magazine_editions: [], magazine_issues: { error: 'boom' } });
    await expect(listPublishedEntries(db, BROKER, 50, NOW)).rejects.toThrow(/archive issue lookup failed: boom/);
  });

  it('공개 판정은 한 곳: get-published-issue 의 isUnpublishedContent 와 동일 함수', () => {
    expect(isUnpublishedFromIssue).toBe(isUnpublishedContent);
    expect(isUnpublishedContent({ status: 'draft' })).toBe(true);
    expect(isUnpublishedContent({ generation: { qualityGate: { passed: false } } })).toBe(true);
    expect(isUnpublishedContent({ generation: { qualityGate: { passed: true } }, headline: 'x' })).toBe(false);
    expect(isNonPublicMarker('needs_review', undefined)).toBe(true);
    expect(isNonPublicMarker(undefined, undefined)).toBe(false);
  });
});

describe('③ 공개 표시명 SSOT', () => {
  it('broker_profiles.name 우선, 없으면 profiles.display_name, 둘 다 없으면 null', () => {
    expect(publicBrokerDisplayName('김테스트', 'E2E 테스트 브로커')).toBe('김테스트');
    expect(publicBrokerDisplayName('  ', 'E2E 테스트 브로커')).toBe('E2E 테스트 브로커');
    expect(publicBrokerDisplayName(null, undefined)).toBeNull();
  });
  it('resolvePublicDisplayName: name 이 있으면 profiles 를 조회하지 않는다', async () => {
    const { db, calls } = mockDb({ profiles: [{ display_name: '프로필 이름' }] });
    expect(await resolvePublicDisplayName(db, { user_id: 'u1', name: '김테스트' })).toBe('김테스트');
    expect(calls).toEqual([]);
  });
  it('resolvePublicDisplayName: name 이 없으면 display_name, 조회 오류는 throw', async () => {
    const { db } = mockDb({ profiles: [{ display_name: '프로필 이름' }] });
    expect(await resolvePublicDisplayName(db, { user_id: 'u1', name: null })).toBe('프로필 이름');
    const bad = mockDb({ profiles: { error: 'down' } });
    await expect(resolvePublicDisplayName(bad.db, { user_id: 'u1', name: '' })).rejects.toThrow(/profile lookup failed/);
  });
  it('뷰어 페이지는 발행 스냅샷 이름을 SSOT 로 덮어쓴다 (소스 확인)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/app/(magazine)/magazine/[brokerId]/[date]/page.tsx'), 'utf8');
    expect(src).toContain('resolvePublicDisplayName');
    expect(src).toMatch(/broker:\s*\{\s*\.\.\.snapshotBroker,\s*name:\s*displayName/);
  });
});

describe('④ 중첩 button 없음 (경매 픽 헤더)', () => {
  it('SectionCard 헤더 button 안에 다른 button 이 없고, NPL 용어 설명은 패널에 있다', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuctionSection, {
        picks: [{ address: '역삼동', discountPct: 20, minimumBid: 8e8, appraisedValue: 1e9, auctionDate: '2026-10-10', status: '진행' }],
      }),
    );
    // 어떤 <button> 도 닫히기 전에 또 다른 <button> 을 열지 않는다
    expect(/<button\b(?:(?!<\/button>)[\s\S])*<button\b/.test(html)).toBe(false);
    expect(html).toContain('NPL 소싱');
    expect(html).toContain('NPL 설명 보기'); // 용어 버튼은 헤더 밖(패널 본문)
  });
});

describe('⑥ 구독 source 매핑', () => {
  it('?ref=forward 는 qr_card 가 아니다 → magazine (referrer 는 별도 필드)', () => {
    expect(resolveSubscribeSource(undefined, 'forward')).toBe('magazine');
  });
  it('QR 진입(?source=qr_card)은 qr_card, 화이트리스트 값은 그대로, 그 밖의 값은 magazine', () => {
    expect(resolveSubscribeSource('qr_card', undefined)).toBe('qr_card');
    expect(resolveSubscribeSource('vibe_card', 'forward')).toBe('vibe_card');
    expect(resolveSubscribeSource('evil<script>', undefined)).toBe('magazine');
    expect(resolveSubscribeSource('  im ', null)).toBe('im');
  });
  it('파라미터가 없으면 기존 기본값 qr_card (e2e 계약)', () => {
    expect(resolveSubscribeSource(undefined, undefined)).toBe('qr_card');
    expect(resolveSubscribeSource('', '')).toBe('qr_card');
  });
  it('항상 구독 API 화이트리스트 안의 값', () => {
    for (const s of [undefined, 'qr_card', 'x', 'magazine']) {
      for (const r of [undefined, 'forward', '']) {
        expect(SUBSCRIBE_SOURCES as readonly string[]).toContain(resolveSubscribeSource(s, r));
      }
    }
  });
});
