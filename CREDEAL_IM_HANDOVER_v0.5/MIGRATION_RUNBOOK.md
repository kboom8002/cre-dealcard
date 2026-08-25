# 마이그레이션 런북

> **D2** · 15단계 100일을 **어떤 순서로 실행하고, 실패하면 어떻게 되돌리는가**
> 모든 단계에 **검증 쿼리**와 **롤백 절차**가 있습니다. 없으면 그 단계는 실행하지 않습니다.

| | |
|---|---|
| **문서 ID** | D2 |
| **소유** | 개발팀 리드 |
| **선행 정본** | **D1·D3·D4·D5·D6·D7·D8·D9·D10·D13 (전량)** · `IM_SYSTEM_SSOT.md` §11 · **`ONTOLOGY_V0.5_SPEC.md` §9** |
| **대상** | 15단계 100.0일 + **v0.5 12단계 12.5일 (§9)** |
| **작성일** | 2026-08-23 · **v0.5 장 추가 2026-08-25** |

---

## 0. 원칙 4가지

### 0.1 되돌릴 수 없는 것을 먼저 하지 않습니다

| 되돌릴 수 있음 | **되돌릴 수 없음** |
|---|---|
| 코드 배포 (플래그) | **테이블 DROP** |
| 렌더 변경 | **Golden 원본 덮어쓰기** |
| 계측 추가 | **구 컬럼 삭제** |

**구 테이블·구 컬럼은 최소 2개 분기 유지합니다.** 삭제는 100일 로드맵 밖입니다.

### 0.2 🔴 진단이 두 번 뒤집힌 것을 검증 쿼리로 막습니다

이번 세션에서 사실 판단이 두 번 뒤집혔습니다.

| 시점 | 판단 | 실제 |
|---|---|---|
| v1.1 | 계측 전무 | **뷰어 계측 이미 있음** |
| v1.1 | 모바일 본문 16px 미만 | **이미 17px** |
| v1.3 | 실패율 40.9% 최우선 | **시스템 오류 0건** |

**전부 "코드를 안 보고 문서로 판단"해서 생긴 오류입니다.** 각 단계 DoD를 문장이 아니라 **실행 가능한 쿼리**로 씁니다.

### 0.3 단계는 병합하지 않습니다

공수를 줄이려고 두 단계를 같이 배포하면 롤백 시 어느 쪽이 원인인지 모릅니다.

### 0.4 배포 후 30일 관측 없이 다음 지표를 판단하지 않습니다

**단계 1(계측)이 첫 번째인 이유입니다.** 기준선 없이 개선했다고 말할 수 없습니다.

---

## 0A. 🔴 SSoT §10.2 잔존 오류 3건 — 이 문서가 정정합니다

SSoT §10.2 설명문에 **B1에서 정정된 수치가 그대로 남아 있습니다.**

| SSoT §10.2 기술 | 정정 | 근거 |
|---|---|---|
| 병렬화 후 **55초** | **63.1초** | D13 §3 |
| 현재 **122초**가 한계 초과 | **평균 104.3초 · p95 148.9초** | 30일 실측 |
| 섹션 +2 = **154초** | **섹션은 늘지 않음 · 63.1초 유지** | D13 §0 |

### 0A.1 결론은 바뀌지 않습니다

**단계 1.5가 단계 6의 선행 조건이라는 판단은 여전히 맞습니다.** 다만 근거가 다릅니다.

```
❌ 옛 근거: 섹션이 2개 늘어 154초가 되므로 병렬화 필요
✅ 새 근거: p95 148.9초가 이미 한계 120초를 넘었으므로 병렬화 필요
```

A16·A17은 슬라이드이므로 섹션을 늘리지 않지만, **현재 p95만으로도 이미 한계를 초과**했습니다. 순서는 그대로입니다.

---

## 1. 실행 순서

### 1.1 선행 조건 그래프

```
0 응급 ─┬─→ 1 계측 ──→ 1.5 병렬화 ──┐
        │                            │
        └─→ 2 가정값 ──→ 3 게이트 ──┤
                          │          │
                     3.5 자산유형     │
                          │          │
                        4 원장 ───────┴─→ 5 IMCore ─┬─→ 6 A16·A17 → 6.5 A03
                                                     ├─→ 7 모바일 → 11 접근성
                                                     └─→ 8 PPTX
                                                          │
                                                     9 해상도 → 10 income 교정
```

### 1.2 전체 표

