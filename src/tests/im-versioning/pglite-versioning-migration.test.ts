/**
 * @file src/tests/im-versioning/pglite-versioning-migration.test.ts
 * @description Phase P4a-1 IM Versioning Migration & Rollback Hermetic PGlite Test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';

describe('P4a-1 IM Versioning Migration & Rollback PGlite Dry-Run', () => {
  let db: PGlite;

  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261027000003_p4a_im_versioning.sql');
  const rollbackPath = path.resolve(process.cwd(), 'supabase/migrations/_rollback/20261027000003_p4a_im_versioning_rollback.sql');

  beforeEach(async () => {
    db = new PGlite();

    // Baseline prerequisite schema
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
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
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.document_objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        building_id UUID,
        owner_id UUID,
        broker_id UUID,
        document_type TEXT DEFAULT 'mobile_im_lite',
        title TEXT,
        body JSONB DEFAULT '{}'::jsonb,
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  it('migration and rollback SQL files exist on disk with non-trivial size', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    const mSql = fs.readFileSync(migrationPath, 'utf8');
    const rSql = fs.readFileSync(rollbackPath, 'utf8');
    expect(mSql.length).toBeGreaterThan(500);
    expect(rSql.length).toBeGreaterThan(200);
  });

  it('dry-run: applies migration cleanly and creates all 6 tables and versioning columns', async () => {
    const mSql = fs.readFileSync(migrationPath, 'utf8');
    await db.exec(mSql);

    // Verify all 6 tables exist
    const tablesRes = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('im_series', 'im_input_snapshots', 'im_approvals', 'im_renditions', 'im_studio_states', 'im_share_links');
    `);
    const tables = tablesRes.rows.map((r: any) => r.table_name);
    expect(tables).toContain('im_series');
    expect(tables).toContain('im_input_snapshots');
    expect(tables).toContain('im_approvals');
    expect(tables).toContain('im_renditions');
    expect(tables).toContain('im_studio_states');
    expect(tables).toContain('im_share_links');

    // Verify document_objects columns
    const colsRes = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'document_objects';
    `);
    const cols = colsRes.rows.map((r: any) => r.column_name);
    expect(cols).toContain('series_id');
    expect(cols).toContain('version_no');
    expect(cols).toContain('content_hash');
    expect(cols).toContain('doc_hash');
    expect(cols).toContain('sealed_at');
    expect(cols).toContain('seal_hash');
  });

  it('verifies stored procedures create_im_version, approve_im_version, and sealed immutability trigger', async () => {
    const mSql = fs.readFileSync(migrationPath, 'utf8');
    await db.exec(mSql);

    // Seed profile and building
    const profileRes = await db.query(`INSERT INTO public.profiles (email) VALUES ('test@example.com') RETURNING id;`);
    const profileId = (profileRes.rows[0] as any).id;

    const bRes = await db.query(`INSERT INTO public.building_ssot_lite (owner_id, address) VALUES ($1, 'Seoul Gangnam') RETURNING id;`, [profileId]);
    const buildingId = (bRes.rows[0] as any).id;

    // Create series
    const seriesRes = await db.query(`
      INSERT INTO public.im_series (building_id, owner_id, label)
      VALUES ($1, $2, 'Primary Series')
      RETURNING id;
    `, [buildingId, profileId]);
    const seriesId = (seriesRes.rows[0] as any).id;

    // 1. Call create_im_version
    const v1Res = await db.query(`
      SELECT new_version_id, new_version_no
      FROM public.create_im_version($1, 'generate', 'Test IM v1', '{"sections": []}'::jsonb, $2);
    `, [seriesId, profileId]);

    expect(v1Res.rows.length).toBe(1);
    const v1Id = (v1Res.rows[0] as any).new_version_id;
    const v1No = (v1Res.rows[0] as any).new_version_no;
    expect(v1No).toBe(1);

    // 2. Call approve_im_version
    const approveRes = await db.query(`
      SELECT public.approve_im_version($1, 'sha256:dummyhash123', $2, 'fact_om', 'Approved v1') as approved;
    `, [v1Id, profileId]);
    expect((approveRes.rows[0] as any).approved).toBe(true);

    // Verify approval record
    const appRows = await db.query(`SELECT * FROM public.im_approvals WHERE version_id = $1;`, [v1Id]);
    expect(appRows.rows.length).toBe(1);
    expect((appRows.rows[0] as any).target_hash).toBe('sha256:dummyhash123');

    // Verify document is sealed and published
    const docRow = await db.query(`SELECT status, sealed_at, seal_hash FROM public.document_objects WHERE id = $1;`, [v1Id]);
    expect((docRow.rows[0] as any).status).toBe('published');
    expect((docRow.rows[0] as any).sealed_at).not.toBeNull();
    expect((docRow.rows[0] as any).seal_hash).toBe('sha256:dummyhash123');

    // 3. Sealed immutability trigger: mutating body of sealed doc must throw exception
    await expect(
      db.query(`UPDATE public.document_objects SET body = '{"mutated": true}'::jsonb WHERE id = $1;`, [v1Id])
    ).rejects.toThrow(/SEALED_VERSION_IMMUTABLE/);

    // 4. Create v2 via create_im_version
    const v2Res = await db.query(`
      SELECT new_version_id, new_version_no
      FROM public.create_im_version($1, 'duplicate', 'Test IM v2', '{"sections": ["new"]}'::jsonb, $2);
    `, [seriesId, profileId]);
    const v2Id = (v2Res.rows[0] as any).new_version_id;
    const v2No = (v2Res.rows[0] as any).new_version_no;
    expect(v2No).toBe(2);

    // 5. Approve v2 -> v1 should become superseded
    await db.query(`
      SELECT public.approve_im_version($1, 'sha256:v2hash', $2, 'fact_om', 'Approved v2') as approved;
    `, [v2Id, profileId]);

    const v1Updated = await db.query(`SELECT status, superseded_by FROM public.document_objects WHERE id = $1;`, [v1Id]);
    expect((v1Updated.rows[0] as any).status).toBe('superseded');
    expect((v1Updated.rows[0] as any).superseded_by).toBe(v2Id);
  });

  it('dry-run: rollback cleans up all objects without leaving orphans', async () => {
    const mSql = fs.readFileSync(migrationPath, 'utf8');
    const rSql = fs.readFileSync(rollbackPath, 'utf8');

    await db.exec(mSql);
    await db.exec(rSql);

    // Verify tables dropped
    const tablesRes = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('im_series', 'im_input_snapshots', 'im_approvals', 'im_renditions', 'im_studio_states', 'im_share_links');
    `);
    expect(tablesRes.rows.length).toBe(0);

    // Verify columns dropped
    const colsRes = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'document_objects' AND column_name IN ('series_id', 'version_no', 'content_hash');
    `);
    expect(colsRes.rows.length).toBe(0);
  });
});
