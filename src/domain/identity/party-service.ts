/**
 * party-service.ts — 검증된 당사자(Party) 관리
 * Spec: DISTRIBUTION_AND_IDENTITY.md §1, §5, §9
 */

import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';
import { isUuid } from '@/lib/im-lite/quick-generate-store';
import type { Party } from '../distribution/types';
import { toE164 } from './gate-schema';
import { RETENTION } from '../distribution/types';

const log = createModuleLogger('party-service');
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export interface IdentityOwnerScope {
  ownerBrokerId?: string;
  isAdmin?: boolean;
}

export class IdentityForbiddenError extends Error {
  constructor(message = '해당 당사자 정보에 대한 권한이 없습니다.') {
    super(message);
    this.name = 'IdentityForbiddenError';
  }
}

export interface CreatePartyInput {
  tenantId: string;
  ownerBrokerId: string;
  name: string;
  phone: string;  // Will be converted to E.164
  email?: string;
  entityType: 'individual' | 'corp' | 'fund' | 'agent';
  consentVersion: string;
}

/**
 * Party를 생성하거나, 같은 tenant+phone의 기존 Party를 반환합니다.
 */
export async function findOrCreateParty(
  input: CreatePartyInput,
  scope?: IdentityOwnerScope,
): Promise<Party> {
  const supabase = createServiceClient();
  const phoneE164 = toE164(input.phone);
  const enforceScope = Boolean(scope && !scope.isAdmin && scope.ownerBrokerId);
  const effectiveOwnerBrokerId =
    enforceScope && scope?.ownerBrokerId ? scope.ownerBrokerId : input.ownerBrokerId;
  const effectiveTenantId = input.tenantId || effectiveOwnerBrokerId;

  // 기존 Party 조회
  let existingQuery = supabase
    .from('party')
    .select()
    .eq('tenant_id', effectiveTenantId)
    .eq('phone_e164', phoneE164);

  if (enforceScope && scope?.ownerBrokerId) {
    existingQuery = existingQuery.eq('owner_broker_id', scope.ownerBrokerId);
  }

  const { data: existing } = await existingQuery.single();

  if (existing) return mapParty(existing);

  // 신규 생성
  const retentionUntil = new Date(
    Date.now() + RETENTION.party.months * 30 * 86400000,
  ).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('party')
    .insert({
      tenant_id: effectiveTenantId,
      owner_broker_id: effectiveOwnerBrokerId,
      name: input.name,
      phone_e164: phoneE164,
      email: input.email,
      entity_type: input.entityType,
      consent_version: input.consentVersion,
      consent_at: new Date().toISOString(),
      retention_until: retentionUntil,
    })
    .select()
    .single();

  if (error) throw new Error(`Party creation failed: ${error.message}`);
  return mapParty(data);
}

/**
 * 매수자 삭제 요청 — 즉시 처리 (§9)
 * party·condition 즉시 파기, 매칭 집계에서도 제거.
 */
