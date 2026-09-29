import { describe, it, expect } from 'vitest';
import { SECTION_LABELS, CHAPTER_LABELS, TIER_LABELS, CONCEPT_LABELS } from '@/domain/ontology/d56-labels';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('D56 용어사전 정합성', () => {
  it('SECTION_LABELS의 모든 값이 D56 권장어와 일치해야 함', () => {
    // D56 권장어 중 일부 핵심 단어들
    const validLabels = [
      '자산 개요',
      '입지 및 시장',
      '임대차 현황표',
      '임대수입 산정기준',
      '위험요인',
      '위험요인 및 반대근거',
      '중개인 검토의견',
      '실사사항 및 매입의향 조건',
      '다음 확인사항',
      '커버 및 브리핑 요약',
      'AI 주간 브리핑',
      '현장 필드노트',
      '금주의 핵심 테마',
      '추천 매물 하이라이트',
      '실거래 및 시장 데이터',
      '주요 CRE 뉴스',
      '세무 및 법률 클리닉',
      '경매 추천 픽',
      '투자 심리 지수',
    ];

    Object.values(SECTION_LABELS).forEach(label => {
      expect(validLabels).toContain(label);
    });
  });

  it('im.lexicon.yaml 치환사전이 D56 §3과 동기화되어 있어야 함', () => {
    const lexiconPath = path.resolve(__dirname, '../../../../credeal/ssot/im.lexicon.yaml');
    const content = fs.readFileSync(lexiconPath, 'utf8');
    const lexicon = yaml.load(content) as any;
    
    expect(lexicon).toHaveProperty('substitutions');
    const subs = lexicon.substitutions;
    
    // Check if new D56 substitutions were appended
    const hasD56Subs = subs.some((s: any) => s.from === 'OM' && s.to === '매각안내서');
    expect(hasD56Subs).toBe(true);
  });

  it('AI 금지규칙 12건이 모두 등록되어야 함', () => {
    const lexiconPath = path.resolve(__dirname, '../../../../credeal/ssot/im.lexicon.yaml');
    const content = fs.readFileSync(lexiconPath, 'utf8');
    const lexicon = yaml.load(content) as any;
    
    expect(lexicon).toHaveProperty('ai_prohibitions');
    expect(lexicon.ai_prohibitions.length).toBeGreaterThanOrEqual(12);
    expect(lexicon.ai_prohibitions[0].id).toBe('AI01');
  });
});
