-- E-1: v0.4 온톨로지 스냅샷 백업 (비가역 전환 전 안전망)
-- 실행 시점: V5-4 L×P 등급 전환 착수 직전
-- 롤백: DROP TABLE IF EXISTS _v04_snapshot_* (스냅샷 테이블 삭제만으로 원복 가능)

BEGIN;

  -- 1. 핵심 테이블 5종 스냅샷
  CREATE TABLE IF NOT EXISTS _v04_snapshot_deals AS TABLE deals;
  CREATE TABLE IF NOT EXISTS _v04_snapshot_ssot AS TABLE building_ssot_lite;
  CREATE TABLE IF NOT EXISTS _v04_snapshot_publish AS TABLE publish_records;
  CREATE TABLE IF NOT EXISTS _v04_snapshot_golden AS TABLE im_golden_sets;
  CREATE TABLE IF NOT EXISTS _v04_snapshot_lease AS TABLE lease_ledger;

  -- 2. 건수 검증 (불일치 시 즉시 롤백)
  DO $$ DECLARE
    d1 BIGINT; d2 BIGINT;
    s1 BIGINT; s2 BIGINT;
    p1 BIGINT; p2 BIGINT;
  BEGIN
    SELECT count(*) INTO d1 FROM deals;
    SELECT count(*) INTO d2 FROM _v04_snapshot_deals;
    IF d1 != d2 THEN RAISE EXCEPTION 'Snapshot mismatch for deals: % vs %', d1, d2; END IF;

    SELECT count(*) INTO s1 FROM building_ssot_lite;
    SELECT count(*) INTO s2 FROM _v04_snapshot_ssot;
    IF s1 != s2 THEN RAISE EXCEPTION 'Snapshot mismatch for ssot: % vs %', s1, s2; END IF;

    SELECT count(*) INTO p1 FROM publish_records;
    SELECT count(*) INTO p2 FROM _v04_snapshot_publish;
    IF p1 != p2 THEN RAISE EXCEPTION 'Snapshot mismatch for publish: % vs %', p1, p2; END IF;

    RAISE NOTICE 'V5-0 snapshot verified: deals=%, ssot=%, publish=%', d1, s1, p1;
  END $$;

COMMIT;
