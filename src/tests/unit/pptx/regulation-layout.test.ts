/**
 * Task A — 규제·계획 면 적응형 레이아웃 (A26 mode 'regulation')
 *  - 노트 수/글자 수에 따라 폰트·카드 높이가 늘고(여백 축소), 많으면 줄어든다
 *  - 요약 스트립은 '제공된 노트'의 종류별 건수만 센다 (없는 값 창작 금지)
 *  - 개발행위허가제한(warn) 카드는 근거/제한행위/기한 줄을 유지한다
 *  - 모든 카드 도형은 본문 하단(BODY_BOTTOM 6.30") 이내, SAFE_BOTTOM(6.75") 이내
 */
import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import {
  buildA26BrokerExtras,
  regulationFonts,
  summarizeRegulationCards,
} from '@/domain/building/mobile-im/pptx/archetypes/a26-broker-extras';
import { buildBrokerRegulationData } from '@/domain/building/mobile-im/pptx/broker-extras-slides';
import { SAFE_BOTTOM } from '@/domain/building/mobile-im/pptx/imlib';
import { extractSlideTexts } from '@/assurance/im-harness/golden-test-utils';

type Note = Record<string, unknown>;

const WARN: Note = {
  kind: 'dev_restriction',
  detail: '도시환경정비 예정구역(창신1구역) 내 개발행위허가 제한',
  basis: '국토계획법 제63조',
  restricted_acts: '신축 및 공작물 설치 (증개축 가능)',
  period: '도시환경정비 계획 수립 시까지',
};
const ZONING: Note = { kind: 'zoning_special', detail: '건폐율 60%, 용적률 기준 600%(허용 660%)' };
const DISTRICT: Note = { kind: 'district_plan', detail: '불허용도 제조·정신병원·창고 / 1층 지정용도 소매·휴게·음식·사무소' };

async function render(notes: Note[]) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  const data = buildBrokerRegulationData({ regulatory_notes: notes } as any)!;
  const out = buildA26BrokerExtras({ pres, slideNum: 7, docno: 'T-REG', data, grade: 'B', provenance: {} } as any);
  const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  const [slide] = await extractSlideTexts(buffer);
  return { out, text: slide.text, xml: slide.xml };
}

/** 라운드렉트(카드·스트립 타일) 도형의 [top, bottom] (인치) — 푸터 칩(y≥6.4)은 제외 */
function cardBoxes(xml: string): Array<{ top: number; bottom: number; w: number }> {
  const boxes: Array<{ top: number; bottom: number; w: number }> = [];
  for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []) {
    if (!sp.includes('prst="roundRect"')) continue;
    const m = sp.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!m) continue;
    const top = Number(m[2]) / 914400;
    const h = Number(m[4]) / 914400;
    if (top >= 6.4) continue;
    boxes.push({ top, bottom: top + h, w: Number(m[3]) / 914400 });
  }
  return boxes;
}

describe('규제·계획 면 — 요약 스트립 데이터 (제공된 노트에서만)', () => {
  it('종류별 건수와 총계를 센다 (등장 순서 유지)', () => {
    const data = buildBrokerRegulationData({ regulatory_notes: [DISTRICT, WARN, DISTRICT, ZONING] } as any)!;
    const s = summarizeRegulationCards(data.cards);
    expect(s.total).toBe(4);
    expect(s.items.map(i => [i.kind, i.count])).toEqual([
      ['district_plan', 2], ['dev_restriction', 1], ['zoning_special', 1],
    ]);
    expect(s.items.find(i => i.kind === 'dev_restriction')!.tone).toBe('warn');
  });

  it('노트가 없으면 비어 있다 (창작 금지)', () => {
    expect(summarizeRegulationCards([])).toEqual({ total: 0, items: [] });
  });

  it('폰트 스케일은 본문 기준 비례·경계 내', () => {
    for (const d of [9.5, 11, 14, 17, 20]) {
      const f = regulationFonts(d);
      expect(f.detail).toBe(d);
      expect(f.line).toBeGreaterThanOrEqual(9);
      expect(f.line).toBeLessThanOrEqual(16);
      expect(f.head).toBeGreaterThanOrEqual(10.5);
      expect(f.head).toBeLessThanOrEqual(17);
    }
  });
});

describe('규제·계획 면 — 렌더 (노트 수별 여백·넘침)', () => {
  const fontSizes = (xml: string) => [...xml.matchAll(/sz="(\d+)"/g)].map(m => Number(m[1]) / 100);

  it('노트 1건: 본문 폰트가 기존(11pt)보다 커지고 카드 높이도 늘어난다', async () => {
    const { text, xml } = await render([ZONING]);
    expect(text).toContain('건폐율 60%');
    expect(Math.max(...fontSizes(xml))).toBeGreaterThanOrEqual(18);
    const cards = cardBoxes(xml).filter(b => b.w > 10); // 전폭 카드
    expect(cards).toHaveLength(1);
    expect(cards[0].bottom - cards[0].top).toBeGreaterThan(1.5); // 기존 최소 1.2"
  });

  it('노트 1건: 요약 스트립(총 1건 + 종류 1건)이 있다', async () => {
    const { text } = await render([ZONING]);
    expect(text).toContain('규제·계획 항목');
    expect(text).toContain('1건');
    expect(text).toContain('용도지역 특례');
  });

  it('노트 2건(경고+특례): 근거/제한행위/기한 줄을 모두 유지하고 건수 타일이 정확하다', async () => {
    const { text } = await render([WARN, ZONING]);
    for (const s of ['근거', '국토계획법 제63조', '제한행위', '신축 및 공작물 설치 (증개축 가능)', '기한', '도시환경정비 계획 수립 시까지']) {
      expect(text).toContain(s);
    }
    expect(text).toContain('2건'); // 총계
    expect(text).toContain('개발행위허가제한');
  });

  it('노트 4건: 모든 카드가 본문 하단(6.30") 이내, SAFE_BOTTOM 이내', async () => {
    const { xml } = await render([WARN, ZONING, DISTRICT, { kind: 'other', detail: '건축선 후퇴 2m' }]);
    const boxes = cardBoxes(xml);
    expect(boxes.length).toBeGreaterThanOrEqual(8); // 스트립 타일 5 + 카드 4 (≥)
    for (const b of boxes) {
      expect(b.bottom).toBeLessThanOrEqual(6.31);
      expect(b.bottom).toBeLessThanOrEqual(SAFE_BOTTOM);
    }
  });

  it('노트 6건(과밀): 경고 카드의 줄이 넘치지 않도록 스트립을 생략하고 하한 폰트로 수용 — 모든 텍스트 유지', async () => {
    const many = Array.from({ length: 6 }, (_, i) => (i === 0
      ? { ...WARN, detail: `세부 지침 ${i + 1}: ` + '불허용도 제조·정신병원·창고·위험물저장 / 1층 지정용도 소매·휴게·음식 '.repeat(2) }
      : { kind: 'district_plan', detail: `세부 지침 ${i + 1}: ` + '불허용도 제조·정신병원·창고·위험물저장 / 1층 지정용도 소매·휴게·음식 '.repeat(2) }));
    const { text, xml } = await render(many);
    for (const n of ['근거', '제한행위', '기한', '세부 지침 6']) expect(text).toContain(n);
    for (const b of cardBoxes(xml)) expect(b.bottom).toBeLessThanOrEqual(6.31);
  });

  it('제목이 종류 라벨과 같으면 중복 표기하지 않는다', async () => {
    const { text } = await render([{ ...WARN, title: '개발행위허가제한' }]);
    expect(text).not.toContain('개발행위허가제한 · 개발행위허가제한');
  });
});