| 단계 | 내용 | 공수 | 누적 | 선행 | 롤백 |
|:-:|---|--:|--:|:-:|---|
| **0** | 응급 E0~E5 | **5.0** | 5.0 | — | 플래그 |
| 1 | 계측 도입 | 3.0 | 8.0 | 0 | 테이블 DROP |
| **1.5** | 섹션 병렬화 | **5.0** | **13.0** | 1 | **env 1줄** |
| 2 | 가정값 외부화 | 8.0 | 21.0 | 0 | 플래그 |
| 3 | 게이트 + basis 강제 | 5.0 | 26.0 | 2 | 플래그 |
| **3.5** | 자산유형 판별 | 4.0 | 30.0 | 3 | 플래그 |
| **4** | **`lease_ledger` 통합** | **8.0** | **38.0** | 3 | **읽기 플래그** |
| **5** | **IMCore 단일 코어** | **13.0** | **51.0** | 4 | **렌더 플래그** |
| 6 | A16·A17 신설 | 8.0 | 59.0 | 5 · **1.5** | 아키타입 설정 |
| 6.5 | A03 8행 해소 | 2.0 | 61.0 | 6 | 상수 1줄 |
| 7 | 모바일 최적화 | 4.0 | 65.0 | 5 | 플래그 |
| 8 | PPTX 최적화 | 10.5 | 75.5 | 6.5 | 플래그 |
| 9 | 해상도 체계 | 12.0 | 87.5 | 4 | 플래그 |
| **10** | **income 포스처 교정** | **11.0** | **98.5** | 9 | 플래그 |
| 11 | 접근성 보강 | 1.5 | **100.0** | 7 | 즉시 |
| | | **100.0일** | | | |

**15단계 · 전부 롤백 경로 보유.**

---

## 2. 단계별 상세

### 2.0 단계 0 — 응급 (5.0일)

| # | 작업 | 문서 |
|:-:|---|:-:|
| E0 | **입력 폼 사전 검증** | **D8 §2** |
| E1 | `im_generation_metrics` 생성 · `cost-tracker.ts` 대상 변경 | D6 §1.1 |
| E2 | 미존재 테이블 참조 CI 차단 | D9 §8.2 |
| E3 | Golden 정제 141 자동 + 28 수동 | D5 |
| E4 | 저장 전 `sanitizePersona` 삽입 | D5 |
| E5 | 스키마-코드 정합성 전수 점검 | D9 §8.2 |

**검증 쿼리.**

```sql
-- E0: 입력 누락 차단이 서버까지 오지 않는가
SELECT COUNT(*) FROM im_generation_jobs
WHERE created_at > NOW() - INTERVAL '7 days'
  AND result->>'error' LIKE '%입력이 필요%';          -- 목표 0

-- E3: 페르소나 문구 잔존
SELECT COUNT(*) FROM golden_examples
WHERE body ~ '(\d0대|자산가|법인 ?대표|초보 ?투자자|은퇴자)';        -- 목표 0

-- E3: 이모지 잔존 (BMP 밖 문자 = UTF-8 4바이트)
SELECT COUNT(*) FROM golden_examples
WHERE octet_length(body) > 3 * char_length(body);                  -- 목표 0

-- E4: 신규 저장분 오염
SELECT COUNT(*) FROM golden_examples
WHERE created_at > NOW() - INTERVAL '7 days' AND is_active
  AND octet_length(body) > 3 * char_length(body);                  -- 목표 0
```

> **이모지 검사를 SQL 정규식으로 쓰지 않습니다.** PostgreSQL 정규식에서 유니코드 범위 표기가 환경마다 달라 조용히 0건을 반환할 수 있습니다. **BMP 밖 문자는 UTF-8에서 4바이트**이므로 `octet_length > 3 × char_length`가 확실합니다. 정밀 판정은 D5 §2의 `EMOJI` 정규식을 쓰는 `npm run golden:audit`으로 합니다.

**롤백** — E0은 폼 플래그 `FORM_PREVALIDATE=0`. **E3은 롤백 불가이므로 원본 스냅샷을 먼저 뜹니다.**

```sql
CREATE TABLE golden_examples_backup_20260823 AS SELECT * FROM golden_examples;
```

> **🔴 E3 착수 전 이 한 줄을 반드시 실행합니다.** Golden 원본 덮어쓰기는 되돌릴 수 없습니다.

### 2.1 단계 1 — 계측 (3.0일)

**DoD** — 8지표 30일 기준선 확보.

```sql
-- 지표 8종이 실제로 쌓이는가
SELECT
  COUNT(*)                                          AS metrics_rows,
  COUNT(*) FILTER (WHERE cost_usd > 0)              AS cost_ok,
  COUNT(DISTINCT section_type)                      AS sections,
  COUNT(*) FILTER (WHERE parallel_group IS NOT NULL) AS staged
FROM im_generation_metrics
WHERE created_at > NOW() - INTERVAL '7 days';

-- 수정률 — 스키마만 있고 INSERT가 없던 항목
SELECT COUNT(*) FROM im_edit_events WHERE created_at > NOW() - INTERVAL '7 days';  -- ≥ 1
```

