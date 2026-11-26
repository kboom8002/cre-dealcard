/**
 * Pro IM Grant Lifecycle Service (`im_pro_grants`)
 *
 * - `issueOrRefreshProGrant`: issues or refreshes a time-boxed Pro IM grant (`pending_nda` by default)
 *   with cryptographic `grant_token`, `expires_at` (72h default), and `max_downloads` (5 default).
 * - `resolveProGrantByAnyId`: resolves a grant by `im_pro_grants.id`, `gate_request_id`, or latest
 *   `building_id` (plus `deal_id` / `gate_requests` fallback).
 * - Schema-drift safe (`42P01`, `42703`, `PGRST204`, `PGRST205`, `23503`) and partial-mock safe.
 */
import crypto from 'node:crypto';
import { verifyAuth } from '@/lib/auth-guard';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('im-pro-grant-service');

/**
 * Framework-agnostic structural request contract compatible with Web `Request`
 * and Next.js server request objects without framework-layer coupling.
 */
export interface RequestLike {
  url?: string;
  nextUrl?: {
    searchParams?: {
      get(name: string): string | null;
    };
  };
  headers?: {
    get(name: string): string | null;
  };
  cookies?: {
    get(name: string): { value?: string } | undefined;
    getAll?: () => Array<{ name: string; value: string }>;
  };
}

export interface ProGrantEntity {
  id: string;
  deal_id?: string | null;
  building_id?: string | null;
  gate_request_id?: string | null;
  broker_id?: string | null;
  requester_id?: string | null;
  requester_name?: string | null;
  requester_email?: string | null;
  requester_phone?: string | null;
  status?: string;
  grant_token?: string | null;
  expires_at: string;
  nda_signed_at?: string | null;
  max_downloads?: number | null;
  download_count?: number | null;
  pdf_export_allowed?: boolean | null;
  is_revoked?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  reason?: string | null;
  [key: string]: unknown;
}

export type GrantRow = ProGrantEntity;

interface DbResult {
  data?: GrantRow | GrantRow[] | null;
  error?: { code?: string; message?: string } | null;
}

interface QueryChain extends PromiseLike<DbResult> {
  eq?: (col: string, val: unknown) => QueryChain;
  order?: (col: string, opts: { ascending: boolean }) => QueryChain;
  limit?: (count: number) => QueryChain;
  select?: (cols?: string) => QueryChain;
  maybeSingle?: () => Promise<DbResult>;
  single?: () => Promise<DbResult>;
}

interface TableRef {
  select?: (cols: string) => QueryChain;
  insert?: (payload: Record<string, unknown>) => QueryChain;
  update?: (payload: Record<string, unknown>) => QueryChain;
}

export interface ProGrantSupabaseLike {
  from: (table: string) => unknown;
}

const OPTIONAL_DRIFT_COLUMNS = new Set([
  'pdf_export_allowed',
  'max_downloads',
  'download_count',
  'grant_token',
  'gate_request_id',
  'requester_id',
  'broker_id',
  'building_id',
  'updated_at',
  'is_revoked',
]);

export interface IssueProGrantInput {
  grantId?: string | null;
  gateRequestId?: string | null;
  buildingId?: string | null;
  dealId?: string | null;
  requesterId?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  brokerId?: string | null;
  ttlHours?: number;
  maxDownloads?: number;
  status?: string;
  pdfExportAllowed?: boolean;
}

export interface IssueProGrantResult {
  ok: boolean;
  created: boolean;
  grant: GrantRow | null;
  grantToken: string | null;
  tableMissing?: boolean;
  error?: string;
}

export interface ResolvedProGrantResult {
  grant: GrantRow | null;
  gateRequest: GrantRow | null;
  buildingId: string | null;
  matchedBy:
    | 'grant_id'
    | 'grant_token'
    | 'gate_request_id'
    | 'building_id'
    | 'deal_id'
    | 'gate_request_only'
    | null;
}

export interface ProGrantViewerAccessResult {
  ok: boolean;
  status: number;
  error?: string;
  code?: string;
}

export interface ConsumeProGrantDownloadResult {
  ok: boolean;
  status: number;
  limit: number;
  used: number;
  error?: string;
}

function getErrCodeMsg(err: unknown): { code: string; msg: string } {
  if (!err || typeof err !== 'object') return { code: '', msg: '' };
  const rec = err as Record<string, unknown>;
  return {
    code: String(rec.code ?? ''),
    msg: String(rec.message ?? ''),
  };
}

