const RATE_LIMIT_BUCKETS = new Map<string, { count: number; resetAt: number }>();

/**
 * Lightweight in-memory fixed-window rate limiter.
 * Avoids reading/writing `document_objects` on every public API request (0 Disk IO).
 */
export async function checkRateLimit(
  ip: string,
  actionKey: string,
  maxRequests: number,
  windowMs: number
): Promise<boolean> {
  const now = Date.now();
  const key = `rate_limit_${actionKey}_${ip}`;

  // Opportunistic cleanup of expired buckets when map grows
  if (RATE_LIMIT_BUCKETS.size > 1000) {
    for (const [k, v] of RATE_LIMIT_BUCKETS.entries()) {
      if (now > v.resetAt) {
        RATE_LIMIT_BUCKETS.delete(k);
      }
    }
  }

  const existing = RATE_LIMIT_BUCKETS.get(key);
  if (!existing || now > existing.resetAt) {
    RATE_LIMIT_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= maxRequests) {
    return false;
  }

  existing.count += 1;
  return true;
}
