# 🏢 AI 시각 E2E 검수 요약 리포트 (대표 2개 케이스)

> **검수 일시**: 2026-08-19T04:04:34.661Z  
> **검수 범위**: 딜카드 데이터 주입 → PPTX 인메모리 생성 → OpenXML 결함 검사 → LibreOffice+PyMuPDF 슬라이드별 고화질 캡처 → AI 시각 무결성 판정

---

## 1. 종합 검수 결과

| 케이스 ID | 포스처 | 슬라이드 수 | 파일 크기 | XML 결함 | 최종 판정 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **case01_seocho_medical** | `income` | 9장 | 593.9 KB | 0건 | ✅ **PASS** |
| **case02_seongsu_hq** | `owner_occupied` | 9장 | 586.7 KB | 0건 | ✅ **PASS** |
| **case03_yeoksam_dev** | `development` | 9장 | 598.0 KB | 0건 | ✅ **PASS** |
| **case04_sinsa_value_add** | `trading` | 9장 | 621.4 KB | 0건 | ✅ **PASS** |
| **case05_icheon_logistics** | `operating` | 9장 | 543.8 KB | 0건 | ✅ **PASS** |
| **case06_yongsan_mixed** | `trading` | 9장 | 620.9 KB | 0건 | ✅ **PASS** |

---

## 2. 세부 검수 항목별 달성도

| 검수 항목 | Case 01 (수익형) | Case 02 (사옥형) | 비고 |
| :--- | :---: | :---: | :--- |
| **P01 파일 오픈 및 렌더링** | ✅ 통과 | ✅ 통과 | 10장 정상 생성 |
| **P02 백지 슬라이드 0장** | ✅ 통과 | ✅ 통과 | 전 슬라이드 콘텐츠 100% 충실 |
| **P03 텍스트 오염 (NaN/undefined/null)** | ✅ 통과 (0건) | ✅ 통과 (0건) | AdmZip 전수 파싱 검증 완료 |
| **P04 표지 (BASIC IM · 자산명 · 매매가)** | ✅ 통과 | ✅ 통과 | Kicker 및 뱃지 정상 |
| **P05 핵심요약 (4대 지표 카드)** | ✅ 통과 | ✅ 통과 | Cap Rate, NOI, 실투자금 일치 |
| **P06 포스처 특화 슬라이드** | ✅ 렌트롤+수익분석 | ✅ 사옥계획+비용비교 | 포스처별 슬라이드 차별화 |
| **P07 리스크 점검 (3-Block 카드)** | ✅ 통과 | ✅ 통과 | 진단+완화책 3단 카드 정상 |
| **P08 투자 포인트 (Thesis)** | ✅ 통과 | ✅ 통과 | 4대 투자 논거 카드 렌더링 |
| **P09 다음 단계 & 면책** | ✅ 통과 | ✅ 통과 | 법적 고지 및 5대 출처 가중치 |

---

## 3. 슬라이드 캡처 파일 링크


### 📁 서초 메디컬 타워 (수익형 표준)
- **PPTX 파일**: [`case01_seocho_medical_basic.pptx`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case01_seocho_medical/case01_seocho_medical_basic.pptx)
- **슬라이드 이미지**:
  - Slide 1: [`slide_1`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case01_seocho_medical/case01_seocho_medical_basic_slide_01.png)
  - Slide 2: [`slide_2`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case01_seocho_medical/case01_seocho_medical_basic_slide_02.png)
  - Slide 3: [`slide_3`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case01_seocho_medical/case01_seocho_medical_basic_slide_03.png)
  - Slide 4: [`slide_4`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case01_seocho_medical/case01_seocho_medical_basic_slide_04.png)
  - Slide 5: [`slide_5`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case01_seocho_medical/case01_seocho_medical_basic_slide_05.png)
  - Slide 6: [`slide_6`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case01_seocho_medical/case01_seocho_medical_basic_slide_06.png)
  - Slide 7: [`slide_7`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case01_seocho_medical/case01_seocho_medical_basic_slide_07.png)
  - Slide 8: [`slide_8`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case01_seocho_medical/case01_seocho_medical_basic_slide_08.png)
  - Slide 9: [`slide_9`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case01_seocho_medical/case01_seocho_medical_basic_slide_09.png)


### 📁 성수 IT밸리 통사옥 (사옥형 표준)
- **PPTX 파일**: [`case02_seongsu_hq_basic.pptx`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case02_seongsu_hq/case02_seongsu_hq_basic.pptx)
- **슬라이드 이미지**:
  - Slide 1: [`slide_1`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case02_seongsu_hq/case02_seongsu_hq_basic_slide_01.png)
  - Slide 2: [`slide_2`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case02_seongsu_hq/case02_seongsu_hq_basic_slide_02.png)
  - Slide 3: [`slide_3`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case02_seongsu_hq/case02_seongsu_hq_basic_slide_03.png)
  - Slide 4: [`slide_4`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case02_seongsu_hq/case02_seongsu_hq_basic_slide_04.png)
  - Slide 5: [`slide_5`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case02_seongsu_hq/case02_seongsu_hq_basic_slide_05.png)
  - Slide 6: [`slide_6`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case02_seongsu_hq/case02_seongsu_hq_basic_slide_06.png)
  - Slide 7: [`slide_7`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case02_seongsu_hq/case02_seongsu_hq_basic_slide_07.png)
  - Slide 8: [`slide_8`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case02_seongsu_hq/case02_seongsu_hq_basic_slide_08.png)
  - Slide 9: [`slide_9`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case02_seongsu_hq/case02_seongsu_hq_basic_slide_09.png)


