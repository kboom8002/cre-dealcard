-- 0230_subscriber_interest_tags.sql
-- 매수자 관심사 프로필 확장 (권역, 자산유형, 토픽, 취미)

ALTER TABLE public.magazine_subscribers
  ADD COLUMN IF NOT EXISTS interest_tags JSONB DEFAULT '{}'::jsonb;

-- interest_tags JSONB 스키마 구조:
-- {
--   "regions": ["성수", "강남"],
--   "assetTypes": ["꼬마빌딩", "오피스"],
--   "topics": ["세무", "밸류업", "금융", "상권"],
--   "hobbies": ["골프", "와인", "미술"]
-- }

COMMENT ON COLUMN public.magazine_subscribers.interest_tags IS
  '매수자 개인화 관심사 태그 (희망 권역, 관심 자산유형, 전문 토픽, 라이프스타일/취미)';
