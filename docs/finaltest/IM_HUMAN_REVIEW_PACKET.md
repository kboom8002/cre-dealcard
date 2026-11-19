# IM Human 2nd Review Packet (1차 검수 패킷 — 예상 소요 35분)

- 생성 시각: 2026-11-19T11:21:07.486Z
- 본 문서는 AI 1st (Layer A~C) 자동 검증 완료 후 인간 검수자가 35분 내 의사결정에 필요한 증거·체크리스트만 압축 정리한 패킷입니다.

## AI 1st (Layer A ~ Layer C) Before / After 요약
| 검증 계층 | Sprint 0 (기준선) | Sprint 1 (Track 1 조치 후) | 상태 |
|:--|:--|:--|:--|
| **Layer A: UX 라이팅 가드** | `basic-im-studio`·`im-lite`·`im-pro`·`im-approval` 등 미감시 | IM 전 표면 편입 + CRE 용어/페르소나 3종 추가 (`138/138 PASS`) | PASS |
| **Layer A: `<14px` AST 가드** | `src/components/im`·`gate` 81건 미감시 | `text-sm` 상향 및 CI/`eslint.config.mjs` 편입 (`0`건) | PASS |
| **Layer B: PPTX 3중 오라클** | Slide 07 `a23` `<8pt 2런` 13덱 + `s7` 1행 고아 슬라이드 | `<8pt` `13->0` + 2면 균형 분할 해소 · `fact-oracle` `736/736` · `visual:check core` `6/8 PASS, 2/8 CHANGED` | PASS |
| **Layer C: 6-Persona DOM 프로브** | `/im-lite` 하단 CTA 잘림 + `w/im` 좌측 사이드바 2~3글자 압축 + `Studio` 로딩 캡처 | 사이드바 제목 전폭 분리 · 하단 CTA 래핑 · `Studio` 실렌더 검증 | PASS |

## UX 라이팅 & UI 주요 변경 대조표
| 표면 | 변경 전 | 변경 후 | 목적 |
|:--|:--|:--|:--|
| `im-approval-client.tsx` | `바텀시트에서 주소 검색 필요` | `상세 입력 창에서 주소 검색 필요` | 개발 용어(`바텀시트`) 제거 |
| `im-data-bottom-sheet.tsx` | `① 투자 유형(포스처) 선택` | `① 투자 목적 선택` | `포스처` 용어 제거 |
| `ImEditorPanels.tsx` | `예: 홍길동 대표공인중개사`, `010-1234-5678` | `예: 김크리 대표공인중개사`, `010-2345-6789` | 법정 샘플 차단값 오입력 방지 |
| `WorkspaceList.tsx` (`SimpleListRow`) | 1행 제목+날짜 동시 배치 → `마포구 ...` 3글자 잘림 | 1행 제목 전폭 · 2행 상태+날짜 배치 | 좌측 목록 매물명 즉시 식별 |
| `ImBottomActionBar.tsx` | `xlarge`에서 `PPTX IM ...` 말줄임 & 파란 버튼 넘침 | `📥 PPTX 받기` + 자연 줄바꿈 | `21px` 시니어 모드 말줄임 제거 |
| `mobile-im-viewer.tsx` | `360px`/`390px xlarge`에서 `간편 문의 · 자료 요` 잘림 + `📩` 겹침 | `전화 문의` + `간편 문의 · 자료 요청` 반응형 래핑 | 모바일 뷰어 CTA 무손실 노출 |
| `SlideNavigator.tsx` & `basic-im-studio` | `[▲][▼][포함]` 같은 줄 배치로 슬라이드 제목 1글자(`⚡ 투...`) 압축 + 390px 테마 배지 우측 잘림 | 2행 카드(제목 전폭) 분리 + 테마 배지 래핑 | 스튜디오 내비게이션 시인성 확보 |

## 캡처 스크린샷 증거 (Gate H1 눈 검수용 10컷)
- `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\p01_im_workspace_1440_normal.png`
- `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\p01b_im_tab2_rentroll_1440.png`
- `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\p01c_im_tab3_axios_1440.png`
- `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\p01d_im_tab4_media_1440.png`
- `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\p01_im_workspace_1440_xlarge.png`
- `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\p02_im_studio_1180.png`
- `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\p02_im_studio_390.png`
- `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\p04a_im_lite_390_normal.png`
- `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\p04b_im_lite_390_xlarge.png`
- `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\p04c_im_lite_360_normal.png`

