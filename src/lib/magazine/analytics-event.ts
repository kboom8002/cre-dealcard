/**
 * src/lib/magazine/analytics-event.ts — 공개 analytics 이벤트 스키마·정규화 (서버 전용, E-04)
 * (Next.js route 파일은 허용된 이름만 export 할 수 있어 스키마·상수는 여기에 둔다)
 */
import { z } from 'zod/v4';
import { SID_TOKEN_RE, VISITOR_ID_RE } from '@/lib/magazine/visitor-id';
import { UUID_RE } from '@/lib/magazine/slug';

/** 같은 방문자의 page_view 중복 억제 창 */
export const PAGE_VIEW_DEDUP_MINUTES = 30;
/** 브로커당 시간당 핫리드 알림 상한 (S2-08) */
export const HOT_LEAD_ALERTS_PER_HOUR = 5;

export const EVENT_TYPES = ['page_view', 'section_view', 'click', 'scroll_depth', 'dwell'] as const;

export const AnalyticsEventSchema = z.object({
  edition_id: z.string().regex(UUID_RE),
  visitor_id: z.string().regex(VISITOR_ID_RE),
  event_type: z.enum(EVENT_TYPES),
  section_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  target_url: z.string().max(500).optional(),
  target_param: z.string().max(60).optional(),
  dwell_seconds: z.number().int().min(0).max(14_400).optional(),
  scroll_pct: z.number().int().min(0).max(100).optional(),
  // 알려지지 않은 키(alert / is_hot_lead / broker_id …)는 zod 가 제거한다.
  metadata: z
    .object({
      referrer: z.string().max(500).optional(),
      pv: z.string().regex(/^[A-Za-z0-9_-]{4,32}$/).optional(),
      sid: z.string().regex(SID_TOKEN_RE).optional(),
      meta: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});
export type AnalyticsEventBody = z.infer<typeof AnalyticsEventSchema>;

/** 저장용 URL: 쿼리·해시 제거(개인정보 방지), tel:/mailto: 는 번호·주소를 버리고 스킴만 남긴다. */
export function sanitizeTargetUrl(u: string | undefined): string | null {
  if (!u) return null;
  const s = u.trim();
  if (!s) return null;
  if (/^tel:/i.test(s)) return 'tel:';
  if (/^mailto:/i.test(s)) return 'mailto:';
  if (/^(javascript|data|vbscript):/i.test(s)) return null;
  const cut = s.split(/[?#]/)[0];
  return cut.slice(0, 300) || null;
}

export function referrerHost(ref: string | undefined): string | null {
  if (!ref) return null;
  try {
    return new URL(ref).host.slice(0, 100) || null;
  } catch {
    return null;
  }
}
