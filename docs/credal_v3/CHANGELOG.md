# CHANGELOG.md — 문서 개정 이력

> **버전 정책**: 스키마(YAML)=semver · SDD/스펙=버전+날짜, 헤더에 변경 요약 기재 · 대체된 문서는 삭제 대신 "superseded by" 표기 · 개정은 본 파일 기재와 동시(CI #12).

## 2026-07-25 — 번들 v3 (데이터 공급 감사 반영)

- **audit/im-data-supply-audit.md 추가** (업로드 문서 — 3대 공급원·엑셀 임포터·7 API·readiness·승인·저장 체계)
- **SDD.md v1.2 → v1.3**: 기구현 자산 재사용 전환(R1~R7) — S1-T5(7 API 어댑터화)·S2-T1(엑셀 1차+OCR 보완)·S2-T2(등기 API 1차)·S1-T10(바텀시트 승격)·S1-T7(부분점수 계승)·S1-T4(directData 병합 대상)·S2-T3(MemoParser 레이어) + 신규 태스크 4건: S0-T12(UI 산식 제거)·S1-T15(주소 폴백 가드 C13)·S1-T16(캐시 TTL 차등)·S2-T11(엑셀→lease_units)
- **SDD-magazine.md v1.1 → v1.2**: MG-A1 브릿지 제거 지점 특정(handler Step 7)
- **TASKS.md v1.0 → v1.1**: 신규 4·개정 7 반영, 의존 그래프 3행 추가
- **ci-checks.md**: #13 check-ui-financials 신설
- **tests/e2e-scenarios.md**: E2E-1 4단계 엑셀 경로로 수정 · E2E-10(주소 폴백) 신설
- **strategy/data-supply-update-plan.md 추가** (본 갱신의 근거 계획)

## 2026-07-25 — 번들 v2 (문서체계 고도화 계획 실행)

- **SDD.md v1.1 → v1.2**: S3-T18(tier 맵 정책 — MI-1 편입) · S3-T19(visitor_fp 공통) · S1-T12 개정(수임 분기·직행·verbal) · S1-T13 주석(pitch_blocks) · 플래그/이벤트/DO NOT/§12.1 갱신
- **SDD-magazine.md v1.0 → v1.1**: MG-A4 격하(S3-T19 소비) · MG-A1 맵 tier 준수
- **SDD-stage4.md v1.0 신설**: MI 태스크 공식화(S4-MI2~9) · K1/F1/K4 · P2P(P1→P2→P3 순차) · /agora·/hub 1단계 · **공용 모듈 소유권 계약(§3)**
- **TASKS.md v1.0 신설**: 전 태스크 단일 인덱스(70+)·스테이지 게이트·교차 의존 그래프 — 착수 순서 SSoT
- **tests/e2e-scenarios.md v1.0 신설**: 플레이북·UX 시나리오의 테스트 승격 9종 (탭 수·타이머 상한 포함)
- **ci/ci-checks.md v1.0 신설**: DO NOT의 기계 강제 12종
- **examples/ 신설**: 산출물 예시 4종·Pitch 샘플 이동 + 마스크 시드 색인 부록 추가 (GAP-3 부트스트랩)
- **README.md v1.0 → v1.1**: 신규 문서 반영·"착수 순서는 TASKS.md" 규칙 추가
- specs/ 추가: magazine-upgrade-plan · map-image-upgrade · pipeline-uiux / audit/ 추가: magazine-architecture · map-image-current

## 2026-07-23 — 번들 v1 (최초)

- SDD.md v1.0→v1.1 (GAP-1~5 태스크화) · credeal-ontology-v0.1.yaml · 정의서 · 코어 스펙 4종(teaser·im-tiering·pitch·full-im) · dev-spec-v2 · README v1.0 · 전략 문서군 12종

## 온톨로지 개정 대기 (다음 스키마 릴리스)

- **v0.1.1** (S1-T0·S2-T9): grade 가중치표 확정 · violationStatus 슬롯 추가
- **v0.2** (Stage 4, Full IM 통합 시): `full.*` 네임스페이스 흡수 · 아웃컴 필드(성사가·사이클) 예비 검토
