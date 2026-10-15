import { describe, it, expect } from 'vitest';
import { resolveDualLineAddress } from '@/domain/building/mobile-im/pptx/address-display';

describe('resolveDualLineAddress (R4 도로명 + 지번 병기 주소 해석기)', () => {
  it('명시적 도로명주소와 지번주소가 모두 있으면 2줄(twoLine) 및 1줄(singleLine) 병기를 생성한다', () => {
    const res = resolveDualLineAddress({
      roadAddress: '서울특별시 강남구 테헤란로 152',
      jibunAddress: '서울특별시 강남구 역삼동 737',
      parcelCount: 1,
    });
    expect(res.roadLine).toBe('서울특별시 강남구 테헤란로 152');
    expect(res.jibunLine).toBe('역삼동 737');
    expect(res.twoLine).toBe('서울특별시 강남구 테헤란로 152\n(지번: 역삼동 737)');
    expect(res.singleLine).toBe('서울특별시 강남구 테헤란로 152 (지번: 역삼동 737)');
  });

  it('명시적 지번 필드가 없어도 19자리 PNU(본번·부번)와 원문/메모 텍스트가 일치하면 결정론적으로 지번을 복원한다 (ig1 당산동5가 11-47 외 1필지)', () => {
    const res = resolveDualLineAddress({
      roadAddress: '서울 영등포구 당산로 222 외 1필지',
      pnu: '1156011500100110047', // 본번 0011(11), 부번 0047(47)
      parcelCount: 2,
      memoTexts: [
        '대상 자산은 영등포구 당산동5가 11-47에 위치한 근생빌딩입니다.',
      ],
    });
    expect(res.roadLine).toBe('서울 영등포구 당산로 222');
    expect(res.jibunLine).toBe('당산동5가 11-47 외 1필지');
    expect(res.twoLine).toBe('서울 영등포구 당산로 222\n(지번: 당산동5가 11-47 외 1필지)');
    expect(res.singleLine).toBe('서울 영등포구 당산로 222 (지번: 당산동5가 11-47 외 1필지)');
  });

  it('PNU 본번·부번과 일치하지 않는 다른 지번(인근 시세 사례 등)은 절대 본건 지번으로 오인하지 않는다', () => {
    const res = resolveDualLineAddress({
      roadAddress: '서울 영등포구 당산로 222',
      pnu: '1156011500100110047', // 11-47
      parcelCount: 2,
      memoTexts: [
        '인근 매물 사례: 당산동5가 11-34, 당산동4가 32-12',
      ],
    });
    expect(res.jibunLine).toBeNull();
    expect(res.twoLine).toBe('서울 영등포구 당산로 222 외 1필지');
    expect(res.singleLine).toBe('서울 영등포구 당산로 222 외 1필지');
  });

  it('도로명주소 괄호 표기 법정동 예: (당산동5가)와 19자리 PNU가 있으면 지번을 결정론적으로 복원한다', () => {
    const res = resolveDualLineAddress({
      roadAddress: '서울 영등포구 당산로 222 (당산동5가)',
      pnu: '1156011500100110047',
      parcelCount: 1,
    });
    expect(res.roadLine).toBe('서울 영등포구 당산로 222');
    expect(res.jibunLine).toBe('당산동5가 11-47');
    expect(res.twoLine).toBe('서울 영등포구 당산로 222\n(지번: 당산동5가 11-47)');
  });
});
