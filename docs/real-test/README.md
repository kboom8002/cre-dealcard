# 골든 테스트 실매물 참조 데이터

> 이 폴더는 E2E 골든 테스트에서 직접 참조하는 **단일 원천(Single Source of Truth)** 매물 데이터입니다.
> `docs/prod-test/`의 원본 데이터를 골든 테스트 소비 형식으로 정규화한 것입니다.

## 폴더 구조

```
docs/real-test/
├── README.md                     ← 이 파일
├── 01-dangsan-income/            ← 수익형 (income) 115억
│   ├── golden-input.json         ← Basic/Pro 양쪽 테스트 입력 통합
│   └── images/                   → 사진 에셋 (8장)
├── 02-yeoksam-hq/                ← 사옥형 (owner_occupied) 120억
│   ├── golden-input.json
│   └── images/                   → 사진 에셋 (7장)
└── 03-jamwon-dev/                ← 개발형 (development) 242억
    ├── golden-input.json
    └── images/                   → 사진 에셋 (7장)
```

## golden-input.json 스키마

각 매물의 `golden-input.json`은 다음 구조를 가집니다:

| 키 | 설명 |
|----|------|
| `id` | 매물 식별자 |
| `name` | 건물명 |
| `posture` | 투자 포스처 (`income`, `owner_occupied`, `development`) |
| `basic_im` | Basic IM 테스트 입력 (L1 메모, 최소 바텀시트, 기대 등급) |
| `pro_im` | Pro IM 테스트 입력 (L3 메모, 전체 바텀시트, R2+ 렌트롤) |
| `photos` | 사진 경로 배열 (Hero 표시 포함) |
| `assertions` | Positive/Negative 기대 결과 |

## Basic IM 적격 판정

| 매물 | 포스처 | Basic 가능? | 근거 |
|------|:------:|:-----------:|------|
| 01-당산 | income | ✅ Grade C+ | L1: 주소+가격+임대료 → Grade C |
| 02-역삼 | owner_occupied | ✅ Grade C+ | L1: 주소+가격 → Grade C |
| 03-잠원 | development | ✅ Grade C+ | L1: 주소+PNU+가격 → Grade C |

## 사용법

```typescript
// E2E 테스트에서 참조
import dangsanInput from '../docs/real-test/01-dangsan-income/golden-input.json';

const memo = dangsanInput.basic_im.memo;
const bottomSheet = dangsanInput.basic_im.bottom_sheet;
const expectedGrade = dangsanInput.basic_im.expected_grade; // "C"
```
