-- ============================================================
-- 00061: Vibe 명함 커스텀 이름/타이틀
-- ============================================================
-- card_name: 명함 표시 이름 (NULL이면 profiles.display_name 사용)
-- card_title: 이름 아래 타이틀 (기본: '공인중개사')

ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS card_name text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS card_title text DEFAULT '공인중개사';
