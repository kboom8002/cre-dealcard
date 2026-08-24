# E2E Test Report: Multiposture E2E Suite

**실행 일시:** 2026-08-23T22:39:56.534Z
**전체 결과:** 총 3개 케이스 (PASS: 3, FAIL: 0)

## 요약 (Summary)
| Case Name | Label | Posture | Result |
|---|---|---|---|
| caseA_hotel_300b | 에이치에비뉴호텔 이대점 300억 | operating | ✅ PASS |
| caseB_office_120b | 역삼동 사옥 120억 | owner_occupied | ✅ PASS |
| caseC_trading_150b | 대치동 밸류애드 150억 | trading | ✅ PASS |

## Case: caseA_hotel_300b (에이치에비뉴호텔 이대점 300억)
- **Posture**: operating
- **Result**: ✅ PASS
- **Artifacts**:
  - PPTX: [caseA_hotel_300b.pptx](C:\Users\User\cre-dealcard\docs\test0823\outputs\multiposture\caseA_hotel_300b\caseA_hotel_300b.pptx)
  - Viewer: [viewer.html](C:\Users\User\cre-dealcard\docs\test0823\outputs\multiposture\caseA_hotel_300b\viewer.html)

### 수행 단계 (Steps)
| Step | Pass | Detail | Duration |
|---|---|---|---|
| 1_memo_slots | ✅ | 10 slots | 1ms |
| 2_banding | ✅ | 300억 원대 | 10ms |
| 3_quality | ✅ | 70 (reference) | 1ms |
| 4_im_generation | ✅ | 7 sections | 78.05s |
| 5_pptx | ✅ | 4 slides | 3.18s |
| 6_html_capture | ✅ | viewer + captures | 2.32s |
| 7_inspection | ✅ | 6/6 pass | 11ms |

### 검사 결과 (Inspections)
| Criterion | Label | Pass | Detail |
|---|---|---|---|
| D06 | 마크다운 잔재 확인 | ✅ | 마크다운 잔재 없음 |
| D07 | 비정상 데이터 (NaN 등) 확인 | ✅ | 비정상 데이터 없음 |
| D08 | 이모지 사용 확인 | ✅ | 이모지 없음 |
| RG-TRUNC-01 | 괄호 밸런스 확인 | ✅ | 괄호 매칭 정상 |
| POSTURE-SLIDE | 포스처별 슬라이드 수 확인 | ✅ | 정상 (4장, 범위: 3~10) |
| PII-CHECK | 개인정보(PII) 유출 확인 | ✅ | 개인정보 패턴 없음 |

---

## Case: caseB_office_120b (역삼동 사옥 120억)
- **Posture**: owner_occupied
- **Result**: ✅ PASS
- **Artifacts**:
  - PPTX: [caseB_office_120b.pptx](C:\Users\User\cre-dealcard\docs\test0823\outputs\multiposture\caseB_office_120b\caseB_office_120b.pptx)
  - Viewer: [viewer.html](C:\Users\User\cre-dealcard\docs\test0823\outputs\multiposture\caseB_office_120b\viewer.html)

### 수행 단계 (Steps)
| Step | Pass | Detail | Duration |
|---|---|---|---|
| 1_memo_slots | ✅ | 3 slots | 1ms |
| 2_banding | ✅ | 120억 원대 | 0ms |
| 3_quality | ✅ | 65 (reference) | 0ms |
| 4_im_generation | ✅ | 7 sections | 74.43s |
| 5_pptx | ✅ | 3 slides | 2.09s |
| 6_html_capture | ✅ | viewer + captures | 2.00s |
| 7_inspection | ✅ | 6/6 pass | 6ms |

### 검사 결과 (Inspections)
| Criterion | Label | Pass | Detail |
|---|---|---|---|
| D06 | 마크다운 잔재 확인 | ✅ | 마크다운 잔재 없음 |
| D07 | 비정상 데이터 (NaN 등) 확인 | ✅ | 비정상 데이터 없음 |
| D08 | 이모지 사용 확인 | ✅ | 이모지 없음 |
| RG-TRUNC-01 | 괄호 밸런스 확인 | ✅ | 괄호 매칭 정상 |
| POSTURE-SLIDE | 포스처별 슬라이드 수 확인 | ✅ | 정상 (3장, 범위: 3~9) |
| PII-CHECK | 개인정보(PII) 유출 확인 | ✅ | 개인정보 패턴 없음 |

---

## Case: caseC_trading_150b (대치동 밸류애드 150억)
- **Posture**: trading
- **Result**: ✅ PASS
- **Artifacts**:
  - PPTX: [caseC_trading_150b.pptx](C:\Users\User\cre-dealcard\docs\test0823\outputs\multiposture\caseC_trading_150b\caseC_trading_150b.pptx)
  - Viewer: [viewer.html](C:\Users\User\cre-dealcard\docs\test0823\outputs\multiposture\caseC_trading_150b\viewer.html)

### 수행 단계 (Steps)
| Step | Pass | Detail | Duration |
|---|---|---|---|
| 1_memo_slots | ✅ | 1 slots | 0ms |
| 2_banding | ✅ | 150억 원대 | 0ms |
| 3_quality | ✅ | 50 (reference) | 0ms |
| 4_im_generation | ✅ | 7 sections | 143.85s |
| 5_pptx | ✅ | 3 slides | 2.35s |
| 6_html_capture | ✅ | viewer + captures | 2.14s |
| 7_inspection | ✅ | 6/6 pass | 3ms |

### 검사 결과 (Inspections)
| Criterion | Label | Pass | Detail |
|---|---|---|---|
| D06 | 마크다운 잔재 확인 | ✅ | 마크다운 잔재 없음 |
| D07 | 비정상 데이터 (NaN 등) 확인 | ✅ | 비정상 데이터 없음 |
| D08 | 이모지 사용 확인 | ✅ | 이모지 없음 |
| RG-TRUNC-01 | 괄호 밸런스 확인 | ✅ | 괄호 매칭 정상 |
| POSTURE-SLIDE | 포스처별 슬라이드 수 확인 | ✅ | 정상 (3장, 범위: 3~9) |
| PII-CHECK | 개인정보(PII) 유출 확인 | ✅ | 개인정보 패턴 없음 |

---

