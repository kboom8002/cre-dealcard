-- lease_ledger: 렌트롤 표준 양식 v1.4/v1.5 필드 영속화 + 물건 단위 메타(lease_ledger_meta)
-- 2026-10-11
--
-- 스펙: docs/RENTROLL_v1.3_to_v1.5.md (§2.2 Z/AA/AB, §2.4, §5, §8, §9.2)
--
-- 이 파일은 단독 실행 가능(idempotent)하다. 여러 번 실행해도 안전하다.
--
-- 변경 사항
--  1) lease_ledger 행 단위 컬럼 3종 추가
--       evidence_level   — Z  근거 ('계약서 원본' | '매도인 렌트롤' | '구두')
--       rent_free_months — AA 렌트프리 잔여(개월, 정수 ≥ 0)
--       payment_status   — AB 입금 확인 ('정상' | '연체' | '미확인')
--     값이 없으면 NULL 이다 (추측해서 채우지 않는다).
--  2) mgmt_fee_krw 의 DEFAULT 0 제거 (§8: 통합계약 비대표 행의 빈 금액을 0원으로 저장하지 않는다).
--     이미 0 으로 저장된 기존 행은 건드리지 않는다 (0 이 입력값인지 미입력인지 구분할 수 없음).
--  3) lease_ledger_meta — 물건(렌트롤) 단위 1행. area_input_unit(G9), 기준일(C5), 헤더 블록 J3~J8, V12 해제 기록.
--     행 단위 면적은 기존대로 ㎡ 정본만 lease_ledger 에 저장하고, 입력 단위는 여기에만 둔다.
--     asset_id 는 lease_ledger.asset_id 와 동일하게 TEXT (building_ssot_lite id).
--  4) RLS 활성화 (정책 없음) — 서버의 service role 만 접근.

-- ── 1) lease_ledger 행 단위 컬럼 ────────────────────────────────────────────
ALTER TABLE lease_ledger
  ADD COLUMN IF NOT EXISTS evidence_level VARCHAR(20)
  CHECK (evidence_level IS NULL OR evidence_level IN ('계약서 원본', '매도인 렌트롤', '구두'));

ALTER TABLE lease_ledger
  ADD COLUMN IF NOT EXISTS rent_free_months INT
  CHECK (rent_free_months IS NULL OR rent_free_months >= 0);

ALTER TABLE lease_ledger
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(10)
  CHECK (payment_status IS NULL OR payment_status IN ('정상', '연체', '미확인'));

COMMENT ON COLUMN lease_ledger.evidence_level   IS '근거 수준(렌트롤 v1.4 Z열) — 계약서 원본 | 매도인 렌트롤 | 구두. NULL = 미기재';
COMMENT ON COLUMN lease_ledger.rent_free_months IS '렌트프리 잔여(개월, 렌트롤 v1.4 AA열) — 정수 ≥ 0. NULL = 미기재';
COMMENT ON COLUMN lease_ledger.payment_status   IS '입금 확인 최근 12개월(렌트롤 v1.4 AB열) — 정상 | 연체 | 미확인. NULL = 미기재';

-- ── 2) mgmt_fee_krw: 빈 값을 0 으로 저장하지 않는다 ───────────────────────────
ALTER TABLE lease_ledger ALTER COLUMN mgmt_fee_krw DROP DEFAULT;

-- ── 3) 물건 단위 메타 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lease_ledger_meta (
  asset_id                  TEXT PRIMARY KEY,                                    -- building_ssot_lite id (lease_ledger.asset_id 와 동일 타입)
  area_input_unit           VARCHAR(10) NOT NULL DEFAULT 'sqm' CHECK (area_input_unit IN ('sqm', 'pyeong')), -- G9
  rentroll_version          VARCHAR(10),                                         -- A1 에서 감지한 양식 버전 ('1.3' | '1.4' | '1.5' | 'unknown')
  rentroll_as_of            DATE,                                                -- C5 렌트롤 기준일
  asking_price_krw          BIGINT,                                              -- J3 매각(희망)가(원)
  gfa_sqm                   NUMERIC(12,2),                                       -- J4 연면적(㎡ 고정, 환산 금지)
  market_rent_1f            BIGINT,                                              -- J5 원/전용평·월
  market_rent_1f_source     TEXT,                                                -- M5
  market_rent_upper         BIGINT,                                              -- J6
  market_rent_upper_source  TEXT,                                                -- M6
  market_rent_basement      BIGINT,                                              -- J7
  market_rent_basement_source TEXT,                                              -- M7
  other_income_krw          BIGINT,                                              -- J8 원/월(VAT 별도)
  other_income_note         TEXT,                                                -- M8
  area_unit_override_reason TEXT,                                                -- V12(AREA_UNIT_MISMATCH) 해제 사유
  area_unit_override_by     TEXT,                                                -- 해제자(user id) — 서버가 채움
  area_unit_override_at     TIMESTAMPTZ,                                         -- 해제 시각 — 서버가 채움
  updated_at                TIMESTAMPTZ DEFAULT now()
);

-- 다른 환경에서 일부 컬럼만 있는 테이블이 이미 만들어졌을 경우를 대비해 컬럼을 보강한다.
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS rentroll_version VARCHAR(10);
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS rentroll_as_of DATE;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS asking_price_krw BIGINT;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS gfa_sqm NUMERIC(12,2);
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS market_rent_1f BIGINT;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS market_rent_1f_source TEXT;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS market_rent_upper BIGINT;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS market_rent_upper_source TEXT;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS market_rent_basement BIGINT;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS market_rent_basement_source TEXT;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS other_income_krw BIGINT;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS other_income_note TEXT;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS area_unit_override_reason TEXT;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS area_unit_override_by TEXT;
ALTER TABLE lease_ledger_meta ADD COLUMN IF NOT EXISTS area_unit_override_at TIMESTAMPTZ;

COMMENT ON TABLE  lease_ledger_meta                  IS '렌트롤 물건 단위 메타(1행/asset_id) — v1.5 G9 면적 입력 단위, C5 기준일, J3~J8 헤더 블록, V12 해제 기록';
COMMENT ON COLUMN lease_ledger_meta.area_input_unit  IS 'G9 면적 입력 단위 — sqm | pyeong. v1.3/v1.4 업로드는 sqm. 행 단위 면적은 lease_ledger 에 ㎡ 정본만 저장';
COMMENT ON COLUMN lease_ledger_meta.gfa_sqm          IS 'J4 연면적(㎡) — G9 와 무관하게 항상 ㎡';
COMMENT ON COLUMN lease_ledger_meta.market_rent_1f   IS 'J5 시장 임대료 1층(원/전용평·월) — 면적 단위 환산 금지';

-- ── 4) RLS ───────────────────────────────────────────────────────────────
-- 정책을 만들지 않으므로 anon/authenticated 는 접근 불가, 서버(service role)만 읽고 쓴다.
ALTER TABLE lease_ledger_meta ENABLE ROW LEVEL SECURITY;