**롤백** — `DROP TABLE im_generation_metrics` (생성 계층 전용이므로 서비스 영향 없음).

> **계측 실패가 생성을 막지 않는지 반드시 테스트합니다.** 테이블을 DROP한 상태에서 IM 생성이 성공해야 합니다. (D6 §9 DoD 6번)

### 2.2 단계 1.5 — 병렬화 (5.0일)

| 항목 | 값 |
|---|--:|
| 현행 평균 | 104.3초 |
| 현행 p95 | **148.9초** |
| **목표 평균** | **≤ 70초** |
| 목표 p95 | ≤ 95초 |
| **한계선** | **< 120초** |

```sql
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_ms)/1000.0 AS p50_sec,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)/1000.0 AS p95_sec,
  COUNT(*)
FROM im_generation_jobs
WHERE outcome = 'completed' AND created_at > NOW() - INTERVAL '7 days';
```

**롤백 — 환경변수 한 줄.**

```bash
IM_SECTION_CONCURRENCY=1     # 순차 실행으로 즉시 복귀
```

**전 단계 중 가장 안전한 롤백입니다.** 배포 후 이상이 보이면 재배포 없이 되돌립니다.

### 2.3 단계 2 — 가정값 외부화 (8.0일)

**DoD** — 21종 전부 `source`·`basis`·`reviewedAt` 보유 · 폐기 6종 제거.

```bash
# 재무 모듈에 리터럴이 남아 있는가
grep -rnE '\* *0\.(85|046|009)|400 *\* *|8_?000_?000' src/lib/financials/ && exit 1
echo "가정값 하드코딩 0건 ✓"
```

```sql
-- 폐기 6종의 산출 경로가 실제로 사라졌는가
SELECT COUNT(*) FROM im_generation_metrics m
JOIN im_documents_v2 d ON d.job_id = m.job_id
WHERE d.payload::text LIKE '%noi_%'
  AND d.payload->>'opexKrw' IS NULL;                -- 목표 0
```

**🔴 이 단계에서 호텔 Opex 35% ↔ GOP 마진 35% 충돌을 확인합니다.**

```bash
sed -n '132p;421p' src/lib/financials.ts
```

Opex 35%면 GOP 마진이 65%가 됩니다. **운영형 GOP가 약 2배로 산출되고 있을 가능성**을 여기서 판정합니다.

**롤백** — `ASSUMPTIONS_FROM_REGISTRY=0`으로 구 상수 경로 복귀.

### 2.4 단계 3 — 게이트 + basis 강제 (5.0일)

**DoD** — 실매물 5건 재생성 시 합계 불일치 0건 · basis 누락 0건.

```sql
-- 차단 게이트가 실제로 작동하는가
SELECT UNNEST(block_reasons) AS code, COUNT(*)
FROM im_generation_metrics
WHERE publish_blocked AND created_at > NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY 2 DESC;
```

**기대 — 양평동 재생성 시 G19·G21이 뜹니다.** 안 뜨면 게이트가 연결되지 않은 것입니다.

**롤백** — `DETERMINISTIC_GATES=warn` (차단 대신 경고만).

> **`off`가 아니라 `warn`입니다.** 게이트를 끄면 어떤 물건이 걸렸을지 기록이 남지 않습니다.

### 2.5 단계 3.5 — 자산유형 판별 (4.0일)

```sql
SELECT
  COALESCE(asset_type,'(null)') AS t,
  COUNT(*),
  ROUND(100.0*COUNT(*)/SUM(COUNT(*)) OVER (), 1) AS pct
FROM assets WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 2 DESC;
```

| | 현재 | 목표 |
|---|--:|--:|
| `unknown` 비율 | **48.4%** | **< 10%** |

**`unknown`을 0으로 만들지 않습니다.** 주용도가 없으면 판별할 수 없는 것이 맞고, 추정으로 채우면 조용히 틀립니다.

**롤백** — 플래그로 구 판별 로직 복귀.

### 2.6 🔴 단계 4 — `lease_ledger` 통합 (8.0일)

**가장 위험한 단계입니다.** 데이터가 두 테이블에 나뉘어 있습니다.

| 순서 | 작업 | 되돌리기 |
|:-:|---|---|
| 1 | `lease_ledger` **생성만** | `DROP` |
| 2 | `lease_spaces`·`lease_units` → **복사** (원본 유지) | 대상 truncate |
| 3 | **읽기** 경로 전환 | **플래그** |
| 4 | **쓰기** 경로 전환 | 플래그 |
| 5 | 구 테이블 `deprecated` 주석 (**삭제 금지**) | — |

**이관 검증 — 건수와 합계가 모두 맞아야 합니다.**

