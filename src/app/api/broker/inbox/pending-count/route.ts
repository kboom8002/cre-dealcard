import { NextRequest } from 'next/server';
import { handleGetPendingCount } from '@/lib/inbox/inbox-pending-count';

/**
 * GET /api/broker/inbox/pending-count
 * Returns the count of pending IM / gate / inquiry requests for the authenticated broker.
 */
export async function GET(req: NextRequest) {
  return handleGetPendingCount(req);
}
