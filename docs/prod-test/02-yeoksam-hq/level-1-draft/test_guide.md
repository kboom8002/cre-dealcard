# L1 Draft Test Guide: 역삼동 642-1 (사옥형)

## Procedure
1. Posture: `owner_occupied` 선택
2. Address: `역삼동 642-1` 검색 및 주소 확정
3. Price: 120억 (`12000000000` 원) 입력
4. Deposit/Rent: 입력 생략 (사옥형은 임대 수익 불요)
5. occupancySpec: L1 단계이므로 생략
6. 사진 및 렌트롤: 생략

## Expected Outcome
- **Grade**: `C` 등급 부여 확인
- PNU(고유번호), 공시지가 등 기본 정보 연동 확인

## Negative Test
- Attempt Pro (IM 생성 시도): 사진 부재(G05), 사옥형 필수 스펙(occupancySpec) 부재로 인해 생성 블록됨 확인.