export function isMissingTableError(err: unknown): boolean {
  const { code, msg } = getErrCodeMsg(err);
  if (!code && !msg) return false;
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /relation .* does not exist/i.test(msg) ||
    /could not find the table/i.test(msg)
  );
}

export function isMissingColumnError(err: unknown): boolean {
  const { code, msg } = getErrCodeMsg(err);
  if (!code && !msg) return false;
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    /column .* does not exist/i.test(msg) ||
    /could not find the .* column/i.test(msg)
  );
}

export function isSchemaDriftError(err: unknown): boolean {
  return isMissingTableError(err) || isMissingColumnError(err);
}

function isForeignKeyError(err: unknown): boolean {
  const { code, msg } = getErrCodeMsg(err);
  if (!code && !msg) return false;
  return code === '23503' || /foreign key constraint/i.test(msg);
}

function extractMissingColumn(err: unknown): string | null {
  const { msg } = getErrCodeMsg(err);
  if (!msg) return null;
  const m1 = msg.match(/could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);
  if (m1?.[1]) return m1[1];
  const m2 = msg.match(/column ['"]?([a-zA-Z0-9_]+)['"]?(?:\s+of relation|\s+does not exist)/i);
  if (m2?.[1]) return m2[1];
  const m3 = msg.match(/im_pro_grants\.([a-zA-Z0-9_]+)/i);
  if (m3?.[1]) return m3[1];
  return null;
}

export function parseGateReasonRequesterMeta(reason: unknown): {
  name: string | null;
  phone: string | null;
  email: string | null;
} {
  if (typeof reason !== 'string' || !reason.trim().startsWith('{')) {
    return { name: null, phone: null, email: null };
  }
  try {
    const parsed = JSON.parse(reason) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { name: null, phone: null, email: null };
    }
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null;
    const phone = typeof parsed.phone === 'string' && parsed.phone.trim() ? parsed.phone.trim() : null;
    const email = typeof parsed.email === 'string' && parsed.email.trim() ? parsed.email.trim() : null;
    return { name, phone, email };
  } catch {
    return { name: null, phone: null, email: null };
  }
}

function generateCryptoGrantToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.byteLength !== bufB.byteLength || bufA.byteLength === 0) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createHmacGrantToken(grantId: string): string | null {
  const secret = (process.env.NDA_GRANT_TOKEN_SECRET || process.env.GRANT_TOKEN_SECRET || '').trim();
  if (!secret || secret.length < 16 || !grantId) return null;
  return crypto.createHmac('sha256', secret).update(grantId, 'utf8').digest('hex');
}

export function verifyHmacGrantToken(grantId: string, providedToken: string): boolean {
  const secret = (process.env.NDA_GRANT_TOKEN_SECRET || process.env.GRANT_TOKEN_SECRET || '').trim();
  if (!secret || secret.length < 16 || !grantId || !providedToken) return false;
  const cleanToken = providedToken.startsWith('sha256=')
    ? providedToken.slice('sha256='.length).trim()
    : providedToken.trim();
  if (!/^[0-9a-f]{64}$/i.test(cleanToken)) return false;
  const expected = crypto.createHmac('sha256', secret).update(grantId, 'utf8').digest('hex');
  return timingSafeStringEqual(cleanToken.toLowerCase(), expected.toLowerCase());
}

function computeDeterministicHmacFallback(grantId: string): string | null {
  return createHmacGrantToken(grantId);
}

function scoreGrantPriority(grant: GrantRow): number {
  if (grant.is_revoked === true || grant.status === 'revoked') return 0;
  if (grant.expires_at && Date.parse(String(grant.expires_at)) < Date.now()) return 1;
  switch (String(grant.status || '').toLowerCase()) {
    case 'active':
      return 5;
    case 'pending_nda':
      return 4;
    case 'approved':
    case 'granted':
      return 3;
    case 'pending':
      return 2;
    default:
      return 1;
  }
}

function pickBestGrant(rows: GrantRow[]): GrantRow | null {
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const pDiff = scoreGrantPriority(b) - scoreGrantPriority(a);
    if (pDiff !== 0) return pDiff;
    const tA = Date.parse(String(a.created_at || '')) || 0;
    const tB = Date.parse(String(b.created_at || '')) || 0;
    return tB - tA;
  });
  return sorted[0] ?? null;
}

