// @vitest-environment node
/**
 * Wave 7.8 — WP-7.8C IM Security, Sync & Studio Closure + Sub-14px Gate Suite
 *
 * Covers:
 *  1. IM P0-1: `POST /api/broker/im/upload-photo` & `POST /api/im/validate` & `/api/broker/share-link`
 *     - Non-UUID `bld-fresh-123` succeeds (`200`) with `drafts/<userId>/bld-fresh-123/im-photos/...`
 *       even when `building_ssot_lite.eq('id', nonUuid)` throws Postgres `22P02`.
 *     - Rejects foreign non-UUID `workspace_items` with `403`.
 *  2. IM P0-2: `optimizeImageForPptx` SSRF, redirect bypass, stream cap & local path confinement
 *     - Blocks `http://169.254.169.254/latest/meta-data/`, `https://127.0.0.1/img.png`,
 *       `https://10.0.0.1/img.png`, `/etc/passwd`, `../../.env.local`, and `src/proxy.ts` (`null`).
 *     - Enforces `redirect: 'error'` and aborts oversized `>10MB` `ReadableStream` bodies (`null`).
 *  3. IM P0-4b: `fetchIMData` prioritizes active `workspace_items` over legacy `im_deleted` events.
 *  4. IM P1-1: `POST /api/broker/im-lite/[id]/fork` populates `source_type: 'building_ssot_lite'` & `source_id`.
 *  5. IM P1-2 / P1-3: `GET /api/broker/share-link?buildingId=...` filters strictly to `buildingId`,
 *     and `POST /api/broker/share-link` `{ buildingId }` mints a verifiable `slk.*` share token.
 *  6. IM P1-4 / P2-1 / UI P1-4:
 *     - `ALLOWED_PUBLIC_IM_PRO_STATUSES` accepts `'broker_reviewed'` and `'shared_external'`.
 *     - Studio components (`SlideEditor`, `HeaderFooterEditor`, `GalleryCurator`) contain 0 `FileReader.readAsDataURL`
 *       bypasses and 0 sub-14px tokens.
 *     - `SUB14_LOCKED_FILES` and `.github/workflows/ci.yml` lock `src/app/admin` & `src/components/admin`.
 */

import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resetWorkspaceRepositoryCacheForTests } from '@/lib/workspace/workspace-repository';
import {
  resetShareLinkTokenStoreForTests,
  verifyShareLinkToken,
} from '@/lib/security/share-link-tokens';
import { clearQuickImStoreForTest } from '@/lib/im-lite/quick-generate-store';

const OWNER_ID = '11117800-7800-4111-8111-111111117801';
const OTHER_ID = '22227800-7800-4222-8222-222222227802';
const BLD_UUID_A = 'aaaa7800-7800-4111-8111-aaaaaaaa7801';
const BLD_UUID_B = 'bbbb7800-7800-4222-8222-bbbbbbbb7802';
const DOC_UUID_1 = 'dddd7800-7800-4333-8333-dddddddd7803';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TINY_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

interface DbRow {
  [key: string]: unknown;
}

const UUID_ID_TABLES = new Set(['building_ssot_lite', 'deals', 'document_objects']);
const UUID_DEAL_TABLES = new Set(['share_link']);

const state = vi.hoisted(() => ({
  tables: {} as Record<string, DbRow[]>,
  insertedPayloads: [] as Array<{ table: string; payload: DbRow }>,
  failInsert42703OnceOnDocObjects: false,
  authUser: {
    id: '11117800-7800-4111-8111-111111117801',
    email: 'owner78c@credeal.kr',
  } as { id: string; email?: string } | null,
  authRole: 'broker' as 'broker' | 'admin' | null,
  storageUploads: [] as Array<{ bucket: string; path: string; contentType?: string; bytes: number }>,
}));

