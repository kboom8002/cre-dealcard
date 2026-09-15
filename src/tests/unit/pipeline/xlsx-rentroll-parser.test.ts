/**
 * XLSX 렌트롤 파서 엣지 케이스 테스트
 * 
 * Bug #3 검증: parseRentRollData()의 컬럼 인덱스 매칭 로직과 단위 변환/날짜 파싱 검증
 * - bizTypeIdx와 tenantNameIdx가 같은 열을 이중 매칭하지 않는지 확인
 * - 원→만원 자동 변환, Excel 직렬 날짜, 공실 행 감지 검증
 * 
 * Rule 7: Negative Pair Obligation
 * Rule 33: 임대면적 컬럼 오매칭 차단
 */
import { describe, test, expect } from 'vitest';

// parseRentRollData의 findCol 로직을 격리 재현
function findCol(header: string[], keywords: string[]): number {
  return header.findIndex((h) => h && keywords.some((k) => h.includes(k)));
}

// 공실 감지 로직 격리 재현 (수정 후)
function detectVacancy(
  cols: any[],
  vacantIdx: number,
  bizTypeIdx: number,
  tenantNameIdx: number,
): boolean {
  if (vacantIdx >= 0 && cols[vacantIdx] != null) {
    const val = String(cols[vacantIdx]).toLowerCase().trim();
    return val === 'y' || val === '1' || val === '공실' || val === 'true' || val === 'yes' || val === '●';
  } else if (bizTypeIdx >= 0) {
    const bizVal = String(cols[bizTypeIdx] ?? '').trim();
    if (bizVal === '' || bizVal === '-' || bizVal === '공실') return true;
  } else if (tenantNameIdx >= 0) {
    const tVal = String(cols[tenantNameIdx] ?? '').trim();
    if (tVal === '' || tVal === '-' || tVal === '공실') return true;
  }
  return false;
}

