# MANIFEST — CREDEAL IM 인계 패키지

> 이 파일이 목록이자 **무결성 증거**입니다. 압축을 풀고 `sha256`을 대조하십시오.

| | |
|---|---|
| **패키지** | `CREDEAL_IM_HANDOVER_v0.5` |
| **온톨로지** | v0.5.0 |
| **생성** | 2026-08-25 |
| **파일** | **310** |
| **용량** | **34.2 MB** (압축 전) |

---

## 0. 여기서 시작하십시오

```
1  WORK_ORDER.md          ← D00 최상위 작업 지시서 · 스프린트 6개 · 62.5일
2  README.md              ← 진입 인덱스 · 독자별 읽는 순서 · 정본 소유표
3  IM_HANDOVER_SET.md     ← D25 이 세트가 왜 이렇게 구성됐는가
```

**나머지 96개 문서를 훑지 마십시오.** `README.md` §0이 역할별로 3개씩 짚어 줍니다.

---

## 1. 압축 해제 직후 확인 — 전부 통과해야 정상입니다

```bash
pip install pyyaml python-pptx pillow

python3 qa/doc_integrity.py                    # 문서 세트 무결성
python3 qa/ontology_check.py                   # 온톨로지 역방향 대조
python3 credeal/ssot/loader.py                 # 레지스트리 자기검사
python3 credeal/parcel.py --selftest           # 필지·제척 계산
python3 credeal/make_parity.py                 # 수치 동일성 5케이스
python3 qa/calibrate.py                        # 오탐/미탐 보정
python3 qa/calibrate_invariant.py              # 동
```

산출물 검사는 **샘플 경로**를 씁니다.

```bash
S=credeal/samples/양평동_IM_D22_A등급.pptx
python3 qa/standard_check.py --kind pptx "$S"
python3 qa/consistency_check.py "$S"
python3 qa/invariant_check.py --fixture fixtures/yangpyeong.json "$S"
```

**생성 시점 실측 — 9종 전량 통과.** 하나라도 실패하면 압축이 손상됐거나
의존 패키지가 빠진 것입니다.

> `calibrate_invariant` 는 **대상 13 · 검사 8 · 건너뜀 5** 로 나옵니다.
> 당산동 대형 데모 PPTX 5종(33 MB)을 제외했기 때문이며 정상입니다.
> 최소 커버리지 8건을 지키는지 검사기가 스스로 확인합니다.

---

## 2. 구성

| 경로 | 파일 | 용량 | 담는 것 |
|---|---:|---:|---|
| `qa/snapshots/` | 82 | 15,604 KB | 렌더 회귀 기준본 |
| `credeal/assets/` | 17 | 7,450 KB | 사진·지도 에셋 (재생성에 필요) |
| `credeal/samples/` | 9 | 4,775 KB | 대표 산출물 — 양평동 A등급 · 다필지 |
| `credeal/` | 27 | 3,985 KB | 참조구현 (python) + 보정 대상 산출물 |
| `(루트 문서)` | 98 | 2,002 KB | 정본 · 규격 · 실행 문서 (96) |
| `goldilocks/` | 18 | 399 KB | 보정용 기준 산출물 |
| `99_superseded/` | 12 | 211 KB | ⛔ 폐기 11종 — 수정 금지 · 읽기 금지 |
| `credeal/ssot/` | 17 | 176 KB | 기계 판독 레지스트리 14 yaml + loader |
| `contracts/` | 5 | 113 KB | TS 계약 — registry · core · render · parity |
| `qa/` | 12 | 103 KB | 검사기 10종 + 기준선 |
| `03_spec_current_state/` | 4 | 77 KB | 🔴 프로덕션 현행 명세 — 개발팀이 갱신 |
| `golden/` | 9 | 56 KB | 골든 IM 레코드 |
| `fixtures/` | 8 | 29 KB | 시험 픽스처 |
| `.github/` | 1 | 3 KB | CI — 문서·온톨로지·산출물 검사 |
| `credeal/broker_inputs/` | 1 | 3 KB | 중개인 보강 입력 |
| | **320** | **34,988 KB** | |

---

## 3. 포함하지 않은 것

| 제외 | 이유 |
|---|---|
| 당산동 대형 데모 PPTX 5종 (33 MB) | 샘플 2종 + 보정 대상 8종으로 충분합니다 |
| `golden_source/` | 운영 DB에서 재생성 |
| `fonts/` | 라이선스 확인 필요 — 로컬 설치 |
| `_yp/` | 중간 산출물 |
| 프로덕션 코드 | 이 패키지는 **규격·검사기·참조구현**입니다 |

🔴 **프로덕션 문서 4종이 이 레포에 없습니다.** 편입 여부를 결정해야 합니다.

