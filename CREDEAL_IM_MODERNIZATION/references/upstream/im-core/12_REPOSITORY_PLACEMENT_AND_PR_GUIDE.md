# 저장소 배치·PR 운영 가이드

> 목적: 이 ZIP을 CREDEAL 저장소에 안전하게 편입하는 방법

---

# 1. 권장 배치

압축 해제 후 검토용 문서는 다음 위치를 권장한다.

```text
docs/impipe/im-core-v1/
  README.md
  00_WORK_ORDER.md
  01_SOFTWARE_DESIGN_DOCUMENT.md
  ...
  adr/
  knowledge/
  schemas/
  examples/
```

`knowledge/`는 이 위치에서 제안자료로 유지한다. 런타임이 직접 읽도록 연결하지 않는다.

---

# 2. 편입 PR

## PR-DOC-1 문서만 편입

- 이 패키지 전체를 `docs/impipe/im-core-v1/`에 추가
- `docs/impipe/README` 또는 문서 색인에 링크
- 코드·DB·런타임 정본 변경 없음
- 제품·기술·도메인·품질 검토 시작

## PR-DOC-2 결정반영

- OQ-01~OQ-08 결정
- ADR 상태를 accepted/rejected로 변경
- 지식소스 proposed 항목 수정
- 버전 1.1.0

## PR-P0-1 정본·승인 봉합

- IC-P0 작업만 구현
- 새 Studio UI 포함 금지
- 기준선과 실패시험 포함

이후 PR은 `08_IMPLEMENTATION_BACKLOG.md` 단계순서를 따른다.

---

# 3. 런타임 정본 반영

현행 실제 정본 파일:

```text
credeal/ssot/im.assumptions.yaml
credeal/ssot/im.bindings.yaml
credeal/ssot/im.budget.yaml
credeal/ssot/im.errors.yaml
credeal/ssot/im.format.yaml
credeal/ssot/im.gating.yaml
credeal/ssot/im.image.yaml
credeal/ssot/im.invariants.yaml
credeal/ssot/im.lexicon.yaml
credeal/ssot/im.masking.yaml
credeal/ssot/im.ontology.yaml
credeal/ssot/im.pages.yaml
credeal/ssot/im.parcel.yaml
credeal/ssot/im.tokens.yaml
```

`im.gating`, `im.tokens`, `im.budget`은 생성본이다. 직접 편집하지 않는다. `IC-P0-T02`에서 owner 경로를 복구한 다음 소유코드를 변경하고 재생성한다.

지식소스 승격 예:

| 제안파일 | 검토 후 반영대상 |
|---|---|
| `claim-catalog-mvp.yaml` | 신규 TypeScript ClaimDefinition 등록부 또는 승인된 기존 정본 확장 |
| `gate-catalog-mvp.yaml` | `im.gating` 소유코드 + `im.invariants` |
| `document-level-bundles.yaml` | `im.pages`의 내용묶음 계층 또는 publication policy |
| `content-unit-catalog.yaml` | `im.bindings`와 채널 조립기 |
| `copy-and-terminology-rules.yaml` | `im.lexicon`, `im.format`, 법무 카피팩 |
| `test-fixture-catalog.yaml` | `src/domain/building/mobile-im/__tests__/fixtures`와 신규 Studio fixtures |

---

# 4. 브랜치·커밋 권장

```text
docs/im-core-v1-sdd
feat/im-core-p0-trust-fix
feat/im-core-v1-domain
feat/mobile-im-composer-v1
feat/pptx-im-studio-v1
```

커밋 예:

```text
docs(im): add IM CORE v1 SDD package
fix(im): rehydrate persisted claim registry on approval
feat(im-core): add immutable snapshot and publication package
feat(im-mobile): compose L1 and L1.5 from publication package
feat(im-pptx): add PPTX IM Studio project and renderer
```

---

# 5. PR 점검표

- [ ] 작업 ID가 PR 제목·본문에 있는가
- [ ] 선독 문서와 지식소스를 표시했는가
- [ ] 스키마·enum·정본 변경이 한 방향으로 생성되는가
- [ ] 기능깃발과 롤백이 있는가
- [ ] 정상·실패시험이 함께 있는가
- [ ] 기존 공개 URL이 유지되는가
- [ ] 원자료·민감정보·사진이 로그에 새지 않는가
- [ ] 문서·코드·시험 추적표를 갱신했는가
- [ ] 생성본 YAML을 손으로 수정하지 않았는가
- [ ] 모바일 또는 PPTX가 package 밖 원자료를 읽지 않는가

