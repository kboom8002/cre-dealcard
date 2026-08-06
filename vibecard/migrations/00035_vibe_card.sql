-- supabase/migrations/00035_vibe_card.sql
-- Vibe AI mobile business card — schema additions

-- 1. Add photo/tagline to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS tagline text;

-- 2. Add vibe analysis columns to broker_profiles
ALTER TABLE broker_profiles
  ADD COLUMN IF NOT EXISTS vibe_vector jsonb,
  ADD COLUMN IF NOT EXISTS vibe_vti text,
  ADD COLUMN IF NOT EXISTS vibe_complement jsonb,
  ADD COLUMN IF NOT EXISTS vibe_template_id text,
  ADD COLUMN IF NOT EXISTS vibe_valence numeric,
  ADD COLUMN IF NOT EXISTS vibe_trust numeric,
  ADD COLUMN IF NOT EXISTS vibe_analyzed_at timestamptz;

-- 3. Index for fast VTI-based queries
CREATE INDEX IF NOT EXISTS idx_broker_profiles_vibe_vti
  ON broker_profiles (vibe_vti)
  WHERE vibe_vti IS NOT NULL;

-- 4. Storage bucket for broker profile photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('broker-photos', 'broker-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read on broker-photos
CREATE POLICY "Public read broker-photos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'broker-photos');

-- Allow authenticated users to upload their own photos
CREATE POLICY "Authenticated upload broker-photos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'broker-photos'
    AND auth.role() = 'authenticated'
  );

-- Allow users to update/delete their own photos
CREATE POLICY "Owner manage broker-photos"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'broker-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Owner delete broker-photos"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'broker-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
