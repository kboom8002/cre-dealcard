import { NextRequest } from 'next/server';
import { handleGetInbox } from '@/lib/inbox/inbox-query';

export {
  parseGateRequestReason,
  type InboxCrmClientRole,
  type InboxDispatchHistoryItem,
  type InboxEmailDeliveryStatus,
  type ParsedGateReason,
} from '@/lib/inbox/inbox-helpers';

/**
 * GET /api/broker/inbox
 * 소통함 통합 조회 (modularized in src/lib/inbox/*)
 */
export async function GET(req: NextRequest) {
  return handleGetInbox(req);
}
