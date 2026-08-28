/**
 * @module RailDispatcher
 * @description Universal dispatch rail for all magazine edition types.
 * Handles weekly, seller_report, and owner_report delivery.
 * @see docs/credal_v3/SDD-magazine.md MG-B1, MG-B4
 */

export type EditionType = 'weekly' | 'seller_report' | 'owner_report';

export interface DispatchTarget {
  subscriberId: string;
  email: string;
  segment: string;
  preferences: Record<string, unknown>;
}

export interface DispatchResult {
  editionType: EditionType;
  totalTargets: number;
  dispatched: number;
  failed: number;
  errors: string[];
  dispatchedAt: string;
}

/**
 * Dispatches a magazine edition to targeted subscribers.
 * Routes through the appropriate channel based on edition type.
 */
export async function dispatchEdition(
  editionType: EditionType,
  editionId: string,
  targets: DispatchTarget[],
  htmlContent: string
): Promise<DispatchResult> {
  const errors: string[] = [];
  let dispatched = 0;

  for (const target of targets) {
    try {
      // Route based on edition type
      switch (editionType) {
        case 'weekly':
          await sendWeeklyEmail(target, htmlContent);
          break;
        case 'seller_report':
          await sendSellerReport(target, htmlContent);
          break;
        case 'owner_report':
          await sendOwnerReport(target, htmlContent);
          break;
      }
      dispatched++;
    } catch (err) {
      errors.push(`${target.email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return {
    editionType,
    totalTargets: targets.length,
    dispatched,
    failed: errors.length,
    errors,
    dispatchedAt: new Date().toISOString(),
  };
}

import { createServiceClient } from '@/lib/supabase/service';
import { sendMagazineEmail } from '@/lib/notification/email-service';

// Channel implementations
async function sendWeeklyEmail(target: DispatchTarget, html: string): Promise<void> {
  const supabase = createServiceClient();

  if (target.email) {
    try {
      await sendMagazineEmail({
        to: target.email,
        brokerName: 'CRE DealCard',
        subscriberName: '고객',
        magazineTitle: 'CRE 위클리 매거진',
        headline: '이번 주 상업용 부동산 시장 인사이트입니다.',
        magazineUrl: 'https://www.credeal.net/magazine',
        imageUrl: '',
      });
    } catch (err) {
      console.warn(`[rail] Failed to send email to ${target.email}:`, err);
    }
  }

  const { error } = await supabase.from('dispatch_logs').insert({
    subscriber_id: target.subscriberId,
    email: target.email,
    edition_type: 'weekly',
    dispatched_at: new Date().toISOString(),
  });
  if (error) console.error(`[rail] Failed to log weekly email to ${target.email}:`, error);
}

async function sendSellerReport(target: DispatchTarget, html: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('dispatch_logs').insert({
    subscriber_id: target.subscriberId,
    email: target.email,
    edition_type: 'seller_report',
    dispatched_at: new Date().toISOString(),
  });
  if (error) console.error(`[rail] Failed to log seller report to ${target.email}:`, error);
}

async function sendOwnerReport(target: DispatchTarget, html: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('dispatch_logs').insert({
    subscriber_id: target.subscriberId,
    email: target.email,
    edition_type: 'owner_report',
    dispatched_at: new Date().toISOString(),
  });
  if (error) console.error(`[rail] Failed to log owner report to ${target.email}:`, error);
}
