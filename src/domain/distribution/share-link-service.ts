/**
 * share-link-service.ts — 공유 링크 발급·검증·폐기 서비스
 * Spec: DISTRIBUTION_AND_IDENTITY.md §2
 */

import { createServiceClient } from '@/lib/supabase/service';
import { newShareToken } from './token';
import { evaluateContamination } from './contamination';
import type { ShareLink, Tier } from './types';

export interface CreateShareLinkInput {
  tenantId: string;
  dealId: string;
  dealVersion?: number;
  tier: 'teaser' | 'basic';
  brokerId: string;
  recipientId?: string;  // null for anonymous teaser
  expiresInDays?: number; // default: 30 for basic, null for teaser
}

/**
 * 공유 링크를 발급합니다.
 * 티저: 익명 확산용 (recipient 없음, 만료 없음)
 * Basic: 특정인 발송 (recipient 연결, 30일 만료)
 */
export async function createShareLink(input: CreateShareLinkInput): Promise<ShareLink> {
  const supabase = createServiceClient();
  const token = newShareToken();
  
  const expiresAt = input.tier === 'basic'
    ? new Date(Date.now() + (input.expiresInDays || 30) * 86400000).toISOString()
    : null;

  const { data, error } = await supabase
    .from('share_link')
    .insert({
      token,
      tenant_id: input.tenantId,
      deal_id: input.dealId,
      deal_version: input.dealVersion || 1,
      tier: input.tier,
      broker_id: input.brokerId,
      recipient_id: input.recipientId || null,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create share link: ${error.message}`);
  return mapShareLink(data);
}

/**
 * 토큰으로 공유 링크를 검증합니다.
 * 만료·폐기 확인 후 열람 가능 여부를 반환합니다.
 */
export async function validateShareLink(
  token: string,
): Promise<{ valid: boolean; link?: ShareLink; reason?: string }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('share_link')
    .select()
    .eq('token', token)
    .single();

  if (error || !data) return { valid: false, reason: 'not_found' };

  if (data.revoked_at) return { valid: false, reason: 'revoked' };
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, link: mapShareLink(data) };
}

/**
 * 링크 열람 시 Viewer 카운트를 증분하고 오염을 평가합니다.
 */
export async function recordLinkView(
  token: string,
  viewerId: string,
): Promise<{ contaminated: boolean; notifyBroker?: string }> {
  const supabase = createServiceClient();

  // 이 Viewer가 이 링크를 이미 본 적 있는지 확인
  const { count } = await supabase
    .from('track_event')
    .select('id', { count: 'exact', head: true })
    .eq('share_token', token)
    .eq('viewer_id', viewerId)
    .eq('kind', 'view.opened');

  if (count && count > 0) {
    // 이미 본 Viewer — 카운트 증분 불필요
    return { contaminated: false };
  }

  // 새 Viewer → distinct_viewers 증분
  const { data: linkData } = await supabase
    .from('share_link')
    .select('distinct_viewers')
    .eq('token', token)
    .single();

  const newCount = (linkData?.distinct_viewers || 0) + 1;
  const result = evaluateContamination(newCount);

  await supabase
    .from('share_link')
    .update({
      distinct_viewers: newCount,
      contaminated: result.contaminated,
    })
    .eq('token', token);

  return {
    contaminated: result.contaminated,
    notifyBroker: result.notifyBroker,
  };
}

/**
 * 링크를 폐기합니다.
 */
export async function revokeShareLink(token: string, brokerId: string): Promise<boolean> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('share_link')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', token)
    .eq('broker_id', brokerId);

  return !error;
}

// ── Mapper ──────────────────────────────────────────────
function mapShareLink(row: any): ShareLink {
  return {
    token: row.token,
    tenantId: row.tenant_id,
    dealId: row.deal_id,
    dealVersion: row.deal_version,
    tier: row.tier,
    brokerId: row.broker_id,
    recipientId: row.recipient_id,
    distinctViewers: row.distinct_viewers,
    contaminated: row.contaminated,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/**
 * 치명적인 변경(critical impact) 발생 시 해당 Deal의 모든 공유 링크 권한을 폐기합니다.
 */
export async function revokeGrantsOnCriticalChange(dealId: string): Promise<boolean> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('share_link')
    .update({ revoked_at: new Date().toISOString() })
    .eq('deal_id', dealId)
    .is('revoked_at', null);

  return !error;
}
