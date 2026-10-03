# CRE DealCard → Basic IM 파이프라인 지식 소스
> 최종 갱신: 2026-10-03 | 커밋 기준: `222389e`

---

## 1. 파이프라인 아키텍처 개요

```
[브로커 메모] → [딜카드 생성] → [바텀시트 입력폼] → [IM Core 도메인]
                                         ↓
                               [모바일 IM 생성 엔진]
                                    ↓          ↓
                           [모바일 IM 뷰어]  [PPTX Basic IM]
```

### 핵심 실행 경로 (1회 IM 생성)

| 단계 | 진입점 | 핵심 로직 |
|:---|:---|:---|
| 1. API 수신 | `src/app/api/broker/im-lite/generate-async/route.ts` | `after()`로 비동기 실행, jobId 즉시 반환 |
| 2. 핸들러 | `src/app/api/broker/im-lite/generate/handler.ts` | 공공데이터 enrichment → grade 산출 → `generateMobileIM()` 호출 |
| 3. 오케스트레이터 | `src/domain/building/mobile-im/writer.ts` | IMContext 빌드 → 섹션 루프 → 품질 게이트 → 스냅샷 저장 |
| 4. 컨텍스트 빌더 | `src/domain/building/mobile-im/im-context-builder.ts` | SSoT 정규화, RAG 검색, 재무 계산, 프롬프트 조립 |
| 5. 섹션 생성 | `src/domain/building/mobile-im/im-section-generator.ts` | 섹션별 LLM 호출 + Quality Gate + LLM Judge |
| 6. 프롬프트 구성 | `src/domain/building/mobile-im/narrative-prompt.ts` | 시스템/유저 프롬프트 조립 (바이너리 새니타이즈 적용됨) |
| 7. PPTX 덱 시퀀스 | `src/domain/building/mobile-im/pptx/deck-sequencer.ts` | 포스처별 슬라이드 편성 (Basic 7~9면) |
| 8. 데이터 바인딩 | `src/domain/building/mobile-im/pptx/data-binder.ts` (81KB) | 마크다운 → 아키타입별 구조화 데이터 변환 |
| 9. PPTX 렌더링 | `src/domain/building/mobile-im/pptx/pptx-renderer.ts` (58KB) | PptxGenJS로 슬라이드 생성 |

---

## 2. 5대 투자 포스처 (Investment Posture)

| 포스처 | 골든 매물 | 기대 슬라이드 | 고유 슬라이드 |
|:---|:---|:---:|:---|
| `income` (수익형) | 당산동(115억), 양평동(250억) | 8~9면 | A23 수익률, A24 렌트롤 |
| `trading` (매매형) | 신사동(760억) | 7~8면 | A24 미생성 |
| `owner_occupied` (자가사옥) | 서초동(230억) | 8면 | 손익분기/절감 분석 |
| `development` (개발형) | 잠원동(242억), 수택동(89억) | 7면 | A09 인허가, 용적률/건폐율 |
| `operating` (운영형) | 호텔(300억) | 7면 | A13 운영KPI, GOP/RevPAR |

---

## 3. PPTX 아키타입 레지스트리 (25종)

| ID | 용도 | 파일 크기 |
|:---|:---|---:|
| A01 | 표지 | 16KB |
| A02 | 물건 개요 스탯 그리드 | 20KB |
| A04 | 비대칭 7:5 (텍스트+사진) | 16KB |
| A06 | 다이어그램/지도/지적도 | 12KB |
| A10 | 클로징/면책 | 8KB |
| A14 | 사진 갤러리 | 9KB |
| A22 | 스태킹 플랜 | 32KB |
| A23 | 수익률 산식/공시지가 차트 | 15KB |
| A24 | 렌트롤 스태킹 | 21KB |
| A25 | 챕터 디바이더 | 12KB |

기본 덱 시퀀스 (income R3): `[A01, A02, A04, A06, A06, A24, A23, A14, A10]` (9면)

---

## 4. AI 모델 & 비용 구조

| 계층 | 모델 | Input/1M | Output/1M | 용도 |
|:---|:---|---:|---:|:---|
| Sol | `gpt-5.6-sol` | $5.00 | $20.00 | 딜카드 생성 |
| Terra | `gpt-5.6-terra` | $3.00 | $12.00 | IM 섹션 생성, QA Gate, Judge |
| Luna | `gpt-5.6-luna` | $1.00 | $4.00 | 메모/렌트롤 파싱 |
| Embedding | `text-embedding-3-small` | $0.02/1M | — | RAG 벡터 검색 |

### 1회 IM 생성 비용 (바이너리 새니타이즈 적용 후)
- 표준 모드: ~20회 API 호출, ~65K input + ~5.4K output = **≈ $0.25 (350원)**
- 패스트 모드: ~10회 API 호출 = **≈ $0.16 (220원)**

### ⚠️ 과거 토큰 폭증 버그 (수정 완료: `e79431b`)
- `narrative-prompt.ts`에서 `JSON.stringify(externalData)`로 지적도 PNG Base64(~190K tokens)가 매 호출 주입
- `handler.ts`에서 사진 업로드가 IM 생성 후에 실행되어 Base64가 프롬프트에 포함
- 수정: 바이너리 필드 destructuring 제거 + 업로드 순서 교정 → **98% 비용 절감**

---

## 5. 골든 테스트 인프라

### 10-Phase 테스트 팩토리 (`e2e/helpers/golden-test-factory.ts`)