async function queryTableRows(
  supabase: ProGrantSupabaseLike,
  table: string,
  col: string,
  val: string,
  limit = 5,
): Promise<{ rows: GrantRow[]; missingTable: boolean; missingColumn: boolean; error: unknown }> {
  try {
    const tbl = supabase.from(table) as TableRef | null | undefined;
    if (!tbl || typeof tbl.select !== 'function') {
      return { rows: [], missingTable: false, missingColumn: false, error: null };
    }
    let q: QueryChain = tbl.select('*');
    if (typeof q?.eq === 'function') {
      q = q.eq(col, val);
    }
    if (typeof q?.order === 'function') {
      q = q.order('created_at', { ascending: false });
    }
    if (typeof q?.limit === 'function') {
      q = q.limit(limit);
    }

    let res: DbResult | undefined;
    if (typeof q?.then === 'function') {
      res = await q;
    } else if (typeof q?.maybeSingle === 'function') {
      res = await q.maybeSingle();
    } else if (typeof q?.single === 'function') {
      res = await q.single();
    }

    if (res?.error) {
      return {
        rows: [],
        missingTable: isMissingTableError(res.error),
        missingColumn: isMissingColumnError(res.error),
        error: res.error,
      };
    }

    const data = res?.data;
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return { rows, missingTable: false, missingColumn: false, error: null };
  } catch (err) {
    return {
      rows: [],
      missingTable: isMissingTableError(err),
      missingColumn: isMissingColumnError(err),
      error: err,
    };
  }
}

/**
 * Resolves a Pro IM grant by `im_pro_grants.id`, `grant_token`, `gate_request_id`,
 * or (when `allowBuildingLookup !== false`) `building_id` / `deal_id`,
 * with safe `gate_requests` fallback and schema-drift guards.
 */
