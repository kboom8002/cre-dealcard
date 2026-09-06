# L3 Verified Test Guide: 역삼동 642-1 (사옥형)

## Procedure
1. L2 상태에서 검증(Verified) 단계로 데이터 고도화
2. Occupancy Spec 상세 확정:
   - Target headcount: 80명
   - Desired floors: 전층 (1F~6F)
   - Area per head: 3.3평
   - Current office rent: 3,800만원
   - Naming Rights: `사옥 단독 명칭 표기(간판 설치권) 가능` 기재
3. Rent Roll 상세 입력 (면적, 만기일 포함):
   - B1: 2025-10-31 만기, 135.20㎡
   - 1F~6F: 잔금일 퇴거 확약, 650.70㎡
4. 매매 실거래가 비교 사례(manual_comps) 3건 등록
5. 권리 분석(Covenants) 등록: 매도법인 즉시 퇴거 확약서, 명도 지연 일할 손해배상 특약 등
6. 사진 4장 이상 (exterior, entrance, lobby, rooftop 등) 확인
7. Data Availability (공적 장부) 모두 연동(true) 확인

## Expected Outcome
- **Grade**: `A` (최고 등급) 확인 (S등급은 존재하지 않음)
- vsLease annual saving이 ~4.2억원으로 올바르게 산출되는지 확인.

## Negative Tests
1. **Vacate covenant not secured**: 명도(퇴거) 확약서 미징구 시 G38 경고 게이트 작동 확인.
2. **Naming rights terminology**: '네이밍 라이츠' 대신 '사옥 단독 명칭 표기(간판 설치권)' 용어 강제 적용 확인. 위반 시 에러 표출.
3. **vsLease comparison accuracy**: 연간 절감액 산출 로직 검증 오류 시 경고 표출.
4. **B1 lease approaching expiry**: B1 스튜디오 만기(2025-10-31) 임박에 대한 적절한 안내 노출 확인.
