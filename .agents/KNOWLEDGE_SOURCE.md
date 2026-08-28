# IM 파이프라인 — 실전 지식 소스 (D33~D44 교훈 축적)

> **용도**: `.agents/SESSION_MASTER_PROMPT.md`의 보조 문서.
> 6판의 반복 실패에서 축적된 **실전 패턴과 안티패턴**.
> **마지막 갱신**: 2026-08-28

---

## A. 반복된 실패 패턴 (안티패턴)

### A1. "선언만 있고 실행 없음"
**17개 위험의 절반이 이것이었습니다.** 게이트를 YAML에 적었지만 코드에서 검사하지 않음.
해소: `wiring-check.ts` — YAML↔코드 전수 대조.

### A2. "대상이 없으면 0건 검사하고 정상이라 하는 것"
git log가 비면 → 0건 매칭 → "통과". 파일이 없으면 → 0건 위반 → "통과".
해소: 대상이 없으면 **판정 불가**로 보고. 점수를 낮추는 것이 정직.

### A3. "허용오차로 정당화"
cap_rate ±0.5%p, noi ±15%를 두면 거짓 통과가 발생.
해소: 허용오차 0. 값이 다르면 설계가 틀린 것.

### A4. "폴백을 개선"
폴백이 실패를 숨김. 개선하면 더 잘 숨김.
해소: 폴백을 제거. 실패하면 면을 열지 않음.

### A5. "검사기를 느슨하게"
임계값을 올려 통과시킴. 결과적으로 결함을 승인.
해소: PR 템플릿 마지막 칸. 사유 없으면 반려.

### A6. "기능을 만들고 테스트를 붙인다"
Negative 짝 없이 양성만 테스트. 검사가 공허해짐.
해소: **되돌렸을 때 실패하는가**로 검증.

### A7. "골든을 갱신해 통과"
정본이 바뀌지 않았는데 골든을 바꿔서 diff를 없앰.
해소: CI baseline 잡 — 정본 변경 없이 골든만 변경 차단.

---

## B. 효과적이었던 패턴

### B1. 코드 실측 → 격차 도출 → 구현
D41에서 가장 효과적: "D41이 요구하는 것 vs 코드에 이미 있는 것"을 대조 표로 만들고,
**실제 격차만** 구현. 이미 있는 것을 다시 만들지 않음.

### B2. 서브에이전트 병렬 실행
Phase별로 서브에이전트에 위임. 빌드 검증은 메인에서.
주의: 서브에이전트가 빌드를 동시에 돌리면 충돌 → 하나만 돌림.

### B3. Select-String으로 잔존 참조 전수 검색
PptxTier 제거처럼 타입을 삭제할 때, `Select-String -Pattern "tier:" -List`로
전 파일을 검색해야 빌드 실패를 예방.

### B4. 한 번에 하나의 관심사
"W1 없이 다른 것을 시작하지 마십시오" — Phase 간 차단 규칙이 혼선 방지.

### B5. 사용자의 질문을 규칙보다 우선
사용자가 "면수 초과를 강제하는 것은 무리 아닌가?"라고 하면,
규칙을 지키려 하지 말고 **사용자 의견에 동의하고 코드를 수정**.

### B6. 정직한 상태 보고
골든 IM이 스텁임을 인정 → SCAFFOLD 표기 → 참조 금지.
"완료"라 적지 않고 실제 상태를 적는 것이 후속 세션을 돕는다.

---

## C. 타입 제거 체크리스트 (PptxTier 교훈)

타입/인터페이스 필드를 삭제할 때:

```
1. 해당 타입 정의 파일에서 삭제
2. Select-String -Path "src\**\*.ts" -Pattern "삭제한_필드" -List
3. Select-String -Path "scripts\*.ts" -Pattern "삭제한_필드" -List
4. 테스트 파일의 타입 정의에서도 제거
5. console.log/출력 포맷에서도 제거
6. npm run build → 0 에러 확인
```

---

## D. 빌드/커밋 체크리스트

```
1. npm run build → exit code 0
2. git add -A
3. git commit -m "feat/fix/refactor(지시서): 제목 — 변경 요약"
4. git push origin main 2>&1
   → exit code 1이지만 stderr에 "main -> main" 있으면 성공
5. .github/workflows/ 변경 시 → PAT workflow scope 필요
```

---

## E. im.errors.yaml 게이트 구조

```yaml
gates:
  - code: G01        # 게이트 코드
    name: slide_min  # 코드 내 식별자
    severity: block  # block | warn | info
    message: "..."   # 인간 설명
```

`quality-gates-v02.ts`의 `PUBLISH_GATES` 배열과 1:1 대응해야 함.
새 게이트 추가 시 반드시 양쪽에 등록. `wiring-check.ts`가 검증.

---

## F. CrossValidatorAnchors 필드 매핑

NumericalAnchors 클래스 (동적 Map) → CrossValidatorAnchors (정적 15필드) 변환:

| 클래스 키 | 인터페이스 필드 |
|---|---|
| `totalAreaSqm` | `totalAreaSqm` |
| `vacancyPct` | `vacancyPct` |
| `monthlyRentTotalKrw` | `monthlyRentKrw` |
| `capRateBase` / `capRate` | `capRateBase` |
| `buildingAge` | `buildingAge` |
| `stationDistance` | `stationDistance` |
| `askingPriceKrw` | `askingPriceKrw` |
| `pricePerPyeong` | `pricePerPyeong` |

---

## G. 자가진단 현황 (adoption_check.py)

```
[OK]   R2 — 코드 리터럴 0건
[OK]   R4 — wiring-check.ts 존재
[OK]   R5 — PR 템플릿 존재
[OK]   R6 — 완화 의심 커밋 0건
[FAIL] R1 — 게이트 51종 중 짝 없는 39종 ← 2주차까지 해소
[FAIL] R3 — cycles/ 계기판 미설치 ← 2주차까지 해소
```

4주차에 `--strict` 전환 → 6/6 미달 시 CI 차단.

---

## H. ReleaseTier 5종 변환 규칙

| D37 5종 | 레거시 | 방향 |
|---|---|---|
| `internal_only` | — | 내부 전용 |
| `fact_om` | `basic` | 팩트 시트 |
| `analysis_im` | `pro` | 분석 IM |
| `decision_im` | `pro` | 의사결정 IM |
| `expert_required` | — | 전문가 필요 |

handler → DB → PPTX → 뷰어 전구간 일관 전달 필수.

---

## I. IncomeArchetype 9종

| 코드 | 설명 |
|---|---|
| `R-INC-01` | 임대안정형 |
| `R-INC-02` | 공실해소형 |
| `R-INC-03` | 임대상승형 |
| `R-INC-04` | 혼합수익형 |
| `R-INC-05` | 단기수익형 |
| `R-INC-06` | 장기안정형 |
| `R-INC-07` | 고위험고수익형 |
| `R-INC-08` | 리모델링수익형 |
| `R-INC-09` | 기타수익형 |

deck-sequencer.ts + pptx-renderer.ts에서 동일 9종 사용.