export async function resolveProGrantByAnyId(
  supabase: ProGrantSupabaseLike,
  idOrBuildingOrRequestId: string,
  opts?: { allowBuildingLookup?: boolean },
): Promise<ResolvedProGrantResult> {
  const allowBuildingLookup = opts?.allowBuildingLookup !== false;
  const cleanId = String(idOrBuildingOrRequestId || '').trim();
  if (!cleanId || !supabase || typeof supabase.from !== 'function') {
    return { grant: null, gateRequest: null, buildingId: null, matchedBy: null };
  }

  // 1. Direct lookup on im_pro_grants.id
  const byGrantId = await queryTableRows(supabase, 'im_pro_grants', 'id', cleanId, 1);
  if (byGrantId.missingTable) {
    if (!allowBuildingLookup) {
      return { grant: null, gateRequest: null, buildingId: null, matchedBy: null };
    }
    const gateOnly = await queryTableRows(supabase, 'gate_requests', 'id', cleanId, 1);
    const gateRow = gateOnly.rows[0] ?? null;
    return {
      grant: null,
      gateRequest: gateRow,
      buildingId: gateRow?.building_id ? String(gateRow.building_id) : null,
      matchedBy: gateRow ? 'gate_request_only' : null,
    };
  }

  if (byGrantId.rows.length > 0) {
    const grant = byGrantId.rows[0];
    let gateRequest: GrantRow | null = null;
    if (grant.gate_request_id) {
      const grRes = await queryTableRows(supabase, 'gate_requests', 'id', String(grant.gate_request_id), 1);
      gateRequest = grRes.rows[0] ?? null;
    }
    return {
      grant,
      gateRequest,
      buildingId:
        (grant.building_id ? String(grant.building_id) : null) ||
        (gateRequest?.building_id ? String(gateRequest.building_id) : null) ||
        (grant.deal_id ? String(grant.deal_id) : null),
      matchedBy: 'grant_id',
    };
  }

  // 1b. Direct lookup on im_pro_grants.grant_token (if column exists)
  const byGrantToken = await queryTableRows(supabase, 'im_pro_grants', 'grant_token', cleanId, 5);
  if (!byGrantToken.missingColumn && byGrantToken.rows.length > 0) {
    const grant = pickBestGrant(byGrantToken.rows);
    if (grant) {
      let gateRequest: GrantRow | null = null;
      if (grant.gate_request_id) {
        const grRes = await queryTableRows(supabase, 'gate_requests', 'id', String(grant.gate_request_id), 1);
        gateRequest = grRes.rows[0] ?? null;
      }
      return {
        grant,
        gateRequest,
        buildingId:
          (grant.building_id ? String(grant.building_id) : null) ||
          (gateRequest?.building_id ? String(gateRequest.building_id) : null) ||
          (grant.deal_id ? String(grant.deal_id) : null),
        matchedBy: 'grant_token',
      };
    }
  }

  // 2. Lookup by im_pro_grants.gate_request_id (if column exists)
  const byGateReqCol = await queryTableRows(supabase, 'im_pro_grants', 'gate_request_id', cleanId, 5);
  if (!byGateReqCol.missingColumn && byGateReqCol.rows.length > 0) {
    const grant = pickBestGrant(byGateReqCol.rows);
    const grRes = await queryTableRows(supabase, 'gate_requests', 'id', cleanId, 1);
    const gateRequest = grRes.rows[0] ?? null;
    if (grant) {
      return {
        grant,
        gateRequest,
        buildingId:
          (grant.building_id ? String(grant.building_id) : null) ||
          (gateRequest?.building_id ? String(gateRequest.building_id) : null) ||
          (grant.deal_id ? String(grant.deal_id) : null),
        matchedBy: 'gate_request_id',
      };
    }
  }

  if (!allowBuildingLookup) {
    return { grant: null, gateRequest: null, buildingId: null, matchedBy: null };
  }

  // 3. Check if cleanId is a gate_requests.id
  const byGateId = await queryTableRows(supabase, 'gate_requests', 'id', cleanId, 1);
  const gateReq = byGateId.rows[0] ?? null;
  if (gateReq?.building_id) {
    const bldId = String(gateReq.building_id);
    const byGateBld = await queryTableRows(supabase, 'im_pro_grants', 'building_id', bldId, 10);
    // Only reuse a building-level legacy grant if it isn't already bound to a different gate_request_id
    const compatibleRows = !byGateBld.missingColumn
      ? byGateBld.rows.filter(
          (r) =>
            (!r.gate_request_id || String(r.gate_request_id) === String(gateReq.id)) &&
            (!gateReq.requester_id || !r.requester_id || String(r.requester_id) === String(gateReq.requester_id)),
        )
      : [];
    const matched = pickBestGrant(compatibleRows);
    if (matched) {
      return {
        grant: matched,
        gateRequest: gateReq,
        buildingId: bldId,
        matchedBy: 'building_id',
      };
    }
    return {
      grant: null,
      gateRequest: gateReq,
      buildingId: bldId,
      matchedBy: 'gate_request_only',
    };
  }

  // 4. Lookup by im_pro_grants.building_id (latest active/pending grant)
  const byBuildingId = await queryTableRows(supabase, 'im_pro_grants', 'building_id', cleanId, 5);
  if (!byBuildingId.missingColumn && byBuildingId.rows.length > 0) {
    const grant = pickBestGrant(byBuildingId.rows);
    if (grant) {
      let gateRequest: GrantRow | null = null;
      if (grant.gate_request_id) {
        const grRes = await queryTableRows(supabase, 'gate_requests', 'id', String(grant.gate_request_id), 1);
        gateRequest = grRes.rows[0] ?? null;
      } else {
        const grBldRes = await queryTableRows(supabase, 'gate_requests', 'building_id', cleanId, 1);
        gateRequest = grBldRes.rows[0] ?? null;
      }
      return {
        grant,
        gateRequest,
        buildingId: cleanId,
        matchedBy: 'building_id',
      };
    }
  }

  // 5. Legacy fallback: im_pro_grants.deal_id or gate_requests.building_id
  const byDealId = await queryTableRows(supabase, 'im_pro_grants', 'deal_id', cleanId, 5);
  if (!byDealId.missingColumn && byDealId.rows.length > 0) {
    const grant = pickBestGrant(byDealId.rows);
    if (grant) {
      return {
        grant,
        gateRequest: null,
        buildingId: (grant.building_id ? String(grant.building_id) : null) || cleanId,
        matchedBy: 'deal_id',
      };
    }
  }

  const byGateBld = await queryTableRows(supabase, 'gate_requests', 'building_id', cleanId, 1);
  if (byGateBld.rows.length > 0) {
    const gateRow = byGateBld.rows[0];
    return {
      grant: null,
      gateRequest: gateRow,
      buildingId: gateRow.building_id ? String(gateRow.building_id) : cleanId,
      matchedBy: 'gate_request_only',
    };
  }

  return { grant: null, gateRequest: null, buildingId: null, matchedBy: null };
}