```
PPTX_IM_METHODOLOGY_AND_ARCHITECTURE.md   PPTX_IM_PRESET_TEMPLATE_SPEC.md
모바일IM_UI_UX_스펙.md                      PPTX_디자인시스템_스펙.md
```

`PPTX_시스템_개선_요구서.md` §0A · `IM_HANDOVER_SET.md` §1.2 참고.

---

## 4. 지금 막혀 있는 것 3건

| # | 항목 | 필요 |
|:-:|---|---|
| **B1** | 🔴 이미지 마스킹 (상호·번호판·얼굴) | **검출 모델 도입 결정** — 이것 없이는 상용 발행 불가 |
| **B2** | `QG01~QG16` 실제 정의 | `quality-gates-v02.ts` 열람 |
| **B3** | `trading` 수집 경로 (등기부 파싱) | 수요 확인 후 판단 — 없으면 미루는 것이 정답 |

상세는 `WORK_ORDER.md` §6.

---

## 5. 무결성

`sha256` 앞 16자리입니다.

```bash
# 대조 예
sha256sum WORK_ORDER.md | cut -c1-16
```

| 파일 | 바이트 | sha256 |
|---|---:|---|
| `.github/workflows/docs.yml` | 3,148 | `bf31dc8e0abb29f0` |
| `03_spec_current_state/01_PIPELINE_FUNCTIONAL_SPEC.md` | 29,640 | `338dc92058c0ae00` |
| `03_spec_current_state/02_MOBILE_IM_CONTENT_GENERATION_AND_RENDERING_SPEC.md` | 22,724 | `14c2cf0133e5e17a` |
| `03_spec_current_state/03_PPTX_IM_CONTENT_GENERATION_AND_RENDERING_SPEC.md` | 24,677 | `05807c50dba7c301` |
| `03_spec_current_state/README.md` | 1,934 | `be275d57c2ef48cf` |
| `12_e2e_real_02_dangsan_income.md` | 18,055 | `4124ee70097faa88` |
| `12_e2e_real_04_yangpyeong_income.md` | 15,703 | `faebcea3d2ae3cca` |
| `99_superseded/IM_AUTHORING_SPEC.md` | 23,490 | `31a19df58ecedc02` |
| `99_superseded/IM_DATA_PIPELINE.md` | 21,311 | `c926801ad3f650f4` |
| `99_superseded/IM_PRECISION_SPEC.md` | 28,281 | `e0ad47a7d46966c8` |
| `99_superseded/IM_레포문서세트_도출계획.md` | 26,289 | `b1fbd22a89ea5a58` |
| `99_superseded/IM_문서세트_배치도출계획.md` | 13,320 | `62a25d817ae7fa2b` |
| `99_superseded/MOBILE_IM_SPEC.md` | 17,429 | `5223c85001948811` |
| `99_superseded/ONTOLOGY_IMPLEMENTATION_GAP.md` | 12,064 | `bba2b9b76ae8dcd9` |
| `99_superseded/ONTOLOGY_V0.2_SPEC.md` | 18,677 | `fcd55a746d314217` |
| `99_superseded/ONTOLOGY_V0.3_SPEC.md` | 14,583 | `8a0e65c7fd2b4347` |
| `99_superseded/ONTOLOGY_V0.4_SPEC.md` | 16,895 | `4f0fe02708429934` |
| `99_superseded/README.md` | 2,223 | `1bfff45d00d3f9ca` |
| `99_superseded/_credeal_v2_extract.md` | 21,465 | `d844eb2eba9b4b13` |
| `AGENTS.md` | 33,890 | `8f9ea08fcbd8156e` |
| `API_TYPE_CONTRACT.md` | 32,211 | `19074cfffb888711` |
| `ASSET_CLASS_EXTENSION_PLAN.md` | 22,344 | `43c0cfbd5c24783a` |
| `ASSUMPTION_REGISTRY.md` | 14,747 | `5520a815b6b8ec68` |
| `BROKER_WORKSPACE_SPEC.md` | 20,792 | `68d957838b672150` |
| `CATALOG_ASSET_TYPES.md` | 19,635 | `5c6e61e7d1ba1f8e` |
| `CATALOG_LEXICON.md` | 22,384 | `3f882eb84bb03409` |
| `CATALOG_RULES.md` | 47,400 | `850a81d4dcf4552d` |
| `CATALOG_SLOTS.md` | 34,690 | `9d2bcc3f35b231da` |
| `CHANGELOG.md` | 60,847 | `3abf7ea7ad853eb4` |
| `CREDEAL_E2E_테스트입력세트.md` | 36,489 | `1ccbec1bdcc51892` |
| `CREDEAL_IM_SPEC_수익형.md` | 46,014 | `09de0c74f53c596e` |
| `CREDEAL_IM_SPEC_수익형_부록.md` | 24,899 | `cdc9aac8151dfd94` |
| `CREDEAL_v2.1_개정마일스톤_P0P1결합판.md` | 22,644 | `7e4c2727222e0c60` |
| `CREDEAL_v3.1_개정기획서.md` | 39,290 | `2698d8d4e1bf9a13` |
| `DEAL_CARD_SPEC.md` | 17,696 | `07d12a5d4acc985e` |
| `DISTRIBUTION_AND_IDENTITY.md` | 28,003 | `2724bd40f6ef6416` |
| `E2E_TEST_GUIDE.md` | 15,164 | `e7cf1202663ada40` |
| `E2E_TR_주택임대차_테스트.md` | 18,951 | `ab8d5eb9a62d3f10` |
| `FIELD_TRANSITION_GUIDE.md` | 12,135 | `6d7dddc8203d5eb1` |
| `GENERATION_PERF_SPEC.md` | 12,250 | `8180d2a8d04fbd31` |
| `GOLDEN_CLEANUP_GUIDE.md` | 12,168 | `99d176691144fabc` |
| `GOLDEN_REBUILD_SPEC.md` | 17,613 | `459448340cac1d4c` |
| `GOLDILOCKS_IM_SPEC.md` | 18,787 | `ecd68685dad55f4a` |
| `HANDOVER.md` | 11,128 | `9c53171a26622fe0` |
| `IM_AB_PLAYBOOK.md` | 16,877 | `de3e05175dfa04f0` |
| `IM_BUILD_BACKLOG.md` | 20,667 | `58de4fdb4492667c` |
| `IM_COMMERCIAL_PROGRAM.md` | 12,106 | `665022f10987f586` |
| `IM_DECISIONS.md` | 20,029 | `6b625d521abd5963` |
| `IM_HANDOVER_SET.md` | 26,255 | `398afd1b4fd05033` |
| `IM_IMAGE_PIPELINE_SPEC.md` | 10,583 | `4e42f5649887aacb` |
| `IM_ONTOLOGY_UPGRADE.md` | 17,818 | `c311d4b483f04e10` |
| `IM_PARCEL_GAP.md` | 15,692 | `24c6b1677fe2b1b7` |
| `IM_PIPELINE_COMPLETION_SPEC.md` | 18,010 | `dba1a4c358d9877d` |
| `IM_PIPELINE_RUNTIME_SPEC.md` | 16,013 | `c084836c07deeaff` |
| `IM_PIPELINE_UPGRADE.md` | 24,556 | `15531298a5a51dfa` |
| `IM_QUALITY_GATES.md` | 19,893 | `1821dd2382edfbad` |
| `IM_QUALITY_TRAINING_PLAN.md` | 15,173 | `56feda5f0d5943e7` |
| `IM_RESOLUTION_TIERS.md` | 17,979 | `f2f9889050d45b7b` |
| `IM_SAMPLE_양평동_해설.md` | 26,172 | `e225cfce74027576` |
| `IM_SECTION_SPEC_평가.md` | 23,275 | `49ee1aa93cf5daa3` |
| `IM_SELF_REVIEW_PROMPTS.md` | 19,324 | `6acc5212413d3187` |
| `IM_STANDARD_개발형.md` | 10,414 | `6167a439233ea09d` |
| `IM_STANDARD_단기매매형.md` | 9,473 | `893185c384ea4f2a` |
| `IM_STANDARD_사옥형.md` | 8,300 | `9f5a58900541fa86` |
| `IM_STANDARD_수익형.md` | 28,639 | `37b5809765b71ca9` |
| `IM_STANDARD_운영형.md` | 9,094 | `7d05acb951968029` |
| `IM_STANDARD_포스처확장.md` | 32,392 | `381478b5a0a91c54` |
| `IM_SYSTEM_SSOT.md` | 55,703 | `a42638cb49f3856d` |
| `IM_UNIFIED_ARCHITECTURE.md` | 13,062 | `c4230b3bd94b8a88` |
| `IM_고도화_전략.md` | 19,772 | `59bc49b9779f6bd1` |
| `IM_산출물점검_v3_섹션7종.md` | 13,378 | `6e8c4d1a95250ac8` |
| `IM_산출물점검_v4_PDF.md` | 16,415 | `62c2bc07bbf9f9e0` |
| `IM_산출물점검_당산동.md` | 18,118 | `20c3e6a0df1a177b` |
| `IM_산출물점검_당산동_v2.md` | 11,249 | `764593f5bb2b83ab` |
| `IM_산출물점검_양평동.md` | 15,728 | `36a7f15bf09fd899` |
| `IM_산출물점검_양평동_모바일.md` | 8,833 | `d3a9c3f6b89300da` |
| `IM_산출물점검_통합추적.md` | 10,474 | `0815a4fb27c2e955` |
| `IM_상용화_준비도_평가서.md` | 22,524 | `a057744620645ff7` |
| `IM_역설계분석_3종.md` | 15,120 | `8b7ccaa37929fb46` |
| `IM_역설계분석_당산동근생빌딩.md` | 12,608 | `cd2c7df471ed79c0` |
| `IM_역설계분석_잠원동두원빌딩.md` | 11,580 | `deba20dd92961b9b` |
| `INPUT_수택동419-19_대지.md` | 7,672 | `c2143320bc7aece1` |
| `INPUT_양평동117_더레드빌딩.md` | 8,470 | `16962db51e10df6e` |
| `INPUT_에이치에비뉴호텔_이대점.md` | 8,199 | `fa52cfa42457b906` |
| `INPUT_정밀_당산동근생빌딩.md` | 14,039 | `9eb9c1029503b94e` |
| `INPUT_정밀_잠원동두원빌딩.md` | 15,652 | `717f6113f603795e` |
| `INPUT_표준_당산동근생빌딩.md` | 8,882 | `2fa18cb9837ee528` |
| `INPUT_표준_잠원동두원빌딩.md` | 9,829 | `0674781b23a555fd` |
| `MIGRATION_RUNBOOK.md` | 29,379 | `b772637c3699d326` |
| `MOBILE_GAP_SPEC.md` | 11,471 | `88b014d86f73a8c0` |
| `MOBILE_IM_BASIC_PLAN.md` | 16,147 | `3a93f565fd8f9245` |
| `MOBILE_IM_품질평가_양평동.md` | 25,470 | `8a30bc84a0801b42` |
| `ONTOLOGY_GOVERNANCE_SPEC.md` | 17,681 | `70dbdc721586a29d` |
| `ONTOLOGY_SSOT_AUDIT.md` | 17,111 | `4cac38223aeb67a9` |
| `ONTOLOGY_V0.5_SPEC.md` | 42,149 | `f6b9370c607e7edd` |
| `OUTPUT_QA_GUIDE.md` | 35,506 | `7b26d52d7d09337d` |
| `P0-상세기능명세-개발스코프.md` | 57,482 | `213f656016db7719` |
| `P1-1_전문가마켓플레이스_기능명세.md` | 35,340 | `114d49b27e699503` |
| `P1-2_너처링자동화_기능명세.md` | 29,715 | `6e772851f57c8831` |
| `POSTURE_IMPL_GUIDE.md` | 23,247 | `34d0b4745a54ded9` |
| `POST_PUBLISH_SPEC.md` | 22,350 | `aea04b8e4ddf024f` |
| `PPTX_ARCHETYPE_SPEC.md` | 21,503 | `71f0861592e0dc86` |
| `PPTX_TEMPLATE_SPEC.md` | 37,530 | `6c9ce5eac798ded0` |
| `PPTX_시스템_개선_요구서.md` | 15,779 | `7fd1b43d5bca1b57` |
| `PRD_IM고도화.md` | 14,443 | `3677cc060f316e38` |
| `PRD_발행후관리.md` | 12,001 | `59246738b5b615c1` |
| `READINESS_DIAGNOSTIC_SPEC.md` | 19,333 | `dc6a5a751f828c0f` |
| `READINESS_SYSTEM.md` | 15,947 | `5e18c37190b5116b` |
| `README.md` | 9,701 | `288fb6e7ae775a9b` |
| `TELEMETRY_SPEC.md` | 15,236 | `fbae328eb90ccd95` |
| `TEST_PLAN.md` | 21,378 | `2cbde46e99d0c909` |
| `UNIT_TEST_GUIDE.md` | 16,248 | `1722eaed12fe2d6b` |
| `WORK_ORDER.md` | 14,637 | `fe53bf55561ff93c` |
| `contracts/im-core.d.ts` | 13,697 | `9a31e32c3405c390` |
| `contracts/im-registry.d.ts` | 22,228 | `be9c955c05a736db` |
| `contracts/im-render.d.ts` | 7,348 | `957bb72ac8812d9d` |
| `contracts/parity.golden.json` | 56,174 | `b2d60ec6aec24d94` |
| `contracts/parity.spec.ts` | 16,716 | `e7d523e4d4b72b15` |
| `credeal/assets/dangsan/cadastre.jpg` | 81,697 | `a5dd49a3532e06f8` |
| `credeal/assets/dangsan/ext1.jpg` | 844,063 | `0d793c71705c3e6a` |
| `credeal/assets/dangsan/ext2.jpg` | 721,610 | `e859b4a5b8ecffa6` |
| `credeal/assets/dangsan/ext3.jpg` | 591,395 | `62f93f323e748132` |
| `credeal/assets/dangsan/front.jpg` | 722,218 | `09d14a108507d816` |
| `credeal/assets/dangsan/hero.jpg` | 793,943 | `f68e72ac3642a61d` |
| `credeal/assets/dangsan/in_cafe.jpg` | 455,150 | `e5a4a58f270b3a11` |
| `credeal/assets/dangsan/in_ev.jpg` | 1,014,521 | `385374324b610097` |
| `credeal/assets/dangsan/in_hall.jpg` | 440,836 | `e29e59a953ca03f3` |
| `credeal/assets/dangsan/in_lobby.jpg` | 440,489 | `9636e0b590feb46e` |
| `credeal/assets/dangsan/in_shop.jpg` | 496,745 | `dbefaa9df3fc3887` |
| `credeal/assets/dangsan/locmap.jpg` | 132,801 | `24b3c818d67cc581` |
| `credeal/assets/dangsan/map.jpg` | 309,590 | `8086f5ec15624c1d` |
| `credeal/assets/yangpyeong/cadastre.jpg` | 169,111 | `b992ac1b0bb3d1f5` |
| `credeal/assets/yangpyeong/context.jpg` | 94,444 | `948ae71c80cc4411` |
| `credeal/assets/yangpyeong/hero.jpg` | 157,088 | `d246fd699d0e3ebb` |
| `credeal/assets/yangpyeong/map.jpg` | 163,428 | `a6a7effa3c3ee75d` |
| `credeal/broker_inputs/yangpyeong.json` | 2,621 | `b7349e1e28bd8203` |
| `credeal/build_d22.py` | 15,171 | `24276c98bdb5b44b` |
| `credeal/build_mobile.py` | 13,244 | `53592c983efdd45e` |
| `credeal/build_pptx.py` | 21,011 | `02afb66177d5b78a` |
| `credeal/build_pptx_kr.py` | 65,034 | `9afbf6faf7eca508` |
| `credeal/copy_im.py` | 37,926 | `9d89f990a6cb79ba` |
| `credeal/core.py` | 31,468 | `8939d83e768c8816` |
| `credeal/design.py` | 5,076 | `7fd19c750a520112` |
| `credeal/image_pipeline.py` | 10,777 | `4c325674a09aecdd` |
| `credeal/input_spec.py` | 25,101 | `3dd6946fd3b147c3` |
| `credeal/make_parity.py` | 7,738 | `f22a3eb1e2ed2afb` |
| `credeal/multiparcel_IM_D22_A등급.pptx` | 69,773 | `2612e4106d6d84c1` |
| `credeal/multiparcel_IM_D22_A등급_모바일.html` | 34,758 | `a64b33a5c03cf3fc` |
| `credeal/parcel.py` | 15,760 | `5aadbd9628c6505f` |
| `credeal/presets.py` | 8,164 | `06269c9fdf00967b` |
| `credeal/public_data.py` | 15,050 | `d435494ab1b59abd` |
| `credeal/samples/multiparcel_IM_D22_A등급.pptx` | 69,773 | `2612e4106d6d84c1` |
| `credeal/samples/multiparcel_IM_D22_A등급_land_value_first.pptx` | 67,223 | `d4fe8c414c2cbdfd` |
| `credeal/samples/multiparcel_IM_D22_A등급_모바일.html` | 34,758 | `a64b33a5c03cf3fc` |
| `credeal/samples/양평동_IM_D22_A등급.pptx` | 1,160,500 | `6cca70368d685870` |
| `credeal/samples/양평동_IM_D22_A등급_evidence_first.pptx` | 1,161,596 | `579d0f07d945d04f` |
| `credeal/samples/양평동_IM_D22_A등급_land_value_first.pptx` | 1,164,766 | `77e0ee580e411e76` |
| `credeal/samples/양평동_IM_D22_A등급_모바일.html` | 33,850 | `8e990e7221d9ccec` |
| `credeal/samples/양평동_IM_D22_A등급_보강전.pptx` | 1,160,648 | `86c284643092ffd9` |
| `credeal/samples/양평동_IM_D22_A등급_보강전_모바일.html` | 36,180 | `036795c2ddbe7a3a` |
| `credeal/ssot/build_ssot.py` | 6,928 | `3be51054b5e85ad4` |
| `credeal/ssot/im.assumptions.yaml` | 9,333 | `52e2b6d7989af51e` |
| `credeal/ssot/im.bindings.yaml` | 18,148 | `91e943f8db55a1d8` |
| `credeal/ssot/im.budget.yaml` | 1,508 | `70ce4619c8f86b8e` |
| `credeal/ssot/im.errors.yaml` | 15,720 | `f695977e01f708a6` |
| `credeal/ssot/im.format.yaml` | 5,818 | `e2949bc528610a39` |
| `credeal/ssot/im.gating.yaml` | 22,029 | `b709083ca0e68883` |
| `credeal/ssot/im.image.yaml` | 9,539 | `75fd1b45f181a279` |
| `credeal/ssot/im.invariants.yaml` | 9,885 | `604efcfb8aa68883` |
| `credeal/ssot/im.lexicon.yaml` | 4,414 | `4918573c0e528ecf` |
| `credeal/ssot/im.masking.yaml` | 4,553 | `2a0683418857e327` |
| `credeal/ssot/im.ontology.yaml` | 17,450 | `e0be326ae5a11bf9` |
| `credeal/ssot/im.pages.yaml` | 7,565 | `19e271624611ae2a` |
| `credeal/ssot/im.parcel.yaml` | 11,104 | `0c26d24aa99f5407` |
| `credeal/ssot/im.tokens.yaml` | 5,785 | `96943e875338078e` |
| `credeal/ssot/loader.py` | 14,561 | `33bcaf296c0a5062` |
| `credeal/당산동_모바일IM_R1.html` | 27,666 | `3650be76cec3a9e1` |
| `credeal/당산동_모바일IM_R2.html` | 33,210 | `1aeec13e886d2aa2` |
| `credeal/양평동_IM_D22_A등급.pptx` | 1,160,500 | `6cca70368d685870` |
| `credeal/양평동_IM_D22_A등급_모바일.html` | 33,850 | `8e990e7221d9ccec` |
| `credeal/양평동_PPTX_IM_KR_R1.pptx` | 1,152,986 | `e0d000b2bd64b3c3` |
| `credeal/양평동_PPTX_IM_KR_R2.pptx` | 1,156,011 | `50fd947aafa4de46` |
| `credeal/양평동_모바일IM_R1.html` | 29,580 | `f4358639e720a0bc` |
| `credeal/양평동_모바일IM_R2.html` | 35,669 | `b48aa4fad651efce` |
| `fixtures/dangsan.json` | 6,219 | `372cd44a10080893` |
| `fixtures/hotel.json` | 534 | `77c5f17f0976ac72` |
| `fixtures/index.json` | 458 | `5d25253d4672046d` |
| `fixtures/jamwon.json` | 2,333 | `0ad7b623bf065ef8` |
| `fixtures/multiparcel.json` | 6,199 | `38156a8faaf69fd0` |
| `fixtures/selfcheck.py` | 4,336 | `e3260d67cf91f123` |
| `fixtures/sutaek.json` | 609 | `1706a6af7622e255` |
| `fixtures/yangpyeong.json` | 8,930 | `bd98a03a16eb967c` |
| `golden/G01-yangpyeong-250.md` | 6,634 | `23f2a2445e54d888` |
| `golden/G02-dangsan-115.md` | 6,668 | `457a1a8802dec016` |
| `golden/G03-yeoksam-hq-120.md` | 6,199 | `3a85fb4abd7e2aab` |
| `golden/G04-yeoksam-office-50.md` | 6,607 | `e946fdbf9462207c` |
| `golden/G05-samseong-house-195.md` | 6,512 | `865b38da17e8932f` |
| `golden/G06-jamwon-dev.md` | 6,610 | `2c39184bef0ce5bc` |
| `golden/G07-daechi-150.md` | 6,136 | `ef9aaaa696a37cf6` |
| `golden/G08-yeoksam-98.md` | 6,160 | `9dc5e38c7573338b` |
| `golden/verify_golden.py` | 5,632 | `ddf8188a55b2b50a` |
| `goldilocks/_regression/당산동_v4결함.txt` | 9,587 | `4aa4afa0067fa43a` |
| `goldilocks/build_md.py` | 3,208 | `405bd4bdf8865de9` |
| `goldilocks/build_mobile.py` | 11,100 | `d1c0d3d6195238dc` |
| `goldilocks/build_pptx.py` | 20,370 | `cd2bea3524cb08a3` |
| `goldilocks/im_copy.py` | 26,395 | `37ada87fe84cf568` |
| `goldilocks/im_core.py` | 18,337 | `eacf23c35b2d3937` |
| `goldilocks/당산동_PPTX_IM.pptx` | 64,960 | `4bbb74dfd66fef1e` |
| `goldilocks/당산동_PPTX_IM.txt` | 12,802 | `1692cc394f0f1f10` |
| `goldilocks/당산동_모바일IM.html` | 27,424 | `8225f64b089d06f9` |
| `goldilocks/당산동_섹션카피.md` | 11,400 | `f797cc1086c24865` |
| `goldilocks/양평동_PPTX_IM.pptx` | 65,657 | `7dbc0c1746d2fa60` |
| `goldilocks/양평동_PPTX_IM.txt` | 13,537 | `76dc44b65b090418` |
| `goldilocks/양평동_모바일IM.html` | 29,360 | `9728d4470577ef43` |
| `goldilocks/양평동_섹션카피.md` | 12,222 | `d20c56d8fe152696` |
| `input-surface-writing-guide.md` | 27,920 | `d211de6fc85addf8` |
| `qa/calibrate.py` | 2,942 | `99717ee797b115af` |
| `qa/calibrate_invariant.py` | 5,515 | `0210c00db7098a1d` |
| `qa/consistency_check.py` | 4,655 | `f05863afbdda9df5` |
| `qa/cross_property.py` | 5,702 | `ef26d14428db393e` |
| `qa/doc_baseline.json` | 28 | `b957415dad54b7bc` |
| `qa/doc_integrity.py` | 13,522 | `8e8a77dea16eba26` |
| `qa/invariant_check.py` | 10,303 | `3c2dbb22bd3f1b66` |
| `qa/ontology_check.py` | 14,012 | `37794534850299cf` |
| `qa/output_qa.py` | 21,804 | `834021c2c40b89fa` |
| `qa/render_snapshot.py` | 7,019 | `28e33ebc3178b2ac` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-01.png` | 34,923 | `45203422f4ad077c` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-02.png` | 60,005 | `52a9a1f321349362` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-03.png` | 82,256 | `fab23220c5301783` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-04.png` | 36,195 | `9ef607611222c989` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-05.png` | 69,111 | `200fe62035adfb8d` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-06.png` | 61,171 | `0626390fc1f70c9a` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-07.png` | 65,494 | `c072d21c32ce3c63` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-08.png` | 46,417 | `d8d3dd0a32a4edac` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-09.png` | 80,791 | `9dbd0b151773ba37` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-10.png` | 76,438 | `7772643c62a4fea5` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-11.png` | 69,033 | `23567bdec1f3aa08` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-12.png` | 80,001 | `ad21d0e3667cbd15` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-13.png` | 62,964 | `ac69fe7112d52046` |
| `qa/snapshots/multiparcel_IM_D22_A등급/p-14.png` | 65,173 | `2a65bcec2f0a3211` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-01.png` | 625,574 | `04d2a7dcfd867688` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-02.png` | 309,662 | `5a7d53942f2d8866` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-03.png` | 306,895 | `31f0440a7b604c47` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-04.png` | 413,075 | `fc9178282366784f` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-05.png` | 126,912 | `1a35c69bffd57a2a` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-06.png` | 75,867 | `8f146778cd395e2d` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-07.png` | 54,799 | `a38ea587c3368fbd` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-08.png` | 82,299 | `f6311f6236d57165` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-09.png` | 82,799 | `cd8ab383167b3cbc` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-10.png` | 61,492 | `3f8644e8343aa186` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-11.png` | 634,518 | `f7da491f4a991645` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-12.png` | 515,435 | `176180a029660697` |
| `qa/snapshots/당산동_PPTX_IM_KR_R2/p-13.png` | 67,900 | `6f10badfb31be4b1` |
| `qa/snapshots/데모_당산동_evidence_first/p-01.png` | 629,071 | `c4416d6d927d9daf` |
| `qa/snapshots/데모_당산동_evidence_first/p-02.png` | 309,649 | `0d4ac8752e5336e9` |
| `qa/snapshots/데모_당산동_evidence_first/p-03.png` | 311,406 | `348f867cc4fbe055` |
| `qa/snapshots/데모_당산동_evidence_first/p-04.png` | 413,036 | `8bd448f6a868b6d3` |
| `qa/snapshots/데모_당산동_evidence_first/p-05.png` | 126,938 | `6af9edfb2d4af164` |
| `qa/snapshots/데모_당산동_evidence_first/p-06.png` | 75,865 | `12603eabcfcae47f` |
| `qa/snapshots/데모_당산동_evidence_first/p-07.png` | 54,812 | `4c7e806ba7a8f426` |
| `qa/snapshots/데모_당산동_evidence_first/p-08.png` | 82,297 | `7eff7443dd5d4fec` |
| `qa/snapshots/데모_당산동_evidence_first/p-09.png` | 82,700 | `bc4de62a97f1a58d` |
| `qa/snapshots/데모_당산동_evidence_first/p-10.png` | 61,531 | `758348a81735b93d` |
| `qa/snapshots/데모_당산동_evidence_first/p-11.png` | 88,342 | `6115ad720de9814b` |
| `qa/snapshots/데모_당산동_evidence_first/p-12.png` | 634,563 | `86e1386dbbe96873` |
| `qa/snapshots/데모_당산동_evidence_first/p-13.png` | 515,435 | `394292de25a693ec` |
| `qa/snapshots/데모_당산동_evidence_first/p-14.png` | 67,831 | `6cc318561d8dbdb6` |
| `qa/snapshots/데모_당산동_land_value_first/p-01.png` | 669,190 | `5424eb634c9f071e` |
| `qa/snapshots/데모_당산동_land_value_first/p-02.png` | 309,663 | `e3475ef635422e83` |
| `qa/snapshots/데모_당산동_land_value_first/p-03.png` | 306,911 | `dddd607a2e3e8fea` |
| `qa/snapshots/데모_당산동_land_value_first/p-04.png` | 413,038 | `edcd2a504203a00b` |
| `qa/snapshots/데모_당산동_land_value_first/p-05.png` | 126,945 | `2a554600984d84f7` |
| `qa/snapshots/데모_당산동_land_value_first/p-06.png` | 75,875 | `05dcc75ea3e4b8a1` |
| `qa/snapshots/데모_당산동_land_value_first/p-07.png` | 54,805 | `46cdd0875650fc74` |
| `qa/snapshots/데모_당산동_land_value_first/p-08.png` | 82,327 | `9b01a0986206b2c5` |
| `qa/snapshots/데모_당산동_land_value_first/p-09.png` | 82,759 | `1ec3b710c6d733ec` |
| `qa/snapshots/데모_당산동_land_value_first/p-10.png` | 61,549 | `a5759cc73f7ff47c` |
| `qa/snapshots/데모_당산동_land_value_first/p-11.png` | 62,440 | `bcda9d9505e377f0` |
| `qa/snapshots/데모_당산동_land_value_first/p-12.png` | 634,563 | `86e1386dbbe96873` |
| `qa/snapshots/데모_당산동_land_value_first/p-13.png` | 515,435 | `394292de25a693ec` |
| `qa/snapshots/데모_당산동_land_value_first/p-14.png` | 67,906 | `896051beead3b278` |
| `qa/snapshots/양평동_IM_D22_A등급/p-01.png` | 460,383 | `16dcfcc8f9d2250e` |
| `qa/snapshots/양평동_IM_D22_A등급/p-02.png` | 267,778 | `ff8337ad3093d153` |
| `qa/snapshots/양평동_IM_D22_A등급/p-03.png` | 246,951 | `64f95ca3e2f6c26a` |
| `qa/snapshots/양평동_IM_D22_A등급/p-04.png` | 394,320 | `95ef6b06c7df30e7` |
| `qa/snapshots/양평동_IM_D22_A등급/p-05.png` | 206,154 | `ed38c8e697295ffd` |
| `qa/snapshots/양평동_IM_D22_A등급/p-06.png` | 77,891 | `3230f9f724ebb5ef` |
| `qa/snapshots/양평동_IM_D22_A등급/p-07.png` | 55,383 | `1e5a7205ea834c30` |
| `qa/snapshots/양평동_IM_D22_A등급/p-08.png` | 82,396 | `b45b96e357ef4bf9` |
| `qa/snapshots/양평동_IM_D22_A등급/p-09.png` | 77,594 | `70d7f7864c4b3621` |
| `qa/snapshots/양평동_IM_D22_A등급/p-10.png` | 68,785 | `e5cb1e67283f119d` |
| `qa/snapshots/양평동_IM_D22_A등급/p-11.png` | 83,590 | `0cd6000bd77723d2` |
| `qa/snapshots/양평동_IM_D22_A등급/p-12.png` | 62,564 | `801e73480589e72c` |
| `qa/snapshots/양평동_IM_D22_A등급/p-13.png` | 371,088 | `98e6fa56897028fd` |
| `qa/snapshots/양평동_IM_D22_A등급/p-14.png` | 66,848 | `bf50dc66d3224f73` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-01.png` | 457,323 | `867f86f194839366` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-02.png` | 266,374 | `ab550d9b6ad945ca` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-03.png` | 218,217 | `851da46ce572fd9c` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-04.png` | 382,142 | `ec77dcc761930acf` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-05.png` | 192,835 | `3860d1b22791af37` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-06.png` | 77,723 | `72634dd056137544` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-07.png` | 53,842 | `3f628ba6f3203bf9` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-08.png` | 82,403 | `e10ad1916152d629` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-09.png` | 33,205 | `afaa276485860488` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-10.png` | 72,506 | `2ffb9955d4ca36f9` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-11.png` | 371,047 | `de476de012824cfe` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-12.png` | 18,766 | `96f2b0ff8bdadd7e` |
| `qa/snapshots/양평동_PPTX_IM_KR_R1/p-13.png` | 66,579 | `ec7a44d13846b291` |
| `qa/standard_check.py` | 10,434 | `49a0dbc6488fd2ff` |
| `수임제안서-P0-3_통합명세.md` | 33,727 | `aa399cd7ebc4a3c1` |
