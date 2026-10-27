/**
 * @file src/tests/adversarial/m1-pglite-migration-stress.test.ts
 * @description Empirical Challenger M1: PGlite Migration & Rollback Multi-Cycle Stress Test.
 *
 * Verifies:
 * 1. 3 full cycles of Apply -> Rollback -> Apply -> Rollback -> Apply -> Rollback.
 * 2. Deep pg_catalog and information_schema inspections:
 *    - Zero leftover columns on im_generation_jobs.
 *    - Zero leftover column (pnu) on building_ssot_lite.
 *    - Zero leftover tables (jobs_v2, feature_flags).
 *    - Zero leftover indexes in pg_class / pg_index.
 *    - Zero leftover policies in pg_policies.
 * 3. building_ssot_lite input_type constraint enforcement:
 *    - 'quick_im' permitted after apply, strictly rejected after rollback.
 * 4. Data persistence & PNU generated column behavior:
 *    - Existing rows compute PNU on apply.
 *    - Unique constraint on (owner_id, pnu) enforced for active records.
 *    - Partial index allows duplicate PNU for archived records.
 *    - Rollback drops generated column without corrupting base data.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';

describe('Empirical Challenger: PGlite Migration & Rollback Multi-Cycle Stress', () => {
  let db: PGlite;

  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261027000002_p05_foundations.sql');
  const rollbackPath = path.resolve(process.cwd(), 'supabase/migrations/_rollback/20261027000002_p05_foundations_rollback.sql');

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');

  beforeEach(async () => {
    db = new PGlite();

    // Baseline schema setup
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role;
        END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$ SELECT '11111111-1111-1111-1111-111111111111'::UUID $$ LANGUAGE sql;

      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT
      );

      CREATE TABLE IF NOT EXISTS public.building_ssot_lite (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL,
        address TEXT,
        raw_register JSONB,
        layers JSONB DEFAULT '{}'::jsonb,
        input_type TEXT DEFAULT 'address',
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT building_ssot_lite_input_type_check
          CHECK (input_type IN ('address', 'broker_memo', 'voice_note', 'manual_form'))
      );

      CREATE TABLE IF NOT EXISTS public.im_generation_jobs (
        id TEXT PRIMARY KEY,
        building_id TEXT,
        status TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  it('Stress: 3 full cycles of Apply -> Rollback with zero leftover schema objects in pg_catalog', async () => {
    const jobsV2Columns = [
      'idempotency_key',
      'attempt',
      'max_attempts',
      'heartbeat_at',
      'started_at',
      'deadline_at',
      'cancel_requested',
      'stage',
      'progress',
      'error_class',
      'cost_usd',
      'llm_calls',
      'tokens',
    ];

    for (let cycle = 1; cycle <= 3; cycle++) {
      // 1. APPLY
      await db.exec(migrationSql);

      // Verify all applied objects exist
      const pnuCheck = await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'building_ssot_lite' AND column_name = 'pnu'`
      );
      expect(pnuCheck.rows.length, `Cycle ${cycle}: pnu column must exist after apply`).toBe(1);

      const jobsV2TableCheck = await db.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs_v2'`
      );
      expect(jobsV2TableCheck.rows.length, `Cycle ${cycle}: jobs_v2 table must exist after apply`).toBe(1);

      const featureFlagsCheck = await db.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'feature_flags'`
      );
      expect(featureFlagsCheck.rows.length, `Cycle ${cycle}: feature_flags table must exist after apply`).toBe(1);

      // Check all 13 columns on im_generation_jobs
      const imJobsCols = await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'im_generation_jobs'`
      );
      const appliedCols = imJobsCols.rows.map((r: any) => r.column_name);
      for (const col of jobsV2Columns) {
        expect(appliedCols, `Cycle ${cycle}: im_generation_jobs must have ${col}`).toContain(col);
      }

      // Check indexes in pg_class
      const indexesAfterApply = await db.query(`
        SELECT relname FROM pg_class WHERE relkind = 'i' AND relname IN (
          'building_ssot_lite_owner_pnu_idx',
          'im_generation_jobs_idempotency_idx',
          'jobs_v2_idempotency_idx',
          'jobs_v2_building_id_idx'
        )
      `);
      expect(indexesAfterApply.rows.length, `Cycle ${cycle}: expected indexes must exist`).toBe(4);

      // 2. ROLLBACK
      await db.exec(rollbackSql);

      // Deep inspection: verify zero leftover columns on im_generation_jobs
      const imJobsColsAfterRollback = await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'im_generation_jobs'`
      );
      const remainingCols = imJobsColsAfterRollback.rows.map((r: any) => r.column_name);
      for (const col of jobsV2Columns) {
        expect(remainingCols, `Cycle ${cycle}: im_generation_jobs must NOT have ${col} after rollback`).not.toContain(col);
      }

      // Deep inspection: verify pnu column completely gone
      const pnuAfterRollback = await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'building_ssot_lite' AND column_name = 'pnu'`
      );
      expect(pnuAfterRollback.rows.length, `Cycle ${cycle}: pnu column must be 0 after rollback`).toBe(0);

      // Deep inspection: verify tables dropped
      const tablesAfterRollback = await db.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('jobs_v2', 'feature_flags')`
      );
      expect(tablesAfterRollback.rows.length, `Cycle ${cycle}: jobs_v2 and feature_flags must be dropped`).toBe(0);

      // Deep inspection: verify indexes dropped in pg_class
      const indexesAfterRollback = await db.query(`
        SELECT relname FROM pg_class WHERE relkind = 'i' AND relname IN (
          'building_ssot_lite_owner_pnu_idx',
          'im_generation_jobs_idempotency_idx',
          'jobs_v2_idempotency_idx',
          'jobs_v2_building_id_idx',
          'jobs_v2_owner_id_idx',
          'jobs_v2_status_idx'
        )
      `);
      expect(indexesAfterRollback.rows.length, `Cycle ${cycle}: all custom indexes must be dropped`).toBe(0);

      // Deep inspection: verify policies dropped in pg_policies
      const policiesAfterRollback = await db.query(`
        SELECT policyname FROM pg_policies WHERE tablename IN ('jobs_v2', 'feature_flags')
      `);
      expect(policiesAfterRollback.rows.length, `Cycle ${cycle}: all policies on dropped tables must be gone`).toBe(0);
    }
  });

  it('input_type check constraint correctly flips: permits "quick_im" during migration and rejects after rollback', async () => {
    // 1. Before migration: 'quick_im' should fail
    let preFail = false;
    try {
      await db.exec(`
        INSERT INTO public.building_ssot_lite (owner_id, address, input_type)
        VALUES ('11111111-1111-1111-1111-111111111111', '강남구 역삼동 1', 'quick_im');
      `);
    } catch {
      preFail = true;
    }
    expect(preFail, 'Pre-migration: inserting quick_im must fail check constraint').toBe(true);

    // 2. Apply migration: 'quick_im' should succeed
    await db.exec(migrationSql);
    await db.exec(`
      INSERT INTO public.building_ssot_lite (owner_id, address, input_type)
      VALUES ('11111111-1111-1111-1111-111111111111', '강남구 역삼동 1', 'quick_im');
    `);
    const countCheck = await db.query(`SELECT COUNT(*)::int as count FROM public.building_ssot_lite WHERE input_type = 'quick_im'`);
    expect((countCheck.rows[0] as any).count).toBe(1);

    // Clean up quick_im row before rollback
    await db.exec(`DELETE FROM public.building_ssot_lite WHERE input_type = 'quick_im'`);

    // 3. Rollback: 'quick_im' should fail again
    await db.exec(rollbackSql);
    let postFail = false;
    try {
      await db.exec(`
        INSERT INTO public.building_ssot_lite (owner_id, address, input_type)
        VALUES ('11111111-1111-1111-1111-111111111111', '강남구 역삼동 1', 'quick_im');
      `);
    } catch {
      postFail = true;
    }
    expect(postFail, 'Post-rollback: inserting quick_im must fail check constraint again').toBe(true);

    // Standard input_type must still succeed
    await db.exec(`
      INSERT INTO public.building_ssot_lite (owner_id, address, input_type)
      VALUES ('11111111-1111-1111-1111-111111111111', '강남구 역삼동 1', 'address');
    `);
    const addrCheck = await db.query(`SELECT COUNT(*)::int as count FROM public.building_ssot_lite WHERE input_type = 'address'`);
    expect((addrCheck.rows[0] as any).count).toBe(1);
  });

  it('PNU generated column: calculates correctly on existing data and enforces unique constraint', async () => {
    const ownerA = '11111111-1111-1111-1111-111111111111';
    const ownerB = '22222222-2222-2222-2222-222222222222';

    // Insert pre-existing rows before migration
    await db.exec(`
      INSERT INTO public.building_ssot_lite (id, owner_id, address, layers, status)
      VALUES 
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '${ownerA}', '역삼동 101', '{"location": {"pnu": "1168010100101010001"}}', 'draft'),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '${ownerA}', '역삼동 102', '{"pnu": "1168010100101020002"}', 'draft'),
        ('cccccccc-cccc-cccc-cccc-cccccccccccc', '${ownerB}', '역삼동 101 (Different Owner)', '{"location": {"pnu": "1168010100101010001"}}', 'draft');
    `);

    // Apply migration
    await db.exec(migrationSql);

    // Verify PNU calculation
    const rows = await db.query(`SELECT id, pnu FROM public.building_ssot_lite ORDER BY address`);
    const pnuMap = new Map(rows.rows.map((r: any) => [r.id, r.pnu]));

    expect(pnuMap.get('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe('1168010100101010001');
    expect(pnuMap.get('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).toBe('1168010100101020002');
    expect(pnuMap.get('cccccccc-cccc-cccc-cccc-cccccccccccc')).toBe('1168010100101010001');

    // Adversarial: inserting duplicate (owner_id, pnu) for active record must FAIL
    let dupFail = false;
    try {
      await db.exec(`
        INSERT INTO public.building_ssot_lite (owner_id, address, layers, status)
        VALUES ('${ownerA}', '역삼동 101 중복시도', '{"location": {"pnu": "1168010100101010001"}}', 'draft');
      `);
    } catch {
      dupFail = true;
    }
    expect(dupFail, 'Duplicate (owner_id, pnu) for active draft must violate unique constraint').toBe(true);

    // Partial Index test: inserting duplicate (owner_id, pnu) for ARCHIVED record must SUCCEED
    await db.exec(`
      INSERT INTO public.building_ssot_lite (owner_id, address, layers, status)
      VALUES ('${ownerA}', '역삼동 101 아카이브', '{"location": {"pnu": "1168010100101010001"}}', 'archived');
    `);
    const archCheck = await db.query(`SELECT COUNT(*)::int as count FROM public.building_ssot_lite WHERE status = 'archived'`);
    expect((archCheck.rows[0] as any).count).toBe(1);

    // Rollback test: base data intact
    await db.exec(rollbackSql);
    const postRollbackRows = await db.query(`SELECT id, address, status FROM public.building_ssot_lite ORDER BY address`);
    expect(postRollbackRows.rows.length).toBe(4);
    expect(postRollbackRows.rows[0]).toHaveProperty('address');
    expect(postRollbackRows.rows[0]).not.toHaveProperty('pnu');
  });
});