```sql
-- 건수
SELECT
  (SELECT COUNT(*) FROM lease_spaces) + (SELECT COUNT(*) FROM lease_units) AS old_rows,
  (SELECT COUNT(*) FROM lease_ledger)                                       AS new_rows;

-- 자산별 월세 합계 (한 건이라도 다르면 실패)
SELECT l.asset_id, l.new_sum, o.old_sum
FROM (SELECT asset_id, SUM(monthly_rent_krw) new_sum FROM lease_ledger GROUP BY 1) l
FULL JOIN (SELECT asset_id, SUM(monthly_rent) old_sum FROM lease_units GROUP BY 1) o
  USING (asset_id)
WHERE COALESCE(l.new_sum,0) <> COALESCE(o.old_sum,0);        -- 목표 0행
```

**롤백** — `LEASE_READ_FROM=legacy`. 구 테이블이 살아 있으므로 즉시 복귀합니다.

> **구 테이블을 최소 2개 분기 유지합니다.** 삭제 유혹이 가장 큰 지점이고, 삭제하면 롤백이 사라집니다.

### 2.7 🔴 단계 5 — IMCore 단일 코어 (13.0일 · 최대 공수)

**DoD** — PPTX가 마크다운 없이 렌더 · 골든 스냅샷 일치.

```bash
# 정상 경로에서 마크다운 재파싱이 사라졌는가
grep -rn "split('|')" src/lib/render/ | grep -v fallback && exit 1
```

```sql
-- 두 매체가 같은 숫자를 내는가 (모바일 Hero vs PPTX A02)
SELECT job_id FROM im_render_audit
WHERE mobile_hero_json::text <> pptx_a02_json::text;          -- 목표 0행
```

**롤백** — `RENDER_PATH=markdown`으로 구 경로 복귀. **13일 작업이므로 주 단위로 부분 배포**하고, 매 배포마다 골든 스냅샷을 비교합니다.

### 2.8 단계 6 · 6.5 — A16·A17 · A03 (10.0일)

```bash
# 좌표 경계
npm run test -- archetype-bounds       # assertBounds 전량

# 렌트롤 전량 표기
grep -rn "별첨 참조\|slice(0, 8)" src/lib/pptx/ && exit 1
```

| 검사 | 기대 |
|---|--:|
| A16 우측 끝 | 12.710 ≤ 12.713 |
| A16 본문 끝 | 6.75 (Footer 여유 0.19) |
| A17 우측 끝 | **12.713** |
| A17 본문 끝 | 6.65 (여유 0.29) |
| A03 12행 | **1장 · 누락 0** |
| A03 18행 | **2장 · 누락 0** |

**🔴 배포 전 골든 PPTX 1장을 시제작해 육안 확인합니다.** 좌표 계산이 맞아도 실제 렌더가 다를 수 있습니다.

**롤백** — 아키타입 설정에서 A16·A17 비활성 · `A03_ROWS_PER_SLIDE=8`.

### 2.9 단계 7 · 11 — 모바일 (5.5일)

```bash
grep -rn 'text-\[10px\]' src/components/mobile/ && exit 1     # 0건
grep -rn 'aria-expanded' src/components/mobile/ | wc -l       # 아코디언 수와 일치
```

```sql
-- E0 효과 판정 — 이 지표 하나로 성패가 갈립니다
SELECT ROUND(100.0*COUNT(*) FILTER (WHERE outcome='input_missing')/COUNT(*),1) AS input_missing_pct
FROM im_generation_jobs WHERE created_at > NOW() - INTERVAL '30 days';
```

| | 현재 | 목표 |
|---|--:|--:|
| 입력 누락률 | **36.4%** | **0%** |

**롤백** — 즉시 (렌더 변경만).

### 2.10 단계 8 — PPTX 최적화 (10.5일)

```bash
# 캡션 9pt 미만
python3 scripts/check_pptx_fontsize.py out.pptx --min-caption 9
```

**폰트 임베딩을 여기서 다룹니다.** 뷰어 PC에 `맑은 고딕`이 없으면 대체 폰트로 렌더되어 **좌표 계산이 무의미해집니다.**

**롤백** — 테마 프리셋 되돌림.

### 2.11 단계 9 · 10 — 해상도 · income 교정 (23.0일)

```sql
-- 해상도 판정이 엑셀과 일치하는가 (실매물 5건)
SELECT asset_id, resolution FROM im_generation_jobs
WHERE asset_id = ANY($1) ORDER BY 1;
```

| 물건 | 기대 |
|---|:-:|
| 양평동 | **R2** |
| 당산동 | **R1** |
| 잠원동 | R1 |
| 수택동 | R3 |
| 호텔 | O2 |

**단계 10 DoD** — 실매물 5건 재생성 · 수치 전량 검산 통과 (D9 §5.2).

**롤백** — 플래그.

---

## 3. 되돌릴 수 없는 지점 3곳

