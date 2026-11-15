-- ============================================================
-- 00060: broker_profiles.user_id UNIQUE constraint
-- ============================================================
-- upsert(onConflict: "user_id")가 정상 작동하기 위해 필수.
-- 기존 일반 인덱스만 있었으므로 UNIQUE index로 교체.
-- ============================================================

-- 기존 일반 인덱스 제거 후 UNIQUE로 재생성
DROP INDEX IF EXISTS broker_profiles_user_id_idx;
CREATE UNIQUE INDEX broker_profiles_user_id_unique ON broker_profiles (user_id);
