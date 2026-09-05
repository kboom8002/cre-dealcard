# 제안 지식 소스 사용법

이 폴더는 SDD 구현을 돕는 기계 판독 제안자료다. 현재 운영 정본이 아니다.

## 파일

| 파일 | 역할 |
|---|---|
| `source-map.yaml` | 규칙의 기존 근거·실제 코드·승격대상 |
| `current-code-map.yaml` | 현행 모듈→목표 모듈·작업 ID |
| `document-level-bundles.yaml` | L1/L1.5/L2/L3 요건 |
| `claim-catalog-mvp.yaml` | MVP 산출항목 정의 |
| `gate-catalog-mvp.yaml` | P0/P1 발행검사 정의 |
| `content-unit-catalog.yaml` | 채널 중립 내용 단위 |
| `copy-and-terminology-rules.yaml` | 외부 한국어 문안·금지·표시규칙 |
| `test-fixture-catalog.yaml` | 실물·합성 표본과 기대결과 |

## 승격절차

1. `IC-P1-T01`에서 제품·도메인·품질 책임자가 ID와 의미를 승인한다.
2. 현행 14개 `im.*.yaml`과 소유코드를 대조한다.
3. 중복되는 규칙은 신규파일로 만들지 않고 기존 owner에 병합한다.
4. 생성본은 소유코드를 수정한 뒤 재생성한다.
5. 코드·Zod·JSON Schema·YAML 차이를 CI에서 검사한다.
6. 승인되지 않은 항목은 `status: proposed`로 유지하며 런타임에서 읽지 않는다.

## 직접 복사 금지

- `claim-catalog-mvp.yaml`을 곧바로 `credeal/ssot/im.claims.yaml`로 복사하지 않는다.
- `gate-catalog-mvp.yaml`을 `im.gating.yaml`에 손으로 붙이지 않는다.
- D55의 존재하지 않는 정본명 때문에 새 정본을 자동생성하지 않는다.
- enum을 코드에 먼저 추가하지 않는다.