| # | 지점 | 대비 |
|:-:|---|---|
| 1 | **Golden 정제 (E3)** | **착수 전 백업 테이블 생성** |
| 2 | 구 테이블 DROP | **100일 로드맵에서 제외** |
| 3 | 구 컬럼 DROP | 동일 |

**2·3은 아예 하지 않습니다.** 디스크 비용보다 롤백 불가 위험이 큽니다.

---

## 4. 플래그 목록

| 플래그 | 기본 | 단계 | 롤백 값 |
|---|:-:|:-:|---|
| `FORM_PREVALIDATE` | 1 | 0 | 0 |
| **`IM_SECTION_CONCURRENCY`** | **4** | **1.5** | **1** |
| `ASSUMPTIONS_FROM_REGISTRY` | 1 | 2 | 0 |
| `DETERMINISTIC_GATES` | `block` | 3 | `warn` |
| `ASSET_TYPE_CLASSIFIER` | `v2` | 3.5 | `v1` |
| **`LEASE_READ_FROM`** | **`ledger`** | **4** | **`legacy`** |
| **`RENDER_PATH`** | **`core`** | **5** | **`markdown`** |
| `A03_ROWS_PER_SLIDE` | 12 | 6.5 | 8 |

**8개 전부 재배포 없이 전환 가능해야 합니다.**

---

## 5. 릴리스 게이트

각 단계 배포 전 공통 통과 조건입니다.

| # | 게이트 | 실패 시 |
|:-:|---|---|
| 1 | `tsc --noEmit` | 배포 중단 |
| 2 | **스키마 대조 공집합** | 배포 중단 |
| 3 | 단위 + 게이트 테스트 | 배포 중단 |
| 4 | 회귀 스냅샷 | 배포 중단 |
| 5 | **불변조건 21 테스트 전량 통과** | 배포 중단 |
| 6 | 금지 패턴 grep 0건 | 배포 중단 |
| 7 | 해당 단계 검증 쿼리 | 배포 중단 |
| 8 | 롤백 플래그 동작 확인 | **배포 중단** |

### 5.1 8번을 형식적으로 넘기지 않습니다

**롤백을 실제로 해보지 않은 롤백 절차는 절차가 아닙니다.** 스테이징에서 플래그를 되돌려 정상 동작을 확인한 뒤 배포합니다.

---

## 6. 사고 대응

| 증상 | 1차 조치 | 원인 후보 |
|---|---|---|
| 생성 시간 급증 | `IM_SECTION_CONCURRENCY=1` | 병렬화 · 외부 API |
| 숫자 불일치 신고 | `DETERMINISTIC_GATES=block` 확인 | 게이트 미연결 |
| 렌트롤 누락 신고 | `A03_ROWS_PER_SLIDE` 확인 | 8행 제한 잔존 |
| PPTX 글자 깨짐 | 테마 되돌림 | **폰트 미임베딩** |
| 수익률 이상 | `ASSUMPTIONS_FROM_REGISTRY=0` | 가정값 오입력 |
| 원장 데이터 소실 | **`LEASE_READ_FROM=legacy`** | 이관 누락 |

### 6.1 신고 접수 시 먼저 확인할 것

```sql
SELECT id, outcome, error_name, error_field, posture, resolution, duration_ms
FROM im_generation_jobs WHERE id = $1;
```

**`outcome`이 `system_error`가 아니면 시스템 문제가 아닙니다.** 입력 누락과 의도된 차단을 장애로 처리하면 대응이 엉뚱해집니다.

---

## 7. 일정

| 구간 | 단계 | 공수 | 산출 |
|---|---|--:|---|
| **1개월차** | 0 · 1 · 1.5 · 2 | **21.0** | 응급 해소 · 기준선 · 63초 |
| 2개월차 | 3 · 3.5 · 4 | 17.0 | 게이트 · 단일 원장 |
| **3개월차** | 5 · 6 · 6.5 | **23.0** | **IMCore · A16·A17** |
| 4개월차 | 7 · 8 · 11 | 16.0 | 매체 최적화 |
| 5개월차 | 9 · 10 | 23.0 | 해상도 · income 교정 |
| | | **100.0일** | |

### 7.1 1개월차가 가장 중요합니다

**입력 누락률 36.4% → 0%** 와 **생성 시간 104.3초 → 63.1초** 가 여기서 나옵니다. 사용자가 체감하는 변화의 대부분입니다.

---

## 8. 보류 4포스처

| 포스처 | 재개 조건 | 공수 |
|---|---|--:|
| development | **시도 3건 이상** (현재 2건) | 12.0 |
| owner_occupied | 법인 사옥 문의 5건 이상 | 8.0 |
| operating | 동일 · **+ Opex/GOP 충돌 해소** | 10.0 |
| trading | 동일 | 6.0 |
| | | *36.0* |