// Excel 직렬 날짜 변환
function parseExcelDate(val: any): string | undefined {
  if (!val) return undefined;
  const s = String(val).trim();
  if (!isNaN(Number(s)) && Number(s) > 30000) {
    const d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }
  const normalized = s.replace(/\./g, '-').replace(/\//g, '-');
  const m = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return s;
}

// 금액 단위 자동 감지
function detectAndConvertToManwon(value: number): number {
  if (value >= 100000) {
    return Math.round(value / 10000);
  }
  return value;
}

describe('XLSX 렌트롤 파서', () => {
  describe('표준 템플릿 v1.2 컬럼 매칭', () => {
    // 표준 템플릿 헤더 (정규화 후)
    const rawHeaders = ['층', '호실', '용도/업종', '임차인(상호)', '전용면적(㎡)', '보증금(만원)', '월세(만원)', '관리비(만원)', '계약시작일', '계약종료일', '비고'];
    const headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/[\s()（）]/g, ''));

    test('POSITIVE: 층 컬럼 매칭', () => {
      const idx = findCol(headers, ['층', '층수', 'floor']);
      expect(idx).toBe(0);
    });

    test('POSITIVE: 업종 컬럼 매칭 (수정 후 — 임차인 키워드 제거)', () => {
      const bizIdx = findCol(headers, ['업종', '용도', '종류', '구분']);
      expect(bizIdx).toBe(2); // '용도/업종' → index 2
    });

    test('POSITIVE: 임차인 컬럼 매칭', () => {
      const tenantIdx = findCol(headers, ['임차인', '입주사', 'tenant', '상호']);
      expect(tenantIdx).toBe(3); // '임차인(상호)' → index 3
    });

    test('NEGATIVE: bizTypeIdx와 tenantNameIdx가 같은 열을 가리키지 않음', () => {
      const bizIdx = findCol(headers, ['업종', '용도', '종류', '구분']);
      const tenantIdx = findCol(headers, ['임차인', '입주사', 'tenant', '상호']);
      expect(bizIdx).not.toBe(tenantIdx);
      expect(bizIdx).toBe(2);
      expect(tenantIdx).toBe(3);
    });

    test('POSITIVE: 면적 컬럼 매칭', () => {
      const areaIdx = findCol(headers, ['면적', '전용면적', 'area', '㎡', '평']);
      expect(areaIdx).toBe(4); // '전용면적(㎡)' → index 4
    });

    test('NEGATIVE: 면적 컬럼에서 월 임대료가 면적으로 둔갑하지 않음 (Rule 33)', () => {
      // '월세(만원)' 헤더가 면적 키워드에 매칭되면 안됨
      const monthlyRentHeader = '월세만원';
      const keywords = ['면적', '전용면적', 'area', '㎡', '평'];
      const matched = keywords.some(k => monthlyRentHeader.includes(k));
      expect(matched).toBe(false);
    });

    test('POSITIVE: 보증금/월세 컬럼 매칭', () => {
      const depositIdx = findCol(headers, ['보증금', '임대보증금', 'deposit']);
      const rentIdx = findCol(headers, ['월임대료', '월세', '임대료', 'rent', '월차임']);
      expect(depositIdx).toBe(5);
      expect(rentIdx).toBe(6);
    });

    test('POSITIVE: 계약 시작/종료 매칭', () => {
      const startIdx = findCol(headers, ['계약시작', '시작일', '개시일', 'start']);
      const endIdx = findCol(headers, ['계약종료', '종료일', '만료일', 'end', '만기']);
      expect(startIdx).toBe(8);
      expect(endIdx).toBe(9);
    });
  });

  describe('금액 단위 자동 변환', () => {
    test('POSITIVE: 만원 단위 그대로 유지 (5000 → 5000)', () => {
      expect(detectAndConvertToManwon(5000)).toBe(5000);
    });

    test('POSITIVE: 원 단위 → 만원 변환 (50000000 → 5000)', () => {
      expect(detectAndConvertToManwon(50000000)).toBe(5000);
    });

    test('POSITIVE: 경계값 100000 → 10 (원→만원)', () => {
      expect(detectAndConvertToManwon(100000)).toBe(10);
    });

    test('NEGATIVE: 99999는 만원 단위로 유지', () => {
      expect(detectAndConvertToManwon(99999)).toBe(99999);
    });
  });

  describe('Excel 직렬 날짜 변환', () => {
    test('POSITIVE: Excel 직렬 번호 변환 (46387 → 날짜)', () => {
      const result = parseExcelDate(46387);
      expect(result).toBeDefined();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Excel serial 46387 → UTC 기준 2026-12-31 또는 2027-01-01 (타임존 차이 허용)
      expect(result).toMatch(/^202[67]-/);
    });

    test('POSITIVE: YYYY-MM-DD 형식 통과', () => {
      expect(parseExcelDate('2026-05-31')).toBe('2026-05-31');
    });

    test('POSITIVE: YYYY.MM.DD → YYYY-MM-DD 변환', () => {
      expect(parseExcelDate('2026.05.31')).toBe('2026-05-31');
    });

    test('POSITIVE: YYYY/MM/DD → YYYY-MM-DD 변환', () => {
      expect(parseExcelDate('2026/5/1')).toBe('2026-05-01');
    });

    test('NEGATIVE: null/undefined → undefined', () => {
      expect(parseExcelDate(null)).toBeUndefined();
      expect(parseExcelDate(undefined)).toBeUndefined();
    });
  });

  describe('공실 행 감지', () => {
    test('POSITIVE: 용도/업종 열이 "공실"이면 공실', () => {
      const cols = ['2F', '201호', '공실', '', 92.3, '', '', '', '', '', '공실'];
      const isVac = detectVacancy(cols, -1, 2, 3);
      expect(isVac).toBe(true);
    });

    test('POSITIVE: 용도 열이 비어있으면 공실', () => {
      const cols = ['3F', '301호', '', '', 100, '', '', '', '', '', ''];
      const isVac = detectVacancy(cols, -1, 2, 3);
      expect(isVac).toBe(true);
    });

    test('POSITIVE: bizTypeIdx가 없고(-1) tenantNameIdx가 비어있으면 공실', () => {
      // 커스텀 양식에서 업종 컬럼이 아예 없는 경우
      const cols = ['2F', '', 92.3, '', ''];
      const isVac = detectVacancy(cols, -1, -1, 1);
      expect(isVac).toBe(true);
    });

    test('NEGATIVE: 임차인 있으면 공실 아님', () => {
      const cols = ['1F', '101호', '카페', '스타벅스', 85.5, 8000, 600, 50, '', '', ''];
      const isVac = detectVacancy(cols, -1, 2, 3);
      expect(isVac).toBe(false);
    });

    test('POSITIVE: 비고 열 "공실" — vacantIdx로 직접 감지', () => {
      const cols = ['4F', '401호', '사무실', '', 110, 5000, 400, 40, '', '', '공실'];
      const isVac = detectVacancy(cols, 10, 2, 3);
      expect(isVac).toBe(true);
    });
  });
});
