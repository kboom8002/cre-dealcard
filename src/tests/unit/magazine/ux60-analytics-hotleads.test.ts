/**
 * Subagent U4 — 60대 중개사 성과/핫리드 대시보드 & 통화 브리핑 모달 단위 테스트
 *  - U-F1-02 (B-06, B-25): '지금 연락해야 할 핫리드' 최상단(First Fold) 배치 및 XPath 형제 계약 보존
 *  - C-18: 영문 세그먼트 코드 한글화 (formatSubscriberSegmentKo) 및 섹션/호수 한글화
 *  - B-19 & C-21: 통화 브리핑 모달 상단 18px 전화번호 + [📞 바로 전화 걸기] / [📋 전화번호 복사] + 16px 스크립트
 *  - 타이포그래피(>=14px, text-sm 이상) & 터치 타깃(min-h-11 / min-h-12) 상향 검증
 */
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatSubscriberSegmentKo,
  formatSectionLabelKo,
  buildSeniorBriefingTemplate,
} from '@/components/magazine-editor/analytics/CallBriefingModal';
import { KpiCardWithHelp } from '@/components/magazine-editor/analytics/KpiCardWithHelp';
import {
  EditionComparisonTable,
  formatEditionLabelKo,
} from '@/components/magazine-editor/analytics/EditionComparisonTable';

const ROOT = process.cwd();

describe('C-18: formatSubscriberSegmentKo (영문 세그먼트 코드 한글화)', () => {
  it('표준 영문 세그먼트 코드를 60대 친화 한글 라벨로 변환한다', () => {
    expect(formatSubscriberSegmentKo('investor')).toBe('투자 관심');
    expect(formatSubscriberSegmentKo('buyer')).toBe('매수 희망');
    expect(formatSubscriberSegmentKo('seller')).toBe('건물주·매도');
    expect(formatSubscriberSegmentKo('tenant')).toBe('임차 희망');
    expect(formatSubscriberSegmentKo('all')).toBe('일반 구독자');
    expect(formatSubscriberSegmentKo('general')).toBe('일반 구독자');
  });

  it('대소문자·공백·괄호 포함 문자열("구독자 (investor)")도 한글로 변환하고 영문 노출이 없다', () => {
    expect(formatSubscriberSegmentKo('  INVESTOR ')).toBe('투자 관심');
    expect(formatSubscriberSegmentKo('구독자 (investor)')).toBe('투자 관심');
    expect(formatSubscriberSegmentKo('구독자 (buyer)')).toBe('매수 희망');
    expect(formatSubscriberSegmentKo('unknown_code')).toBe('일반 구독자');
    expect(formatSubscriberSegmentKo('')).toBe('일반 구독자');
    expect(formatSubscriberSegmentKo(null)).toBe('일반 구독자');
    expect(formatSubscriberSegmentKo(undefined)).toBe('일반 구독자');
  });

  it('이미 한글인 세그먼트 라벨은 그대로 유지한다', () => {
    expect(formatSubscriberSegmentKo('투자 관심')).toBe('투자 관심');
    expect(formatSubscriberSegmentKo('매수 희망')).toBe('매수 희망');
  });
});

describe('formatSectionLabelKo / formatEditionLabelKo (섹션·호수 한글화)', () => {
  it('영문 섹션 ID를 자연스러운 한국어 섹션명으로 변환한다', () => {
    expect(formatSectionLabelKo('featured_deals')).toBe('추천 매물');
    expect(formatSectionLabelKo('market_pulse')).toBe('시장 브리핑');
    expect(formatSectionLabelKo('field_note')).toBe('현장 노트');
    expect(formatSectionLabelKo('tax_clinic')).toBe('세무·법률 클리닉');
    expect(formatSectionLabelKo('추천 매물')).toBe('추천 매물');
  });

  it('Vol.N 형태의 영문 호수 라벨을 N호로 변환한다', () => {
    expect(formatEditionLabelKo('Vol.1')).toBe('1호');
    expect(formatEditionLabelKo('vol 12')).toBe('12호');
    expect(formatEditionLabelKo('2026년 10월호')).toBe('2026년 10월호');
  });
});

describe('B-19 & C-21: buildSeniorBriefingTemplate (통화 브리핑 스크립트)', () => {
  const sampleLead = {
    subscriber_name: '김철수',
    buyerTemperature: '🔥 적극검토',
    totalViews: 4,
    recentSections: ['featured_deals', 'market_pulse'],
    interest_tags: {
      regions: ['강남·서초'],
      assetTypes: ['꼬마빌딩'],
    },
  };

  it('중개사 표시 이름이 없으면 "담당 공인중개사입니다"로 인사하고 "고객님, 안녕하세요" 계약을 유지한다', () => {
    const script = buildSeniorBriefingTemplate(sampleLead);
    expect(script).toContain('김철수 고객님, 안녕하세요. 담당 공인중개사입니다.');
    expect(script).not.toContain('안녕하세요. 중개사입니다.');
    expect(script).toContain('[추천 매물, 시장 브리핑]');
    expect(script).not.toContain('featured_deals');
    expect(script).toContain('강남·서초, 꼬마빌딩');
  });

  it('중개사 표시 이름이 전달되면 인사말에 반영한다', () => {
    const script = buildSeniorBriefingTemplate(sampleLead, '박영수 대표중개사');
    expect(script).toContain('김철수 고객님, 안녕하세요. 박영수 대표중개사입니다.');
  });
});