**골격은 이미 구현돼 있어 수요 확인 시 즉시 착수 가능합니다.**

> **🔴 다만 현재 분포(62건 전부 income)는 기본값의 결과일 수 있습니다.** 단계 0에서 `posture` 기본값을 제거한 뒤 30일을 다시 관측해야 재개 판단이 성립합니다. (D10 §10.1)

---

## 9. 온톨로지 v0.5 마이그레이션 🆕

> `ONTOLOGY_V0.5_SPEC.md` §9의 **파괴적 변경 7건**을 실제로 돌리는 절차입니다.
> §0의 원칙 4가지가 그대로 적용됩니다 — **되돌릴 수 없는 것을 먼저 하지 않습니다.**

| | |
|---|---|
| **선행** | `ONTOLOGY_V0.5_SPEC.md` · `CATALOG_*` 4종 · `qa/ontology_check.py` 통과 |
| **되돌릴 수 없는 지점** | **1곳** — V5-4 등급 재산정 |
| **총 단계** | 12 |

### 9.1 실행 순서

```
읽기 전용·안전                          되돌릴 수 없음
├ V5-0  스냅샷                         ┆
├ V5-1  코드 개명 (G · QG)              ┆
├ V5-2  라벨 치환                       ┆
├ V5-3  Provenance 분할                 ┆
├ V5-4  등급 재산정 ─────────────────▶ 🔴 여기서부터 전진만
├ V5-5  R-INC 재판정
├ V5-6  포스처 계약 status
├ V5-7  L축 태깅
├ V5-8  신규 게이트 활성 (warn)
├ V5-9  신규 게이트 활성 (block)
├ V5-10 공란 코드 정리
└ V5-11 영향 보고서
```

### 9.2 단계별

#### V5-0 · 스냅샷 — 0.5일

```sql
CREATE TABLE _v04_snapshot_deal AS SELECT * FROM deal;
CREATE TABLE _v04_snapshot_slot AS SELECT * FROM building_ssot_lite;
CREATE TABLE _v04_snapshot_publish AS SELECT * FROM publish_record;
```

**검증** — 행 수 일치. **롤백** — 해당 없음.

> Golden 테이블도 함께 뜹니다 (§3 지점 1과 동일 원칙).

---

#### V5-1 · 코드 개명 `G1~G9 → G01~G09` · 운영 `G → QG` — 1.5일

| 대상 | 조치 |
|---|---|
| `CATALOG_RULES` | ✅ 완료 (v0.5) |
| `quality-gates-v02.ts` | `G0x` → `QG0x` |
| 로그 파서·대시보드 | **구코드 읽기 전용 매핑 유지** |

```ts
// 과거 로그의 해석이 사후에 바뀌면 안 됩니다
export const LEGACY_GATE_MAP = {
  before: '2026-09-01',
  'G7':  { publish: 'G07', runtime: 'QG07' },   // 🔴 둘 다 가능했습니다
};
```

🔴 **개명 이전 로그의 `G7`은 두 가지 뜻입니다.** 어느 쪽인지 특정할 수 없으므로
매핑에 둘 다 적고, 그 기간의 통계는 **분리 집계하지 않습니다.**

**검증** — `grep -rn "G[1-9][^0-9]" src/` 결과 0.
**롤백** — 문자열 치환 역방향. 안전합니다.

---

#### V5-2 · 라벨 치환 — 0.5일

| 코드 | v0.4 | v0.5 |
|---|---|---|
| `R-INC-01` | 초안정 수익형 | **임대 안정형** |
| `R-INC-02` | 밸류애드형 | **가치 상승 여력형** |
| `BuyerPurpose.value_add` | 밸류애드 | **가치 상승 여력** |
| `L02` 동작 문구 | 밸류애드 실행 계획 | **가치 상승 실행 계획** |

**코드는 바꾸지 않습니다.** 바꾸면 과거 IM의 해석이 사후에 바뀝니다.

**검증** — `qa/standard_check.py` `internal_label` 범위 위반 0.
**롤백** — 역치환.

---

#### V5-3 · `Provenance` 5종 → 9종 — 3.0일

```
public → registry     (건축물대장·등기부·토지대장 유래)
       → public_api   (그 외 공공 API)
```

근거는 **`CATALOG_SLOTS.md` §1.3 수집 경로표**입니다.

```sql
-- 자동 변환하지 않습니다. 슬롯 키별로 매핑합니다.
UPDATE building_ssot_lite
   SET provenance = 'registry'
 WHERE provenance = 'public'
   AND slot_key IN (:REGISTRY_SLOTS);   -- §1.3 S1 행

UPDATE building_ssot_lite
   SET provenance = 'public_api'
 WHERE provenance = 'public';           -- 나머지 = 낮은 쪽
```