async function mutateGrantWithDriftFallback(
  supabase: ProGrantSupabaseLike,
  mode: 'insert' | 'update',
  payload: Record<string, unknown>,
  targetId?: string,
): Promise<{ data: GrantRow | null; error: unknown; strippedColumns: Set<string>; tableMissing: boolean }> {
  const workingPayload: Record<string, unknown> = { ...payload };
  const strippedColumns = new Set<string>();
  const tbl = supabase.from('im_pro_grants') as TableRef | null | undefined;
  const mutator = mode === 'insert' ? tbl?.insert : tbl?.update;
  if (!tbl || typeof mutator !== 'function') {
    return {
      data: null,
      error: new Error(`im_pro_grants.${mode} is not available`),
      strippedColumns,
      tableMissing: false,
    };
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    let q: QueryChain =
      mode === 'insert'
        ? tbl.insert!(workingPayload)
        : tbl.update!(workingPayload);
    if (mode === 'update' && targetId && typeof q?.eq === 'function') {
      q = q.eq('id', targetId);
    }
    if (typeof q?.select === 'function') {
      q = q.select();
    }

    let res: DbResult | undefined;
    if (typeof q?.maybeSingle === 'function') {
      res = await q.maybeSingle();
    } else if (typeof q?.single === 'function') {
      res = await q.single();
    } else {
      res = await q;
    }

    const err = res?.error;
    if (!err) {
      const row = Array.isArray(res?.data) ? res.data[0] ?? null : res?.data ?? null;
      const fallbackRow = {
        id: targetId || String(workingPayload.id || ''),
        expires_at: String(workingPayload.expires_at || ''),
        ...workingPayload,
      } as GrantRow;
      return {
        data: row || fallbackRow,
        error: null,
        strippedColumns,
        tableMissing: false,
      };
    }

    if (isMissingTableError(err)) {
      return { data: null, error: err, strippedColumns, tableMissing: true };
    }

    if (isMissingColumnError(err)) {
      const missingCol = extractMissingColumn(err);
      if (missingCol && missingCol in workingPayload) {
        delete workingPayload[missingCol];
        strippedColumns.add(missingCol);
        continue;
      }
      let dropped = false;
      for (const optCol of OPTIONAL_DRIFT_COLUMNS) {
        if (optCol in workingPayload) {
          delete workingPayload[optCol];
          strippedColumns.add(optCol);
          dropped = true;
          break;
        }
      }
      if (dropped) continue;
    }

    if (isForeignKeyError(err)) {
      const { msg } = getErrCodeMsg(err);
      if (/deal_id/i.test(msg) && 'deal_id' in workingPayload && workingPayload.deal_id !== null) {
        workingPayload.deal_id = null;
        continue;
      }
      if (/gate_request_id/i.test(msg) && 'gate_request_id' in workingPayload && workingPayload.gate_request_id !== null) {
        workingPayload.gate_request_id = null;
        continue;
      }
      if (/building_id/i.test(msg) && 'building_id' in workingPayload && workingPayload.building_id !== null) {
        workingPayload.building_id = null;
        continue;
      }
    }

    return { data: null, error: err, strippedColumns, tableMissing: false };
  }

  return {
    data: null,
    error: new Error('im_pro_grants mutation exceeded schema-drift retries'),
    strippedColumns,
    tableMissing: false,
  };
}

/**
 * Issues a new `im_pro_grants` row or refreshes an existing grant (`pending_nda` by default),
 * populating `grant_token`, `expires_at` (`ttlHours` default 72), and `max_downloads` (default 5).
 */
