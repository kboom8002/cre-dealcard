const RATE_LIMIT_BUCKETS = new Map<string, { count: number; resetAt: number }>();

export const MAX_RATE_LIMIT_BUCKETS = 5_000;

function hasRealSupabaseServiceConfig(): boolean {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) {
    return false;
  }
  if (
    url.includes("mock-supabase") ||
    url.includes("mock.supabase.co") ||
    url.includes("placeholder") ||
    key === "mock-service-role-key" ||
    key.startsWith("mock")
  ) {
    return false;
  }
  return /^https?:\/\//i.test(url);
}

function evictRateLimitBucketsIfNeeded(now: number): void {
  if (RATE_LIMIT_BUCKETS.size > 1_000) {
    for (const [k, v] of RATE_LIMIT_BUCKETS.entries()) {
      if (now > v.resetAt) {
        RATE_LIMIT_BUCKETS.delete(k);
      }
    }
  }

  // Hard cap > 5,000 even if unexpired (FIFO/oldest insertion eviction against IP spray)
  if (RATE_LIMIT_BUCKETS.size >= MAX_RATE_LIMIT_BUCKETS) {
    const excess = RATE_LIMIT_BUCKETS.size - MAX_RATE_LIMIT_BUCKETS + 1;
    let removed = 0;
    for (const oldestKey of RATE_LIMIT_BUCKETS.keys()) {
      RATE_LIMIT_BUCKETS.delete(oldestKey);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

function checkInMemoryBucket(
  key: string,
  maxRequests: number,
  windowMs: number,
  now: number,
): boolean {
  if (maxRequests <= 0) {
    return false;
  }

  const existing = RATE_LIMIT_BUCKETS.get(key);
  if (!existing || now > existing.resetAt) {
    if (existing) {
      RATE_LIMIT_BUCKETS.delete(key);
    }
    evictRateLimitBucketsIfNeeded(now);
    RATE_LIMIT_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= maxRequests) {
    return false;
  }

  existing.count += 1;
  return true;
}

export function getRateLimitBucketSize(): number {
  return RATE_LIMIT_BUCKETS.size;
}

export function clearRateLimitBuckets(): void {
  RATE_LIMIT_BUCKETS.clear();
}

/**
 * Fast fixed-window rate limiter with bounded in-memory buckets (<= 5,000)
 * and optional distributed Supabase RPC backing (`check_distributed_rate_limit`)
 * in real production, degrading gracefully to in-memory on RPC absence/failure.
 */
export async function checkRateLimit(
  ip: string,
  actionKey: string,
  maxRequests: number,
  windowMs: number
): Promise<boolean> {
  const now = Date.now();
  const key = `rate_limit_${actionKey}_${ip}`;

  const inMemoryAllowed = checkInMemoryBucket(key, maxRequests, windowMs, now);
  if (!inMemoryAllowed) {
    return false;
  }

  if (hasRealSupabaseServiceConfig()) {
    try {
      const { createServiceClient } = await import("@/lib/supabase/service");
      const supabase = createServiceClient();
      const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      const { data, error } = await supabase.rpc("check_distributed_rate_limit", {
        p_bucket_key: key,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds,
      });
      if (!error && typeof data === "boolean") {
        return data;
      }
    } catch {
      // Graceful fallback to in-memory bucket when RPC or DB is unreachable
    }
  }

  return inMemoryAllowed;
}
