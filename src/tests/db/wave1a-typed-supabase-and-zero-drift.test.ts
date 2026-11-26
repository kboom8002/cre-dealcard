import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  applyMigrationSql,
  cloneSchema,
  evaluate,
  extractRefs,
  loadSnapshot,
  pendingMigrations,
  strOf,
} from '../../../scripts/check-schema-drift';
import {
  generateSupabaseTypesSource,
  mapSqlTypeToTs,
} from '../../../scripts/generate-supabase-types';
import { NEW_FROM, scanFile } from '../../../scripts/policy-scan.mjs';
import type {
  Database,
  Json,
  RpcName,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '@/types/supabase.generated';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const GENERATED_TYPES_PATH = path.join(ROOT, 'src', 'types', 'supabase.generated.ts');

describe('Wave 1 Track 1A — Typed Supabase <Database>, AST Drift Checker & Zero-Drift Migration', () => {
  it('(1) generates deterministic Database types covering snapshot + overlaid 20261126000002 tables and RPCs', () => {
    const runA = generateSupabaseTypesSource();
    const runB = generateSupabaseTypesSource();

    // Byte-for-byte deterministic across invocations
    expect(runA.source).toBe(runB.source);
    expect(runA.tableCount).toBeGreaterThanOrEqual(175);
    expect(runA.rpcCount).toBeGreaterThanOrEqual(27);

    const diskContent = fs.readFileSync(GENERATED_TYPES_PATH, 'utf8');
    expect(diskContent).toBe(runA.source);

    // Deferred 20261004000004_magazine_referrals must be archived, not overlaid
    expect(diskContent).not.toContain('20261004000004_magazine_referrals.sql');
    expect(
      fs.existsSync(
        path.join(MIGRATIONS_DIR, '_archive', '20261004000004_magazine_referrals.deferred.sql'),
      ),
    ).toBe(true);

    // Compile-time type checks on generated Database helpers
    const sampleEventInsert: TablesInsert<'activity_events'> = {
      event_type: 'deal_card_created',
    };
    const sampleBuildingUpdate: TablesUpdate<'building_ssot_lite'> = {
      completeness_score: 85,
      verification_result: { verified: true } satisfies Json,
    };
    const sampleMetricRow: Partial<Tables<'im_generation_metrics'>> = {
      section_type: 'executive_summary',
      outcome: 'completed',
    };
    const rpcNames: RpcName[] = [
      'approve_im_version',
      'increment_preset_use_count',
      'increment_term_hit_count',
      'increment_ab_views',
      'increment_ab_clicks',
      'create_golden_version_atomic',
      'get_related_buildings',
      'match_org',
      'search_similar_deals',
      'search_similar_ims',
    ];

    expect(sampleEventInsert.event_type).toBe('deal_card_created');
    expect(sampleBuildingUpdate.completeness_score).toBe(85);
    expect(sampleMetricRow.section_type).toBe('executive_summary');
    expect(rpcNames).toHaveLength(10);

    // SQL -> TS type mapping sanity
    expect(mapSqlTypeToTs('uuid')).toBe('string');
    expect(mapSqlTypeToTs('timestamptz')).toBe('string');
    expect(mapSqlTypeToTs('numeric(10,2)')).toBe('number');
    expect(mapSqlTypeToTs('jsonb')).toBe('Json');
    expect(mapSqlTypeToTs('text[]')).toBe('string[]');
    expect(mapSqlTypeToTs('boolean')).toBe('boolean');

    // Ensure Database['public'] has required Supabase GenericSchema keys
    type PublicKeys = keyof Database['public'];
    const keys: PublicKeys[] = ['Tables', 'Views', 'Functions', 'Enums', 'CompositeTypes'];
    expect(keys).toHaveLength(5);
  });

  it('(2) exports typed Supabase client factories alongside backwards-compatible untyped factories', async () => {
    const clientMod = await import('@/lib/supabase/client');
    const serviceMod = await import('@/lib/supabase/service');
    const serverSrc = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'supabase', 'server.ts'), 'utf8');

    expect(typeof clientMod.createClient).toBe('function');
    expect(typeof clientMod.createTypedClient).toBe('function');
    expect(typeof serviceMod.createServiceClient).toBe('function');
    expect(typeof serviceMod.createTypedServiceClient).toBe('function');
    expect(serverSrc).toContain('export async function createServerSupabaseClient()');
    expect(serverSrc).toContain('export async function createTypedServerSupabaseClient()');
  });

  it('(3) resolves DISPATCH_LEDGER_TABLE & imported/joined constants in check-schema-drift and eliminates dot-filter false positives', () => {
    // Direct unit check on strOf with imported DISPATCH_LEDGER_TABLE + array.join(', ')
    const sampleFile = path.join(ROOT, 'src', 'app', 'api', 'broker', 'magazine', 'distribute', 'route.ts');
    const sampleCode = `
      import { DISPATCH_LEDGER_TABLE } from "@/domain/magazine/send-gate";
      const COLS = ['id', 'status', 'created_at'].join(', ');
      const TBL = DISPATCH_LEDGER_TABLE;
    `;
    const sf = ts.createSourceFile(sampleFile, sampleCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const varStmts = sf.statements.filter(ts.isVariableStatement);
    const colsInit = varStmts[0].declarationList.declarations[0].initializer;
    const tblInit = varStmts[1].declarationList.declarations[0].initializer;

    expect(strOf(colsInit, sf, sampleFile)).toBe('id, status, created_at');
    expect(strOf(tblInit, sf, sampleFile)).toBe('magazine_dispatch_logs');

    // Full codebase extraction check: DISPATCH_LEDGER_TABLE references must resolve to `magazine_dispatch_logs`
    const { refs, unresolved } = extractRefs();
    const dispatchRefs = refs.filter((r) => r.table === 'magazine_dispatch_logs' && r.op === 'from');
    expect(dispatchRefs.length).toBeGreaterThanOrEqual(20);
    expect(unresolved).toBeLessThan(140);

    // Zero magazine drift and near-zero/zero total drift with pending migrations overlaid
    const { schema: liveSchema, snap } = loadSnapshot();
    const pending = pendingMigrations(snap.appliedMigrations ?? []);
    const withPending = cloneSchema(liveSchema);
    for (const f of pending) {
      applyMigrationSql(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'), withPending);
    }

    const violations = evaluate(refs, withPending);
    const magViolations = violations.filter(
      (v) => /magazine/i.test(v.file) || /^magazine_/.test(v.table ?? ''),
    );
    expect(magViolations).toHaveLength(0);
    expect(violations).toHaveLength(0);

    // Dot-filter false positives (`profiles.broker_profiles`, `buyer_condition.party`) must not appear
    const dotFalsePositives = violations.filter(
      (v) =>
        (v.table === 'profiles' && v.col === 'broker_profiles') ||
        (v.table === 'buyer_condition' && v.col === 'party') ||
        (v.table === 'lease_spaces' && v.col === 'building'),
    );
    expect(dotFalsePositives).toHaveLength(0);
  }, 120_000);

  it('(4) passes policy-scan.mjs with 0 errors and executes 20261126000002 idempotently on PGlite with strict RLS & RPC lockdown', async () => {
    const migrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && /^\d{14}_/.test(f) && f.slice(0, 14) >= NEW_FROM)
      .sort();

    expect(migrationFiles).toContain('20261126000002_sota_schema_alignment_and_telemetry.sql');

    const policyErrors = migrationFiles
      .flatMap((f) => scanFile(f))
      .filter((finding) => finding.level === 'ERROR');
    expect(policyErrors).toEqual([]);

    // Verify 20261126000002 executes cleanly TWICE (100% idempotent) on bare PGlite
    const db = new PGlite();
    await db.exec(`
      CREATE TABLE public.im_golden_sets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id TEXT,
        building_id UUID,
        section_type TEXT NOT NULL,
        section_alias TEXT DEFAULT '',
        asset_type TEXT,
        price_band TEXT,
        posture TEXT,
        markdown TEXT NOT NULL,
        judge_score NUMERIC(3,1),
        was_edited BOOLEAN DEFAULT false,
        source_type TEXT DEFAULT 'auto_approve',
        version INTEGER DEFAULT 1,
        parent_id UUID,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE public.building_ssot_lite (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE public.evidence_files (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE public.im_fewshot_usage_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE public.im_projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), readiness_score INTEGER);
    `);

    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '20261126000002_sota_schema_alignment_and_telemetry.sql'),
      'utf8',
    );
    await db.exec(sql);
    await db.exec(sql); // Second run proves idempotency

    // Every base table in public must have RLS enabled (`relrowsecurity = true`)
    const unprotected = await db.query<{ relname: string }>(`
      SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname NOT IN ('im_golden_sets', 'building_ssot_lite', 'evidence_files', 'im_fewshot_usage_log', 'im_projects')
         AND NOT c.relrowsecurity
    `);
    expect(unprotected.rows).toEqual([]);

    // Verify anon cannot execute any of the 9 newly created RPCs
    const anonExec = await db.query<{ proname: string }>(`
      SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN (
           'increment_preset_use_count',
           'increment_term_hit_count',
           'increment_ab_views',
           'increment_ab_clicks',
           'create_golden_version_atomic',
           'get_related_buildings',
           'match_org',
           'search_similar_deals',
           'search_similar_ims'
         )
         AND has_function_privilege('anon', p.oid, 'EXECUTE')
    `);
    expect(anonExec.rows).toEqual([]);

    // Verify create_golden_version_atomic works atomically
    const seedRes = await db.query<{ id: string }>(`
      INSERT INTO public.im_golden_sets (document_id, section_type, asset_type, price_band, posture, markdown, judge_score)
      VALUES ('doc-1', 'overview', 'office', 'B2', 'income', 'Old markdown', 4.2)
      RETURNING id
    `);
    const oldId = seedRes.rows[0].id;
    const verRes = await db.query<{ new_id: string }>(
      `SELECT public.create_golden_version_atomic($1::uuid, 'Updated markdown', 4.8) AS new_id`,
      [oldId],
    );
    expect(verRes.rows[0].new_id).toBeTruthy();
    expect(verRes.rows[0].new_id).not.toBe(oldId);

    const checkRows = await db.query<{ id: string; is_active: boolean; version: number }>(
      `SELECT id, is_active, version FROM public.im_golden_sets ORDER BY version ASC`,
    );
    expect(checkRows.rows).toEqual([
      { id: oldId, is_active: false, version: 1 },
      { id: verRes.rows[0].new_id, is_active: true, version: 2 },
    ]);

    await db.close();
  }, 120_000);
});