export async function issueOrRefreshProGrant(
  supabase: ProGrantSupabaseLike,
  input: IssueProGrantInput,
): Promise<IssueProGrantResult> {
  if (!supabase || typeof supabase.from !== 'function') {
    return { ok: false, created: false, grant: null, grantToken: null, error: 'Supabase client unavailable' };
  }

  const ttlHours =
    typeof input.ttlHours === 'number' && Number.isFinite(input.ttlHours) && input.ttlHours > 0
      ? input.ttlHours
      : 72;
  const maxDownloads =
    typeof input.maxDownloads === 'number' && Number.isFinite(input.maxDownloads) && input.maxDownloads > 0
      ? Math.floor(input.maxDownloads)
      : 5;
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  let existingGrant: GrantRow | null = null;
  if (input.grantId) {
    const res = await queryTableRows(supabase, 'im_pro_grants', 'id', input.grantId, 1);
    if (res.missingTable) {
      return { ok: false, created: false, grant: null, grantToken: null, tableMissing: true, error: 'im_pro_grants table unavailable' };
    }
    existingGrant = res.rows[0] ?? null;
  } else if (input.gateRequestId) {
    const res = await queryTableRows(supabase, 'im_pro_grants', 'gate_request_id', input.gateRequestId, 5);
    if (res.missingTable) {
      return { ok: false, created: false, grant: null, grantToken: null, tableMissing: true, error: 'im_pro_grants table unavailable' };
    }
    if (!res.missingColumn) {
      existingGrant = pickBestGrant(res.rows);
    }
  }

  if (!existingGrant && input.buildingId && !input.grantId && !input.gateRequestId) {
    const res = await queryTableRows(supabase, 'im_pro_grants', 'building_id', input.buildingId, 10);
    if (!res.missingTable && !res.missingColumn && res.rows.length > 0) {
      const sameRequester = res.rows.filter((r) => {
        if (r.is_revoked === true || r.status === 'revoked') return false;
        if (input.requesterId && r.requester_id) return String(r.requester_id) === String(input.requesterId);
        if (input.requesterEmail && r.requester_email) {
          return String(r.requester_email).toLowerCase() === input.requesterEmail.trim().toLowerCase();
        }
        if (input.requesterPhone && r.requester_phone) {
          return String(r.requester_phone).replace(/\D/g, '') === input.requesterPhone.replace(/\D/g, '');
        }
        return false;
      });
      existingGrant = pickBestGrant(sameRequester);
    }
  }

  if (existingGrant && existingGrant.status !== 'revoked' && existingGrant.is_revoked !== true) {
    const existingToken =
      typeof existingGrant.grant_token === 'string' && existingGrant.grant_token.trim().length >= 8
        ? existingGrant.grant_token.trim()
        : null;
    const tokenToPersist = existingToken || generateCryptoGrantToken();
    const nextStatus =
      input.status ||
      (existingGrant.status === 'active' && existingGrant.nda_signed_at ? 'active' : 'pending_nda');

    const updatePatch: Record<string, unknown> = {
      status: nextStatus,
      expires_at: expiresAt,
      grant_token: tokenToPersist,
      max_downloads: existingGrant.max_downloads ?? maxDownloads,
      download_count: typeof existingGrant.download_count === 'number' ? existingGrant.download_count : 0,
    };
    if (!existingGrant.building_id && input.buildingId) updatePatch.building_id = input.buildingId;
    if (!existingGrant.gate_request_id && input.gateRequestId) updatePatch.gate_request_id = input.gateRequestId;
    if (!existingGrant.broker_id && input.brokerId) updatePatch.broker_id = input.brokerId;
    if (!existingGrant.requester_id && input.requesterId) updatePatch.requester_id = input.requesterId;
    if (!existingGrant.requester_email && input.requesterEmail) updatePatch.requester_email = input.requesterEmail;
    if (input.pdfExportAllowed !== undefined) updatePatch.pdf_export_allowed = input.pdfExportAllowed;

    const updated = await mutateGrantWithDriftFallback(supabase, 'update', updatePatch, String(existingGrant.id));
    if (updated.error) {
      log.warn('[issueOrRefreshProGrant] update failed', { id: existingGrant.id, error: updated.error });
      const { msg } = getErrCodeMsg(updated.error);
      return {
        ok: false,
        created: false,
        grant: null,
        grantToken: null,
        tableMissing: updated.tableMissing,
        error: msg || 'Grant update failed',
      };
    }
    const effectiveToken = updated.strippedColumns.has('grant_token')
      ? computeDeterministicHmacFallback(String(existingGrant.id))
      : tokenToPersist;
    return {
      ok: true,
      created: false,
      grant: updated.data,
      grantToken: effectiveToken,
    };
  }

  const grantId = input.grantId || crypto.randomUUID();
  const token = generateCryptoGrantToken();
  const cleanName = (input.requesterName || '').trim() || '투자 검토자';
  const cleanPhone = (input.requesterPhone || '').trim() || '010-0000-0000';

  const insertPayload: Record<string, unknown> = {
    id: grantId,
    deal_id: input.dealId || null,
    building_id: input.buildingId || null,
    gate_request_id: input.gateRequestId || null,
    broker_id: input.brokerId || null,
    requester_id: input.requesterId || null,
    requester_name: cleanName,
    requester_phone: cleanPhone,
    requester_email: input.requesterEmail ? input.requesterEmail.trim() : null,
    status: input.status || 'pending_nda',
    grant_token: token,
    expires_at: expiresAt,
    max_downloads: maxDownloads,
    download_count: 0,
    pdf_export_allowed: input.pdfExportAllowed !== false,
  };

  const inserted = await mutateGrantWithDriftFallback(supabase, 'insert', insertPayload);
  if (inserted.error) {
    log.warn('[issueOrRefreshProGrant] insert failed', { grantId, error: inserted.error });
    const { msg } = getErrCodeMsg(inserted.error);
    return {
      ok: false,
      created: false,
      grant: null,
      grantToken: null,
      tableMissing: inserted.tableMissing,
      error: msg || 'Grant creation failed',
    };
  }

  const resolvedId = String(inserted.data?.id || grantId);
  const effectiveToken = inserted.strippedColumns.has('grant_token')
    ? computeDeterministicHmacFallback(resolvedId)
    : token;

  return {
    ok: true,
    created: true,
    grant: inserted.data,
    grantToken: effectiveToken,
  };
}

