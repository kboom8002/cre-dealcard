import { describe, it, expect } from 'vitest';
import { parseStationName, stationNameOnly, formatStationLabel } from '@/domain/building/mobile-im/pptx/binder/station-name';
import { normalizeStationName } from '@/domain/building/mobile-im/pptx/binder/binder-utils';
import { parseStation, extractSummaryFacts, buildSummaryHighlights } from '@/domain/building/mobile-im/pptx/summary-highlights';

describe('parseStationName (D11b)', () => {
  it.each([
    ['동대문역사문화공원역 5호선', '동대문역사문화공원역', ['5호선']],
    ['동대문역사문화공원역(2·4·5호선)', '동대문역사문화공원역', ['2호선', '4호선', '5호선']],
    ['동대문역사문화공원역', '동대문역사문화공원역', []],
    ['동대문역사문화공원', '동대문역사문화공원역', []],
    ['당산역(2호선/9호선)', '당산역', ['2호선', '9호선']],
    ['선유도역(9호선) 4번출구', '선유도역', ['9호선']],
    ['선유도역 9호선역', '선유도역', ['9호선']],
    ['양재역 신분당선', '양재역', ['신분당선']],
    ['판교역 GTX-A', '판교역', ['GTX-A']],
    ['인천시청역 인천2호선', '인천시청역', ['인천2호선']],
    ['강남', '강남역', []],
    ['서울대입구역', '서울대입구역', []],
    ['서울대입구역 2번출구', '서울대입구역', []],
    ['강남역（2호선）', '강남역', ['2호선']],
  ])('%s → %s %j', (raw, name, lines) => {
    expect(parseStationName(raw)).toEqual({ name, lines });
  });

  it('empty input', () => {
    expect(parseStationName('')).toEqual({ name: '', lines: [] });
    expect(parseStationName(null)).toEqual({ name: '', lines: [] });
    expect(stationNameOnly(undefined)).toBe('');
  });

  it('formatStationLabel', () => {
    expect(formatStationLabel('동대문역사문화공원역', ['5호선'])).toBe('동대문역사문화공원역(5호선)');
    expect(formatStationLabel('강남역', [])).toBe('강남역');
    expect(formatStationLabel('', ['2호선'])).toBe('');
  });

  it('normalizeStationName uses shared parser', () => {
    expect(normalizeStationName('동대문역사문화공원역(2·4·5호선)')).toBe('동대문역사문화공원역');
    expect(normalizeStationName('당산역(2호선/9호선)')).toBe('당산역');
    expect(normalizeStationName('양재역 신분당선')).toBe('양재역');
    expect(normalizeStationName('')).toBe('');
  });

  it('summary-highlights parseStation / label render full station name', () => {
    expect(parseStation('동대문역사문화공원역 5호선')).toEqual({ name: '동대문역사문화공원역', line: '5호선' });
    expect(parseStation('당산역(2호선/9호선)')).toEqual({ name: '당산역', line: '2호선·9호선' });
    expect(parseStation('선유도역(9호선) 4번출구')).toEqual({ name: '선유도역', line: '9호선' });
    expect(parseStation('강남')).toEqual({ name: '강남역', line: undefined });
    expect(parseStation('서울대입구역')).toEqual({ name: '서울대입구역', line: undefined });
    expect(parseStation('서울대입구역', '2호선')).toEqual({ name: '서울대입구역', line: '2호선' });

    const facts = extractSummaryFacts({
      posture: 'income',
      body: {},
      enrichment: { locationPoi: { nearestStation: { name: '동대문역사문화공원역 5호선', walkMinutes: 3, distanceM: 200 } } },
    } as any);
    const r = buildSummaryHighlights(facts);
    expect(r.shortHighlights[0]).toContain('동대문역사문화공원역(5호선) 도보 3분');
    expect(r.shortHighlights[0]).not.toContain('동대문역(사문화공원역');
  });
});
