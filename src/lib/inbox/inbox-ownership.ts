import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import {
  getInboxState,
  getQuickImRecord,
  isUuid,
} from '@/lib/im-lite/quick-generate-store';
import { isRealProductionRuntime } from '@/lib/env';
import { getWorkspaceItemByAnyId } from '@/lib/workspace/workspace-repository';
import { isIgnorableSchemaError } from './inbox-schema-caps';

function getShareLinkHmacSecret(): string {
  const shareLinkSecret = (process.env.SHARE_LINK_SECRET || '').trim();
  if (shareLinkSecret.length >= 32) {
    return shareLinkSecret;
  }
  const nextAuthSecret = (process.env.NEXTAUTH_SECRET || '').trim();
  if (nextAuthSecret.length >= 32) {
    return nextAuthSecret;
  }
  if (isRealProductionRuntime()) {
    throw new Error(
      'FATAL: SHARE_LINK_SECRET (or NEXTAUTH_SECRET) of at least 32 characters must be configured in production.'
    );
  }
  return shareLinkSecret || nextAuthSecret || 'credeal-share-link-hmac-secret-v1';
}

function decodeSignedShareToken(token: string): {
  validSig: boolean;
  buildingId?: string;
  brokerId?: string;
  recipientId?: string;
} {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'slk') {
    return { validSig: false };
  }
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return { validSig: false };
  }
  const expectedSig = crypto
    .createHmac('sha256', getShareLinkHmacSecret())
    .update(payloadB64)
    .digest('base64url');
  const sigBuf = Buffer.from(sigB64);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { validSig: false };
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as {
      b?: string;
      u?: string;
      r?: string;
    };
    return {
      validSig: true,
      buildingId: typeof parsed?.b === 'string' ? parsed.b : undefined,
      brokerId: typeof parsed?.u === 'string' && parsed.u ? parsed.u : undefined,
      recipientId: typeof parsed?.r === 'string' && parsed.r ? parsed.r : undefined,
    };
  } catch {
    return { validSig: false };
  }
}

export async function inspectShareTokenOwnership(token: string): Promise<{
  ownerId: string | null;
  buildingId: string;
  recipientId: string;
}> {
  if (!token) {
    return { ownerId: null, buildingId: '', recipientId: '' };
  }

  const memStore = (globalThis as any).__CRE_SHARE_LINK_TOKEN_STORE__ as
    | {
        tokens?: Record<string, { buildingId?: string; brokerId?: string | null; recipientId?: string | null }>;
        revokedTokens?: Record<string, { buildingId?: string; brokerId?: string | null }>;
      }
    | undefined;
  const memEntry = memStore?.tokens?.[token];
  const memRevoked = memStore?.revokedTokens?.[token];
  const decoded = decodeSignedShareToken(token);

  let dbOwnerId: string | null = null;
  let dbBuildingId = '';
  let dbRecipientId = '';

  try {
    const supabase = createServiceClient();
    const q: any = supabase
      .from('im_share_links')
      .select('token, building_id, broker_id, recipient_id')
      .eq('token', token);
    const res = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q.single?.();
    if (res?.data) {
      if (res.data.broker_id) dbOwnerId = String(res.data.broker_id);
      if (res.data.building_id) dbBuildingId = String(res.data.building_id);
      if (res.data.recipient_id) dbRecipientId = String(res.data.recipient_id);
    }
  } catch {
    // ignore if im_share_links table unavailable in minimal mock
  }

  const ownerId =
    dbOwnerId ||
    memEntry?.brokerId ||
    memRevoked?.brokerId ||
    (decoded.validSig && decoded.brokerId ? decoded.brokerId : null) ||
    null;
  const buildingId =
    dbBuildingId ||
    memEntry?.buildingId ||
    memRevoked?.buildingId ||
    (decoded.validSig && decoded.buildingId ? decoded.buildingId : '') ||
    '';
  const recipientId =
    dbRecipientId ||
    memEntry?.recipientId ||
    (decoded.validSig && decoded.recipientId ? decoded.recipientId : '') ||
    '';

  return { ownerId, buildingId, recipientId };
}