function buildInMemoryServiceClient() {
  const ensure = (table: string): DbRow[] => {
    if (!state.tables[table]) state.tables[table] = [];
    return state.tables[table];
  };

  const from = (table: string) => {
    const filters: Array<(row: DbRow) => boolean> = [];
    let pendingUuidError: { code: string; message: string } | null = null;
    let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: DbRow | DbRow[] | null = null;
    let limitCount: number | null = null;

    const recordInvalidUuidIfNeeded = (col: string, val: unknown) => {
      const strVal = String(val ?? '');
      if (UUID_ID_TABLES.has(table) && col === 'id' && !UUID_RE.test(strVal)) {
        pendingUuidError = {
          code: '22P02',
          message: `invalid input syntax for type uuid: "${strVal}"`,
        };
      }
      if (UUID_DEAL_TABLES.has(table) && col === 'deal_id' && !UUID_RE.test(strVal)) {
        pendingUuidError = {
          code: '22P02',
          message: `invalid input syntax for type uuid: "${strVal}"`,
        };
      }
    };

    const execute = () => {
      if (pendingUuidError) {
        return { data: null, error: pendingUuidError, count: null };
      }
      if (op === 'insert' && table === 'document_objects' && state.failInsert42703OnceOnDocObjects) {
        state.failInsert42703OnceOnDocObjects = false;
        return {
          data: null,
          error: { code: '42703', message: 'column "series_id" of relation "document_objects" does not exist' },
          count: null,
        };
      }

      const rows = ensure(table);

      if (op === 'select') {
        let matched = rows.filter((r) => filters.every((fn) => fn(r))).map((r) => structuredClone(r));
        if (limitCount !== null) matched = matched.slice(0, limitCount);
        return { data: matched, error: null, count: matched.length };
      }

      if (op === 'insert') {
        const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
        const inserted = items.map((it, idx) => {
          const clone = structuredClone(it);
          state.insertedPayloads.push({ table, payload: clone });
          const rec: DbRow = {
            id: clone.id || `00007800-7800-4000-8000-${String(rows.length + idx + 1).padStart(12, '0')}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...clone,
          };
          rows.push(rec);
          return structuredClone(rec);
        });
        return { data: inserted, error: null, count: inserted.length };
      }

      if (op === 'upsert') {
        const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
        const upserted = items.map((it, idx) => {
          const clone = structuredClone(it);
          const keyCol = clone.token ? 'token' : 'id';
          const existingIdx = rows.findIndex((r) => clone[keyCol] && r[keyCol] === clone[keyCol]);
          if (existingIdx >= 0) {
            rows[existingIdx] = { ...rows[existingIdx], ...clone };
            return structuredClone(rows[existingIdx]);
          }
          const rec: DbRow = {
            id: clone.id || `ups-${table}-${rows.length + idx + 1}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...clone,
          };
          rows.push(rec);
          return structuredClone(rec);
        });
        return { data: upserted, error: null, count: upserted.length };
      }

      if (op === 'update') {
        const matched = rows.filter((r) => filters.every((fn) => fn(r)));
        for (const row of matched) {
          if (payload && !Array.isArray(payload)) {
            Object.assign(row, structuredClone(payload));
          }
        }
        return { data: matched.map((r) => structuredClone(r)), error: null, count: matched.length };
      }

      state.tables[table] = rows.filter((r) => !filters.every((fn) => fn(r)));
      return { data: [], error: null, count: 0 };
    };

    const evalOrClause = (r: DbRow, clause: string): boolean => {
      const m1 = clause.match(/^([a-zA-Z0-9_]+)\.eq\.(.+)$/);
      if (m1) return String(r[m1[1]] ?? '') === m1[2];
      const m2 = clause.match(/^metadata->>([a-zA-Z0-9_]+)\.eq\.(.+)$/);
      if (m2) {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        return String(meta[m2[1]] ?? '') === m2[2];
      }
      return false;
    };

    const builder = {
      select: () => builder,
      insert: (p: DbRow | DbRow[]) => {
        op = 'insert';
        payload = p;
        return builder;
      },
      update: (p: DbRow) => {
        op = 'update';
        payload = p;
        return builder;
      },
      upsert: (p: DbRow | DbRow[]) => {
        op = 'upsert';
        payload = p;
        return builder;
      },
      delete: () => {
        op = 'delete';
        return builder;
      },
      eq: (col: string, val: unknown) => {
        recordInvalidUuidIfNeeded(col, val);
        filters.push((r) => r[col] === val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
        return builder;
      },
      or: (expr: string) => {
        const parts = expr.split(',').map((p) => p.trim());
        filters.push((r) => parts.some((p) => evalOrClause(r, p)));
        return builder;
      },
      contains: (col: string, obj: Record<string, unknown>) => {
        filters.push((r) => {
          const target = r[col];
          if (!target || typeof target !== 'object') return false;
          return Object.entries(obj).every(([k, v]) => (target as Record<string, unknown>)[k] === v);
        });
        return builder;
      },
      order: () => builder,
      limit: (n: number) => {
        limitCount = n;
        return builder;
      },
      maybeSingle: async () => {
        const res = execute();
        if (res.error) return { data: null, error: res.error };
        const arr = Array.isArray(res.data) ? res.data : [];
        return { data: arr[0] ?? null, error: null };
      },
      single: async () => {
        const res = execute();
        if (res.error) return { data: null, error: res.error };
        const arr = Array.isArray(res.data) ? res.data : [];
        return arr[0]
          ? { data: arr[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'Not found' } };
      },
      then: <TResult1 = ReturnType<typeof execute>, TResult2 = never>(
        onfulfilled?: ((value: ReturnType<typeof execute>) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) => Promise.resolve(execute()).then(onfulfilled, onrejected),
    };

    return builder;
  };

  return {
    from,
    storage: {
      createBucket: vi.fn(async () => ({ data: null, error: null })),
      from: (bucket: string) => ({
        upload: vi.fn(async (storagePath: string, buf: Buffer, opts?: { contentType?: string }) => {
          state.storageUploads.push({
            bucket,
            path: storagePath,
            contentType: opts?.contentType,
            bytes: buf.byteLength,
          });
          return { data: { path: storagePath }, error: null };
        }),
        getPublicUrl: (storagePath: string) => ({
          data: { publicUrl: `https://cdn.credeal.test/${bucket}/${storagePath}` },
        }),
        createSignedUploadUrl: vi.fn(async (tempPath: string) => ({
          data: {
            signedUrl: `https://cdn.credeal.test/upload/sign/${bucket}/${tempPath}?token=sig`,
            token: 'sig',
            path: tempPath,
          },
          error: null,
        })),
      }),
    },
  };
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => buildInMemoryServiceClient(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn(async () => {
    if (!state.authUser) {
      return {
        user: null,
        role: null,
        profile: null,
        error: Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 }),
      };
    }
    return {
      user: state.authUser,
      role: state.authRole,
      profile: { role: state.authRole || 'broker', display_name: '테스트 중개인' },
      error: null,
    };
  }),
}));

