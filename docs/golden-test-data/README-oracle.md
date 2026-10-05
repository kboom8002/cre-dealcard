# 사실 오라클 + 오프라인 재렌더 (golden fact oracle)

골든 E2E(서버 + Playwright + 실 API + LLM, 1회 ~16분)는 "구조"만 검사해 사실 오류(다른 건물 값, 층수 누락, 임차인 마스킹 등)를 놓쳤다.
이 체계는 **DB에 저장된 골든 문서 스냅샷을 오프라인으로 재렌더(수 초)** 하고, **검증된 정답(`expected_facts.json`)과 PPTX/뷰어 텍스트를 자동 대조**한다.
서버·Playwright·LLM·실 외부 API 호출이 없다 (`fetch` 전체 차단, 카카오 정적지도만 중립 회색 PNG 스텁).

```
capture.ts  ── DB(read-only) ──▶ e2e/golden-snapshots/<name>.json (+ <name>/asset-*.jpg|png)
rerender.ts ── 스냅샷 ──▶ 오프라인 렌더 ──▶ e2e/golden-snapshots/out/<name>.pptx, <name>.slides.json
oracle      ── slides.json + expected_facts.json ──▶ PASS / FAIL / PENDING 표
```

## 1. 스냅샷 캡처 (`scripts/golden-snapshot/capture.ts`)

```powershell
npx tsx scripts/golden-snapshot/capture.ts core            # 7대 골든
npx tsx scripts/golden-snapshot/capture.ts all             # + income-golden 8종
npx tsx scripts/golden-snapshot/capture.ts operating-hotel-r2
npx tsx scripts/golden-snapshot/capture.ts core --live-enrich   # (선택) enrichForBasicIm 1회 실호출 결과도 저장
```

- doc id: `e2e/screenshots/<name>/doc-id.txt` (골든 E2E 가 기록). `.env.local` 의 서비스 키로 `document_objects` / `building_ssot_lite` 를 **읽기만** 한다.
- 저장물: 문서 body(enrichment: 대장·토지이용계획·locationPoi(candidateSpots)·지적도 포함), 건물 행, 중개인 연락처(전화/이메일은 **마스킹**), 사진 목록.
  - 20KB 초과 base64 이미지는 `e2e/golden-snapshots/<name>/asset-NN.*` 파일로 외부화(`$asset-data:`/`$asset-path:` 참조), 원격(https) 사진은 1000px JPEG 로 내려받아 저장 → 스냅샷당 < 3MB.
  - `token|secret|password|api key|authorization|cookie|jwt` 키와 `owner_id/broker_id` 는 제거, 비밀값 패턴 검출 시 `[REDACTED]`.
- 기본(`--live-enrich` 없음)은 DB 읽기뿐이다. 공시지가 추이(`landPriceHistory`)처럼 DB에 저장되지 않는 enrichment 가 필요하면 `--live-enrich` 로 한 번만 실 API 를 호출해 `liveEnrichment` 로 고정한다.
- 라우트 `src/app/api/public/im-lite/[buildingId]/pptx/route.ts` 의 `renderer.render()` 입력 구성을 `lib.ts: buildRenderInput()` 이 그대로 재현한다. **라우트의 입력 구성을 바꾸면 이 함수도 같이 바꿔야 한다.**

### 갱신 시점
골든 E2E 를 다시 돌려 새 문서가 생성되었을 때(프롬프트 변경 → 재녹화 후) `e2e/screenshots/<name>/doc-id.txt` 가 갱신되므로 `capture.ts core` 를 다시 실행하고 스냅샷을 커밋한다. 렌더러/바인더만 수정하는 작업에서는 **스냅샷을 갱신하지 않고** 재렌더 + 오라클만 돌리면 된다.

## 2. 오프라인 재렌더 (`scripts/golden-snapshot/rerender.ts`)

```powershell
npx tsx scripts/golden-snapshot/rerender.ts core     # 골든당 약 1~5초
npx tsx scripts/golden-snapshot/rerender.ts income-yangpyeong-r3
```