### 📁 역삼 테헤란로 신축부지 (개발형 표준)
- **PPTX 파일**: [`case03_yeoksam_dev_basic.pptx`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case03_yeoksam_dev/case03_yeoksam_dev_basic.pptx)
- **슬라이드 이미지**:
  - Slide 1: [`slide_1`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case03_yeoksam_dev/case03_yeoksam_dev_basic_slide_01.png)
  - Slide 2: [`slide_2`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case03_yeoksam_dev/case03_yeoksam_dev_basic_slide_02.png)
  - Slide 3: [`slide_3`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case03_yeoksam_dev/case03_yeoksam_dev_basic_slide_03.png)
  - Slide 4: [`slide_4`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case03_yeoksam_dev/case03_yeoksam_dev_basic_slide_04.png)
  - Slide 5: [`slide_5`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case03_yeoksam_dev/case03_yeoksam_dev_basic_slide_05.png)
  - Slide 6: [`slide_6`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case03_yeoksam_dev/case03_yeoksam_dev_basic_slide_06.png)
  - Slide 7: [`slide_7`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case03_yeoksam_dev/case03_yeoksam_dev_basic_slide_07.png)
  - Slide 8: [`slide_8`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case03_yeoksam_dev/case03_yeoksam_dev_basic_slide_08.png)
  - Slide 9: [`slide_9`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case03_yeoksam_dev/case03_yeoksam_dev_basic_slide_09.png)


### 📁 신사동 가로수길 밸류애드 (밸류애드 표준)
- **PPTX 파일**: [`case04_sinsa_value_add_basic.pptx`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case04_sinsa_value_add/case04_sinsa_value_add_basic.pptx)
- **슬라이드 이미지**:
  - Slide 1: [`slide_1`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case04_sinsa_value_add/case04_sinsa_value_add_basic_slide_01.png)
  - Slide 2: [`slide_2`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case04_sinsa_value_add/case04_sinsa_value_add_basic_slide_02.png)
  - Slide 3: [`slide_3`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case04_sinsa_value_add/case04_sinsa_value_add_basic_slide_03.png)
  - Slide 4: [`slide_4`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case04_sinsa_value_add/case04_sinsa_value_add_basic_slide_04.png)
  - Slide 5: [`slide_5`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case04_sinsa_value_add/case04_sinsa_value_add_basic_slide_05.png)
  - Slide 6: [`slide_6`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case04_sinsa_value_add/case04_sinsa_value_add_basic_slide_06.png)
  - Slide 7: [`slide_7`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case04_sinsa_value_add/case04_sinsa_value_add_basic_slide_07.png)
  - Slide 8: [`slide_8`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case04_sinsa_value_add/case04_sinsa_value_add_basic_slide_08.png)
  - Slide 9: [`slide_9`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case04_sinsa_value_add/case04_sinsa_value_add_basic_slide_09.png)


### 📁 이천 복합물류센터 (운영형 표준)
- **PPTX 파일**: [`case05_icheon_logistics_basic.pptx`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case05_icheon_logistics/case05_icheon_logistics_basic.pptx)
- **슬라이드 이미지**:
  - Slide 1: [`slide_1`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case05_icheon_logistics/case05_icheon_logistics_basic_slide_01.png)
  - Slide 2: [`slide_2`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case05_icheon_logistics/case05_icheon_logistics_basic_slide_02.png)
  - Slide 3: [`slide_3`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case05_icheon_logistics/case05_icheon_logistics_basic_slide_03.png)
  - Slide 4: [`slide_4`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case05_icheon_logistics/case05_icheon_logistics_basic_slide_04.png)
  - Slide 5: [`slide_5`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case05_icheon_logistics/case05_icheon_logistics_basic_slide_05.png)
  - Slide 6: [`slide_6`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case05_icheon_logistics/case05_icheon_logistics_basic_slide_06.png)
  - Slide 7: [`slide_7`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case05_icheon_logistics/case05_icheon_logistics_basic_slide_07.png)
  - Slide 8: [`slide_8`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case05_icheon_logistics/case05_icheon_logistics_basic_slide_08.png)
  - Slide 9: [`slide_9`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case05_icheon_logistics/case05_icheon_logistics_basic_slide_09.png)


### 📁 용산 용리단길 복합구옥 (엣지 표준)
- **PPTX 파일**: [`case06_yongsan_mixed_basic.pptx`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case06_yongsan_mixed/case06_yongsan_mixed_basic.pptx)
- **슬라이드 이미지**:
  - Slide 1: [`slide_1`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case06_yongsan_mixed/case06_yongsan_mixed_basic_slide_01.png)
  - Slide 2: [`slide_2`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case06_yongsan_mixed/case06_yongsan_mixed_basic_slide_02.png)
  - Slide 3: [`slide_3`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case06_yongsan_mixed/case06_yongsan_mixed_basic_slide_03.png)
  - Slide 4: [`slide_4`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case06_yongsan_mixed/case06_yongsan_mixed_basic_slide_04.png)
  - Slide 5: [`slide_5`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case06_yongsan_mixed/case06_yongsan_mixed_basic_slide_05.png)
  - Slide 6: [`slide_6`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case06_yongsan_mixed/case06_yongsan_mixed_basic_slide_06.png)
  - Slide 7: [`slide_7`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case06_yongsan_mixed/case06_yongsan_mixed_basic_slide_07.png)
  - Slide 8: [`slide_8`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case06_yongsan_mixed/case06_yongsan_mixed_basic_slide_08.png)
  - Slide 9: [`slide_9`](C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/case06_yongsan_mixed/case06_yongsan_mixed_basic_slide_09.png)