| Phase | 검증 내용 |
|:---|:---|
| 1 | 인증 및 환경 검증 |
| 2 | 바텀시트 주입 + IM 생성 (MockOpenAI 폴백 포함) |
| 3 | PPTX 다운로드 + 바이너리 분석 (ZIP 구조, 슬라이드 수, 미디어 수) |
| 4 | 11종 품질 단언 (결함토큰, 더미데이터, 회피문구, 가격밴드, 이미지, 갤러리) |
| 5 | 모바일 IM 뷰어 시각 검증 (로딩, Hero Card, 결함토큰, 반응형) |
| 6 | 승인/편집/재승인 워크플로우 |
| 7 | PPTX 오버플로우 검증 (제원 완전성, 토지정보 통합) |
| 8 | 재무 교차 검증 (매각가, Cap Rate, 보증금/임대료) |
| 10 | 회귀 방지 스냅샷 (pptx-full-text.txt, slide-titles.json, pipeline_log.md) |

### 7대 골든 매물 데이터셋 (`docs/golden-test-data/`)

| 디렉토리 | 포스처 | 해상도 | 이미지 에셋 |
|:---|:---|:---|:---:|
| `p1-dangsan-income` | income | R1/R2/R3 | ✅ |
| `p2-sinsa-trading` | trading | R1/R3 | ✅ |
| `p3-seocho-owner` | owner_occupied | R1/R3 | ✅ |
| `p4-jamwon-dev` | development | R1/R2/R3 | ✅ |
| `p5-yangpyeong-income` | income | R1/R2/R3 | ✅ |
| `p6-hotel-operating` | operating | R1/R2 | ✅ |
| `p7-sutaek-dev` | development | R1/R2 | ✅ |

### 최종 테스트 현황 (2026-10-02 기준)
- **7대 골든 E2E**: 전수 PASS (82/82 테스트)
- **Unit/Integration**: 230개 테스트 파일, `status: "passed"`, `failedTests: []`
- **TypeScript**: `npx tsc --noEmit` 에러 0건
- **빌드**: `npm run build` 성공

---

## 6. Agent Rules 체계 (11개 모듈, 48개 규칙)

| 모듈 | 핵심 규칙 |
|:---|:---|
| 01-cre-lexicon | CRE 정본 용어, 페르소나 배제, 비중복 렌더링 |
| 02-pipeline-engineering | 게이트/단언, Basic 7~9면, Pro 12~20면 |
| 03-im-core-domain | 재무 SSOT, ClaimRegistry 불변식 |
| 04-production-web | iOS 타임아웃, target_hash 동기화, Playwright |
| 05-posture-isolation | 5대 포스처 격리, 전용 게이트 |
| 06-preflight-audit | 파싱, 면적 변환, 더미 방지, Sharp CJK |
| 07-basic-im-ssot | Basic IM 슬라이드 계약, V-World 지적도, 스태킹 |
| 08-e2e-golden-test | 10-Phase 골든 E2E, 바이너리 4대 단언, RCA |
| 09-subagent-hygiene | 대형파일 금지, 최소 컨텍스트 |
| 10-powershell-git | Windows PowerShell Git 규칙 |
| 11-prompt-hygiene-cost | **LLM 프롬프트 바이너리 제거, 비용 실측 검증** |

---

## 7. 핵심 파일 크기 Top 20 (도메인 로직)

| 파일 | 크기 | 역할 |
|:---|---:|:---|
| `data-binder.ts` | 81KB | 마크다운→아키타입 데이터 바인딩 |
| `imlib.ts` (pptx) | 71KB | PptxGenJS 저수준 렌더링 |
| `archetype-builders.ts` | 67KB | 아키타입별 빌더 함수 |
| `premium-template-engine.ts` | 60KB | 프리미엄 템플릿 폴백 |
| `pptx-renderer.ts` | 58KB | PPTX 최종 렌더러 |
| `posture-builders.ts` | 50KB | 포스처별 데이터 빌더 |
| `financial-calculator.ts` | 41KB | im-core 재무 계산 |
| `handler.ts` | 42KB | IM 생성 핸들러 |
| `writer.ts` | 39KB | IM 오케스트레이터 |
| `im-section-generator.ts` | 38KB | 섹션 AI 생성 + Gate + Judge |

---

## 8. 알려진 이슈 및 개선 영역

### 해결 완료
- [x] JSON 원시 데이터 PPTX 누출 (D-JSON-LEAK 4-layer defense, `ce3bd71`)
- [x] 물건 개요 대표 이미지 미렌더링 (`b823fc0`)
- [x] 갤러리 슬라이드 미생성 (`b823fc0`)
- [x] LLM 프롬프트 토큰 폭증 ($15→$0.25, `e79431b`)
- [x] 승인 게이트 `total_area_sqm=0` 블로커 (DB 폴백 적용)

### 잠재 개선 영역
- [ ] Quality Gate 배치 통합 (섹션별 8회→전체 1~2회)
- [ ] 프롬프트 필드 슬라이싱 (SSoT/공공데이터 섹션별 필수 필드만)
- [ ] 토큰 텔레메트리 DB 연결 (`im_generation_metrics` 테이블 마이그레이션)
- [ ] 승인 게이트 `land_area_sqm=0` / `total_area_sqm=0` 근본 해결
- [ ] Pro IM 혼입 경고 (Basic IM에 고급 분석 키워드 노출)
- [ ] data-binder.ts 81KB 모듈 분할
- [ ] `handler.ts` 42KB 함수 길이 축소