## 잔여 P-Score 백로그 (Track 1 vs Track 2)
- #1 [P2_experiment] `cognitive_above_fold_overload` (track1_ui_renderer, P-Score=1.51) -> `src/app/(broker)/broker/w/im/_components/ImEditorPanels.tsx`: /broker/w/im#rentroll: aboveFoldActionCount=31 (권장 <= 12~14개)

## Human 2nd 3-Gate 검수 체크리스트 (총 35분)
- [ ] **Gate H1 (10분 — 눈·어감 검수)**: 위 스크린샷 10컷 및 `visual:check` Diff PNG(`income-wellbing-r3` s6/s7, `income-yangpyeong-r3` s6/s7) 확인 후 `Approve / Reject`
- [ ] **Gate H2 (15분 — 손끝 무마찰 검수)**: 실매물 1건(당산동/양평동 실지번 + 엑셀 렌트롤 + 사진 6장)을 설명서 없이 `/broker/w/im`에서 생성 → 스튜디오 편집까지 완주하며 5초 이상 망설인 지점 기록
- [ ] **Gate H3 (10분 — 거래 신뢰도 검수)**: 생성된 Basic/Pro PPTX를 실제 PowerPoint로 열고 + 실 스마트폰 카카오톡에서 `/im-lite` 링크를 열어 5대 수치·지적도·법정 표기 최종 Sign-off

## Layer D (R3 반아첨 멀티모달 Vision & Blended Score)
- 판정 모델: `gpt-4o` · 추정 실측 비용 `$0.0617` (14,951 in / 2,432 out)
- 음성 대조군(`NC-01-R3`): **PASS** (2.5 <= 2.9, floorRisk=true) · 원문 접지율: **95.2%**
- 5대 포스처 PPTX 종합 점수: **4.5 / 5.0** ([SIMULATED] 전체적으로 시각적 균형과 문체가 잘 유지되고 있습니다. 다만, 일부 전문 용어와 설명이 복잡하여 개선이 필요합니다.)

| Persona | R2 (DOM) | R3 (Vision) | Blended (0.7/0.3) | FloorRisk |
|:--|:--:|--:|--:|:--:|
| IM-MG-01 | 4.98 | 4.95 | **4.97** | NO |
| IM-MG-02 | 5.00 | 5.00 | **5.00** | NO |
| IM-MG-03 | 4.97 | 4.95 | **4.96** | NO |
| IM-MG-04 | 4.91 | 4.95 | **4.92** | NO |
| IM-MG-06 | 5.00 | 5.00 | **5.00** | NO |

## Layer B 시각 회귀 (`visual:check core`) Human Gate H1 승인 대상
- 범위: `core` 8덱 (PASS 5 · CHANGED 3 · 미승인 기준선 0)
  - `income-dangsan-r3` [CHANGED]: s6 (2.45%) → Human Gate H1 검수 후 승인/반려
  - `income-wellbing-r3` [CHANGED]: s6 (8.76%), s7 (5.08%) → Human Gate H1 검수 후 승인/반려
  - `income-yangpyeong-r3` [CHANGED]: s6 (8.43%), s7 (4.20%) → Human Gate H1 검수 후 승인/반려

## 5대 포스처 PPTX 검수 PNG 경로 (Gate H1/H3)
- [임대수익형 (Income)] `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\visual-current\income-wellbing-r3\slide-06.png` (실물: `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\income-wellbing-r3.pptx`)
- [임대수익형 (Income)] `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\visual-current\income-wellbing-r3\slide-07.png` (실물: `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\income-wellbing-r3.pptx`)
- [임대수익형 (Income)] `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\visual-current\income-wellbing-r3\slide-08.png` (실물: `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\income-wellbing-r3.pptx`)
- [사옥형 (Owner)] `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\visual-current\owner-seocho-r3\slide-01.png` (실물: `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\owner-seocho-r3.pptx`)
- [사옥형 (Owner)] `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\visual-current\owner-seocho-r3\slide-06.png` (실물: `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\owner-seocho-r3.pptx`)
- [매매차익/밸류애드 (Trading)] `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\visual-current\trading-sinsa-r3\slide-06.png` (실물: `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\trading-sinsa-r3.pptx`)
- [신축/개발형 (Development)] `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\visual-current\development-jamwon-r3\slide-05.png` (실물: `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\development-jamwon-r3.pptx`)
- [운영자산/호텔형 (Operating)] `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\visual-current\operating-hotel-r2\slide-05.png` (실물: `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\operating-hotel-r2.pptx`)

## 상세 리포트 링크
- Layer C 상세 리포트: `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\sprint1-baseline.md`
- Layer D R3 심사 전문: `C:\Users\User\cre-dealcard\e2e\golden-snapshots\out\im-ppgt\layer-d-r3-audit.md`
