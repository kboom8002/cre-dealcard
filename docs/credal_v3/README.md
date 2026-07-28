# CREDEAL 문서 번들 — README (docs/ 인덱스)

> **버전**: v1.1 (2026-07-25) · 본 파일은 레포 `docs/README.md`로 배치한다.
> **v1.1**: 2차 도출분 편입(매거진·맵/이미지·파이프라인 UX) · SDD v1.2/Stage4 · TASKS/E2E/CI/CHANGELOG/examples 신설. 이력은 `CHANGELOG.md`.
> **목적**: 크리딜 문서 전체의 인덱스 — 각 문서의 역할, 우선순위 규칙, 레포 배치, 읽기 순서, LLM 개발 에이전트 설정.

---

## 1. 우선순위 규칙 (충돌 시 판정)

```
스키마(필드·enum·제약·규칙)  →  ontology/credeal-ontology-v0.1.yaml 이 항상 우선
태스크 착수 순서·의존 판정    →  TASKS.md 가 유일 기준
구현 절차·DDL·DoD           →  소속 SDD (SDD.md v1.2 / SDD-magazine.md v1.1 / SDD-stage4.md)
개별 기능의 세부 정책·UX     →  specs/ 하위 해당 스펙이 우선
전략·비전·로드맵 맥락        →  strategy/ 문서 (구현 입력 아님)
```

- 문서 간 불일치 발견 시: 코드를 맞추지 말고 **문서를 먼저 개정**(PR)한 뒤 구현한다.
- 용어 통일: WALT(WALE는 alias) · '검증 슬롯' = provenance tier ≠ ai_inferred · 'gated' = disclosure_policy.gated.

## 2. 레포 배치 및 파일 매핑

세션 산출 파일명 → 레포 경로 매핑. (★ = 개발 필수 번들)

```
docs/
├── README.md                          ← 본 파일 · CHANGELOG.md ← 개정 이력 (v1.1 신설)
├── SDD.md                          ★  ← CREDEAL_SDD_Stage0-3.md (v1.2)
├── SDD-magazine.md                 ★  ← CREDEAL_SDD_Magazine.md (v1.1)
├── SDD-stage4.md                   ★  ← CREDEAL_SDD_Stage4.md (v1.0 — MI·K·P2P·공개표면)
├── TASKS.md                        ★  ← 마스터 태스크 인덱스 (착수 순서 SSoT)
│
├── ontology/
│   ├── credeal-ontology-v0.1.yaml  ★  ← 스키마 SSoT (S1-T0에서 v0.1.1로 개정 예정)
│   ├── ontology-definitions.md        ← 근거·출처
│   └── api-slot-mapping.md            ← [GAP-1 산출물 — S1-T5에서 생성]
│
├── specs/
│   ├── teaser.md ★ · im-tiering.md ★ · pitch.md ★
│   ├── pipeline-uiux.md            ★  ← 딜 파이프라인 UI/UX (S1-T10/11/14 기준 문서 — v1.1)
│   ├── map-image-upgrade.md        ★  ← 맵/이미지 고도화 (S3-T18·S4-MI 원문 — v1.1)
│   ├── magazine-upgrade-plan.md       ← 매거진 고도화 계획 (v1.1)
│   ├── full-im.md · dev-spec-v2.md · auxiliary-elements.md
│   └── nlg-mask-templates.md          ← [GAP-3 산출물 — 시드: examples/]
│
├── audit/
│   ├── mobile-im-audit.md             ← 기존 29모듈 지도
│   ├── im-data-supply-audit.md     ★  ← 데이터 공급·저장 체계 (v3 — S1-T5·S2 태스크 필수 선독)
│   ├── magazine-architecture.md       ← 매거진 현행 (v1.1)
│   └── map-image-current.md           ← 맵/이미지 현행 (v1.1)
│
├── examples/                          ← v1.1 신설 — 마스크·골든셋 초기 시드 (부록 색인 포함)
│   ├── output-samples.md              ← 산출물 예시 4종 (티저·Basic·Pro·매거진)
│   └── pitch-samples.md               ← 수임 제안서 샘플 + 파이프라인 반영
│
├── tests/e2e-scenarios.md             ← v1.1 신설 — E2E 9종 (탭 수·타이머 상한 포함)
├── ci/ci-checks.md                    ← v1.1 신설 — 기계 검증 12종
│
├── legal/copy-pack.md                 ← [GAP-4 — S0-T11 v0 → S3-T17 v1]
├── design/wireframes/                 ← [GAP-5 — S1-T14~, 기준: specs/pipeline-uiux.md]
│
└── strategy/                          ← 구현 입력 아님 — 개발 컨텍스트에서 제외
    ├── business-strategy.docx         ← CREDEAL_통합사업전략_및_로드맵.docx
    ├── platform-roadmap.docx          ← CREDEAL_플랫폼고도화전략_및_단계별로드맵.docx
    ├── business-plan.docx             ← CREDEAL_사업계획서.docx
    ├── product-strategy.docx          ← CREDEAL_제품전략_및_고도화방안.docx
    ├── platform-plan-v2.md            ← CREDEAL_플랫폼재구성_서비스기획안_v2.0_통합고도화판.md
    ├── expansion-roadmap.docx         ← CREDEAL_플랫폼패턴_확장로드맵.docx
    ├── agent-ecosystem.md             ← CREDEAL_브로커AI에이전트_및_에이전트허브_개념설계.md
    ├── network-effects.md             ← CREDEAL_네트워크효과_플라이휠_양면플랫폼_극대화방안.md
    ├── pipeline-playbook.md           ← CREDEAL_딜파이프라인_시나리오_및_최적활용모델.md
    ├── mobile-im-improvements.md      ← 모바일IM_최적개선방향.md
    ├── mobile-im-audit-plan.md        ← 모바일IM_기술감사기반_고도화개선방안.md (G1~G10 원문)
    └── (구판) platform-plan-v1.docx   ← CREDEAL_플랫폼재구성_및_서비스기획안.docx — v2.0으로 대체됨
```

