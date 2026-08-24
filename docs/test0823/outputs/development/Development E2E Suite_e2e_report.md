# E2E Test Report: Development E2E Suite

**실행 일시:** 2026-08-23T22:34:33.934Z
**전체 결과:** 총 2개 케이스 (PASS: 2, FAIL: 0)

## 요약 (Summary)
| Case Name | Label | Posture | Result |
|---|---|---|---|
| caseA_jamwon_242b | 잠원동 신축개발 242억 | development | ✅ PASS |
| caseB_sutaek_89b | 구리 수택동 나대지 89억 | development | ✅ PASS |

## Case: caseA_jamwon_242b (잠원동 신축개발 242억)
- **Posture**: development
- **Result**: ✅ PASS
- **Artifacts**:
  - PPTX: [caseA_jamwon_242b.pptx](C:\Users\User\cre-dealcard\docs\test0823\outputs\development\caseA_jamwon_242b\caseA_jamwon_242b.pptx)
  - Viewer: [viewer.html](C:\Users\User\cre-dealcard\docs\test0823\outputs\development\caseA_jamwon_242b\viewer.html)

### 수행 단계 (Steps)
| Step | Pass | Detail | Duration |
|---|---|---|---|
| 1_memo_slots | ✅ | 1 slots | 2ms |
| 2_banding | ✅ | 240억 원대 | 11ms |
| 3_quality | ✅ | 80 (reference) | 1ms |
| 4_im_generation | ✅ | 7 sections | 69.51s |
| 5_pptx | ✅ | 4 slides | 4.44s |
| 6_html_capture | ✅ | viewer + captures | 5.26s |
| 7_inspection | ✅ | 6/6 pass | 6ms |

### 검사 결과 (Inspections)
| Criterion | Label | Pass | Detail |
|---|---|---|---|
| D06 | 마크다운 잔재 확인 | ✅ | 마크다운 잔재 없음 |
| D07 | 비정상 데이터 (NaN 등) 확인 | ✅ | 비정상 데이터 없음 |
| D08 | 이모지 사용 확인 | ✅ | 이모지 없음 |
| RG-TRUNC-01 | 괄호 밸런스 확인 | ✅ | 괄호 매칭 정상 |
| POSTURE-SLIDE | 포스처별 슬라이드 수 확인 | ✅ | 정상 (4장, 범위: 3~9) |
| PII-CHECK | 개인정보(PII) 유출 확인 | ✅ | 개인정보 패턴 없음 |

---

## Case: caseB_sutaek_89b (구리 수택동 나대지 89억)
- **Posture**: development
- **Result**: ✅ PASS
- **Artifacts**:
  - PPTX: [caseB_sutaek_89b.pptx](C:\Users\User\cre-dealcard\docs\test0823\outputs\development\caseB_sutaek_89b\caseB_sutaek_89b.pptx)
  - Viewer: [viewer.html](C:\Users\User\cre-dealcard\docs\test0823\outputs\development\caseB_sutaek_89b\viewer.html)

### 수행 단계 (Steps)
| Step | Pass | Detail | Duration |
|---|---|---|---|
| 1_memo_slots | ✅ | 3 slots | 1ms |
| 2_banding | ✅ | 80억 원대 | 0ms |
| 3_quality | ✅ | 70 (reference) | 0ms |
| 4_im_generation | ✅ | 7 sections | 93.81s |
| 5_pptx | ✅ | 3 slides | 2.44s |
| 6_html_capture | ✅ | viewer + captures | 2.09s |
| 7_inspection | ✅ | 6/6 pass | 2ms |

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

