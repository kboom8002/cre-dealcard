/**
 * Server Feature Flags & Cohorts (WP-P05-02 / S6)
 * 
 * Strict Principle:
 * "클라이언트 body 로 플래그를 켜는 것은 금지합니다"
 * 
 * Resolution Priority:
 * 1. Environment variable override / kill-switch (e.g. FF_WS_SHELL=false/true)
 * 2. ff_ws cookie cohort check
 * 3. Database feature_flags table (cached for 60 seconds)
 * 4. User ID deterministic rollout percentage bucket
 * 5. Default fallback
 */
import { createServiceClient } from '@/lib/supabase/service';
import { createHash } from 'node:crypto';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('flags');

export type FeatureFlagKey =
  | 'ws_shell'
  | 'home_v2'
  | 'card4_editor'
  | 'og_v2'
  | 'send_sheet'
  | 'quick_im'
  | 'basic_im_doc_pptx'
  | 'basic_im_doc_mobile'
  | 'inbox_v2'
  | 'magazine_ws'
  | 'multi_send'
  | 'ff_mobile_core_package';

interface DBFlagRecord {
  key: string;
  enabled: boolean;
  rollout_pct: number;
  allow_user_ids: string[];
  updated_at: string;
}

// In-memory 60s cache
let cachedFlags: Map<string, DBFlagRecord> | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000;

const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
  ws_shell: false,
  home_v2: false,
  card4_editor: false,
  og_v2: false,
  send_sheet: false,
  quick_im: false,
  basic_im_doc_pptx: false,
  basic_im_doc_mobile: false,
  inbox_v2: false,
  magazine_ws: false,
  multi_send: false,
  ff_mobile_core_package: false,
};

function toEnvKey(flag: FeatureFlagKey): string {
  return `FF_${flag.toUpperCase()}`;
}

function parseCookieHeader(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, v] = part.trim().split('=');
    if (k && v !== undefined) {
      result[k] = decodeURIComponent(v);
    }
  }
  return result;
}

function computeRolloutBucket(userId: string, flag: string): number {
  const hash = createHash('sha256').update(`${userId}:${flag}`).digest('hex');
  const num = parseInt(hash.slice(0, 8), 16);
  return num % 100;
}

async function getCachedDBFlags(): Promise<Map<string, DBFlagRecord> | null> {
  const now = Date.now();
  if (cachedFlags && now < cacheExpiresAt) {
    return cachedFlags;
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('feature_flags')
      .select('key, enabled, rollout_pct, allow_user_ids, updated_at');

    if (error) {
      // Table might not exist yet before migration
      return cachedFlags;
    }

    const map = new Map<string, DBFlagRecord>();
    if (Array.isArray(data)) {
      for (const row of data) {
        map.set(row.key, {
          key: row.key,
          enabled: Boolean(row.enabled),
          rollout_pct: Number(row.rollout_pct ?? 0),
          allow_user_ids: Array.isArray(row.allow_user_ids) ? row.allow_user_ids : [],
          updated_at: String(row.updated_at || ''),
        });
      }
    }

    cachedFlags = map;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return cachedFlags;
  } catch (err) {
    log.warn('Failed to fetch feature flags from DB, using cache/defaults:', err);
    return cachedFlags;
  }
}

export interface FlagResolutionContext {
  userId?: string;
  requestHeaders?: Headers | Record<string, string>;
  cookieString?: string;
}

/**
 * Resolves whether a feature flag is enabled on the server side.
 * Never allows client request body to override flag state.
 */
export async function getServerFeatureFlag(
  flag: FeatureFlagKey,
  context?: FlagResolutionContext
): Promise<boolean> {
  // 1. Environment variable override (highest priority)
  const envKey = toEnvKey(flag);
  const envVal = process.env[envKey] ?? process.env[flag.toUpperCase()];
  if (envVal === 'true') return true;
  if (envVal === 'false') return false;

  // 2. Cookie check: ff_ws
  let cookieHeader = context?.cookieString;
  if (!cookieHeader && context?.requestHeaders) {
    if (context.requestHeaders instanceof Headers) {
      cookieHeader = context.requestHeaders.get('cookie') ?? undefined;
    } else if (typeof context.requestHeaders === 'object') {
      cookieHeader = context.requestHeaders['cookie'] ?? context.requestHeaders['Cookie'];
    }
  }

  if (cookieHeader) {
    const cookies = parseCookieHeader(cookieHeader);
    const ffWsVal = cookies['ff_ws'];
    if (ffWsVal) {
      // ff_ws=true or ff_ws=1 enables workspace suite
      if (ffWsVal === 'true' || ffWsVal === '1') {
        if (['ws_shell', 'home_v2', 'card4_editor', 'inbox_v2', 'magazine_ws'].includes(flag)) {
          return true;
        }
      }
      // ff_ws can also contain comma-separated flag list
      if (ffWsVal.split(',').map(s => s.trim()).includes(flag)) {
        return true;
      }
    }
  }

  // 3. Database feature_flags table (cached for 60s)
  const dbFlags = await getCachedDBFlags();
  if (dbFlags && dbFlags.has(flag)) {
    const row = dbFlags.get(flag)!;
    if (!row.enabled) return false;

    // Specific user allowlist
    if (context?.userId && row.allow_user_ids.includes(context.userId)) {
      return true;
    }

    // Percentage rollout
    if (row.rollout_pct >= 100) return true;
    if (row.rollout_pct > 0 && context?.userId) {
      const bucket = computeRolloutBucket(context.userId, flag);
      if (bucket < row.rollout_pct) return true;
    }

    if (row.rollout_pct === 0 && row.allow_user_ids.length === 0) {
      return row.enabled;
    }
  }

  // 4. Default fallback
  return DEFAULT_FLAGS[flag] ?? false;
}

/**
 * Synchronous environment & cookie checker when async DB lookup cannot be performed.
 */
export function getSyncFeatureFlag(
  flag: FeatureFlagKey,
  cookieHeader?: string
): boolean {
  const envKey = toEnvKey(flag);
  const envVal = process.env[envKey] ?? process.env[flag.toUpperCase()];
  if (envVal === 'true') return true;
  if (envVal === 'false') return false;

  if (cookieHeader) {
    const cookies = parseCookieHeader(cookieHeader);
    const ffWsVal = cookies['ff_ws'];
    if (ffWsVal === 'true' || ffWsVal === '1') {
      if (['ws_shell', 'home_v2', 'card4_editor', 'inbox_v2', 'magazine_ws'].includes(flag)) {
        return true;
      }
    }
    if (ffWsVal && ffWsVal.split(',').map(s => s.trim()).includes(flag)) {
      return true;
    }
  }

  return DEFAULT_FLAGS[flag] ?? false;
}
