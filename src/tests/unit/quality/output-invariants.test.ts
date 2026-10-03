import { describe, it, expect } from 'vitest';
import {
  checkOutputInvariants, errorsOf, extractSlideXmlText, checkMetricParity, formatViolations,
} from '@/domain/building/mobile-im/quality/output-invariants';

const ids = (texts: string[]) => checkOutputInvariants(texts).map(v => v.id);

describe('H1 output-invariants: 정탐 (반드시 잡아야 함)', () => {
  it.each([
    ['PLACEHOLDER', '담당자 [담당자명] / [연락처]'],
    ['PLACEHOLDER', '중개법인 [중개법인명]'],
    ['PLACEHOLDER', '본 [건물명 비공개] 는'],
    ['PLACEHOLDER', 'hello {{broker_name}}'],
    ['EVASIVE_PHRASE', '수익률은 산출 중 입니다'],
    ['EVASIVE_PHRASE', '세부 조건은 추후 협의'],
    ['NUMERIC_ARTIFACT', '수익률 NaN%'],
    ['NUMERIC_ARTIFACT', '매매가 undefined 원'],
    ['NUMERIC_ARTIFACT', '값 [object Object]'],
    ['PAIRED_EMPTY', '주차 -대 / -대'],
    ['PAIRED_EMPTY', '승강기 -% / -%'],
    ['PAIRED_EMPTY', '주차 - / -'],
    ['JSON_MARKDOWN_LEAK', '{"price": 100}'],
    ['JSON_MARKDOWN_LEAK', '| a | b |\n|---|---|'],
    ['JSON_MARKDOWN_LEAK', '이것은 **강조** 텍스트'],
    ['MOCK_VALUE', '대주 NH농협캐피탈'],
  ])('%s: %s', (id, text) => {
    expect(ids([text])).toContain(id);
  });

  it('중복 문장은 warn 으로 보고 (Rule 4)', () => {
    const s = '이 자산은 역세권 코너 입지로 안정적인 임대 수요가 있습니다.';
    const v = checkOutputInvariants([`${s} ${s}`]);
    expect(v.some(x => x.id === 'DUPLICATE_SENTENCE' && x.severity === 'warn')).toBe(true);
    expect(errorsOf(v)).toHaveLength(0);
  });
});

describe('H1 output-invariants: 오탐 방지 (잡으면 안 됨)', () => {
  it.each([
    '오피스빌딩 매각 안내',
    '본 자산은 영등포구 양평동4가에 위치합니다',
    '주차 23대 / 승강기 1대',
    '공실률 0% / 임대료 -',
    '보증금 - / 월세 -',
    '표준 null값 처리 설명이 아닌 일반 문장 nullable',
    '연면적 1,234.5㎡ (373평)',
    '수익률 4.5% (NOI 기준)',
    '상호 [참고] 표기',
  ])('%s', (text) => {
    expect(errorsOf(checkOutputInvariants([text]))).toEqual([]);
  });

  it('서로 다른 슬라이드의 동일 문장은 중복으로 보지 않음 (단위별 검사)', () => {
    const s = '이 자산은 역세권 코너 입지로 안정적인 임대 수요가 있습니다.';
    expect(checkOutputInvariants([s, s])).toEqual([]);
  });
});

describe('H1 output-invariants: 유틸', () => {
  it('extractSlideXmlText: a:t 이어붙이고 엔티티 복원', () => {
    const xml = '<a:p><a:r><a:t>A &amp; B</a:t></a:r></a:p><a:p><a:r><a:t>두번째</a:t></a:r></a:p>';
    expect(extractSlideXmlText(xml)).toBe('A & B\n두번째');
  });

  it('formatViolations: 위반 없음 = OK', () => {
    expect(formatViolations([])).toBe('OK');
  });

  it('checkMetricParity: 불일치만 보고하고 결측은 제외', () => {
    const r = checkMetricParity(
      { price: '250억원', cap: '4.5%', area: '-', floors: 'B1~10F' },
      { price: '250억 원', cap: '4.6%', area: '518.7', floors: 'B1~10F' },
    );
    expect(r).toEqual([{ key: 'cap', a: '4.5%', b: '4.6%' }]);
  });
});
