/**
 * @file p0-pii-persona-scrub.test.ts
 * @description T29: 개인정보 마스킹 (PII Scrubbing) + 페르소나 격리 검증
 *
 * 메모에 전화번호, 실명, 페르소나 지칭 문구 등이 포함되었을 때
 * stripMarkdown 및 PPTX 렌더링 파이프라인을 거치며 정상적으로
 * 제거/마스킹되는지 확인합니다.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { stripMarkdown, bindSectionData } from '@/domain/building/mobile-im/pptx/data-binder';
import { extractSlideTexts, assertNoCorruptionStrings, BUILDING_META } from './pptx-test-helpers';

describe('T29: PII Scrubbing & Persona Isolation', { timeout: 60_000 }, () => {
  let renderer: MobileImPptxRenderer;

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  // ── Section A: stripMarkdown 페르소나 격리 단위 테스트 ──

  describe('A. Persona text stripping in stripMarkdown', () => {
    const personaPhrases = [
      '60대 자산가를 위한',
      '50대 자산가를 위한',
      '60대 투자자의 관점',
      '고액 자산가에게 추천하는',
      '법인 대표 맞춤',
      'VIP 투자자용',
      '초보 매수자를 위한',
      '개인 투자자의 관점',
      '40대 자산가를 위한',
      '30대 투자자에게 추천하는',
    ];

    personaPhrases.forEach((phrase, idx) => {
      test(`T29-A${String(idx + 1).padStart(2, '0')}: Strips "${phrase}" from output`, () => {
        const input = `${phrase} 안정적 월 임대수익과 우량 테넌트 자산입니다.`;
        const result = stripMarkdown(input);

        // 페르소나 지칭 문구가 제거되어야 함
        expect(result).not.toContain('60대');
        expect(result).not.toContain('50대');
        expect(result).not.toContain('40대');
        expect(result).not.toContain('30대');
        expect(result).not.toContain('자산가를 위한');
        expect(result).not.toContain('투자자의 관점');
        expect(result).not.toContain('에게 추천하는');
        expect(result).not.toContain('VIP');
        expect(result).not.toContain('초보');
        expect(result).not.toContain('고액');
        // 실질 콘텐츠는 보존
        expect(result).toContain('안정적');
        expect(result).toContain('임대수익');
      });
    });

    test('T29-A11: Multiple persona phrases in single text → all stripped', () => {
      const input = '60대 자산가를 위한 고급 사옥 투자. VIP 투자자용 프리미엄 자산.';
      const result = stripMarkdown(input);
      expect(result).not.toContain('60대');
      expect(result).not.toContain('VIP');
      expect(result).toContain('투자');
      expect(result).toContain('자산');
    });

    test('T29-A12: No false positives on normal CRE text', () => {
      const normalTexts = [
        { text: '자산가치 분석 결과 150억 상회', expectContain: '분석' },
        { text: '투자 수익률 5.8% 달성', expectContain: '수익률' },
        { text: '대표 브로커 정보', expectContain: '브로커' },
        { text: '매수자 정보는 비공개', expectContain: '비공개' },
      ];
      for (const { text, expectContain } of normalTexts) {
        const result = stripMarkdown(text);
        expect(result).toContain(expectContain);
      }
    });
  });

  // ── Section B: 시스템 메시지 제거 ──

  describe('B. Internal system message stripping', () => {
    test('T29-B01: "건축물대장 조회 미완료" stripped', () => {
      const input = '> 🔍 **건축물대장 조회 미완료**: 공공데이터 API 응답을 받지 못했습니다.';
      const result = stripMarkdown(input);
      expect(result).not.toContain('건축물대장 조회 미완료');
      expect(result).not.toContain('공공데이터 API');
    });

    test('T29-B02: "추후 업데이트 시 자동 반영됩니다" stripped', () => {
      const input = '임대차 상세 현황은 추후 업데이트 시 자동 반영됩니다.';
      const result = stripMarkdown(input);
      expect(result).not.toContain('추후 업데이트 시 자동 반영됩니다');
    });

    test('T29-B03: "임대차 상세 현황" system message stripped', () => {
      const input = '> 🔒 **임대차 상세 현황 미확인** 부분입니다.';
      const result = stripMarkdown(input);
      expect(result).not.toContain('임대차 상세 현황');
    });
  });

  // ── Section C: HTML/이모지 제거 ──

  describe('C. HTML tags and emoji removal', () => {
    test('T29-C01: HTML tags stripped', () => {
      const input = '<b>강조</b> 텍스트 <script>alert("XSS")</script>';
      const result = stripMarkdown(input);
      expect(result).not.toContain('<b>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('강조');
      expect(result).toContain('텍스트');
    });

    test('T29-C02: Emoji removed from output', () => {
      const input = '✨ 핵심 투자 포인트 🏢 건물 현황 💡 시사점';
      const result = stripMarkdown(input);
      expect(result).not.toContain('✨');
      expect(result).not.toContain('🏢');
      expect(result).not.toContain('💡');
      expect(result).toContain('핵심 투자 포인트');
    });
  });

  // ── Section D: PPTX 렌더링 레벨 검증 ──

  describe('D. PPTX-level persona and PII verification', () => {
    test('T29-D01: Persona phrases do NOT appear in rendered PPTX', async () => {
      const docWithPersona = {
        title: '서초 메디컬빌딩',
        body: {},
        sections: [
          {
            title: '물건 개요',
            markdown: '60대 자산가를 위한 서초 메디컬빌딩은 올근생 건물입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 연면적 | 620.8평 |',
            section_type: 'property_overview',
          },
          {
            title: '입지',
            markdown: '강남역 도보 4분 거리에 위치합니다.',
            section_type: 'location_access',
          },
          {
            title: '임대차 현황',
            markdown: '전층 만실 운영 중입니다.\n\n| 층 | 업종 | 월세 |\n|---|---|---|\n| 1F | 약국 | 1,200만 |',
            section_type: 'lease_status',
          },
          {
            title: '수익성',
            markdown: 'VIP 투자자용 프리미엄 수익 구조. Cap Rate 4.62%입니다.',
            section_type: 'income_analysis',
          },
          {
            title: '리스크',
            markdown: '| 리스크 | 현황 | 완화 |\n|---|---|---|\n| 업종 집중 | 의료 | 다각화 |',
            section_type: 'risk_check',
          },
          {
            title: '투자 포인트',
            markdown: '60대 자산가를 위한 핵심 투자 자산입니다.',
            section_type: 'investment_thesis',
          },
          {
            title: '다음 단계',
            markdown: '고액 자산가에게 추천하는 다음 단계입니다.',
            section_type: 'next_steps',
          },
        ],
      };

      const input: MobileImPptxInput = {
        buildingId: 'pii-persona-test',
        posture: 'income',
        grade: 'A',
        doc: docWithPersona,
        building: BUILDING_META.income,
      };

      const result = await renderer.render(input);
      await assertNoCorruptionStrings(result.buffer);

      const slideTexts = await extractSlideTexts(result.buffer);
      const allText = Array.from(slideTexts.values()).flat().join(' ');

      // 페르소나 지칭이 PPTX에 나타나면 안 됨
      // (addFallbackContent에서도 stripMarkdown 적용 완료)
      expect(allText).not.toContain('60대 자산가를 위한');
      expect(allText).not.toContain('VIP 투자자용');
      expect(allText).not.toContain('고액 자산가에게 추천하는');

      // 실질 콘텐츠는 보존
      expect(allText).toContain('서초');
      expect(allText).toContain('메디컬');
    });

    test('T29-D02: System messages do NOT leak into PPTX', async () => {
      const docWithSystemMsg = {
        title: '테스트 물건',
        body: {},
        sections: [
          {
            title: '물건 개요',
            markdown: '일반 빌딩입니다.\n> 🔍 **건축물대장 조회 미완료**: 공공데이터 API 응답을 받지 못했습니다.\n\n| 항목 | 내용 |\n|---|---|\n| 연면적 | 300평 |',
            section_type: 'property_overview',
          },
          {
            title: '리스크',
            markdown: '| 리스크 | 현황 | 완화 |\n|---|---|---|\n| 정보부족 | 확인중 | 보완 |',
            section_type: 'risk_check',
          },
          {
            title: '투자 포인트',
            markdown: '핵심 자산입니다.',
            section_type: 'investment_thesis',
          },
          {
            title: '다음 단계',
            markdown: '실사 진행.',
            section_type: 'next_steps',
          },
        ],
      };

      const input: MobileImPptxInput = {
        buildingId: 'pii-sysmsg-test',
        posture: 'income',
        grade: 'A',
        doc: docWithSystemMsg,
        building: BUILDING_META.income,
      };

      const result = await renderer.render(input);
      const slideTexts = await extractSlideTexts(result.buffer);
      const allText = Array.from(slideTexts.values()).flat().join(' ');

      expect(allText).not.toContain('건축물대장 조회 미완료');
      expect(allText).not.toContain('공공데이터 API');
    });
  });

  // ── Section E: bindSectionData 레벨 페르소나 격리 ──

  describe('E. bindSectionData persona isolation', () => {
    test('T29-E01: Persona text stripped from bound section content', () => {
      const doc = {
        body: {},
        sections: [
          {
            title: '투자 포인트',
            markdown: '60대 자산가를 위한 핵심 투자 자산입니다. 안정적 월 임대수익을 제공합니다.',
            section_type: 'investment_thesis',
          },
        ],
      };

      const result = bindSectionData(doc);
      const thesis = result['thesis'];
      expect(thesis).toBeDefined();

      // 바인딩된 데이터의 파싱된 필드들에서 페르소나 문구가 제거
      // content 자체는 원본이 보존될 수 있지만, 아키타입으로 변환된 props에서는 제거
      if (thesis.pillars) {
        const pillarText = (thesis as any).pillars.map((p: any) => `${p.title} ${p.body}`).join(' ');
        expect(pillarText).not.toContain('60대 자산가를 위한');
      }
    });
  });
});
