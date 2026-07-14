-- 00053_broker_faq.sql
-- Vibe 명함 FAQ: 사용자 직접 입력 (최대 7개)
-- 구조: [{"q": "질문", "a": "답변"}, ...]

ALTER TABLE public.broker_profiles
  ADD COLUMN IF NOT EXISTS faq_items JSONB DEFAULT '[]';
