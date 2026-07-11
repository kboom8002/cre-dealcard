-- supabase/migrations/00064_broker_avatars_bucket.sql
-- Fix: broker-avatars Storage 버킷 생성 (코드에서 사용하지만 마이그레이션 누락)
-- broker-photos 버킷과 동일한 RLS 정책 적용

-- 1. broker-avatars 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('broker-avatars', 'broker-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. 공개 읽기 허용
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public read broker-avatars'
  ) THEN
    CREATE POLICY "Public read broker-avatars"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'broker-avatars');
  END IF;
END $$;

-- 3. 인증 사용자 업로드 허용
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated upload broker-avatars'
  ) THEN
    CREATE POLICY "Authenticated upload broker-avatars"
      ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'broker-avatars'
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;

-- 4. 소유자 수정 허용
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Owner manage broker-avatars'
  ) THEN
    CREATE POLICY "Owner manage broker-avatars"
      ON storage.objects
      FOR UPDATE
      USING (
        bucket_id = 'broker-avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

-- 5. 소유자 삭제 허용
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Owner delete broker-avatars'
  ) THEN
    CREATE POLICY "Owner delete broker-avatars"
      ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'broker-avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;