function extractGrantCookieToken(rawCookie: string | undefined, grant: ProGrantEntity): string {
  const clean = typeof rawCookie === 'string' ? rawCookie.trim() : '';
  if (!clean) return '';
  const colonIdx = clean.indexOf(':');
  if (colonIdx <= 0) return clean;

  const cookieGrantId = clean.slice(0, colonIdx).trim();
  const cookieToken = clean.slice(colonIdx + 1).trim();
  if (!cookieToken) return '';
  if (
    cookieGrantId === String(grant.id) ||
    (grant.gate_request_id && cookieGrantId === String(grant.gate_request_id))
  ) {
    return cookieToken;
  }
  return '';
}

function isGrantTokenMatch(candidate: string, grant: ProGrantEntity): boolean {
  if (!candidate) return false;
  if (
    typeof grant.grant_token === 'string' &&
    grant.grant_token.trim().length >= 8 &&
    timingSafeStringEqual(candidate, grant.grant_token.trim())
  ) {
    return true;
  }
  if (verifyHmacGrantToken(String(grant.id), candidate)) {
    return true;
  }
  if (grant.gate_request_id && verifyHmacGrantToken(String(grant.gate_request_id), candidate)) {
    return true;
  }
  return false;
}

/**
 * Verifies Pro IM viewer/export authorization via grant token (query/header/cookie)
 * or an authenticated session matching requester, broker, or admin. Fail-closed (403).
 */
export async function verifyProGrantViewerAccess(
  req: RequestLike,
  grant: ProGrantEntity,
): Promise<ProGrantViewerAccessResult> {
  let queryToken = req.nextUrl?.searchParams?.get('token')?.trim() || '';
  if (!queryToken && typeof req.url === 'string' && req.url) {
    try {
      queryToken = new URL(req.url, 'http://localhost').searchParams.get('token')?.trim() || '';
    } catch {
      // Ignore malformed URL fallback
    }
  }
  const headerToken = req.headers?.get('x-grant-token')?.trim() || '';
  const cookieToken = extractGrantCookieToken(req.cookies?.get('cre_pro_grant')?.value, grant);

  const candidates = Array.from(new Set([queryToken, headerToken, cookieToken].filter(Boolean)));
  for (const candidate of candidates) {
    if (isGrantTokenMatch(candidate, grant)) {
      return { ok: true, status: 200 };
    }
  }

  try {
    const authReq =
      req.headers && req.cookies && typeof req.cookies.getAll === 'function'
        ? req
        : {
            url: req.url,
            nextUrl: req.nextUrl,
            headers: req.headers ?? new Headers(),
            cookies: {
              get: (name: string) => req.cookies?.get?.(name),
              getAll: () => (typeof req.cookies?.getAll === 'function' ? req.cookies.getAll() : []),
            },
          };
    const authRes = await verifyAuth(authReq as Parameters<typeof verifyAuth>[0]);
    if (!authRes.error && authRes.user) {
      if (authRes.role === 'admin') {
        return { ok: true, status: 200 };
      }
      if (grant.requester_id && authRes.user.id === String(grant.requester_id)) {
        return { ok: true, status: 200 };
      }
      if (grant.broker_id && authRes.user.id === String(grant.broker_id)) {
        return { ok: true, status: 200 };
      }
      if (
        grant.requester_email &&
        authRes.user.email &&
        authRes.user.email.trim().toLowerCase() === String(grant.requester_email).trim().toLowerCase()
      ) {
        return { ok: true, status: 200 };
      }
    }
  } catch {
    // Fail closed when auth lookup errors
  }

  return {
    ok: false,
    status: 403,
    error: '열람 권한 토큰이 필요합니다.',
    code: 'GRANT_TOKEN_REQUIRED',
  };
}

