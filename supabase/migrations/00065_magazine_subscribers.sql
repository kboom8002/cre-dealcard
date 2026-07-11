-- supabase/migrations/00065_magazine_subscribers.sql
-- 매거진 구독자 관리 테이블 및 RPC 추가

-- 1. 매거진 구독자 테이블 생성
CREATE TABLE IF NOT EXISTS public.magazine_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  broker_id TEXT NOT NULL,              -- 브로커 slug
  subscriber_phone TEXT,                -- 구독자 전화번호 (알림톡용)
  subscriber_email TEXT,                -- 구독자 이메일
  subscriber_name TEXT,                 -- 구독자 이름
  channel TEXT NOT NULL DEFAULT 'kakao' -- 'kakao' | 'email' | 'both'
    CHECK (channel IN ('kakao', 'email', 'both')),
  status TEXT NOT NULL DEFAULT 'active' -- 'active' | 'paused' | 'unsubscribed'
    CHECK (status IN ('active', 'paused', 'unsubscribed')),
  source TEXT DEFAULT 'manual'          -- 'manual' | 'vibe_card' | 'magazine' | 'im'
    CHECK (source IN ('manual', 'vibe_card', 'magazine', 'im')),
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- 동일 브로커에 동일 전화번호 중복 방지
  UNIQUE (broker_id, subscriber_phone)
);

-- 브로커별 구독자 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_mag_sub_broker
  ON public.magazine_subscribers (broker_id, status);

-- RLS 활성화
ALTER TABLE public.magazine_subscribers ENABLE ROW LEVEL SECURITY;

-- 브로커는 자기 구독자만 관리할 수 있도록 정책 생성
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Broker manages own subscribers'
  ) THEN
    CREATE POLICY "Broker manages own subscribers" ON public.magazine_subscribers
      FOR ALL USING (
        broker_id IN (
          SELECT slug FROM public.broker_profiles WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 공개 구독 (구독 폼에서 누구나 가입 가능)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public subscribe'
  ) THEN
    CREATE POLICY "Public subscribe" ON public.magazine_subscribers
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 2. broker_profiles에 pending_magazine_deals 컬럼 추가 (Phase 2-2용)
ALTER TABLE public.broker_profiles
  ADD COLUMN IF NOT EXISTS pending_magazine_deals JSONB DEFAULT '[]'::jsonb;

-- 3. IM→Magazine 자동 적재 RPC 함수 생성
CREATE OR REPLACE FUNCTION public.append_magazine_deal_snippet(
  p_user_id UUID,
  p_snippet JSONB
) RETURNS VOID AS $$
BEGIN
  UPDATE public.broker_profiles
  SET pending_magazine_deals = COALESCE(pending_magazine_deals, '[]'::jsonb) || p_snippet
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.magazine_subscribers IS '매거진 구독자 관리 테이블. source 필드로 가입 경로 추적.';
