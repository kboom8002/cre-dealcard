# 00. 거버넌스 및 권한 체계 (Governance and Authority Specification)

> **식별자**: `IM-GOV-000`  
> **상태**: 정본 확정 (Active SSOT)  
> **최종 갱신일**: 2026-09-03  
> **적용 범위**: CRE Mobile IM, Blind Dealcard, PPTX IM Studio 전체 파이프라인  

---

## 1. 개요 및 헌법적 합의

본 문서는 CREDEAL IM 고도화 파이프라인의 거버넌스 체계, 의사결정 권한, 책임 분계선(Line of Demarcation), 그리고 릴리스 게이트의 승인 요건을 정의한다.

### 5대 헌법적 합의 (DEC-001 ~ DEC-005)
1. **DEC-001 ID 매핑 원칙**:
   단일 거래건(`deal_id`)을 중심으로 모든 파생 산출물(딜카드, 모바일 IM, PPTX 프로젝트)이 계보(`lineage`)를 유지하며, 채널별 ID는 `deal_id`를 상위 키로 참조한다.
2. **DEC-002 레거시 URL 보존 원칙**:
   과거 발행된 `/im-lite/[id]`, `/dc/[id]` 등의 공개 URL은 무중단 영구 보존되며, 신규 파이프라인은 하위 호환 프록시 어댑터를 통해 동일 엔드포인트를 서비스한다.
3. **DEC-003 저장소 수명주기 정책**:
   임시 렌더 캐시 및 프리뷰는 14일 TTL을 적용하고, 최종 승인된 발행본(`release_records`) 및 승인 원장(`approval_events`)은 영구 불변(WORM: Write Once Read Many) 보존한다.
4. **DEC-004 승인 권한 분계선**:
   기계적 검사 통과(`passed`)와 인간의 승인 행위(`approved`)를 엄격히 분리한다. 인간 중개인의 승인은 암호학적 SHA-256 타겟 해시와 결속되어야만 유효하다.
5. **DEC-005 타협 불가 품질 게이트 (Non-Waivable Gates)**:
   G30(D등급 차단), G37(4대 면적 분모 일관성), G38(운영비 누락 시 실질 NOI 날조 금지), PII 보호 게이트는 어떠한 관리자 권한으로도 면제(Bypass/Waive)할 수 없다.

---

## 2. 6대 역할군 및 승인 권한 (Approval Roles)

최종 릴리스 및 마일스톤 종료(Exit Gate)는 다음 6대 필수 역할군의 서명을 요구한다:

| 역할군 (Role) | 책임 영역 | 필수 승인 단계 |
|---|---|---|
| **Product (제품)** | 제품 로드맵, 사용자 가치, 채널 전략 부합성 | MG-0 ~ MG-8 |
| **Domain (도메인)** | 대한민국 상업용 부동산 법률·세무·거래 관행 적합성 | MG-0 ~ MG-8 |
| **Architecture (아키텍처)** | 계층 분리, 의존성 순수성(Rule 12), 무사이클 DAG | MG-0 ~ MG-8 |
| **Quality (품질/QA)** | 7-상태 게이트 평가, 네거티브 짝 단언, 회귀망 100% | MG-0 ~ MG-8 |
| **Operations (운영/보안)** | PII 마스킹, 인프라 SLA, 카나리 및 롤백 훈련 | MG-2, MG-7, MG-8 |
| **Broker Practice (중개실무)** | 12개 골든 케이스 실무 완성도 및 거래 성사 유효성 | MG-3, MG-5, MG-8 |

---

## 3. 게이트 평가 규칙 (Gate Evaluation Governance)

1. 모든 게이트 평가는 7-상태 모델(`PASS`, `FAIL`, `WARN`, `NOT_APPLICABLE`, `NOT_RUN`, `INDETERMINATE`, `SYSTEM_ERROR`)을 따른다.
2. `NOT_RUN`, `INDETERMINATE`, `SYSTEM_ERROR` 상태가 1건이라도 발생한 산출물은 외부 발행을 원천 차단한다.
3. 게이트 추가 시 반드시 `quality-gates-v02.ts`의 `PUBLISH_GATES` 레지스트리에 등록하여야 한다 (Rule 5).
