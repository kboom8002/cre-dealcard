/**
 * party-service.ts — 검증된 당사자(Party) 관리
 * Spec: DISTRIBUTION_AND_IDENTITY.md §1, §5, §9
 */

import { createServiceClient } from '@/lib/supabase/service';
import type { Party } from '../distribution/types';
import { toE164 } from './gate-schema';
import { RETENTION } from '../distribution/types';

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
export async function findOrCreateParty(input: CreatePartyInput): Promise<Party> {
  const supabase = createServiceClient();
  const phoneE164 = toE164(input.phone);

  // 기존 Party 조회
  const { data: existing } = await supabase
    .from('party')
    .select()
    .eq('tenant_id', input.tenantId)
    .eq('phone_e164', phoneE164)
    .single();

  if (existing) return mapParty(existing);

  // 신규 생성
  const retentionUntil = new Date(
    Date.now() + RETENTION.party.months * 30 * 86400000,
  ).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('party')
    .insert({
      tenant_id: input.tenantId,
      owner_broker_id: input.ownerBrokerId,
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
export async function deleteParty(partyId: string): Promise<void> {
  const supabase = createServiceClient();

  // buyer_condition은 ON DELETE CASCADE로 자동 삭제
  const { error } = await supabase
    .from('party')
    .delete()
    .eq('id', partyId);

  if (error) throw new Error(`Party deletion failed: ${error.message}`);

  // 감사 로그 기록
  await supabase.from('track_event').insert({
    tenant_id: '00000000-0000-0000-0000-000000000000',
    deal_id: '00000000-0000-0000-0000-000000000000',
    kind: 'party.deleted',
    payload: { partyId, deletedAt: new Date().toISOString(), reason: 'user_request' },
  });
}

/**
 * Recipient를 Party에 확정적으로 결합합니다.
 * §1: 확정적 결합 — 본인이 직접 제출.
 */
export async function bindRecipientToParty(
  recipientId: string,
  partyId: string,
): Promise<void> {
  const supabase = createServiceClient();

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
