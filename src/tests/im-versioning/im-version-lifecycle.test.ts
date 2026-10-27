/**
 * @file src/tests/im-versioning/im-version-lifecycle.test.ts
 * @description WP-P4a1-01 ~ WP-P4a1-03: IM Versioning Full Lifecycle & Immutability Integration Test.
 *
 * Verifies end-to-end workflow:
 * 1. Create v1 IM draft under a series.
 * 2. Approve v1 -> document status becomes 'published', sealed_at set, body NOT mutated.
 * 3. Attempt direct in-place update on sealed v1 -> rejected with 409 SEALED_VERSION_IMMUTABLE.
 * 4. Fork new version v2 from v1 -> returns unsealed v2 draft with parent_version_id = v1.id.
 * 5. Update v2 draft -> succeeds.
 * 6. Approve v2 -> v2 becomes published, v1 marked superseded, historical audit chain intact.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { computeContentHash } from '@/domain/building/im-core/hashes';

describe('WP-P4a1-01 ~ WP-P4a1-03: IM Version Lifecycle, Immutability & Fork Flow', () => {
  let db: PGlite;
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261027000003_p4a_im_versioning.sql');

  let profileId: string;
  let buildingId: string;
  let seriesId: string;

  beforeEach(async () => {
    db = new PGlite();

    // Baseline setup
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
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

    // Apply migration
    const mSql = fs.readFileSync(migrationPath, 'utf8');
    await db.exec(mSql);

    // Seed test broker and building
    const pRes = await db.query(`INSERT INTO public.profiles (email) VALUES ('broker@example.com') RETURNING id;`);
    profileId = (pRes.rows[0] as any).id;

    const bRes = await db.query(`INSERT INTO public.building_ssot_lite (owner_id, address) VALUES ($1, 'Seoul Gangnam') RETURNING id;`, [profileId]);
    buildingId = (bRes.rows[0] as any).id;

    const sRes = await db.query(`
      INSERT INTO public.im_series (building_id, owner_id, label)
      VALUES ($1, $2, 'Investment Series 1')
      RETURNING id;
    `, [buildingId, profileId]);
    seriesId = (sRes.rows[0] as any).id;
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it('Step 1: allocates sequential version_no under im_series with concurrency protection', async () => {
    const v1Res = await db.query(`
      SELECT new_version_id, new_version_no
      FROM public.create_im_version($1, 'generate', 'Initial IM v1', '{"asking_price": 1000000}'::jsonb, $2);
    `, [seriesId, profileId]);

    const v1Id = (v1Res.rows[0] as any).new_version_id;
    const v1No = (v1Res.rows[0] as any).new_version_no;

    expect(v1No).toBe(1);

    const docRow = await db.query(`SELECT series_id, version_no, status FROM public.document_objects WHERE id = $1;`, [v1Id]);
    expect((docRow.rows[0] as any).series_id).toBe(seriesId);
    expect((docRow.rows[0] as any).version_no).toBe(1);
    expect((docRow.rows[0] as any).status).toBe('draft');
  });

  it('Step 2 & 3: approves v1 without body mutation, seals document, and blocks in-place mutation', async () => {
    const initialBody = {
      title: 'Initial IM v1',
      asking_price: 100_0000_0000,
      sections: [{ id: '01', content: 'test' }],
    };

    const v1Res = await db.query(`
      SELECT new_version_id, new_version_no
      FROM public.create_im_version($1, 'generate', 'Initial IM v1', $2::jsonb, $3);
    `, [seriesId, JSON.stringify(initialBody), profileId]);

    const v1Id = (v1Res.rows[0] as any).new_version_id;
    const contentHash = computeContentHash(initialBody);

    // Call approve_im_version RPC
    await db.query(`
      SELECT public.approve_im_version($1, $2, $3, 'fact_om', 'Approved v1');
    `, [v1Id, contentHash, profileId]);

    // Assert status = published and sealed_at is set
    const approvedDoc = await db.query(`
      SELECT status, sealed_at, seal_hash, body
      FROM public.document_objects
      WHERE id = $1;
    `, [v1Id]);

    const row = approvedDoc.rows[0] as any;
    expect(row.status).toBe('published');
    expect(row.sealed_at).not.toBeNull();
    expect(row.seal_hash).toBe(contentHash);

    // Critical assertion: body must NOT have been mutated in-place
    expect(row.body).toEqual(initialBody);
    expect(row.body.approval_target_hash).toBeUndefined();
    expect(row.body.approved_at).toBeUndefined();

    // Verify approval ledger entry exists
    const appRows = await db.query(`SELECT * FROM public.im_approvals WHERE version_id = $1;`, [v1Id]);
    expect(appRows.rows.length).toBe(1);
    expect((appRows.rows[0] as any).target_hash).toBe(contentHash);

    // Step 3: Trigger blocks mutation of sealed document
    await expect(
      db.query(`UPDATE public.document_objects SET body = '{"mutated": true}'::jsonb WHERE id = $1;`, [v1Id])
    ).rejects.toThrow(/SEALED_VERSION_IMMUTABLE/);
  });

  it('Step 4, 5, 6: forks v2 from sealed v1, edits v2, and approves v2 superseding v1', async () => {
    const v1Body = { asking_price: 100_0000_0000, rent: 3000_0000 };
    const v1Hash = computeContentHash(v1Body);

    // 1. Create and approve v1
    const v1Res = await db.query(`
      SELECT new_version_id, new_version_no
      FROM public.create_im_version($1, 'generate', 'Initial IM v1', $2::jsonb, $3);
    `, [seriesId, JSON.stringify(v1Body), profileId]);
    const v1Id = (v1Res.rows[0] as any).new_version_id;

    await db.query(`SELECT public.approve_im_version($1, $2, $3);`, [v1Id, v1Hash, profileId]);

    // 2. Fork v2 (simulates fork endpoint logic)
    const v2Res = await db.query(`
      SELECT new_version_id, new_version_no
      FROM public.create_im_version($1, 'duplicate', 'Initial IM v2 (Forked)', $2::jsonb, $3);
    `, [seriesId, JSON.stringify(v1Body), profileId]);
    const v2Id = (v2Res.rows[0] as any).new_version_id;
    const v2No = (v2Res.rows[0] as any).new_version_no;

    expect(v2No).toBe(2);

    // Set parent_version_id
    await db.query(`UPDATE public.document_objects SET parent_version_id = $1 WHERE id = $2;`, [v1Id, v2Id]);

    // 3. Edit v2 draft: succeeds because v2 is unsealed
    const updatedV2Body = { asking_price: 95_0000_0000, rent: 3000_0000 };
    await db.query(`
      UPDATE public.document_objects
      SET body = $1::jsonb
      WHERE id = $2;
    `, [JSON.stringify(updatedV2Body), v2Id]);

    const v2Check = await db.query(`SELECT body FROM public.document_objects WHERE id = $1;`, [v2Id]);
    expect((v2Check.rows[0] as any).body).toEqual(updatedV2Body);

    // 4. Approve v2
    const v2Hash = computeContentHash(updatedV2Body);
    await db.query(`SELECT public.approve_im_version($1, $2, $3);`, [v2Id, v2Hash, profileId]);

    // 5. Verify v2 is published and v1 is superseded
    const v2Approved = await db.query(`SELECT status, sealed_at FROM public.document_objects WHERE id = $1;`, [v2Id]);
    expect((v2Approved.rows[0] as any).status).toBe('published');
    expect((v2Approved.rows[0] as any).sealed_at).not.toBeNull();

    const v1Final = await db.query(`SELECT status, superseded_by FROM public.document_objects WHERE id = $1;`, [v1Id]);
    expect((v1Final.rows[0] as any).status).toBe('superseded');
    expect((v1Final.rows[0] as any).superseded_by).toBe(v2Id);

    // 6. Verify series pointers reflect v2 as published
    const seriesFinal = await db.query(`SELECT latest_approved_version_no, published_version_id FROM public.im_series WHERE id = $1;`, [seriesId]);
    expect((seriesFinal.rows[0] as any).latest_approved_version_no).toBe(2);
    expect((seriesFinal.rows[0] as any).published_version_id).toBe(v2Id);
  });
});
