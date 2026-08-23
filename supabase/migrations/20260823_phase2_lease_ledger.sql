-- Phase 2: lease_ledger 단일 원장 통합 마이그레이션
-- Spec: API_TYPE_CONTRACT.md (D3 §3.2)
-- 2026-08-23

CREATE TABLE IF NOT EXISTS lease_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id           UUID REFERENCES buildings(id) ON DELETE CASCADE,
  asset_id              TEXT,                                           -- 외부/레거시 식별자 매핑
  unit_label            TEXT NOT NULL,                                  -- 1. 호실/층
  contract_group        TEXT,                                           -- 2. 계약그룹 (통합계약 등)
  lease_area_sqm        NUMERIC(10,2),                                  -- 3. 임대면적(㎡)
  tenant_business       TEXT,                                           -- 4. 업종/상호 (원문 그대로)
  legal_basis           VARCHAR(10) CHECK (legal_basis IN ('상가', '주택', '미확인')), -- 5. 적용법령
  deposit_krw           BIGINT,                                         -- 6. 보증금(원)
  monthly_rent_krw      BIGINT,                                         -- 7. 월세(원, VAT별도)
  mgmt_fee_krw          BIGINT DEFAULT 0,                               -- 8. 관리비(원, VAT별도)
  first_contract_date   DATE,                                           -- 9. 최초 계약일 (YYYY-MM-DD)
  current_start_date    DATE,                                           -- 10. 현 계약 시작일 (YYYY-MM-DD)
  current_expiry_date   DATE,                                           -- 11. 현 계약 만료일 (YYYY-MM-DD)
  renewal_exercised     VARCHAR(10) CHECK (renewal_exercised IN ('있음', '없음', '모름')), -- 12. 갱신요구권 행사
  opposing_power        VARCHAR(20) CHECK (opposing_power IN ('사업자등록', '주민등록', '미확인')), -- 13. 대항력 요건
  lease_state           VARCHAR(10) NOT NULL DEFAULT '임대중' CHECK (lease_state IN ('임대중', '공실', '자가사용')), -- 14. 임대상태
  note                  TEXT,                                           -- 15. 비고
  source_tier           VARCHAR(20) DEFAULT 'broker_input',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 고속 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_lease_ledger_building_id
  ON lease_ledger (building_id);

CREATE INDEX IF NOT EXISTS idx_lease_ledger_lease_state
  ON lease_ledger (lease_state);

CREATE INDEX IF NOT EXISTS idx_lease_ledger_legal_basis
  ON lease_ledger (legal_basis);

-- 복합 고유 제약조건 (building_id + unit_label)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lease_ledger_building_unit
  ON lease_ledger (building_id, unit_label)
  WHERE building_id IS NOT NULL;