- `OFFLINE_RENDER=1` 훅: `src/domain/building/mobile-im/pptx/basic-im-enrichment.ts` 의 `enrichForBasicIm` 이 외부 호출 없이 스냅샷의 enrichment(또는 `liveEnrichment`)만 반환한다. (기본 동작은 불변)
- `lib.ts: installOfflineGuard()` 가 `globalThis.fetch` 를 교체해 모든 네트워크 호출을 차단·기록한다(차단 건수는 `slides.json.network.blocked`). `KAKAO_REST_API_KEY` 는 더미로 덮어써 실키가 쓰이지 않는다.
- 사진은 repo 상대경로(`docs/golden-test-data/...`)를 쓰므로 **repo 루트에서 실행**해야 한다(`npx vitest`/`npx tsx` 기본).
- 출력 `out/<name>.slides.json`: `slides[]`(슬라이드별 텍스트), `viewer.sections[]`(모바일 뷰어 섹션 markdown).

## 3. 사실 오라클

```powershell
npm run test:oracle                       # = npx vitest run src/tests/golden/fact-oracle.test.ts
npx tsx scripts/golden-snapshot/oracle.ts core      # vitest 없이 표만 보기
$env:ORACLE_STRICT='1'; npm run test:oracle         # pending 도 실패로 취급
```

결과: 골든 × 사실 표(`PASS` / `FAIL` / `PENDING`)를 콘솔과 `e2e/golden-snapshots/out/oracle-report.md|json` 에 출력.
`PASS*` = pending 태그가 붙어 있는데 통과함 → **태그를 제거**한다.

### `docs/golden-test-data/<fixture>/expected_facts.json` 스키마

| 키 | 의미 |
|:--|:--|
| `must_contain[]` `{label, anyOf[], where, source, pending?}` | `anyOf` 중 하나라도 텍스트에 있어야 함. 문자열은 리터럴(공백 무시), `re:` 접두는 정규식. `where`: `pptx` / `viewer` / `both`(양쪽 모두) |
| `must_not_contain[]` | 하나라도 있으면 실패 (0㎡, 0.0평, Infinity/NaN/undefined, `[임차인`, TARGET, `…`, 다른 건물 값 등) |
| `must_not_be_dash[]` `{label, labelRegex?, regexNearLabel, window?}` | 원천에 값이 있는데 PPTX 가 `-` 이거나 **행이 없음**. 라벨 직후 `window`자 안에서 `regexNearLabel` 이 맞아야 통과. 실패 사유(행 누락 / '-' 표시 / 값 불일치)를 구분해 보고 |
| `numeric[]` `{labelRegex, value, unit, tolerancePct}` | 라벨 뒤 숫자+단위의 **모든 언급**이 기대값 허용오차 내여야 함(평↔㎡ 환산). 다른 건물 값이 한 곳만 섞여도 실패 |
| `landmarks[]` | 위치도/입지 슬라이드에 나와야 할 랜드마크 그룹(`anyOf`). 기본 `pending:'W2'` |
| `tenants` `{names[]}` | 렌트롤 상호 그대로 — PPTX **와** 뷰어 양쪽에 있어야 함(오너 결정: IM 전 구간 실명). 기본 `pending:'W3'` |
| `duplicate_sentences` | 서로 다른 슬라이드에 동일한 문장(28자 이상)이 반복되면 실패 |

`source`: `fixture`(bottom_sheet/memo/렌트롤) · `register`(공공 건축물대장 API 값, 스냅샷 `enrichment.buildingRegister`) · `derived`(이들에서 직접 유도 — 필지 합계, 최근접 역 등). **현재 PPTX 출력에서 정답을 역산하지 않는다.**
`note` 에 출처/충돌을 적는다. 픽스처와 대장이 충돌하는 값(예: 당산 연면적 1,441.15 vs 1,141.15)은 `anyOf` 에 둘 다 넣고 `CONFLICT` 로 표시해 오너 확인을 기다린다.

### 정답 선정 원칙
1. 픽스처(bottom_sheet/memo/렌트롤)와 공공 대장이 **일치**하면 확정.
2. 대장이 **비정상**(bcRat/vlRat/platArea = 0, 건물명 공백 등)이거나 다른 건물이면 픽스처가 정답 (예: 호텔 — 3,842.6㎡, 지상 12층, 2016).
3. 둘이 충돌하고 어느 쪽이 맞는지 알 수 없으면 둘 다 허용 + `CONFLICT` note.
4. 값이 어디에도 없으면 사실을 만들지 않는다 (Rule 34/37) — 해당 단언은 쓰지 않는다.