## 3. 문서별 역할 요약

### 개발 필수 (★ — LLM 에이전트 컨텍스트에 포함)

| 문서 | 역할 | 소비 태스크 |
|------|------|-------------|
| **SDD.md (v1.1)** | 구현 절차의 SSoT — Stage 0~3 태스크 49+6종·DDL·인터페이스·API·DoD·DO NOT 23종·GAP 5종 | 전체 |
| **credeal-ontology-v0.1.yaml** | 스키마 SSoT — 슬롯 ~70·enum 14계열·제약 C01~12·규칙 R01~10·어휘 샘플·소스 매핑 | S1-T1 이하 전부 |
| **specs/teaser.md** | 밴딩 규칙·재식별 게이트·레이아웃·슬라이더·공개 정책 3계층 | S3-T8~T12 |
| **specs/im-tiering.md** | Basic/Pro 렌더 정책(include/exclude)·동의 체인 8상태·열람 제어·개인화 모듈 | S3-T4~T7 |
| **specs/pitch.md** | 웜 6블록·콜드 4블록·가격 의견 산출·법적 가드레일 | S1-T13, S2-T10 |

### 개발 참조 (필요 시 조회)

| 문서 | 역할 |
|------|------|
| specs/dev-spec-v2.md | 4레이어·S1~S6 서비스 전반, enrichment 실행 규칙(§A1.3), 용어 대조(Part C-3) |
| ontology/ontology-definitions.md | YAML 각 설계 결정의 근거·공적 출처(법령·조사기준)·베타 검증 계획 |
| audit/mobile-im-audit.md | 기존 `src/domain/building/mobile-im/` 29모듈의 구조·역할 — 주입 지점 파악용 |
| specs/auxiliary-elements.md | 카피 문법·리드 태깅·매칭 3단의 세부 (S3-T11·T15 보조) |
| specs/full-im.md | Stage 4 예고 — cre-fullim 통합·코어 상속. **Stage 0~3에서는 구현하지 않음** |

### 전략 문서 (strategy/ — 개발 컨텍스트 제외)

사업·제품 전략, 확장 로드맵, 에이전트 3막, 네트워크 효과, 활용 플레이북 — 의사결정·투자·온보딩용. LLM 개발 에이전트의 컨텍스트에 넣으면 초점이 흐려지므로 제외한다. 단, `pipeline-playbook.md`(시나리오)는 E2E 테스트 시나리오 설계 시 참조 가치가 있다.

## 4. 읽기 순서 (신규 합류자)

1. **개발자·LLM 에이전트**: SDD §0(규약) → 온톨로지 YAML 훑기 → SDD §1~4(아키텍처·DDL·모듈·API) → 담당 Stage의 태스크 표 → 해당 spec 정독
2. **기획·디자인**: strategy/platform-plan-v2.md → specs/teaser·im-tiering(레이아웃·UX 정책) → pipeline-playbook(사용 시나리오)
3. **경영·투자**: strategy/business-strategy.docx → business-plan.docx → expansion-roadmap.docx

## 5. LLM 개발 에이전트 설정 (CLAUDE.md 권장 문구)

```markdown
# CREDEAL 개발 규약
- 태스크 착수 순서·의존은 docs/TASKS.md가 유일 기준이다: "상태 todo이고 의존이 모두 done인 최상단 태스크"를 선택한다.
- 상세 명세는 소속 SDD를 따른다: SDD.md(v1.2, S태스크) / SDD-magazine.md(v1.1, MG) / SDD-stage4.md(S4). 각 PR은 태스크 ID·플래그·DoD 항목을 명시한다.
- 스키마(필드·enum·제약·규칙)는 docs/ontology/credeal-ontology-v0.1.yaml이 SSoT다. 코드단 임의 추가 금지 — YAML 선개정.
- 기능 세부 정책은 docs/specs/의 해당 스펙을 따른다. 공용 모듈 소유권은 SDD-stage4 §3.
- 각 SDD의 DO NOT 목록 위반은 구현하지 않고 보고한다. ci/ci-checks.md 12종은 머지 게이트다.
- E2E는 tests/e2e-scenarios.md를 따른다 (E2E-1·9는 머지 필수).
- docs/strategy/는 읽지 않는다 (구현 입력 아님).
- 문서와 코드가 충돌하면 코드를 문서에 맞추되, 문서가 틀렸다고 판단되면 문서 개정 PR을 먼저 제안한다. 개정 시 CHANGELOG.md 동시 갱신.
```

## 6. 문서 유지보수 규칙

- **버저닝**: 스키마(YAML)는 semver(v0.1.1…), 스펙·SDD는 문서 헤더에 버전·변경 요약 기록
- **GAP 산출물**(api-slot-mapping·nlg-mask-templates·copy-pack·wireframes)은 코드와 같은 PR 사이클로 리뷰
- **스테이지 완료 시**: SDD 해당 Stage DoD 체크 상태를 커밋하고, 다음 Stage 착수 승인 기록을 남긴다
- **구판 관리**: 대체된 문서(기획안 v1 등)는 삭제하지 않고 헤더에 "superseded by ..." 표기

---

> **한 줄 요약**: 개발에 필요한 것은 ★ 5개(SDD + YAML + 스펙 3종)이고, 판정 규칙은 하나다 — **스키마는 YAML, 절차는 SDD, 세부는 스펙, 전략은 컨텍스트 밖.**
