import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('rate-limiter');

export async function checkRateLimit(ip: string, actionKey: string, maxRequests: number, windowMs: number): Promise<boolean> {
  const supabase = createServiceClient();
  const now = Date.now();
  const title = `rate_limit_${actionKey}_${ip}`;

  try {
    const { data: existing } = await supabase
      .from('document_objects')
      .select('id, content')
      .eq('source_type', 'manual')
      .eq('document_type', 'snapshot')
      .eq('title', title)
      .maybeSingle();

    if (!existing) {
      await supabase.from('document_objects').insert({
        source_type: 'manual',
        document_type: 'snapshot',
        title,
        content: { count: 1, resetAt: now + windowMs },
      });
      return true;
    }

    const content = existing.content as { count: number; resetAt: number };
    if (!content || now > content.resetAt) {
      await supabase.from('document_objects').update({
        content: { count: 1, resetAt: now + windowMs }
      }).eq('id', existing.id);
      return true;
    }

    if (content.count >= maxRequests) {
      return false;
    }

    await supabase.from('document_objects').update({
      content: { count: content.count + 1, resetAt: content.resetAt }
    }).eq('id', existing.id);
    return true;

  } catch (err) {
    log.warn('[RateLimiter] Failed to check rate limit, allowing request:', err);
    return true; // Fail open
  }
}