## 4. pending 태그 정책

| 태그 | 의미 | 담당 |
|:--|:--|:--|
| `W1` | 면적/게이트/대장 수정 (0 클레임, 다른 건물 대장값, 메모 면적 키 불일치, 층수·준공 누락) | register/gate agent |
| `W2` | 랜드마크 POI (위치도·입지 슬라이드의 구체 시설명) | landmark agent |
| `W3` | 임차인 실명 (마스킹 `임차인 A`, `[임차인…]` 제거) | tenant agent |

- `pending` 이 붙은 사실이 **실패**하면 `PENDING`(expected-fail, 테스트를 막지 않음)으로만 보고한다. **태그 없는 실패는 `FAIL` 이며 테스트가 실패한다.**
- 해당 작업이 끝나면 PASS* 로 표시되므로 **태그를 지운다** (stale tag 정리). 태그를 새로 다는 것은 "알려진 결함 묶음에 속한다"는 증명이 있을 때만.
- `ORACLE_STRICT=1`: pending 도 FAIL 로 취급 — **릴리즈 직전/머지 전** 게이트용. 모든 pending 이 해소되면 strict 가 통과해야 "상용화 종료 기준 ①"을 충족한다.
- 어떤 묶음에도 속하지 않는 실패는 태그를 달지 말고 FAIL 로 남겨 결함 목록에 둔다(예: 뷰어의 잘못된 대지면적, 본문 말줄임표).

## 5. 경계 가드 (`src/tests/unit/boundary-guard.test.ts`, `npm run test:guard`)

`src/domain/building/mobile-im/pptx/**` 가 원시 건축물대장 키(`br.grndFlrCnt`, `br.ugrndFlrCnt`, `br.bcrPct`, `br.farPct`, `br.groundFloors`, `br.undergroundFloors`, `br.approvalDate`)를 직접 읽으면 실패한다.
- STRICT: 대장 수신자 변수(`br/reg/register/buildingRegister…`) + allowlist(현재 `spec-resolver.ts`, 이관 후 삭제).
- BASELINE: 같은 키 이름의 접근 횟수를 파일별로 고정(현재 부채) — 증가/신규 파일 금지. 감사 후 줄이면 숫자를 낮춘다.

## 6. 제외·한계
- `liveEnrichment` 없는 스냅샷은 `landPriceHistory`(공시지가 10년 추이)가 없다 → 수익률 슬라이드의 공시지가 문구는 폴백 문구로 나온다. 필요하면 `--live-enrich` 로 재캡처.
- 카카오 정적지도는 회색 스텁이라 **이미지 픽셀**은 검증 대상이 아니다. POI 번호 마커/라벨 텍스트는 프로덕션과 동일한 로직으로 생성된다.
- 이 체계는 렌더러/바인더 결함에 효과적이다. LLM 본문 품질(프롬프트) 변경은 여전히 replay 골든으로 확인한다.

## 랜드마크 풀 (W2 랜드마크 oracle)

- `npx tsx scripts/golden-snapshot/capture.ts core --pool-only` : 기존 스냅샷은 두고 `resolveLandmarkPool`(live, 캐시 미사용)을 골든당 1회 호출해 `e2e/golden-snapshots/<name>/poi-pool.json` 저장 (좌표/posture/assetType 은 스냅샷 값). 기본 `capture.ts core` 도 풀을 함께 캡처 (`--no-pool` 로 생략). live 실패 시 로그만 남기고 기존 파일 유지(양평은 docs p5 poi-pool.json 폴백).
- `rerender.ts` / `oracle.ts` : poi-pool.json 이 있으면 렌더러 `landmarkPoolFixture` 로 주입 (네트워크/캐시 미사용, 차단 0건 유지). 없으면 풀 없음 → 레거시 후보 폴백.
- `npx tsx scripts/golden-snapshot/pois.ts core` : 골든별 선별 POI(번호·클래스·이름·거리·점수) + 기대 랜드마크 미선택 원인 분류 (A pool 에 없음 / B 이름 불일치 / C 분류 탈락(other) / D 선택기 탈락). 결과 `out/pois-report.md`.