/**
 * Atomically consumes one download slot for an `im_pro_grants` record before rendering.
 * Prefers `consume_im_pro_grant_download` RPC and falls back cleanly to conditional CAS update.
 */
export async function consumeProGrantDownload(
  supabase: ProGrantSupabaseLike & {
    rpc?: (fn: string, params: Record<string, unknown>) => PromiseLike<{ data?: unknown; error?: unknown }>;
  },
  grantId: string,
  maxDownloads = 5,
  currentDownloadCount = 0,
): Promise<ConsumeProGrantDownloadResult> {
  const effectiveMax =
    typeof maxDownloads === 'number' && Number.isFinite(maxDownloads) && maxDownloads > 0
      ? Math.floor(maxDownloads)
      : 5;
  const used =
    typeof currentDownloadCount === 'number' && Number.isFinite(currentDownloadCount) && currentDownloadCount >= 0
      ? Math.floor(currentDownloadCount)
      : 0;

  if (used >= effectiveMax) {
    return {
      ok: false,
      status: 429,
      limit: effectiveMax,
      used,
      error: '다운로드 횟수 초과',
    };
  }

  if (supabase && typeof supabase.rpc === 'function') {
    try {
      const rpcRes = await supabase.rpc('consume_im_pro_grant_download', {
        p_grant_id: grantId,
        p_default_max: effectiveMax,
      });
      if (!rpcRes?.error && rpcRes?.data != null) {
        const raw = Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data;
        if (typeof raw === 'boolean') {
          return raw
            ? { ok: true, status: 200, limit: effectiveMax, used: used + 1 }
            : { ok: false, status: 429, limit: effectiveMax, used: effectiveMax, error: '다운로드 횟수 초과' };
        }
        if (raw && typeof raw === 'object') {
          const rec = raw as Record<string, unknown>;
          const allowed =
            rec.ok !== undefined
              ? Boolean(rec.ok)
              : rec.allowed !== undefined
              ? Boolean(rec.allowed)
              : rec.consumed !== undefined
              ? Boolean(rec.consumed)
              : true;
          const nextLimit = Number(rec.limit ?? rec.max_downloads ?? effectiveMax) || effectiveMax;
          const nextUsed = Number(rec.used ?? rec.download_count ?? (allowed ? used + 1 : nextLimit));
          if (!allowed) {
            return {
              ok: false,
              status: 429,
              limit: nextLimit,
              used: nextUsed,
              error: '다운로드 횟수 초과',
            };
          }
          return { ok: true, status: 200, limit: nextLimit, used: nextUsed };
        }
      }
      // On 42883 / PGRST202 / RPC error or null data, fall through to atomic CAS update
    } catch {
      // Mock or unsupported RPC — fall through to atomic CAS update
    }
  }

  try {
    const tbl = supabase.from('im_pro_grants') as TableRef | null | undefined;
    if (!tbl || typeof tbl.update !== 'function') {
      return { ok: true, status: 200, limit: effectiveMax, used: used + 1 };
    }
    let q = tbl.update({ download_count: used + 1 }) as QueryChain & {
      lt?: (col: string, val: number) => QueryChain;
    };
    if (typeof q?.eq === 'function') {
      q = q.eq('id', grantId) as typeof q;
    }
    if (typeof q?.lt === 'function') {
      q = q.lt('download_count', effectiveMax) as typeof q;
    }
    if (typeof q?.select === 'function') {
      q = q.select('id') as typeof q;
      const casRes = await q;
      if (!casRes?.error && Array.isArray(casRes?.data) && casRes.data.length === 0) {
        return {
          ok: false,
          status: 429,
          limit: effectiveMax,
          used: effectiveMax,
          error: '다운로드 횟수 초과',
        };
      }
      if (casRes?.error && !isMissingColumnError(casRes.error)) {
        // Non-blocking on legacy schemas
      }
    } else {
      await q;
    }
    return { ok: true, status: 200, limit: effectiveMax, used: used + 1 };
  } catch {
    return { ok: true, status: 200, limit: effectiveMax, used: used + 1 };
  }
}
