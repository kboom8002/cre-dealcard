-- 0220_magazine_upgrade.sql
-- CREDEAL v3 Phase 3: Magazine refinement

ALTER TABLE magazine_subscribers ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE magazine_subscribers ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT 'investor';
ALTER TABLE magazine_subscribers ADD COLUMN IF NOT EXISTS interest_profile JSONB DEFAULT '{}';

ALTER TABLE magazine_editions ADD COLUMN IF NOT EXISTS deal_id UUID;
ALTER TABLE magazine_editions ADD COLUMN IF NOT EXISTS asset_id UUID;
ALTER TABLE magazine_editions ADD COLUMN IF NOT EXISTS featured_teaser_ids UUID[] DEFAULT '{}';

-- Add analytics tracking
ALTER TABLE magazine_analytics_events ADD COLUMN IF NOT EXISTS visitor_fp TEXT;