`broker_aug` · `ledger` · `derived` 는 **소급 적용하지 않습니다.** 과거 데이터에서
"중개인이 보강했는지"를 알 방법이 없습니다. 신규 입력부터 적용합니다.

**검증**
```sql
SELECT provenance, count(*) FROM building_ssot_lite GROUP BY 1;
-- public 이 0 이어야 합니다
```
**롤백** — `registry`·`public_api` → `public` 역변환. 안전합니다.

---

#### V5-4 · 등급 L×P 재산정 🔴 되돌릴 수 없음 — 2.0일

**이 단계 이후로는 전진 수정만 합니다.** 등급이 바뀌면 이미 발행된 IM의
잠금 상태와 어긋나기 때문입니다.

| 준비 | 내용 |
|---|---|
| 1 | L축 슬롯군을 포스처별로 태깅 (V5-7 선행 부분) |
| 2 | 축별 채움률 계산 구현 (`ONTOLOGY_V0.5_SPEC` §6.5) |
| 3 | **v0.4 점수와 L×P 등급을 나란히 리포트** |

```
딜ID    v0.4점수  v0.4등급   L   P   v0.5등급   변화
D-0012   72.67      B       R2  P3     A        ↑
D-0031   64.59      C       R1  P2     B        ↑
D-0044   52.35      C       R2  P3     A        ↑↑
```

🔴 **등급이 오르는 딜이 많을 것으로 예상됩니다.** v0.4는 단일 점수라 축 하나만
좋아도 중간값이 나왔고, v0.5는 두 축이 다 좋으면 A를 줍니다.
**A로 올라간 딜은 DCF·민감도가 열립니다** (`C11`) — 그 딜들의 산출물을 재검토해야 합니다.

**`C11`과 `L04`의 발동 조건이 소리 없이 바뀝니다.** 파괴적 변경 7번이 이것입니다.

**검증** — 등급 분포 리포트 + A 승격 딜 전량 수동 심사.
**롤백** — 스냅샷 복원 외에는 없습니다. **그래서 이 단계 전에 멈출 수 있어야 합니다.**

---

#### V5-5 · `R-INC` 재판정 — 1.0일

`R-INC-04~06` 정의가 확정되었으므로 전 `income` 딜을 재판정합니다.

```
R-INC-02 (가치 상승 여력형)   건물연령 ≥ 20년 ∧ 유효 용적률 여유 ≥ 50%p
R-INC-04 (임대료 정상화형)    평균 임대료 ≤ 권역 시세 × 0.85 ∧ 12개월 내 갱신 ≥ 1건
R-INC-06 (리모델링형)         건물연령 > 20년 ∧ 용적률 여유 < 50%p
```

🔴 **`L02` 편성이 정반대로 바뀌는 딜이 나옵니다.** v0.4에서 `R-INC-02`로 잡혀
가치 상승 실행 계획이 편성된 딜 중 실제로는 임대료 정상화형인 것이 있습니다
(당산동이 그 사례). **아키타입이 바뀐 딜을 전량 보고하고 재생성 여부를 사람이
결정합니다.**

**검증** — 아키타입 변경 목록. **롤백** — 재판정 역실행 가능 (순수 계산).

---

#### V5-6 · 포스처 계약 `status` 산정 — 0.5일

```
income          commercial
owner_occupied  beta
development     beta
operating       beta
trading         internal_only   ← L축 슬롯 미구현
```

`G30`을 **`warn`으로 먼저 켭니다.** 진행 중인 `trading` 딜이 있으면 중개인에게
사전 안내가 필요합니다.

**검증** — `trading` 진행 딜 목록. **롤백** — 플래그 off.

---

#### V5-7 · L축 태깅 — 1.0일

`CATALOG_SLOTS` §4 매트릭스와 `ONTOLOGY_V0.5_SPEC` §6.2를 코드로 옮깁니다.
축 무관 슬롯군은 **두 축 분모에서 모두 제외**합니다 (§6.2.1).

**검증** — 포스처별 L·P 슬롯군 합이 전체와 일치.

---

#### V5-8 · 신규 게이트 `warn` — 1.0일

`G17`~`G24` · `G26`~`G30` · `C33` · `C34` · `X05` 를 **경고로 먼저** 켭니다.

```
DETERMINISTIC_GATES = warn
```

**최소 2주 관측.** 오탐이 나오면 여기서 잡습니다.

**검증** — 게이트별 발동 건수. 예상 밖으로 많으면 규칙이 틀린 것입니다.

---

#### V5-9 · 신규 게이트 `block` — 0.5일

관측 결과 오탐 0을 확인한 뒤 차단으로 올립니다.

🔴 **`G20`(사진 마스킹)은 검출 모델이 없으면 켤 수 없습니다.**
`im.masking.yaml` §images 의 차단 대상 4종이 미구현입니다 — 이 게이트만
`warn` 으로 남기고, **모델 도입 전까지 사진은 사람이 확인**합니다.

