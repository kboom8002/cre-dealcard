import { describe, it, expect } from 'vitest';
import { parseKoreanMoney, parseVacancy, extractSlotsFromMemo } from './memo-slot-mapper';
import { hasValidBuildingNumber } from '@/domain/verification/address-resolver';

describe('memo-slot-mapper: parseKoreanMoney', () => {
  it('복합 한국어 금액 단위 파싱 (억 + 천만/만 + 원)', () => {
    // 실매물 당산동 케이스
    expect(parseKoreanMoney('약 2억 9,000만원선')).toBe(290_000_000);
    expect(parseKoreanMoney('보증금 2억 9000만원')).toBe(290_000_000);
    expect(parseKoreanMoney('115억')).toBe(11_500_000_000);
    expect(parseKoreanMoney('4,000만원')).toBe(40_000_000);
    expect(parseKoreanMoney('월세 300만원')).toBe(3_000_000);
  });

  it('단일 억 단위 및 만 단위 파싱', () => {
    expect(parseKoreanMoney('350억')).toBe(35_000_000_000);
    expect(parseKoreanMoney('5000만')).toBe(50_000_000);
    expect(parseKoreanMoney('108억')).toBe(10_800_000_000);
  });

  // Negative pair (Rule 7)
  it('Negative Pair: 금액이 없는 텍스트는 0을 반환', () => {
    expect(parseKoreanMoney('')).toBe(0);
    expect(parseKoreanMoney('협의 필요')).toBe(0);
    expect(parseKoreanMoney('문의 요망')).toBe(0);
  });
});

describe('memo-slot-mapper: parseVacancy', () => {
  it('만실 및 공실 없음 실무 어휘 인식', () => {
    expect(parseVacancy('현재 만실 운영 중')).toBe(0.0);
    expect(parseVacancy('만실')).toBe(0.0);
    expect(parseVacancy('공실 없음')).toBe(0.0);
    expect(parseVacancy('공실 0%')).toBe(0.0);
    expect(parseVacancy('공실률 0%')).toBe(0.0);
  });

  it('명시적 공실률 퍼센트 파싱', () => {
    expect(parseVacancy('공실률: 10%')).toBe(10.0);
    expect(parseVacancy('공실 5.5%')).toBe(5.5);
  });

  // Negative pair (Rule 7)
  it('Negative Pair: 공실/만실 언급이 없는 텍스트는 null 반환', () => {
    expect(parseVacancy('')).toBeNull();
    expect(parseVacancy('일반 임대 중')).toBeNull();
    expect(parseVacancy('초역세권 매물')).toBeNull();
  });
});

describe('address-resolver: hasValidBuildingNumber', () => {
  it('상세 지번 또는 건물번호가 포함된 실제 주소 식별', () => {
    expect(hasValidBuildingNumber('서울시 영등포구 당산동5가 12-3')).toBe(true);
    expect(hasValidBuildingNumber('서울시 영등포구 당산동5가 12-3번지')).toBe(true);
    expect(hasValidBuildingNumber('서울시 강남구 역삼동 742-1')).toBe(true);
    expect(hasValidBuildingNumber('서울시 강남구 테헤란로 152')).toBe(true);
    expect(hasValidBuildingNumber('경기 성남시 분당구 판교역로 235')).toBe(true);
    expect(hasValidBuildingNumber('마포구 서교동 354-22')).toBe(true);
    expect(hasValidBuildingNumber('종로3가 45-1')).toBe(true);
    expect(hasValidBuildingNumber('을지로2가 100')).toBe(true);
  });

  // Negative pair (Rule 7)
  it('Negative Pair: 상세 번지가 없는 단순 권역/동명은 false 반환 (주소 오인 방지)', () => {
    expect(hasValidBuildingNumber('서울시 영등포구 당산동5가')).toBe(false);
    expect(hasValidBuildingNumber('당산동5가')).toBe(false);
    expect(hasValidBuildingNumber('서울시 강남구 역삼동')).toBe(false);
    expect(hasValidBuildingNumber('역삼동')).toBe(false);
    expect(hasValidBuildingNumber('강남대로')).toBe(false);
    expect(hasValidBuildingNumber('종로3가')).toBe(false);
    expect(hasValidBuildingNumber('을지로2가')).toBe(false);
    expect(hasValidBuildingNumber('성수동1가')).toBe(false);
    expect(hasValidBuildingNumber(null)).toBe(false);
    expect(hasValidBuildingNumber(undefined)).toBe(false);
    expect(hasValidBuildingNumber('')).toBe(false);
  });
});

describe('memo-slot-mapper: extractSlotsFromMemo Level 1 Real Case', () => {
  it('당산동 Level 1 메모에서 보증금, 월세, 매매가, 만실(0%) 슬롯이 모두 추출됨', () => {
    const rawMemo = `[매물 기본 정보]
- 매물명: 영등포구 당산동5가 올근생 빌딩
- 위치: 서울시 영등포구 당산동5가 (당산역 도보 3분)
- 매매가: 115억
- 대지면적: 약 105평 / 연면적: 약 310평
- 층수: 지하 1층 ~ 지상 5층
- 준공: 2012년

[임대차 요약]
- 보증금 총액: 약 2억 9,000만원선
- 월 임대료 총액: 4,000만원
- 관리비: 300만원
- 공실 현황: 현재 만실 운영 중 (공실 없음)
- 주요 임차인: 1층 대형 F&B 프랜차이즈, 2~4층 병의원 및 학원, 5층 사무실`;

    const result = extractSlotsFromMemo(rawMemo);
    const slotsByKey = new Map(result.slots.map(s => [s.key, s.value]));

    expect(slotsByKey.get('askingPriceKrw')).toBe(11_500_000_000);
    expect(slotsByKey.get('totalDepositKrw')).toBe(290_000_000);
    expect(slotsByKey.get('monthlyRentKrw')).toBe(40_000_000);
    expect(slotsByKey.get('vacancyRatePct')).toBe(0.0);
  });
});
