-- lease_ledger: 테이블 보장 + 전용면적 영속화 + (asset_id, unit_label) upsert 충돌키
-- 2026-10-05
--
-- 배경
--  - 운영 DB 에는 20260823_phase2_lease_ledger.sql 이 적용되지 않아 lease_ledger 테이블 자체가 없었다
--    (SQL Editor 실행 시 42P01 relation "lease_ledger" does not exist). persistLeaseUnits() 의 쓰기는
--    지금까지 경고 로그만 남기고 전부 실패해 왔다.
--  - 이 파일은 단독 실행 가능(idempotent)하다: 테이블이 없으면 만들고, 있으면 빠진 컬럼·인덱스만 추가한다.
--    여러 번 실행해도 안전하다.
--
-- 변경 사항
--  1) lease_ledger 생성 (20260823 스키마 + exclusive_area_sqm)
--  2) exclusive_area_sqm : 렌트롤 표준양식 v1.3 '전용면적(㎡)'. lease_area_sqm(임대면적)과 별개로 저장.
--     전용 ≤ 임대 는 CHECK 로 막지 않는다 (입력 오류는 업로드 단계에서 경고만 하고 값은 보존).
--  3) (asset_id, unit_label) 고유 인덱스 — persistLeaseUnits() 는 building_ssot_lite id 를 asset_id(TEXT)로 넘기고
--     building_id 는 비운다. 비-부분 인덱스라 PostgREST upsert(on_conflict=asset_id,unit_label) 가 추론할 수 있다.
--  4) RLS 활성화 (정책 없음) — 서버의 service role 만 접근. anon/authenticated 키로는 읽기·쓰기 불가.

-- ── 1) 테이블 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lease_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id           UUID,                                           -- buildings(id) FK 는 아래 DO 블록에서 조건부 추가
  asset_id              TEXT,                                           -- building_ssot_lite id (upsert 충돌키)
  unit_label            TEXT NOT NULL,                                  -- 1. 호실/층
  contract_group        TEXT,                                           -- 2. 계약그룹 (통합계약)
  lease_area_sqm        NUMERIC(10,2),                                  -- 3. 임대면적(㎡)
  exclusive_area_sqm    NUMERIC(10,2) CHECK (exclusive_area_sqm IS NULL OR exclusive_area_sqm > 0), -- 3-1. 전용면적(㎡)
  tenant_business       TEXT,                                           -- 4. 업종/상호 (원문 그대로)
  legal_basis           VARCHAR(10) CHECK (legal_basis IN ('상가', '주택', '미확인')), -- 5. 적용법령
  deposit_krw           BIGINT,                                         -- 6. 보증금(원)
  monthly_rent_krw      BIGINT,                                         -- 7. 월세(원, VAT별도)
  mgmt_fee_krw          BIGINT DEFAULT 0,                               -- 8. 관리비(원, VAT별도)
  first_contract_date   DATE,                                           -- 9. 최초 계약일
  current_start_date    DATE,                                           -- 10. 현 계약 시작일
  current_expiry_date   DATE,                                           -- 11. 현 계약 만료일
  renewal_exercised     VARCHAR(10) CHECK (renewal_exercised IN ('있음', '없음', '모름')), -- 12. 갱신요구권 행사
  opposing_power        VARCHAR(20) CHECK (opposing_power IN ('사업자등록', '주민등록', '미확인')), -- 13. 대항력 요건
  lease_state           VARCHAR(10) NOT NULL DEFAULT '임대중' CHECK (lease_state IN ('임대중', '공실', '자가사용')), -- 14. 임대상태
  note                  TEXT,                                           -- 15. 비고
  source_tier           VARCHAR(20) DEFAULT 'broker_input',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 다른 환경에서 20260823 으로 이미 만들어진 테이블이면 전용면적 컬럼만 추가
ALTER TABLE lease_ledger
  ADD COLUMN IF NOT EXISTS exclusive_area_sqm NUMERIC(10,2)
  CHECK (exclusive_area_sqm IS NULL OR exclusive_area_sqm > 0);

-- buildings 테이블이 있을 때만 FK 연결 (없는 환경에서도 이 파일이 실패하지 않도록)
DO $$
BEGIN
  IF to_regclass('public.buildings') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.lease_ledger'::regclass
         AND contype = 'f'
         AND conname = 'lease_ledger_building_id_fkey'
     ) THEN
    ALTER TABLE lease_ledger
      ADD CONSTRAINT lease_ledger_building_id_fkey
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN lease_ledger.exclusive_area_sqm IS '전용면적(㎡) — 임차인 독점 사용 면적. 전용률 = exclusive_area_sqm / lease_area_sqm';
COMMENT ON COLUMN lease_ledger.lease_area_sqm     IS '임대면적(㎡) — 계약면적(전용 + 공용 분담분)';
COMMENT ON COLUMN lease_ledger.contract_group     IS '계약그룹 — 같은 값이면 하나의 통합계약(금액은 대표 행에만 기입)';
COMMENT ON COLUMN lease_ledger.asset_id           IS 'building_ssot_lite id — persistLeaseUnits upsert 충돌키 (asset_id, unit_label)';

-- ── 2) 인덱스 ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lease_ledger_building_id ON lease_ledger (building_id);
CREATE INDEX IF NOT EXISTS idx_lease_ledger_lease_state ON lease_ledger (lease_state);
CREATE INDEX IF NOT EXISTS idx_lease_ledger_legal_basis ON lease_ledger (legal_basis);

-- 20260823 스키마 호환 (building_id 기준 부분 고유 인덱스)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lease_ledger_building_unit
  ON lease_ledger (building_id, unit_label)
  WHERE building_id IS NOT NULL;

-- 같은 (asset_id, unit_label) 중복 행이 있으면 가장 최근 행만 남긴다 (고유 인덱스 생성 전제; 새 테이블이면 0건)
DELETE FROM lease_ledger a
USING lease_ledger b
WHERE a.asset_id IS NOT NULL
  AND a.asset_id = b.asset_id
  AND a.unit_label = b.unit_label
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lease_ledger_asset_unit
  ON lease_ledger (asset_id, unit_label);

-- ── 3) RLS ───────────────────────────────────────────────────────────────
-- 정책을 만들지 않으므로 anon/authenticated 는 접근 불가, 서버(service role)만 읽고 쓴다.
ALTER TABLE lease_ledger ENABLE ROW LEVEL SECURITY;