import { POST as postUploadPhoto } from '@/app/api/broker/im/upload-photo/route';
import { POST as postImValidate } from '@/app/api/im/validate/route';
import {
  GET as getShareLinks,
  POST as postShareLink,
} from '@/app/api/broker/share-link/route';
import { POST as postForkIm } from '@/app/api/broker/im-lite/[id]/fork/route';
import {
  optimizeImageForPptx,
  isBlockedPrivateOrInternalIp,
  isPathInsideRoot,
} from '@/domain/building/mobile-im/pptx/utils/image-optimizer';
import {
  ALLOWED_PUBLIC_IM_PRO_STATUSES,
  resolvePublishedImProDocument,
} from '@/app/api/public/im-pro/_lib/im-pro-doc-guard';
import { fetchIMData } from '@/app/(public)/im-lite/[buildingId]/fetch-im-data';

const SUB14_CLASS_RE =
  /(?:^|\s)(?:(?:[a-z0-9-]+|\[[^\]\s]*\]):)*!?text-(?:xs|\[(?:[0-9]|1[0-3])(?:\.\d+)?px\])!?(?=$|\s|\/)/;

describe('Wave 7.8 — WP-7.8C IM Security, Sync & Studio Closure + Sub-14px Gate', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    state.tables = {};
    state.insertedPayloads = [];
    state.failInsert42703OnceOnDocObjects = false;
    state.storageUploads = [];
    state.authUser = { id: OWNER_ID, email: 'owner78c@credeal.kr' };
    state.authRole = 'broker';
    resetWorkspaceRepositoryCacheForTests();
    resetShareLinkTokenStoreForTests();
    clearQuickImStoreForTest();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('1. IM P0-1 — Non-UUID Draft Photo Upload 22P02 Guard & Per-Broker Storage Isolation', () => {
    it('uploads non-UUID bld-fresh-123 photo (200) under drafts/<userId>/bld-fresh-123/ without hitting building_ssot_lite 22P02', async () => {
      const form = new FormData();
      form.append('file', new File([TINY_PNG_BYTES], 'facade.png', { type: 'image/png' }));
      form.append('buildingId', 'bld-fresh-123');
      form.append('name', 'facade.png');

      const res = await postUploadPhoto(
        new NextRequest('http://localhost:3000/api/broker/im/upload-photo', {
          method: 'POST',
          body: form,
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.path).toMatch(new RegExp(`^drafts/${OWNER_ID}/bld-fresh-123/im-photos/.*\\.png$`));
      expect(state.storageUploads).toHaveLength(1);
      expect(state.storageUploads[0]?.path).toContain(`drafts/${OWNER_ID}/bld-fresh-123/im-photos/`);

      // Foreign broker's non-UUID workspace_item must be rejected with 403
      state.tables.workspace_items = [
        {
          id: '99997800-7800-4999-8999-999999997899',
          owner_id: OTHER_ID,
          kind: 'im',
          legacy_id: 'bld-fresh-foreign',
          building_id: null,
          status: 'draft',
          title: '타인 초안',
          address: '서울시 강남구',
        },
      ];
      const foreignForm = new FormData();
      foreignForm.append('file', new File([TINY_PNG_BYTES], 'facade.png', { type: 'image/png' }));
      foreignForm.append('buildingId', 'bld-fresh-foreign');
      const foreignRes = await postUploadPhoto(
        new NextRequest('http://localhost:3000/api/broker/im/upload-photo', {
          method: 'POST',
          body: foreignForm,
        })
      );
      expect(foreignRes.status).toBe(403);
    });

    it('guards non-UUID buildingId in POST /api/im/validate without 22P02 500 crash', async () => {
      const res = await postImValidate(
        new NextRequest('http://localhost:3000/api/im/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buildingId: 'bld-fresh-123',
            investment_posture: 'income',
            tier: 'basic',
            asking_price_manwon: 500000,
            monthly_rent_total_krw: 18000000,
            resolved_address: '서울 강남구 역삼동',
            resolved_pnu: '1168010100108230033',
          }),
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.canGenerate).toBe(true);
    });
  });

  describe('2. IM P0-2 — optimizeImageForPptx SSRF, Redirect Bypass, Stream Limit & Local Path Confinement', () => {
    it('blocks IMDS, loopback, RFC1918, /etc/passwd, ../../.env.local, and src/proxy.ts (returns null)', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const blockedInputs = [
        'http://169.254.169.254/latest/meta-data/',
        'https://169.254.169.254/latest/meta-data/',
        'https://127.0.0.1/img.png',
        'https://10.0.0.1/img.png',
        'https://[::ffff:169.254.169.254]/img.png',
        'https://localhost/img.png',
        'https://metadata.google.internal/computeMetadata/v1/',
        'https://admin:secret@8.8.8.8/img.png',
        'https://8.8.8.8:8443/img.png',
        '/etc/passwd',
        '../../.env.local',
        '/api/public/testguide-assets/../../.env.local',
        'src/proxy.ts',
      ];

      for (const bad of blockedInputs) {
        const result = await optimizeImageForPptx(bad);
        expect(result, `Expected null for ${bad}`).toBeNull();
      }
      expect(fetchSpy).not.toHaveBeenCalled();

      expect(isBlockedPrivateOrInternalIp('169.254.169.254')).toBe(true);
      expect(isBlockedPrivateOrInternalIp('127.0.0.1')).toBe(true);
      expect(isBlockedPrivateOrInternalIp('10.0.0.1')).toBe(true);
      expect(isBlockedPrivateOrInternalIp('172.16.5.4')).toBe(true);
      expect(isBlockedPrivateOrInternalIp('192.168.1.10')).toBe(true);
      expect(isBlockedPrivateOrInternalIp('100.64.1.1')).toBe(true);
      expect(isBlockedPrivateOrInternalIp('::1')).toBe(true);
      expect(isBlockedPrivateOrInternalIp('fe80::1')).toBe(true);
      expect(isBlockedPrivateOrInternalIp('fc00::1')).toBe(true);
      expect(isBlockedPrivateOrInternalIp('::ffff:127.0.0.1')).toBe(true);
      expect(isBlockedPrivateOrInternalIp('8.8.8.8')).toBe(false);

      expect(
        isPathInsideRoot(
          path.join(process.cwd(), 'public', 'photo.jpg'),
          path.join(process.cwd(), 'public')
        )
      ).toBe(true);
      expect(
        isPathInsideRoot(
          path.join(process.cwd(), 'public', '..', '.env.local'),
          path.join(process.cwd(), 'public')
        )
      ).toBe(false);
    });

    it('passes redirect: "error" to fetch and aborts oversized >10MB chunked streams immediately', async () => {
      vi.spyOn(dns.promises, 'lookup').mockImplementation(
        (async () => [{ address: '93.184.216.34', family: 4 }]) as unknown as typeof dns.promises.lookup
      );

      let capturedInit: RequestInit | undefined;
      globalThis.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedInit = init;
        let sentChunks = 0;
        const stream = new ReadableStream<Uint8Array>({
          pull(controller) {
            sentChunks += 1;
            if (sentChunks > 12) {
              controller.close();
              return;
            }
            // 2MB per chunk -> exceeds 10MB on 6th chunk without Content-Length header
            controller.enqueue(new Uint8Array(2 * 1024 * 1024));
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }) as unknown as typeof fetch;

      const res = await optimizeImageForPptx('https://cdn.credeal-assets.example/huge.jpg');
      expect(res).toBeNull();
      expect(capturedInit?.redirect).toBe('error');
    });
  });

  describe('3. IM P0-4b — fetchIMData Prioritizes Active workspace_items Over Legacy im_deleted Events', () => {
    it('hydrates active canonical workspace_items snapshot even when older im_deleted exists in activity_events', async () => {
      state.tables.workspace_items = [
        {
          id: '78007800-7800-4780-8780-780078007801',
          owner_id: OWNER_ID,
          kind: 'im',
          building_id: BLD_UUID_A,
          legacy_id: BLD_UUID_A,
          status: 'published',
          title: '역삼 프라임 빌딩',
          address: '서울특별시 강남구 역삼동 823-33',
          price_band: '80억~90억',
          draft_payload: {
            title: '역삼 프라임 빌딩',
            address: '서울특별시 강남구 역삼동 823-33',
            askingPriceManwon: 850000,
          },
          published_snapshot: {
            buildingId: BLD_UUID_A,
            blindName: '역삼 프라임 빌딩',
            sections: [{ id: 'overview', title: '자산 개요', content: '역삼 핵심 오피스' }],
          },
          deleted_at: null,
          revoked_at: null,
          created_at: '2026-11-18T10:00:00.000Z',
          updated_at: '2026-11-18T12:00:00.000Z',
        },
      ];
      state.tables.activity_events = [
        {
          id: 'ev-old-delete',
          actor_id: OWNER_ID,
          event_type: 'im_deleted',
          entity_id: BLD_UUID_A,
          metadata: { building_id: BLD_UUID_A },
          created_at: '2026-11-10T00:00:00.000Z',
        },
      ];

      const doc = await fetchIMData(BLD_UUID_A, undefined, {
        userId: OWNER_ID,
        isAdmin: false,
      });
      expect(doc).not.toBeNull();
      expect(doc?.blindName).toBe('역삼 프라임 빌딩');
    });
  });

  describe('4. IM P1-1 — POST /api/broker/im-lite/[id]/fork Populates NOT NULL source_type & source_id', () => {
    it('includes source_type: "building_ssot_lite" and source_id on both primary and fallback inserts', async () => {
      state.tables.document_objects = [
        {
          id: DOC_UUID_1,
          owner_id: OWNER_ID,
          broker_id: OWNER_ID,
          building_id: BLD_UUID_A,
          version_no: 1,
          title: '서초 오피스 IM',
          status: 'published',
          body: { sections: [{ title: '개요' }], approval_target_hash: 'sha256:abc' },
        },
      ];

      const res1 = await postForkIm(
        new NextRequest(`http://localhost:3000/api/broker/im-lite/${DOC_UUID_1}/fork`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: DOC_UUID_1 }) }
      );
      expect(res1.status).toBe(200);
      const docInserts1 = state.insertedPayloads.filter((p) => p.table === 'document_objects');
      expect(docInserts1).toHaveLength(1);
      expect(docInserts1[0]?.payload.source_type).toBe('building_ssot_lite');
      expect(docInserts1[0]?.payload.source_id).toBe(BLD_UUID_A);

      // Verify 42703 unmigrated-column fallback standardPayload also includes source_type & source_id
      state.insertedPayloads = [];
      state.failInsert42703OnceOnDocObjects = true;
      const res2 = await postForkIm(
        new NextRequest(`http://localhost:3000/api/broker/im-lite/${DOC_UUID_1}/fork`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: DOC_UUID_1 }) }
      );
      expect(res2.status).toBe(200);
      const docInserts2 = state.insertedPayloads.filter((p) => p.table === 'document_objects');
      expect(docInserts2).toHaveLength(1);
      expect(docInserts2[0]?.payload.source_type).toBe('building_ssot_lite');
      expect(docInserts2[0]?.payload.source_id).toBe(BLD_UUID_A);
    });
  });

  describe('5. IM P1-2 / P1-3 — Share-Link Strict buildingId Filtering & Token Minting', () => {
    it('filters GET /api/broker/share-link?buildingId=... strictly to the requested buildingId and mints slk token on POST', async () => {
      state.tables.share_link = [
        {
          token: 'tok-deal-a',
          deal_id: BLD_UUID_A,
          broker_id: OWNER_ID,
          tier: 'basic',
          revoked_at: null,
          created_at: '2026-11-18T10:00:00.000Z',
        },
        {
          token: 'tok-deal-b',
          deal_id: BLD_UUID_B,
          broker_id: OWNER_ID,
          tier: 'basic',
          revoked_at: null,
          created_at: '2026-11-18T11:00:00.000Z',
        },
      ];

      const getRes = await getShareLinks(
        new NextRequest(`http://localhost:3000/api/broker/share-link?buildingId=${BLD_UUID_A}`)
      );
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.links).toHaveLength(1);
      expect(getJson.links[0]?.token).toBe('tok-deal-a');

      // Mint share token for owned non-UUID workspace draft via POST { buildingId }
      state.tables.workspace_items = [
        {
          id: '88887800-7800-4888-8888-888888887801',
          owner_id: OWNER_ID,
          kind: 'im',
          legacy_id: 'bld-fresh-share-1',
          building_id: null,
          status: 'published',
          title: '신규 공유 빌딩',
          address: '서울 마포구',
        },
      ];
      const mintRes = await postShareLink(
        new NextRequest('http://localhost:3000/api/broker/share-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ buildingId: 'bld-fresh-share-1', kind: 'im' }),
        })
      );
      expect(mintRes.status).toBe(201);
      const mintJson = await mintRes.json();
      expect(mintJson.token).toMatch(/^slk\./);
      const check = await verifyShareLinkToken({
        token: mintJson.token,
        buildingId: 'bld-fresh-share-1',
      });
      expect(check.valid).toBe(true);
    });
  });

  describe('6. IM P1-4 / IM P2-1 / UI P1-4 — Pro IM Statuses, Studio FileReader Removal & Admin Sub-14px Gate', () => {
    it('accepts broker_reviewed and shared_external in ALLOWED_PUBLIC_IM_PRO_STATUSES', async () => {
      expect(ALLOWED_PUBLIC_IM_PRO_STATUSES.has('broker_reviewed')).toBe(true);
      expect(ALLOWED_PUBLIC_IM_PRO_STATUSES.has('shared_external')).toBe(true);

      for (const status of ['broker_reviewed', 'shared_external'] as const) {
        state.tables.document_objects = [
          {
            id: `doc-${status}`,
            building_id: BLD_UUID_A,
            owner_id: OWNER_ID,
            document_type: 'im_pro',
            status,
            is_revoked: false,
            body: { sections: [{ title: '심층 재무 분석', markdown: '내용' }] },
            created_at: new Date().toISOString(),
          },
        ];
        const guardRes = await resolvePublishedImProDocument({
          supabase: buildInMemoryServiceClient(),
          buildingId: BLD_UUID_A,
        });
        expect(guardRes.ok).toBe(true);
      }
    });

    it('removes FileReader.readAsDataURL bypasses from Studio editors and locks admin sub-14px paths in ESLint & CI', () => {
      const studioFiles = [
        'src/app/(broker)/broker/basic-im-studio/[buildingId]/components/SlideEditor.tsx',
        'src/components/broker/im-studio/HeaderFooterEditor.tsx',
        'src/components/broker/im-studio/GalleryCurator.tsx',
      ];
      for (const rel of studioFiles) {
        const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
        expect(src, `${rel} must not contain FileReader`).not.toContain('FileReader');
        expect(src, `${rel} must not contain readAsDataURL`).not.toContain('readAsDataURL');
        expect(SUB14_CLASS_RE.test(src), `${rel} must have 0 sub-14px classes`).toBe(false);
      }

      const approvalPageSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/(broker)/broker/im-approval/[id]/page.tsx'),
        'utf8'
      );
      expect(approvalPageSrc).toContain("['im_lite', 'mobile_im']");

      const modalSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/(broker)/broker/w/im/_components/ImFullscreenModal.tsx'),
        'utf8'
      );
      expect(modalSrc).toContain('Escape');
      expect(modalSrc).toContain('min-h-16 py-2');
      expect(SUB14_CLASS_RE.test(modalSrc)).toBe(false);

      const eslintSrc = fs.readFileSync(path.resolve(process.cwd(), 'eslint.config.mjs'), 'utf8');
      expect(eslintSrc).toContain('"src/app/admin/**/*.{ts,tsx}"');
      expect(eslintSrc).toContain('"src/components/admin/**/*.{ts,tsx}"');

      const ciSrc = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
      expect(ciSrc).toContain('"src/app/admin"');
      expect(ciSrc).toContain('"src/components/admin"');
    });
  });
});