describe('U-F1-02 & 골든 E2E 계약: EditorAnalyticsTab / CallBriefingModal 소스 구조 검증', () => {
  const tabSrc = readFileSync(
    join(ROOT, 'src/components/magazine-editor/EditorAnalyticsTab.tsx'),
    'utf8',
  );
  const modalSrc = readFileSync(
    join(ROOT, 'src/components/magazine-editor/analytics/CallBriefingModal.tsx'),
    'utf8',
  );

  it('성과 탭에서 "지금 연락해야 할 핫리드" 섹션이 KPI("30일 총 열람")보다 먼저 배치된다 (First Fold 승격)', () => {
    const hotLeadIdx = tabSrc.indexOf('지금 연락해야 할 핫리드');
    const kpiIdx = tabSrc.indexOf('label="30일 총 열람"');
    expect(hotLeadIdx).toBeGreaterThan(0);
    expect(kpiIdx).toBeGreaterThan(0);
    expect(hotLeadIdx).toBeLessThan(kpiIdx);
  });

  it('Part 3 XPath 계약: <span>지금 연락해야 할 핫리드</span> 바로 다음 형제가 <span>{filteredLeads.length}명</span>이다', () => {
    expect(tabSrc).toMatch(
      /<span[^>]*>지금 연락해야 할 핫리드<\/span>\s*<span[^>]*>\s*\{filteredLeads\.length\}명\s*<\/span>/,
    );
  });

  it('통화 브리핑 모달 상단(스크립트 <pre> 위)에 전화번호(text-lg) + [📞 바로 전화 걸기] + [📋 전화번호 복사]가 배치된다', () => {
    const callIdx = modalSrc.indexOf('📞 바로 전화 걸기');
    const copyPhoneIdx = modalSrc.indexOf('📋 전화번호 복사');
    const preIdx = modalSrc.indexOf('<pre');
    expect(callIdx).toBeGreaterThan(0);
    expect(copyPhoneIdx).toBeGreaterThan(0);
    expect(preIdx).toBeGreaterThan(0);
    expect(callIdx).toBeLessThan(preIdx);
    expect(copyPhoneIdx).toBeLessThan(preIdx);
    expect(modalSrc).toContain('AI 생성 아님');
    expect(modalSrc).toContain('고객 통화 브리핑');
    expect(modalSrc).toContain('문구 복사');
  });

  it('소유 5개 파일에 14px 미만 텍스트 클래스(text-[11px], text-xs, text-label, text-caption)가 없다', () => {
    const ownedFiles = [
      'src/components/magazine-editor/EditorAnalyticsTab.tsx',
      'src/components/magazine-editor/analytics/CallBriefingModal.tsx',
      'src/components/magazine-editor/analytics/SubscriberDetailPanel.tsx',
      'src/components/magazine-editor/analytics/KpiCardWithHelp.tsx',
      'src/components/magazine-editor/analytics/EditionComparisonTable.tsx',
    ];
    for (const rel of ownedFiles) {
      const content = readFileSync(join(ROOT, rel), 'utf8');
      expect(content, rel).not.toMatch(/\btext-(?:xs|label|caption)\b/);
      expect(content, rel).not.toMatch(/text-\[(?:[0-9]|1[0-3])px\]/);
    }
  });
});

describe('KpiCardWithHelp & EditionComparisonTable 정적 렌더링 검증', () => {
  it('KpiCardWithHelp: exact 라벨, "${label} 기준 보기" 버튼, min-h-11 터치 타깃을 렌더링한다', () => {
    const html = renderToStaticMarkup(
      React.createElement(KpiCardWithHelp, {
        label: '완독률',
        definition: '최근 30일 열람 방문자 중 끝까지 읽은 비율입니다.',
        icon: React.createElement('span', null, 'icon'),
        value: '68',
        unit: '%',
        sub: '열람 방문자 중 끝까지 읽은 비율',
      }),
    );
    expect(html).toContain('>완독률</span>');
    expect(html).toContain('aria-label="완독률 기준 보기"');
    expect(html).toContain('min-h-11');
  });

  it('EditionComparisonTable: 발행 에디션별 성과 제목, 한글 호수 변환, 새 창 열기 터치 타깃을 렌더링한다', () => {
    const html = renderToStaticMarkup(
      React.createElement(EditionComparisonTable, {
        editions: [
          {
            id: 'ed-1',
            broker_id: 'kim-broker',
            edition_label: 'Vol.3',
            title: '강남 꼬마빌딩 주간 브리핑',
            market_temp: '선별 매수',
            view_count: 42,
            published_at: '2026-10-15T00:00:00Z',
          },
        ],
      }),
    );
    expect(html).toContain('발행 에디션별 성과');
    expect(html).toContain('3호');
    expect(html).toContain('42회');
    expect(html).toContain('aria-label="새 창에서 열기"');
    expect(html).toContain('min-h-11');
  });
});
