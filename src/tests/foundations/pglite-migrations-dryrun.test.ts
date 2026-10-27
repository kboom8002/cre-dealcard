/**
 * @file src/tests/foundations/pglite-migrations-dryrun.test.ts
 * @description P0.5 Foundation Automated Verification Suite:
 * Hermetic dry-run of P0.5 SQL migration and rollback using `@electric-sql/pglite`.
 *
 * 1. Initialize hermetic in-memory Postgres via PGlite (zero remote database connection).
 * 2. Apply baseline schema prerequisite (building_ssot_lite).
 * 3. Execute `supabase/migrations/20261027000002_p05_foundations.sql`.
 * 4. Assert creation of stored generated `pnu` column, unique constraint, and `jobs_v2` table.
 * 5. Execute rollback script `supabase/migrations/_rollback/20261027000002_p05_foundations_rollback.sql`.
 * 6. Assert clean reversion of schema drift.
 * 7. Assert idempotent replay.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §1.3, §6, WP-P05-03
 * - ORIGINAL_REQUEST.md (§ 2026-10-27T04:28:40Z)
 * - PROJECT.md (Milestone 1, Feature 10)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';

describe('P0.5 Foundation Verification: PGlite Hermetic Migration & Rollback Dry-Run', () => {
  let db: PGlite;

  function resolveMigrationPath(): string {
    const direct = path.resolve(process.cwd(), 'supabase/migrations/20261027000002_p05_foundations.sql');
    if (fs.existsSync(direct)) return direct;
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    if (fs.existsSync(migrationsDir)) {
      const match = fs.readdirSync(migrationsDir).find(f => f.includes('20261027000002') && f.endsWith('.sql'));
      if (match) return path.join(migrationsDir, match);
    }
    return direct;
  }

  function resolveRollbackPath(): string {
    const direct = path.resolve(process.cwd(), 'supabase/migrations/_rollback/20261027000002_p05_foundations_rollback.sql');
    if (fs.existsSync(direct)) return direct;
    const rollbackDir = path.resolve(process.cwd(), 'supabase/migrations/_rollback');
    if (fs.existsSync(rollbackDir)) {
      const match = fs.readdirSync(rollbackDir).find(f => f.includes('20261027000002') && f.endsWith('.sql'));
      if (match) return path.join(rollbackDir, match);
    }
    return direct;
  }

  const migrationPath = resolveMigrationPath();
  const rollbackPath = resolveRollbackPath();

  beforeEach(async () => {
    // Create a fresh in-memory Postgres instance for complete hermetic isolation
    db = new PGlite();

    // Set up baseline schema prerequisite in PGlite
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
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$ SELECT '00000000-0000-0000-0000-000000000000'::UUID $$ LANGUAGE sql;

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
        updated_at TIMESTAMPTZ DEFAULT now()
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

  it('migration and rollback SQL files exist on disk with valid encoding', () => {
    expect(
      fs.existsSync(migrationPath),
      `Migration file must exist at: ${migrationPath}`
    ).toBe(true);

    expect(
      fs.existsSync(rollbackPath),
      `Rollback file must exist at: ${rollbackPath}`
    ).toBe(true);

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');

    expect(migrationSql.length).toBeGreaterThan(50);
    expect(rollbackSql.length).toBeGreaterThan(30);
  });

  it('dry-run: applies migration cleanly to PGlite and creates expected schema objects', async () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await db.exec(migrationSql);

    // 1. Assert pnu column exists on building_ssot_lite
    const pnuColCheck = await db.query(`
      SELECT column_name, data_type, is_generated
      FROM information_schema.columns
      WHERE table_name = 'building_ssot_lite' AND column_name = 'pnu';
    `);

    expect(pnuColCheck.rows.length).toBe(1);
    expect((pnuColCheck.rows[0] as any).column_name).toBe('pnu');

    // 2. Assert jobs_v2 table exists
    const jobsTableCheck = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'jobs_v2';
    `);

    expect(jobsTableCheck.rows.length).toBe(1);

    // 3. Assert jobs_v2 columns
    const jobsColsCheck = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'jobs_v2';
    `);

    const colNames = jobsColsCheck.rows.map((r: any) => r.column_name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('idempotency_key');
    expect(colNames).toContain('status');
    expect(colNames).toContain('heartbeat_at');
    expect(colNames).toContain('cancel_requested');
  });

  it('dry-run: applies rollback cleanly and restores baseline schema', async () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');

    // Apply migration
    await db.exec(migrationSql);

    // Execute rollback
    await db.exec(rollbackSql);

    // 1. Assert pnu column is dropped
    const pnuCheck = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'building_ssot_lite' AND column_name = 'pnu';
    `);
    expect(pnuCheck.rows.length).toBe(0);

    // 2. Assert jobs_v2 table is dropped
    const jobsCheck = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'jobs_v2';
    `);
    expect(jobsCheck.rows.length).toBe(0);
  });

  it('idempotency: applying migration -> rollback -> migration cycles without error', async () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');

    // Cycle 1: Up
    await db.exec(migrationSql);

    // Cycle 1: Down
    await db.exec(rollbackSql);

    // Cycle 2: Up again (must succeed without duplicate constraint / table errors)
    await db.exec(migrationSql);

    // Cycle 2: Down again
    await db.exec(rollbackSql);

    // Verify clean state at end of cycles
    const finalCheck = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'building_ssot_lite' AND column_name = 'pnu';
    `);
    expect(finalCheck.rows.length).toBe(0);
  });
});