export async function deleteParty(
  partyId: string,
  scope?: IdentityOwnerScope,
): Promise<void> {
  const supabase = createServiceClient();
  const enforceScope = Boolean(scope && !scope.isAdmin && scope.ownerBrokerId);

  let existingTenantId: string | null = null;
  let existingBrokerId: string | null = null;
  if (isUuid(partyId) || enforceScope) {
    try {
      const { data: existingRow } = await supabase
        .from('party')
        .select('id, tenant_id, owner_broker_id')
        .eq('id', partyId)
        .maybeSingle();
      if (
        enforceScope &&
        existingRow?.owner_broker_id &&
        String(existingRow.owner_broker_id) !== scope!.ownerBrokerId
      ) {
        throw new IdentityForbiddenError('해당 당사자 정보에 대한 삭제 권한이 없습니다.');
      }
      if (existingRow?.tenant_id && isUuid(String(existingRow.tenant_id))) {
        existingTenantId = String(existingRow.tenant_id);
      }
      if (existingRow?.owner_broker_id && isUuid(String(existingRow.owner_broker_id))) {
        existingBrokerId = String(existingRow.owner_broker_id);
      }
    } catch (preReadErr) {
      if (preReadErr instanceof IdentityForbiddenError) {
        throw preReadErr;
      }
      // Non-blocking pre-read before deletion
    }
  }

  // buyer_condition은 ON DELETE CASCADE로 자동 삭제
  let deleteQuery = supabase
    .from('party')
    .delete()
    .eq('id', partyId);
  if (enforceScope && scope?.ownerBrokerId) {
    deleteQuery = deleteQuery.eq('owner_broker_id', scope.ownerBrokerId);
  }
  const { error } = await deleteQuery;

  if (error) throw new Error(`Party deletion failed: ${error.message}`);

  const deletedAt = new Date().toISOString();
  const safeTenantId = existingTenantId && isUuid(existingTenantId) ? existingTenantId : ZERO_UUID;
  const safeDealId = ZERO_UUID;
  const safePartyId = isUuid(partyId) ? partyId : null;

  // 감사 로그 기록 (track_event — non-blocking, UUID verified)
  if (isUuid(safeTenantId) && isUuid(safeDealId)) {
    try {
      const { error: trackErr } = await supabase.from('track_event').insert({
        tenant_id: safeTenantId,
        deal_id: safeDealId,
        kind: 'party.deleted',
        ...(safePartyId ? { party_id: safePartyId } : {}),
        payload: { partyId, deletedAt, reason: 'user_request' },
      });
      if (trackErr) {
        log.warn('[party-service] track_event audit insert failed (non-blocking):', trackErr.message);
      }
    } catch (trackEx) {
      log.warn('[party-service] track_event audit insert threw:', trackEx);
    }
  }

  // PIPA 파기 영구 감사 로그 (activity_events)
  try {
    const { error: actErr } = await supabase.from('activity_events').insert({
      actor_id: existingBrokerId && isUuid(existingBrokerId) ? existingBrokerId : null,
      actor_role: 'system',
      event_type: 'party_pipa_erased',
      entity_type: 'party',
      entity_id: safePartyId,
      metadata: {
        party_id: partyId,
        tenant_id: safeTenantId,
        deleted_at: deletedAt,
        reason: 'user_request',
        pipa_erasure: true,
      },
    });
    if (actErr) {
      log.warn('[party-service] activity_events PIPA erasure audit failed:', actErr.message);
    }
  } catch (actEx) {
    log.warn('[party-service] activity_events PIPA erasure audit threw:', actEx);
  }
}

/**
 * Recipient를 Party에 확정적으로 결합합니다.
 * §1: 확정적 결합 — 본인이 직접 제출.
 */
export async function bindRecipientToParty(
  recipientId: string,
  partyId: string,
  scope?: IdentityOwnerScope,
): Promise<void> {
  const supabase = createServiceClient();
  const enforceScope = Boolean(scope && !scope.isAdmin && scope.ownerBrokerId);

  if (enforceScope && scope?.ownerBrokerId) {
    const { data: ownedParty } = await supabase
      .from('party')
      .select('id')
      .eq('id', partyId)
      .eq('owner_broker_id', scope.ownerBrokerId)
      .maybeSingle();

    if (!ownedParty) {
      throw new IdentityForbiddenError('해당 당사자(party)에 대한 권한이 없습니다.');
    }

    const { data: recipientRow } = await supabase
      .from('recipient')
      .select('id, broker_id')
      .eq('id', recipientId)
      .maybeSingle();

    const recipientOwner =
      (recipientRow as Record<string, unknown> | null)?.broker_id ??
      (recipientRow as Record<string, unknown> | null)?.owner_broker_id;

    if (!recipientRow || (recipientOwner && String(recipientOwner) !== scope.ownerBrokerId)) {
      throw new IdentityForbiddenError('해당 수신자(recipient)에 대한 권한이 없습니다.');
    }

    await supabase
      .from('recipient')
      .update({ party_id: partyId })
      .eq('id', recipientId)
      .eq('broker_id', scope.ownerBrokerId);
    return;
  }

  await supabase
    .from('recipient')
    .update({ party_id: partyId })
    .eq('id', recipientId);
}

function mapParty(row: any): Party {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ownerBrokerId: row.owner_broker_id,
    name: row.name,
    phoneE164: row.phone_e164,
    email: row.email,
    entityType: row.entity_type,
    consentVersion: row.consent_version,
    consentAt: row.consent_at,
    retentionUntil: row.retention_until,
    createdAt: row.created_at,
  };
}
