# E2E Test Report: Income E2E Suite

**실행 일시:** 2026-08-23T23:04:02.200Z
**전체 결과:** 총 2개 케이스 (PASS: 2, FAIL: 0)

## 요약 (Summary)
| Case Name | Label | Posture | Result |
|---|---|---|---|
| caseA_dangsan_115b | 당산역 메디컬 근생빌딩 115억 | income | ✅ PASS |
| caseB_yangpyeong_250b | 선유도역 업무시설 250억 | income | ✅ PASS |

## Case: caseA_dangsan_115b (당산역 메디컬 근생빌딩 115억)
- **Posture**: income
- **Result**: ✅ PASS
- **Artifacts**:
  - PPTX: [caseA_dangsan_115b.pptx](C:\Users\User\cre-dealcard\docs\test0823\outputs\income\caseA_dangsan_115b\caseA_dangsan_115b.pptx)
  - Viewer: [viewer.html](C:\Users\User\cre-dealcard\docs\test0823\outputs\income\caseA_dangsan_115b\viewer.html)

### 수행 단계 (Steps)
| Step | Pass | Detail | Duration |
|---|---|---|---|
| 1_memo_slots | ✅ | 2 slots | 3ms |
| 2_banding | ✅ | 110억 원대 | 22ms |
| 3_quality | ✅ | 68 (reference) | 2ms |
| 4_im_generation | ✅ | 7 sections | 151.39s |
| 5_pptx | ✅ | 4 slides | 5.04s |
| 6_html_capture | ✅ | viewer + captures | 5.44s |
| 7_inspection | ✅ | 8/8 pass | 21ms |

### 검사 결과 (Inspections)
| Criterion | Label | Pass | Detail |
|---|---|---|---|
| D06 | 마크다운 잔재 확인 | ✅ | 마크다운 잔재 없음 |
| D07 | 비정상 데이터 (NaN 등) 확인 | ✅ | 비정상 데이터 없음 |
| D08 | 이모지 사용 확인 | ✅ | 이모지 없음 |
| RG-TRUNC-01 | 괄호 밸런스 확인 | ✅ | 괄호 매칭 정상 |
| POSTURE-SLIDE | 포스처별 슬라이드 수 확인 | ✅ | 정상 (4장, 범위: 3~10) |
| PLACEHOLDER-CHECK | 플레이스홀더 미치환 확인 | ✅ | 미치환 플레이스홀더 없음 |
| TEMPLATE-FABRICATION | 템플릿 허위 데이터 확인 | ✅ | 허위 하드코딩 데이터 없음 |
| PII-CHECK | 개인정보(PII) 유출 확인 | ✅ | 개인정보 패턴 없음 |

---

## Case: caseB_yangpyeong_250b (선유도역 업무시설 250억)
- **Posture**: income
- **Result**: ✅ PASS
- **Artifacts**:
  - PPTX: [caseB_yangpyeong_250b.pptx](C:\Users\User\cre-dealcard\docs\test0823\outputs\income\caseB_yangpyeong_250b\caseB_yangpyeong_250b.pptx)
  - Viewer: [viewer.html](C:\Users\User\cre-dealcard\docs\test0823\outputs\income\caseB_yangpyeong_250b\viewer.html)

### 수행 단계 (Steps)
| Step | Pass | Detail | Duration |
|---|---|---|---|
| 1_memo_slots | ✅ | 5 slots | 3ms |
| 2_banding | ✅ | 250억 원대 | 0ms |
| 3_quality | ✅ | 60 (reference) | 0ms |
| 4_im_generation | ✅ | 7 sections | 156.65s |
| 5_pptx | ✅ | 4 slides | 4.51s |
| 6_html_capture | ✅ | viewer + captures | 2.42s |
| 7_inspection | ✅ | 8/8 pass | 9ms |

### 검사 결과 (Inspections)
| Criterion | Label | Pass | Detail |
|---|---|---|---|
| D06 | 마크다운 잔재 확인 | ✅ | 마크다운 잔재 없음 |
| D07 | 비정상 데이터 (NaN 등) 확인 | ✅ | 비정상 데이터 없음 |
| D08 | 이모지 사용 확인 | ✅ | 이모지 없음 |
| RG-TRUNC-01 | 괄호 밸런스 확인 | ✅ | 괄호 매칭 정상 |
| POSTURE-SLIDE | 포스처별 슬라이드 수 확인 | ✅ | 정상 (4장, 범위: 3~10) |
| PLACEHOLDER-CHECK | 플레이스홀더 미치환 확인 | ✅ | 미치환 플레이스홀더 없음 |
| TEMPLATE-FABRICATION | 템플릿 허위 데이터 확인 | ✅ | 허위 하드코딩 데이터 없음 |
| PII-CHECK | 개인정보(PII) 유출 확인 | ✅ | 개인정보 패턴 없음 |

---