export async function verifyBrokerOwnership(params: {
  userId: string;
  isAdmin: boolean;
  buildingId: string;
  threadId: string;
  clientId?: string;
  action?: string;
}): Promise<{ allowed: boolean; status?: number; reason?: string }> {
  const { userId, isAdmin, buildingId, threadId, clientId, action = '' } = params;
  if (isAdmin) return { allowed: true };

  const strictMode =
    isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1';
  const strictUuidMode =
    strictMode || (process.env.NODE_ENV === 'production' && !process.env.VITEST);

  // 1. In-memory / test quick store check
  if (buildingId) {
    const quickRec = getQuickImRecord(buildingId);
    if (quickRec?.ownerId && quickRec.ownerId !== userId) {
      return { allowed: false, status: 403, reason: '다른 중개인의 매물에 접근할 수 없습니다.' };
    }
  }

  // 2. Check custom client ownership in memory
  let verifiedViaTarget = false;
  const targetClientKey = clientId || threadId;
  if (targetClientKey) {
    const rawCustomId = targetClientKey.replace(/^(?:custom[-_]|cli-)/, '');
    const inboxState = getInboxState();
    const matchedCustom = inboxState.customClients.find(
      (c) =>
        c.id === targetClientKey ||
        c.id === rawCustomId ||
        c.id === `custom_${rawCustomId}`
    );
    if (matchedCustom && (!matchedCustom.ownerId || matchedCustom.ownerId !== userId)) {
      return {
        allowed: false,
        status: 403,
        reason: '다른 중개인의 고객 정보에 접근할 수 없습니다.',
      };
    }
    if (matchedCustom) {
      verifiedViaTarget = true;
    }
  }

  // 3. DB ownership check (fail-closed on DB errors and unauthorized/missing targets)
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (
      process.env.NODE_ENV === 'test' &&
      msg.includes('getServerEnv must not be called on the client')
    ) {
      return { allowed: true };
    }
    return {
      allowed: false,
      status: 503,
      reason: '데이터베이스 연결을 초기화할 수 없습니다.',
    };
  }

  const rawReqId = threadId.replace(/^srv-/, '');
  let verifiedViaInquiry = false;
  let verifiedBuildingOwnership = false;

  if (buildingId) {
    const wsBld = await getWorkspaceItemByAnyId(supabase, buildingId);
    if (wsBld) {
      if (wsBld.ownerId !== userId) {
        return { allowed: false, status: 403, reason: '해당 빌딩의 소유 중개인이 아닙니다.' };
      }
      verifiedBuildingOwnership = true;
    }
  }

  let checkedGateOrInquiryNotFound = false;

  if (
    rawReqId &&
    isUuid(rawReqId) &&
    !threadId.startsWith('custom_') &&
    !threadId.startsWith('cli-') &&
    !threadId.startsWith('sub_') &&
    !threadId.startsWith('view_')
  ) {
    const { data: gateReq, error: gateErr } = await supabase
      .from('gate_requests')
      .select('id, building_id')
      .eq('id', rawReqId)
      .maybeSingle();

    if (gateErr && !isIgnorableSchemaError(gateErr)) {
      return {
        allowed: false,
        status: 500,
        reason: '열람 요청 소유권 확인 중 오류가 발생했습니다.',
      };
    }

    if (gateReq) {
      const gateBldId = (gateReq as any).building_id ? String((gateReq as any).building_id) : '';
      if (gateBldId) {
        const wsGateBld = await getWorkspaceItemByAnyId(supabase, gateBldId);
        if (wsGateBld && wsGateBld.ownerId !== userId) {
          return {
            allowed: false,
            status: 403,
            reason: '해당 IM 열람 요청의 소유 중개인이 아닙니다.',
          };
        }
        if (isUuid(gateBldId)) {
          const [{ data: reqBld, error: reqBldErr }, { data: reqLegacyBld, error: reqLegacyErr }] =
            await Promise.all([
              supabase
                .from('building_ssot_lite')
                .select('owner_id')
                .eq('id', gateBldId)
                .maybeSingle(),
              supabase.from('buildings').select('*').eq('id', gateBldId).maybeSingle(),
            ]);

          if (reqBldErr && !isIgnorableSchemaError(reqBldErr)) {
            return {
              allowed: false,
              status: 500,
              reason: '열람 요청 매물 소유권 확인 중 오류가 발생했습니다.',
            };
          }
          if (reqBld?.owner_id && String(reqBld.owner_id) !== userId) {
            return {
              allowed: false,
              status: 403,
              reason: '해당 IM 열람 요청의 소유 중개인이 아닙니다.',
            };
          }
          if (reqLegacyErr && !isIgnorableSchemaError(reqLegacyErr)) {
            return {
              allowed: false,
              status: 500,
              reason: '열람 요청 매물 소유권 확인 중 오류가 발생했습니다.',
            };
          }
          const legacyRec = reqLegacyBld as Record<string, unknown> | null;
          const reqLegacyOwner = legacyRec?.owner_id ?? legacyRec?.created_by;
          if (reqLegacyOwner && String(reqLegacyOwner) !== userId) {
            return {
              allowed: false,
              status: 403,
              reason: '해당 IM 열람 요청의 소유 중개인이 아닙니다.',
            };
          }
          if (!wsGateBld && !reqBld?.owner_id && !(reqLegacyBld as any)?.owner_id) {
            return {
              allowed: false,
              status: 403,
              reason: '해당 IM 열람 요청의 소유 중개인을 확인할 수 없습니다.',
            };
          }
        }
      }
      verifiedViaTarget = true;
    }

    const { data: inqRow, error: inqErr } = await supabase
      .from('im_inquiry_requests')
      .select('id, building_id, broker_user_id')
      .eq('id', rawReqId)
      .maybeSingle();

    if (inqErr && !isIgnorableSchemaError(inqErr)) {
      return { allowed: false, status: 500, reason: '문의 소유권 확인 중 오류가 발생했습니다.' };
    }

    if (inqRow) {
      if ((inqRow as any).broker_user_id && String((inqRow as any).broker_user_id) !== userId) {
        return { allowed: false, status: 403, reason: '해당 IM 문의의 소유 중개인이 아닙니다.' };
      }
      if ((inqRow as any).broker_user_id && String((inqRow as any).broker_user_id) === userId) {
        verifiedViaInquiry = true;
        verifiedViaTarget = true;
      }
    }

    if (!gateReq && !inqRow) {
      checkedGateOrInquiryNotFound = true;
    }
  }

  if (
    targetClientKey &&
    !targetClientKey.startsWith('sub_') &&
    !targetClientKey.startsWith('view_') &&
    (targetClientKey.startsWith('custom_') ||
      targetClientKey.startsWith('custom-') ||
      targetClientKey.startsWith('cli-') ||
      isUuid(targetClientKey))
  ) {
    const rawClientId = targetClientKey.replace(/^(?:custom[-_]|cli-)/, '');
    if (isUuid(rawClientId)) {
      const { data: cliRow, error: cliErr } = await supabase
        .from('broker_clients')
        .select('id, broker_id')
        .eq('id', rawClientId)
        .maybeSingle();
      if (cliErr && !isIgnorableSchemaError(cliErr)) {
        return { allowed: false, status: 500, reason: '고객 소유권 확인 중 오류가 발생했습니다.' };
      }
      if (cliRow) {
        if (!cliRow.broker_id || String(cliRow.broker_id) !== userId) {
          return {
            allowed: false,
            status: 403,
            reason: '다른 중개인의 고객 정보에 접근할 수 없습니다.',
          };
        }
        verifiedViaTarget = true;
      } else if (
        strictUuidMode &&
        action !== 'upsert_client' &&
        !verifiedViaTarget &&
        (Boolean(clientId) ||
          targetClientKey.startsWith('custom_') ||
          targetClientKey.startsWith('custom-') ||
          targetClientKey.startsWith('cli-') ||
          checkedGateOrInquiryNotFound)
      ) {
        const memExists = getInboxState().customClients.some(
          (c) =>
            c.ownerId === userId &&
            (c.id === targetClientKey || c.id === rawClientId || c.id === `custom_${rawClientId}`)
        );
        if (!memExists) {
          return {
            allowed: false,
            status: 404,
            reason: '대상 고객 또는 스레드를 찾을 수 없습니다.',
          };
        }
        verifiedViaTarget = true;
      }
    }
  } else if (checkedGateOrInquiryNotFound && strictUuidMode && action !== 'upsert_client') {
    return {
      allowed: false,
      status: 404,
      reason: '대상 스레드 또는 열람 요청을 찾을 수 없습니다.',
    };
  }

  if (targetClientKey && targetClientKey.startsWith('sub_')) {
    const rawSubId = targetClientKey.replace(/^sub_/, '');
    if (rawSubId) {
      const { data: subRow, error: subErr } = await supabase
        .from('magazine_subscribers')
        .select('id, broker_id')
        .eq('id', rawSubId)
        .maybeSingle();
      if (subErr && !isIgnorableSchemaError(subErr)) {
        return { allowed: false, status: 500, reason: '구독자 소유권 확인 중 오류가 발생했습니다.' };
      }
      if (subRow) {
        if (!subRow.broker_id || String(subRow.broker_id) !== userId) {
          if (!subRow.broker_id) {
            return {
              allowed: false,
              status: 403,
              reason: '소유 중개인이 확인되지 않은 구독 고객 정보에는 접근할 수 없습니다.',
            };
          }
          const { data: bp } = await supabase
            .from('broker_profiles')
            .select('slug')
            .eq('user_id', userId)
            .maybeSingle();
          const ownSlug = bp?.slug ? String(bp.slug).trim() : '';
          if (!ownSlug || String(subRow.broker_id) !== ownSlug) {
            return {
              allowed: false,
              status: 403,
              reason: '다른 중개인의 구독 고객 정보에 접근할 수 없습니다.',
            };
          }
        }
        verifiedViaTarget = true;
      } else if (isUuid(rawSubId) && strictUuidMode) {
        return {
          allowed: false,
          status: 404,
          reason: '대상 구독 고객을 찾을 수 없습니다.',
        };
      }
    }
  }

  if (buildingId) {
    if (isUuid(buildingId)) {
      const [{ data: ssotRow, error: ssotErr }, { data: bldRow, error: bldErr }] =
        await Promise.all([
          supabase
            .from('building_ssot_lite')
            .select('owner_id')
            .eq('id', buildingId)
            .maybeSingle(),
          supabase.from('buildings').select('*').eq('id', buildingId).maybeSingle(),
        ]);

      if (ssotErr && !isIgnorableSchemaError(ssotErr)) {
        return {
          allowed: false,
          status: 500,
          reason: '매물 소유권 검증 중 데이터베이스 오류가 발생했습니다.',
        };
      }
      if (ssotRow) {
        if (!ssotRow.owner_id || String(ssotRow.owner_id) !== userId) {
          return { allowed: false, status: 403, reason: '해당 빌딩의 소유 중개인이 아닙니다.' };
        }
        verifiedBuildingOwnership = true;
      }

      if (bldErr && !isIgnorableSchemaError(bldErr)) {
        return {
          allowed: false,
          status: 500,
          reason: '매물 소유권 검증 중 데이터베이스 오류가 발생했습니다.',
        };
      }
      if (bldRow) {
        const bldRec = bldRow as Record<string, unknown>;
        const bOwner = String(bldRec.owner_id ?? bldRec.created_by ?? '');
        if (bOwner && bOwner !== userId) {
          return { allowed: false, status: 403, reason: '해당 빌딩의 소유 중개인이 아닙니다.' };
        }
        if (bOwner === userId) verifiedBuildingOwnership = true;
      }

      if (verifiedViaInquiry || verifiedBuildingOwnership) {
        return { allowed: true };
      }
      if (strictUuidMode) {
        return {
          allowed: false,
          status: 403,
          reason: '소유권이 확인되지 않은 매물에는 접근할 수 없습니다.',
        };
      }
    } else if (!verifiedBuildingOwnership) {
      // WP-7.3E: bound the non-UUID ownership scan to events that reference this building id
      // (superset filter; the exact match is still evaluated below). Falls back to the legacy
      // unfiltered scan if the filtered query is rejected.
      const canFilterBuilding = /^[A-Za-z0-9_.:-]{1,200}$/.test(buildingId);
      const buildOwnershipEvQ = (filtered: boolean) => {
        let evQ: any = supabase
          .from('activity_events')
          .select('actor_id, entity_id, event_type, metadata, created_at');
        if (typeof evQ.in === 'function') {
          evQ = evQ.in('event_type', ['im_upserted', 'dealcard_upserted']);
        }
        if (filtered && typeof evQ.or === 'function') {
          evQ = evQ.or(`metadata->>building_id.eq.${buildingId},metadata->>im_id.eq.${buildingId}`);
        }
        if (typeof evQ.order === 'function') {
          evQ = evQ.order('created_at', { ascending: false });
        }
        if (filtered && typeof evQ.limit === 'function') {
          evQ = evQ.limit(1000);
        }
        return evQ;
      };
      let evRes = await buildOwnershipEvQ(canFilterBuilding);
      if (canFilterBuilding && evRes?.error) evRes = await buildOwnershipEvQ(false);
      const { data: acts, error: actErr } = evRes;
      if (actErr && !isIgnorableSchemaError(actErr)) {
        return {
          allowed: false,
          status: 500,
          reason: '비-UUID 매물 소유권 검증 중 오류가 발생했습니다.',
        };
      }
      let claimedOwner: string | null = null;
      for (const ev of acts || []) {
        const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<
          string,
          any
        >;
        const evBId = String(meta.building_id || meta.im_id || ev?.entity_id || '').trim();
        if (evBId === buildingId && ev.actor_id) {
          claimedOwner = String(ev.actor_id);
          if (claimedOwner !== userId) {
            return {
              allowed: false,
              status: 403,
              reason: '다른 중개인의 매물에 접근할 수 없습니다.',
            };
          }
          break;
        }
      }
      if (strictMode && !claimedOwner) {
        return {
          allowed: false,
          status: 404,
          reason: '매물 정보를 찾을 수 없습니다.',
        };
      }
    }
  }

  if (
    strictUuidMode &&
    action !== 'upsert_client' &&
    (threadId || clientId) &&
    !verifiedBuildingOwnership &&
    !verifiedViaInquiry &&
    !verifiedViaTarget
  ) {
    return {
      allowed: false,
      status: 404,
      reason: '대상 스레드 또는 고객 정보를 찾을 수 없습니다.',
    };
  }

  return { allowed: true };
}
