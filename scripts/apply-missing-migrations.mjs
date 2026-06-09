/**
 * scripts/apply-missing-migrations.mjs
 * 
 * Supabase REST API를 통해 미적용 마이그레이션을 직접 적용합니다.
 * Supabase CLI 없이도 동작합니다.
 * 
 * Run: node scripts/apply-missing-migrations.mjs
 */

const SUPABASE_URL = 'https://vwbmaulavgjwezffbxgi.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Ym1hdWxhdmdqd2V6ZmZieGdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NDgzNSwiZXhwIjoyMDkzOTUwODM1fQ.icKlLmN0DsEEQbxAR7F-MN8OVlnBp4L-ONntWcGKks8';

// Supabase pg_sql RPC (uses Management API)
async function execSQL(sql, label) {
  const projectRef = 'vwbmaulavgjwezffbxgi';
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  
  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ ${label}: HTTP ${res.status}`, text.slice(0, 200));
    return false;
  }
  
  const json = await res.json();
  if (json.error) {
    console.error(`❌ ${label}:`, json.error);
    return false;
  }
  
  console.log(`✅ ${label}`);
  return true;
}

const migrations = [
  {
    label: '1. Fix document_objects.document_type constraint (add mobile_im, snapshot)',
    sql: `
      ALTER TABLE document_objects
        DROP CONSTRAINT IF EXISTS document_objects_document_type_check;
      ALTER TABLE document_objects
        ADD CONSTRAINT document_objects_document_type_check
        CHECK (document_type IN (
          'deal_curiosity_report','blind_teaser','buyer_fit_memo',
          'owner_prep_memo','missing_data_checklist','gate_request_note',
          'snapshot','mobile_im'
        ));
    `,
  },
  {
    label: '2. Fix document_objects.status constraint (add pending_approval, published, etc)',
    sql: `
      ALTER TABLE document_objects
        DROP CONSTRAINT IF EXISTS document_objects_status_check;
      ALTER TABLE document_objects
        ADD CONSTRAINT document_objects_status_check
        CHECK (status IN (
          'draft','generating','generated','pending_approval','published',
          'revision_needed','disclosure_checked','broker_reviewed',
          'approved_internal','shared_external','archived'
        ));
    `,
  },
  {
    label: '3. Add document_objects.broker_id column',
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='document_objects' AND column_name='broker_id'
        ) THEN
          ALTER TABLE document_objects
            ADD COLUMN broker_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `,
  },
  {
    label: '4. Add document_objects.slug column',
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='document_objects' AND column_name='slug'
        ) THEN
          ALTER TABLE document_objects ADD COLUMN slug TEXT;
          CREATE UNIQUE INDEX IF NOT EXISTS document_objects_slug_idx
            ON document_objects(slug) WHERE slug IS NOT NULL;
        END IF;
      END $$;
    `,
  },
  {
    label: '5. Add document_objects.content column',
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='document_objects' AND column_name='content'
        ) THEN
          ALTER TABLE document_objects ADD COLUMN content JSONB DEFAULT '{}';
        END IF;
      END $$;
    `,
  },
  {
    label: '6. Add building_ssot_lite.raw_address column',
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='building_ssot_lite' AND column_name='raw_address'
        ) THEN
          ALTER TABLE building_ssot_lite ADD COLUMN raw_address TEXT;
        END IF;
      END $$;
    `,
  },
  {
    label: '7. Create external_data_cache table',
    sql: `
      CREATE TABLE IF NOT EXISTS external_data_cache (
        id                           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        building_ssot_lite_id        UUID NOT NULL REFERENCES building_ssot_lite(id) ON DELETE CASCADE,
        pnu                          TEXT,
        legal_dong_code              TEXT,
        road_address                 TEXT,
        jibun_address                TEXT,
        latitude                     DOUBLE PRECISION,
        longitude                    DOUBLE PRECISION,
        building_register            JSONB DEFAULT '{}',
        building_register_fetched_at TIMESTAMPTZ,
        official_land_price          JSONB DEFAULT '{}',
        land_price_fetched_at        TIMESTAMPTZ,
        land_use_plan                JSONB DEFAULT '{}',
        land_use_fetched_at          TIMESTAMPTZ,
        comparable_transactions      JSONB DEFAULT '[]',
        transactions_fetched_at      TIMESTAMPTZ,
        location_poi                 JSONB DEFAULT '{}',
        location_fetched_at          TIMESTAMPTZ,
        created_at                   TIMESTAMPTZ DEFAULT NOW(),
        updated_at                   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS external_data_cache_ssot_unique
        ON external_data_cache (building_ssot_lite_id);
      CREATE INDEX IF NOT EXISTS external_data_cache_pnu_idx
        ON external_data_cache (pnu);
      ALTER TABLE external_data_cache ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "Service role full access to external_data_cache" ON external_data_cache;
      CREATE POLICY "Service role full access to external_data_cache"
        ON external_data_cache FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    `,
  },
  {
    label: '8. Create external_data_cache updated_at trigger',
    sql: `
      CREATE OR REPLACE FUNCTION update_external_data_cache_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS external_data_cache_updated_at ON external_data_cache;
      CREATE TRIGGER external_data_cache_updated_at
        BEFORE UPDATE ON external_data_cache
        FOR EACH ROW EXECUTE FUNCTION update_external_data_cache_updated_at();
    `,
  },
  {
    label: '9. Seed building_ssot_lite demo record (b1111111)',
    sql: `
      INSERT INTO building_ssot_lite (
        id, owner_id, created_by_role, input_type, raw_input,
        area_signal, asset_type, price_band, size_signal,
        current_use_signal, vacancy_signal, fit_summary, caution_summary,
        hidden_fields, layers, confidence, disclosure, status, raw_address
      ) VALUES (
        'b1111111-1111-1111-1111-111111111111',
        'e1a12345-1234-1234-1234-123456789abc',
        'broker', 'broker_memo',
        '강남구 테헤란로 427 소재 A급 오피스 빌딩. 연면적 약 8,500㎡, 지하3층/지상15층. 완전임대 상태 월 임대료 1.1억. WALT 2.8년. 매각 희망가 450억원.',
        '강남구 GBD (테헤란로)', '오피스 빌딩', '450억원',
        '연면적 8,500㎡ (2,571평), 지하3층/지상15층',
        '완전임대 (Multi-tenant 오피스)', '완전임대 (0% 공실)',
        '강남 GBD A급 완전임대 안정 수익형. 자산운용사·법인 사옥 최적.',
        '준공 18년 경과 설비 노후화 확인 필요. 외국계 임차인 1.8년 만기 리스크.',
        ARRAY['tenant_name','exact_address','unit_rent','seller_motivation'],
        '{
          "asset_identity": {"asset_type": "오피스 빌딩", "area_tier": "GBD_A급", "asset_grade": "A"},
          "physical_fact": {"total_area_sqm": 8500, "floors_above": 15, "floors_below": 3, "completion_year": 2007, "parking_count": 120, "vacancy_pct": 0},
          "income_signal": {"monthly_rent_krw": 110000000, "cap_rate_base_pct": 2.53, "irr_5y_base_pct": 8.4}
        }'::jsonb,
        '{"asset_type":"confirmed","price_band":"confirmed","monthly_rent":"inferred","vacancy_signal":"confirmed"}'::jsonb,
        '{"tenant_name":"redacted","exact_address":"redacted","unit_rent":"redacted"}'::jsonb,
        'snapshot_draft_ready',
        '서울특별시 강남구 테헤란로 427'
      )
      ON CONFLICT (id) DO UPDATE SET
        layers = EXCLUDED.layers,
        status = EXCLUDED.status,
        raw_address = EXCLUDED.raw_address,
        updated_at = NOW();
    `,
  },
  {
    label: '10. Seed document_objects mobile_im demo (d1111111)',
    sql: `
      INSERT INTO document_objects (
        id, owner_id, broker_id, source_type, source_id, building_id,
        document_type, visibility, status, slug, title,
        model_version, prompt_version, body, content
      ) VALUES (
        'd1111111-1111-1111-1111-111111111111',
        'e1a12345-1234-1234-1234-123456789abc',
        'e1a12345-1234-1234-1234-123456789abc',
        'building_ssot_lite',
        'b1111111-1111-1111-1111-111111111111',
        'b1111111-1111-1111-1111-111111111111',
        'mobile_im', 'public_blind', 'published',
        'demo-gbd-office-hongildong',
        '강남구 GBD A급 오피스 빌딩 — Mobile IM',
        'gpt-4o-2024-11-20', 'mobile-im-v1.2-phase0',
        '{
          "building_id": "f1111111-1111-1111-1111-111111111111",
          "blind_name": "강남구 GBD *** 오피스 빌딩",
          "area_signal": "강남구 GBD (테헤란로)",
          "asset_type": "오피스 빌딩",
          "price_band": "450억원",
          "completeness_score": 92,
          "ai_used": true,
          "readiness_score": 92
        }'::jsonb,
        '{
          "building_ssot_lite_id": "b1111111-1111-1111-1111-111111111111",
          "ai_used": true,
          "model": "gpt-4o-2024-11-20",
          "financial_summary": {
            "monthly_rent_krw": 110000000,
            "purchase_price_krw": 45000000000,
            "noi_base": 1140000000,
            "cap_rate_base": 2.53,
            "irr_5y_base": 8.4,
            "gross_yield": 2.93,
            "price_per_pyeong": 17500000
          },
          "readiness": {"score": 92, "missing": []}
        }'::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        body = EXCLUDED.body,
        status = EXCLUDED.status,
        updated_at = NOW();
    `,
  },
];

async function main() {
  console.log('🚀 Applying missing migrations to Supabase...\n');
  
  // Test Management API access first
  const testRes = await fetch(
    `https://api.supabase.com/v1/projects/vwbmaulavgjwezffbxgi/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: 'SELECT 1 as test' }),
    }
  );
  
  if (!testRes.ok) {
    const text = await testRes.text();
    console.log('⚠️  Management API not accessible (HTTP', testRes.status, ')');
    console.log('Response:', text.slice(0, 300));
    console.log('\n📋 Falling back to supabase-js direct approach...');
    await applyViaSDK();
    return;
  }
  
  console.log('✅ Management API accessible\n');
  
  let success = 0;
  let failed = 0;
  
  for (const m of migrations) {
    const ok = await execSQL(m.sql, m.label);
    if (ok) success++;
    else failed++;
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n✅ Done: ${success} succeeded, ${failed} failed`);
}

async function applyViaSDK() {
  // Fallback: use supabase-js client with service role for what we can
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  
  console.log('\n📦 Testing what is already working via SDK...');
  
  // Test mobile_im insert with current constraints
  const { error } = await client.from('document_objects').insert({
    owner_id: 'e1a12345-1234-1234-1234-123456789abc',
    source_type: 'manual',
    document_type: 'snapshot', // use existing allowed type
    visibility: 'internal_only',
    status: 'draft',
    body: { test: true },
    title: 'test-delete-me'
  }).select('id').single();
  
  if (error) {
    console.log('❌ Even snapshot type fails:', error.message);
  } else {
    console.log('✅ snapshot type works — DB connection confirmed');
  }
  
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Management API is not accessible with the service_role JWT.
    This is normal — Supabase Management API requires a separate
    Personal Access Token (PAT), not the service_role key.

📋 MANUAL ACTION REQUIRED:
   1. Go to: https://supabase.com/dashboard/project/vwbmaulavgjwezffbxgi/sql/new
   2. Copy and run the SQL from: supabase/migrations/00041_mobile_im_external_data.sql
   3. Copy and run the SQL from: supabase/migrations/00042_mobile_im_pipeline_demo_seed.sql
   4. Also run these ALTER statements:

      ALTER TABLE document_objects
        DROP CONSTRAINT IF EXISTS document_objects_document_type_check;
      ALTER TABLE document_objects
        ADD CONSTRAINT document_objects_document_type_check
        CHECK (document_type IN (
          'deal_curiosity_report','blind_teaser','buyer_fit_memo',
          'owner_prep_memo','missing_data_checklist','gate_request_note',
          'snapshot','mobile_im'
        ));
      ALTER TABLE document_objects
        DROP CONSTRAINT IF EXISTS document_objects_status_check;
      ALTER TABLE document_objects
        ADD CONSTRAINT document_objects_status_check
        CHECK (status IN (
          'draft','generating','generated','pending_approval','published',
          'revision_needed','disclosure_checked','broker_reviewed',
          'approved_internal','shared_external','archived'
        ));

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

main().catch(console.error);
