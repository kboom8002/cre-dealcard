# CRE DealCard 골든 실매물 4종(CASE-02~05) AI 1차 전수검증 및 인간 2차 20분 검수 리포트

- 생성 시각: 2026-11-21T14:02:30.508Z
- 시각 검수 보드(HTML): `docs/finaltest/GOLDEN_4CASES_HUMAN_REVIEW_BOARD.html`
- 최종 4대 워크스페이스 Blended 유효 평균: **92.24 / 100점** (과락: **0건** · 인간 2차 검수 진입: **READY**)
- Layer D(R3) 실측: `4` calls · `8,632` / `1,682` tokens · **`$0.0384`** · 음성대조군 NC-01-R3 **PASS** (2점, floorRisk=true) · 원문 스팬 접지율 **67.0%**

## 1. 4대 워크스페이스 통합 스코어카드 (`0.70 * R2 + 0.30 * R3`)
| 워크스페이스 | R2 결정론(100) | R3 환산(100) | **Blended 최종(100)** | 과락 | 판정 |
|:--|--:|--:|--:|--:|:--:|
| **딜카드 (DealCard)** | 98.05 | 78.25 | **92.11 / 100** | 0건 | PASS |
| **투자설명서 (IM)** | 95.37 | 82.50 | **91.51 / 100** | 0건 | PASS |
| **부동산뉴스 (Newsletter)** | 98.44 | 76.25 | **91.78 / 100** | 0건 | PASS |
| **고객 소통함 (Inbox)** | 98.32 | 82.50 | **93.57 / 100** | 0건 | PASS |

## 2. AI 1차 루프에서 실제 발굴·선제 해결한 상용 결함 (10건)
1. **[P0] XLSX v1.5 `임차인` ↔ `용도` 컬럼 뒤바뀜 수정** (`im/page.tsx`): 표준양식 E열 `업종/상호 (원문)`이 `tenant_type`·`tenant_name` 양쪽에 동일 문자열로 들어와 `05 층별 임대차 현황`에서 상호와 업종이 뒤바뀌던 치명적 결함 해결 (`CASE-04`, `CASE-05`).
2. **[P0] PPTX `02 물건 개요` 가짜 `0% / 0%` 및 `승용 0대` / `23대 /` 꼬리 슬래시 제거** (`quick-generate/route.ts`, `pptx-renderer.ts`): 건폐율·용적률 미입력 시 `0% / 0%` 행 생략, 승강기 미입력 시 `주차 | 총 23대`로 정갈하게 표시.
3. **[P0] 비정수 억 매매가 `242.268억 원` → `242억 2,680만 원` 정규화** (`archetype-builders.ts`, `pptx-renderer.ts`, `quick-generate/route.ts` — `CASE-03`).
4. **[P0] 비수익형(사옥형·개발형) 기대수익률 렌트롤 입력 시 `05 임대차` + `06 기대수익률` + `07 수익률` 완전 연동** (`deck-sequencer.ts` — `CASE-02` 1.70%→3.52%, `CASE-03` 1.37%→4.14%).
5. **[P0] `01 요약` 투자 포인트 빈 제목(`01 기대수익률`) 차단 + 3건 보장 + 한국형 보증금 차감 현행 임대수익률 통일** (`a02-stat-grid.ts` — `CASE-02`, `CASE-03`).
6. **[P1] `05 층별 임대차 현황` 임대가능 호실 대비 공실률 요약 표기 추가** (`a24-rentroll-stacking.ts` — `CASE-02` 20.0%, `CASE-03` 16.7%).
7. **[P1] 표지 긴 한글 제목 고아음절(`더레드빌
딩)`) 방지 + 의미 있는 사진 파일명 캡션 보존** (`a01-cover.ts`, `im-workspace-types.ts` — `CASE-05` `승강기홀`/`기준층오피스`).
8. **[P1] 소통함 `아주 크게(21px)` 좌상단 `지금 할 일` 카드 버튼 겹침 해소** (`InboxListColumn.tsx`: 2단 세로 배치로 겹침 `0px` 달성).
9. **[P0] 소통함 뉴스레터 익명 열람객 원본 에디션 UUID 노출 및 오연결(`딜카드/IM 편집`) 차단** (`inbox-query-events.ts`, `inbox-lead-threads.ts`, `InboxEditorColumn.tsx`: `열람 자료: 부동산뉴스` + `📰 뉴스레터 편집·보내기 →`로 정상화).
10. **[P0] 모바일 `/im-lite` 뷰어 `0% / 0%`, `23대 / 0대` 및 `06 수지 분석` 수익률 불일치 해소** (`mobile-im-viewer.tsx`: 미입력 0값 행 숨김 + 보증금 차감 현행 임대수익률 통일 및 운영비 차감 Cap Rate 보조 병기).

## 3. 실매물 4종 오라클·포카요케 전수 검증표
| 케이스 | 포스처 | PPTX 면수 | 블라인드 유출 | 수치 오라클 & 포카요케 | 잔여 결함 |
|:--|:--|--:|--:|:--|--:|
| **CASE-02** | owner_occupied (일치) | 11면 | 0건 | price(230억)=true, asisYield(net=1.7%/gross=1.67%)=true, stabilizedYield(net=3.52%/gross=3.39%)=true, vacancy(unit=20%/area=20%)=true · case02WonUnitAutoCorrect=true | **0건** |
| **CASE-03** | value_add (일치) | 11면 | 0건 | price(242억)=true, asisYield(net=1.37%/gross=1.35%)=true, stabilizedYield(net=4.14%/gross=3.96%)=true, vacancy(unit=16.7%/area=16.7%)=true · case03ExactPriceReadout=true, case03LandGfaSwapRecovery=true | **0건** |
| **CASE-04** | income (일치) | 12면 | 0건 | price(115억)=true, asisYield(net=2.75%/gross=2.59%)=true, stabilizedYield(net=3.83%/gross=3.63%)=true, vacancy(unit=7.7%/area=10.8%)=true, rentRollSplit(expected>=2, marker=true, slides=4)=true | **0건** |
| **CASE-05** | income (일치) | 11면 | 0건 | price(250억)=true, asisYield(net=2.54%/gross=2.47%)=true, stabilizedYield(net=3.38%/gross=3.26%)=true, vacancy(unit=18.2%/area=25.3%)=true · case05V12BlockingGate=true | **0건** |

## 4. 인간 2차 최종 검수 (총 20분 권장 체크리스트)
### Part A. 시각 스캔 (10분 — `GOLDEN_4CASES_HUMAN_REVIEW_BOARD.html` 열람)
- [ ] `CASE-02~05` 핵심 PPTX 슬라이드 클릭 확대 → 표 정렬·숫자·세로사진 구도·캡션 확인
- [ ] 모바일 390px 큰글씨(`/dc`, `/im-lite`, `/magazine`, `/broker/w/inbox`) 가독성·버튼 크기 확인

### Part B. 실기기 2케이스 스팟 체험 (10분)
- [ ] **PC 스팟 (`CASE-05` 양평동4가)**: `99_부록_V12_단위혼동_차단게이트_체험용.xlsx` 차단 확인 → `02_현황_렌트롤_v1.5_pyeong.xlsx` 업로드 → PPTX 다운로드 후 PowerPoint 직접 재생
- [ ] **모바일 스팟 (`CASE-03` 잠원동)**: 실제 스마트폰 카카오톡으로 `/dc` 공유 → 2×2 썸네일 말풍선·`/dc`·`/im-lite`·전화/IM 요청 버튼 체감 확인
