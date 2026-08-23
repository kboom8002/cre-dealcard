# 마이그레이션 런북

> **D2** · 15단계 100일을 **어떤 순서로 실행하고, 실패하면 어떻게 되돌리는가**
> 모든 단계에 **검증 쿼리**와 **롤백 절차**가 있습니다. 없으면 그 단계는 실행하지 않습니다.

| | |
|---|---|
| **문서 ID** | D2 |
| **소유** | 개발팀 리드 |
| **선행 정본** | **D1·D3·D4·D5·D6·D7·D8·D9·D10·D13 (전량)** · `IM_SYSTEM_SSOT.md` v1.4 §10 |
| **대상** | 15단계 · 100.0일 |
| **작성일** | 2026-08-23 |

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

## 9. 참고

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