**롤백** — 플래그 `warn` 복귀.

---

#### V5-10 · 공란 코드 정리 — 0.5일

폐기된 `C02·C03·C05·C06·C08·C09·C10·C12` · `M01~M12` 를 참조하는 코드를 제거합니다.
`G07`을 **"등록되고 폐기되지 않은 전 C 코드"** 로 바꿉니다.

**검증** — `grep -rn "C0[23568]\|C1[02]" src/` 결과 0.

---

#### V5-11 · 영향 보고서 — 0.5일

| 담을 것 |
|---|
| 등급 변화 분포 (v0.4 ↔ v0.5) |
| A 승격 딜 목록 + DCF 노출 재검토 결과 |
| 아키타입 변경 딜 목록 |
| `Provenance` 분할 결과 (registry / public_api 비율) |
| 신규 게이트 2주 발동 통계 |
| `internal_only` 로 막힌 딜 |

---

### 9.3 플래그 추가

| 플래그 | 기본 | 단계 | 롤백 값 |
|---|:-:|:-:|---|
| `ONTOLOGY_VERSION` | `v0.5` | V5-3 | `v0.4` |
| `GRADE_ENGINE` | `lxp` | V5-4 | `score` |
| **`POSTURE_CONTRACT_GATE`** | `warn` → `block` | V5-6·V5-9 | `off` |
| `PROVENANCE_SCHEMA` | `v9` | V5-3 | `v5` |

§4의 8개에 더해 **12개**가 됩니다.

### 9.4 되돌릴 수 없는 지점 — §3에 1곳 추가

| # | 지점 | 대비 |
|:-:|---|---|
| 1 | Golden 정제 (E3) | 착수 전 백업 |
| 2 | 구 테이블 DROP | 하지 않음 |
| 3 | 구 컬럼 DROP | 하지 않음 |
| **4** | **등급 재산정 (V5-4)** | **V5-0 스냅샷 · 승격 딜 수동 심사** |

### 9.5 일정

| 구간 | 일수 |
|---|--:|
| V5-0 ~ V5-3 (되돌릴 수 있음) | 5.5 |
| V5-4 ~ V5-7 | 4.5 |
| V5-8 게이트 warn 전환 | 1.0 |
| V5-8 **관측** | (14일 대기 — 작업 아님) |
| V5-9 ~ V5-11 | 1.5 |
| | **12.5 작업일 + 14 관측일** |

### 9.6 §8 보류 4포스처 — 갱신

v0.5로 **골격이 채워졌으므로** 재개 조건이 바뀝니다.

| 포스처 | v0.4 재개 조건 | **v0.5 상태** | 남은 것 |
|---|---|---|---|
| development | 시도 3건 이상 | 표준·아키타입·슬롯 ✅ | 실증 1건 더 |
| owner_occupied | 법인 사옥 문의 5건 | 표준·아키타입 ✅ | **실증 0건** |
| operating | 동일 + Opex/GOP 충돌 | 충돌 해소 (`C31`) ✅ | 실증 1건뿐 |
| trading | 동일 | 🔴 **L축 슬롯 미구현** | `holding_history` 수집 |

🔴 **"현재 분포 62건 전부 income"이 기본값의 결과일 수 있다**는 D10 §10.1의 지적은
그대로 유효합니다. **단계 0에서 `posture` 기본값을 제거한 뒤 30일을 다시 관측**해야
재개 판단이 성립합니다.

---

## 10. 참고

| 영역 | 문서 |
|---|---|
| 사양 정본 | `IM_SYSTEM_SSOT.md` v1.4 |
| 승인 문서 | `PRD_IM고도화.md` (D1) |
| 타입 계약 | `API_TYPE_CONTRACT.md` (D3) |
| 가정값 | `ASSUMPTION_REGISTRY.md` (D4) |
| Golden 정제 | `GOLDEN_CLEANUP_GUIDE.md` (D5) |
| 계측 | `TELEMETRY_SPEC.md` (D6) |
| 아키타입 | `PPTX_ARCHETYPE_SPEC.md` (D7) |
| 모바일 | `MOBILE_GAP_SPEC.md` (D8) |
| 테스트 | `TEST_PLAN.md` (D9) |
| 포스처 산식 | `POSTURE_IMPL_GUIDE.md` (D10) |
| 성능 | `GENERATION_PERF_SPEC.md` (D13) |
| 온톨로지 v0.5 | `ONTOLOGY_V0.5_SPEC.md` §9 |
| 실행 계약 | `IM_PIPELINE_RUNTIME_SPEC.md` (D26) |
| 인계 세트 | `IM_HANDOVER_SET.md` (D25) |
