/**
 * GET /api/public/im-lite/[buildingId]/pptx?doc_id=xxx&tier=basic&preset=golden_institutional
 *
 * Mobile IM PPTX 다운로드 (Basic / Pro)
 * Vercel Pro: runtime=nodejs, maxDuration=300
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ReleaseTier } from '@/domain/building/im-core';
import { getServerViewer } from '@/lib/server-viewer';
import { isOwnerOrAdmin } from '@/domain/public-projection/access';
import {
  isImDocStatusPublic,
  PUBLIC_IM_DOC_STATUSES,
  NON_PUBLIC_DOCUMENT_STATUSES,
} from '@/domain/public-projection/visibility';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export const runtime = 'nodejs';
export const maxDuration = 300;  // Vercel Pro — 24p Pro 덱 대응

// W-4: Vercel 서버리스에서 in-memory Map은 인스턴스 간 공유 불가/cold start 리셋됨.
// 향후 Upstash Redis 등 외부 스토어로 전환 권장. 현재는 best-effort.
import { checkRateLimit } from '@/lib/rate-limiter';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const rateLimit = process.env.NODE_ENV === 'development' ? 1000 : 60;
  const isAllowed = await checkRateLimit(ip, 'rate_limit', rateLimit, 3600 * 1000);
  if (!isAllowed) {
    return NextResponse.json({
      error: 'Rate limit exceeded',
      reason: 'PPTX 다운로드 요청이 일시적으로 많습니다.',
      suggestion: '약 1분 뒤에 다시 다운로드 버튼을 눌러주세요.',
    }, { status: 429 });
  }

  const { buildingId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const docId = searchParams.get('doc_id') || searchParams.get('docId');
  /** @deprecated 골디락스 전환 후 렌더에 영향 없음 — 파일명 호환용 */
  const tier = (searchParams.get('tier') ?? 'basic') as 'basic' | 'pro';
  const presetParam = searchParams.get('preset');

  const { getQuickImRecord, resolveOrSynthesizeQuickImRecord, isUuid, getInboxState } = await import('@/lib/im-lite/quick-generate-store');
  const { isBuildingShareLinkRevoked } = await import('@/lib/security/share-link-tokens');
  const memRec = (docId ? getQuickImRecord(docId) : undefined) || getQuickImRecord(buildingId);

  // Create Supabase client with sanitized env values (defends against trailing \r\n on serverless)
  const { env, getServerEnv } = await import('@/lib/env');
  const srvEnv = getServerEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    srvEnv.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  let viewer: any = null;
  try {
    viewer = await getServerViewer();
  } catch {
    viewer = null;
  }

  let latestDeletedTime = 0;
  let dbRevoked: boolean | undefined;
  let dbRevokeTime = 0;
  try {
    const [{ data: imEvents }, { data: govEvents }] = await Promise.all([
      supabase
        .from('activity_events')
        .select('event_type, entity_id, metadata, created_at')
        .in('event_type', ['im_upserted', 'im_deleted', 'im_restored'])
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('activity_events')
        .select('event_type, entity_id, metadata, created_at')
        .in('event_type', ['link_revoked', 'link_restored'])
        .order('created_at', { ascending: false })
        .limit(80),
    ]);

    if (Array.isArray(imEvents)) {
      for (const ev of imEvents) {
        const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, any>;
        const evBId = String(meta.building_id || ev?.entity_id || '');
        const evImId = String(meta.im_id || meta.im_item?.id || '');
        const evItemBid = String(meta.im_item?.buildingId || '');
        if (
          evBId !== buildingId &&
          evImId !== buildingId &&
          evItemBid !== buildingId &&
          (!docId || (evBId !== docId && evImId !== docId))
        ) {
          continue;
        }
        if (ev.event_type === 'im_deleted') {
          latestDeletedTime = Date.parse(ev.created_at || '') || Date.now();
        }
        break;
      }
    }

    if (Array.isArray(govEvents)) {
      for (const row of govEvents) {
        const meta = (row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, any>;
        const evBldId = String(meta.building_id || row?.entity_id || '').trim();
        if (evBldId !== buildingId) continue;
        if (row.event_type === 'link_revoked') {
          dbRevoked = true;
          dbRevokeTime = Date.parse(String(meta.revoked_at || row.created_at || '')) || 0;
          break;
        }
        if (row.event_type === 'link_restored') {
          dbRevoked = false;
          dbRevokeTime = Date.parse(String(meta.restored_at || row.created_at || '')) || 0;
          break;
        }
      }
    }
  } catch {
    // Non-blocking
  }

  let quickRec = latestDeletedTime > 0
    ? null
    : (await resolveOrSynthesizeQuickImRecord(buildingId, supabase, docId)) || memRec;

  let buildingRow: any = null;
  let buildingOwnerId: string | null = null;
  const IM_DOC_TYPES = ['mobile_im', 'im_lite', 'im_lite_draft'];
  let dbDoc: any = null;

  if (isUuid(buildingId) || !quickRec?.fullDocBody) {
    try {
      // 1. Fetch building (owner) first — P0-SEC: 문서 상태/소유자 판정에 사용
      if (isUuid(buildingId)) {
        const { data: bRow } = await supabase
          .from('building_ssot_lite')
          .select('*')
          .eq('id', buildingId)
          .maybeSingle();
        buildingRow = bRow;
      }

      buildingOwnerId = (buildingRow?.owner_id as string | null | undefined) ?? null;

      if (docId && isUuid(buildingId)) {
        const { data: requested } = await supabase
          .from('document_objects')
          .select('*')
          .eq('building_id', buildingId)
          .in('document_type', IM_DOC_TYPES)
          .eq('id', docId)
          .maybeSingle();
        // 비공개 상태 doc_id 는 소유자·admin 에게만 — 그 외에는 무시하고 최신 공개본으로 대체
        if (requested && (isImDocStatusPublic(requested.status) || isOwnerOrAdmin(viewer, buildingOwnerId, requested.owner_id))) {
          dbDoc = requested;
        }
      }

      if (!dbDoc && isUuid(buildingId)) {
        const privileged = isOwnerOrAdmin(viewer, buildingOwnerId);
        let latestQuery = supabase
          .from('document_objects')
          .select('*')
          .eq('building_id', buildingId)
          .in('document_type', IM_DOC_TYPES);
        latestQuery = privileged
          ? latestQuery.not('status', 'in', `(${NON_PUBLIC_DOCUMENT_STATUSES.join(',')})`)
          : latestQuery.in('status', [...PUBLIC_IM_DOC_STATUSES]);
        const { data: latest } = await latestQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
        dbDoc = latest ?? null;
      }
    } catch {
      // Non-blocking fallback for non-UUID or offline DB
    }
  }

  // Check if latest lifecycle event in activity_events is im_deleted and newer than dbDoc?.updated_at
  if (latestDeletedTime > 0) {
    const dbDocUpdatedTime = Date.parse(dbDoc?.updated_at || dbDoc?.created_at || '') || 0;
    if (!dbDoc || latestDeletedTime >= dbDocUpdatedTime) {
      return NextResponse.json({ error: 'IM document has been deleted' }, { status: 404 });
    }
  }

  // Link revocation check
  const inboxRevokedEntry = getInboxState().revokedBuildings?.[buildingId];
  const localRevoked = Boolean(inboxRevokedEntry?.revoked || isBuildingShareLinkRevoked(buildingId));
  const localRevokeTime = inboxRevokedEntry?.revokedAt ? Date.parse(inboxRevokedEntry.revokedAt) || 0 : 0;
  const effectiveRevoked =
    typeof dbRevoked === 'boolean' && (!localRevokeTime || dbRevokeTime >= localRevokeTime)
      ? dbRevoked
      : localRevoked || dbRevoked === true || Boolean(quickRec?.isRevoked) || dbDoc?.body?.is_revoked === true;

  if (effectiveRevoked && !isOwnerOrAdmin(viewer, buildingOwnerId, dbDoc?.owner_id ?? (quickRec as any)?.ownerId)) {
    return NextResponse.json({ ok: false, error: 'LINK_REVOKED' }, { status: 403 });
  }

  let doc: any = null;
  if (dbDoc?.body && quickRec?.fullDocBody) {
    const dbBody = dbDoc.body as Record<string, any>;
    const qrBody = quickRec.fullDocBody as Record<string, any>;
    const dbTime = Date.parse(dbDoc.updated_at || dbBody.updated_at || dbBody.approved_at || dbDoc.created_at || '') || 0;
    const qrTime = Date.parse(quickRec?.updatedAt || quickRec?.createdAt || '') || 0;
    const dbIsNewer = dbTime > 0 && (qrTime === 0 || dbTime > qrTime);
    const primary = dbIsNewer ? dbBody : qrBody;
    const secondary = dbIsNewer ? qrBody : dbBody;

    const mergedBody: Record<string, any> = {
      ...secondary,
      ...primary,
      ssot_summary: {
        ...(secondary.ssot_summary || {}),
        ...(primary.ssot_summary || {}),
        coordinates:
          primary.ssot_summary?.coordinates ||
          secondary.ssot_summary?.coordinates ||
          primary.coordinates ||
          secondary.coordinates,
        pnu:
          primary.ssot_summary?.pnu ||
          secondary.ssot_summary?.pnu ||
          primary.pnu ||
          secondary.pnu ||
          buildingRow?.pnu,
      },
      heroCard: {
        ...(secondary.heroCard || {}),
        ...(primary.heroCard || {}),
      },
      enrichment: primary.enrichment || secondary.enrichment,
      coordinates:
        primary.coordinates ||
        secondary.coordinates ||
        primary.ssot_summary?.coordinates ||
        secondary.ssot_summary?.coordinates,
      pnu:
        primary.pnu ||
        secondary.pnu ||
        primary.ssot_summary?.pnu ||
        secondary.ssot_summary?.pnu ||
        buildingRow?.pnu,
      pnus: primary.pnus || secondary.pnus,
      parcels: primary.parcels || secondary.parcels,
      floor_leases:
        Array.isArray(primary.floor_leases) && primary.floor_leases.length > 0
          ? primary.floor_leases
          : Array.isArray(secondary.floor_leases)
          ? secondary.floor_leases
          : [],
      rent_roll:
        Array.isArray(primary.rent_roll) && primary.rent_roll.length > 0
          ? primary.rent_roll
          : Array.isArray(secondary.rent_roll)
          ? secondary.rent_roll
          : [],
      photos_v2:
        Array.isArray(primary.photos_v2) && primary.photos_v2.length > 0
          ? primary.photos_v2
          : Array.isArray(secondary.photos_v2)
          ? secondary.photos_v2
          : [],
      photos:
        Array.isArray(primary.photos) && primary.photos.length > 0
          ? primary.photos
          : Array.isArray(secondary.photos)
          ? secondary.photos
          : [],
      photo_urls:
        Array.isArray(primary.photo_urls) && primary.photo_urls.length > 0
          ? primary.photo_urls
          : Array.isArray(secondary.photo_urls)
          ? secondary.photo_urls
          : [],
      sections:
        Array.isArray(primary.sections) && primary.sections.length > 0
          ? primary.sections
          : Array.isArray(secondary.sections)
          ? secondary.sections
          : [],
      broker_contact: primary.broker_contact || secondary.broker_contact,
    };

    doc = {
      ...dbDoc,
      id: dbIsNewer ? dbDoc.id : (quickRec.documentId || dbDoc.id),
      building_id: buildingId,
      owner_id: dbDoc.owner_id ?? quickRec.ownerId ?? null,
      title: dbIsNewer ? (dbDoc.title || primary.buildingName) : (quickRec.buildingName || primary.buildingName || dbDoc.title),
      status: dbDoc.status || 'published',
      body: mergedBody,
    };
  } else if (quickRec?.fullDocBody) {
    doc = {
      id: quickRec.documentId,
      building_id: quickRec.buildingId,
      owner_id: quickRec.ownerId ?? null,
      title: quickRec.buildingName,
      status: 'published',
      body: { ...quickRec.fullDocBody },
    };
  } else if (dbDoc) {
    doc = dbDoc;
  }

  if (!doc?.body || !Array.isArray((doc.body as any).sections) || (doc.body as any).sections.length === 0) {
    return NextResponse.json({ error: 'Valid IM document not found or document has no sections' }, { status: 404 });
  }

  if (tier !== 'pro') {
    doc.body.preset = doc.body.preset || 'credeal_basic';
    doc.body.tier = doc.body.tier || 'basic';
  }

  // 소유자·admin 여부 (워터마크 해제 권한)
  const isPrivilegedViewer = isOwnerOrAdmin(viewer, buildingOwnerId, doc.owner_id ?? (quickRec as any)?.ownerId);
  if (doc.body?.is_revoked === true && !isPrivilegedViewer) {
    return NextResponse.json({ ok: false, error: 'LINK_REVOKED' }, { status: 403 });
  }

  // Poison coordinate / PNU guard (Dangsan 11-47 leak) & on-the-fly geocoding
  const rawAddr = String(
    doc.body?.ssot_summary?.address ||
    doc.body?.resolved_address ||
    doc.body?.address ||
    buildingRow?.raw_address ||
    ''
  ).trim();
  let coordLat = Number(doc.body?.coordinates?.lat ?? doc.body?.ssot_summary?.coordinates?.lat ?? buildingRow?.lat ?? 0) || null;
  let coordLng = Number(doc.body?.coordinates?.lng ?? doc.body?.ssot_summary?.coordinates?.lng ?? buildingRow?.lng ?? 0) || null;
  let resolvedPnu = String(doc.body?.ssot_summary?.pnu || doc.body?.pnu || buildingRow?.pnu || '').trim() || null;

  const isDangsanAddr = /당산|양평/.test(rawAddr);
  const isDangsanCoord =
    coordLat != null &&
    coordLng != null &&
    Math.abs(coordLat - 37.5342) < 0.0005 &&
    Math.abs(coordLng - 126.9022) < 0.0005;
  const isDangsanPnu = resolvedPnu === '1156011500100110047';
  if (!isDangsanAddr && (isDangsanCoord || isDangsanPnu)) {
    coordLat = null;
    coordLng = null;
    resolvedPnu = null;
    if (doc.body?.coordinates) delete doc.body.coordinates;
    if (doc.body?.ssot_summary?.coordinates) delete doc.body.ssot_summary.coordinates;
    if (doc.body?.pnu === '1156011500100110047') delete doc.body.pnu;
    if (doc.body?.ssot_summary?.pnu === '1156011500100110047') delete doc.body.ssot_summary.pnu;
    if (doc.body?.enrichment?.cadastralMapImage) delete doc.body.enrichment.cadastralMapImage;
  }

  if ((!coordLat || !coordLng) && rawAddr) {
    try {
      const { resolveAddress } = await import('@/lib/external/address-resolver');
      const geoRes = await Promise.race([
        resolveAddress(rawAddr),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
      if (geoRes) {
        if (geoRes.lat && geoRes.lng) {
          coordLat = geoRes.lat;
          coordLng = geoRes.lng;
        }
        if (!resolvedPnu && geoRes.pnu) {
          resolvedPnu = geoRes.pnu;
        }
      }
    } catch {
      // Non-blocking on-the-fly geocoding
    }
  }

  if (coordLat && coordLng) {
    doc.body.coordinates = { lat: coordLat, lng: coordLng };
    if (doc.body.ssot_summary && typeof doc.body.ssot_summary === 'object') {
      doc.body.ssot_summary.coordinates = { lat: coordLat, lng: coordLng };
    }
  }
  if (resolvedPnu) {
    doc.body.pnu = resolvedPnu;
    if (doc.body.ssot_summary && typeof doc.body.ssot_summary === 'object') {
      doc.body.ssot_summary.pnu = resolvedPnu;
    }
  }

  const building = buildingRow ? {
    ...buildingRow,
    address: rawAddr || buildingRow.raw_address,
    pnu: resolvedPnu,
    lat: coordLat,
    lng: coordLng,
    investment_posture: doc.body?.ssot_summary?.investment_posture || doc.body?.investmentPosture || 'income',
  } : (doc.body?.ssot_summary ? {
    id: buildingId,
    owner_id: doc.owner_id ?? null,
    raw_address: rawAddr,
    address: rawAddr,
    pnu: resolvedPnu,
    lat: coordLat,
    lng: coordLng,
    investment_posture: doc.body.ssot_summary?.investment_posture || doc.body.investmentPosture || 'income',
  } : null);

  // 3. Fetch broker profile (SSoT resolver — 실제 DB 값만, 부재 시 생략, 더미 문자열 필터링)
  const DUMMY_BROKER_STRINGS = new Set([
    '담당 공인중개사',
    '전담 부동산중개법인',
    '크리딜 파트너 중개법인',
    '11560-2023-00412',
    '02-558-7700',
    '-',
  ]);
  const cleanBrokerStr = (val: unknown): string | undefined => {
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    if (!trimmed || DUMMY_BROKER_STRINGS.has(trimmed)) return undefined;
    return trimmed;
  };

  const ownerId = doc?.broker_id ?? doc?.owner_id ?? building?.owner_id;
  const { fetchBrokerContact, toPptxBrokerInput } = await import('@/domain/broker/broker-contact');
  const rawDbBroker = toPptxBrokerInput(await fetchBrokerContact(supabase, ownerId));
  const quickBrokerContact = quickRec?.fullDocBody?.broker_contact;
  const broker = quickBrokerContact
    ? {
        display_name: cleanBrokerStr(quickBrokerContact.name ?? quickBrokerContact.brokerName) || cleanBrokerStr(rawDbBroker?.display_name),
        company_name: cleanBrokerStr(quickBrokerContact.company ?? quickBrokerContact.brokerageName) || cleanBrokerStr(rawDbBroker?.company_name),
        phone: cleanBrokerStr(quickBrokerContact.phone ?? quickBrokerContact.brokerPhone) || cleanBrokerStr(rawDbBroker?.phone),
        email: cleanBrokerStr(rawDbBroker?.email),
        registration_no: cleanBrokerStr(quickBrokerContact.registration_no ?? quickBrokerContact.registrationNo) || cleanBrokerStr(rawDbBroker?.registration_no),
        specialty: cleanBrokerStr(rawDbBroker?.specialty),
      }
    : rawDbBroker
    ? {
        display_name: cleanBrokerStr(rawDbBroker.display_name),
        company_name: cleanBrokerStr(rawDbBroker.company_name),
        phone: cleanBrokerStr(rawDbBroker.phone),
        email: cleanBrokerStr(rawDbBroker.email),
        registration_no: cleanBrokerStr(rawDbBroker.registration_no),
        specialty: cleanBrokerStr(rawDbBroker.specialty),
      }
    : null;

  // 4. Import and run renderer
  try {
    const { MobileImPptxRenderer } = await import(
      '@/domain/building/mobile-im/pptx/pptx-renderer'
    );
    const renderer = new MobileImPptxRenderer();

    // IM body에서 posture, grade 등 메타데이터 추출
    const body = doc.body ?? {};

    // ── 데이터 완전성 게이트 ──
    const dataCompleteness = body.dataCompleteness;
    const isDev = process.env.NODE_ENV === 'development';
    // 골디락스: 데이터 완전성 게이트 (D등급 차단은 renderer에서 처리)
    if (dataCompleteness && !dataCompleteness.pptxExportAllowed && !isDev) {
      return NextResponse.json({
        error: 'PPTX 다운로드 불가',
        reason: '건축물대장 등 필수 공공데이터가 조회되지 않았습니다.',
        suggestion: '건물 주소를 확인하고 IM을 재생성해 주세요.',
        dataStatus: dataCompleteness.buildingRegisterSource,
        qualityGrade: dataCompleteness.qualityGrade,
      }, { status: 422 });
    }

    const posture = body.investment_posture
      ?? body.investmentPosture
      ?? body.posture
      ?? body.identity?.investmentPosture
      ?? body.identity?.investment_posture
      ?? body.ssot_summary?.investment_posture
      ?? building?.investment_posture
      ?? 'income';

    // F3 fix: Grade 계산을 뷰어와 동일한 computeDataQualityBadge로 통일
    let grade = body.dataGrade ?? body.dataCompleteness?.qualityGrade ?? body.qualityGrade ?? body.grade;
    if (!grade) {
      try {
        const { computeDataQualityBadge, tierToGrade } = await import(
          '@/domain/building/mobile-im/data-quality-badge'
        );
        const { resolveEnrichment } = await import('@/domain/building/im-core/resolve-enrichment');
        const enriched = resolveEnrichment(body);
        const ssot = body.ssot_summary ?? {};
        const badge = computeDataQualityBadge({
          hasAddress: !!(ssot.address || ssot.raw_address || enriched.meta.address),
          hasPublicData: !!(enriched.buildingRegister || ssot.building_register_source === 'api'),
          hasMonthlyRent: !!(ssot.monthly_rent_total_krw || body.financial?.monthlyRentKrw),
          hasVacancy: ssot.vacancy_pct != null || !!ssot.vacancy_signal,
          hasPhotos: !!(body.photos_v2?.length || body.photos?.length),
          hasAskingPrice: !!(ssot.asking_price_manwon || ssot.price_band),
          hasFloorLeases: !!(body.floor_leases?.length || body.rentRoll?.length),
          hasTotalGrossArea: !!(ssot.total_gross_area_sqm || ssot.size_signal),
          hasLandArea: !!(ssot.land_area_sqm),
        }, posture as any);
        grade = tierToGrade(badge.tier);
      } catch (e) {
        log.error('Grade computation failed', e);
        grade = 'B'; // 계산 실패 시 기본값
      }
    }
    if (grade === 'D') {
      return NextResponse.json({
        error: 'Grade D documents cannot be exported to PPTX [G30]',
        reason: '건물 기본 정보(주소·매매 희망가·임대 조건 중 필수 항목)가 부족하여 슬라이드를 구성할 수 없습니다.',
        suggestion: '[기본 IM 수정·재생성] 버튼을 눌러 건물 주소와 매매 희망가를 입력한 뒤 다시 생성해 주세요.',
        qualityGrade: 'D',
      }, { status: 422 });
    }
    const incomeArchetype = body.incomeArchetype ?? undefined;
    const hasViolation = body.hasViolation ?? body.violationStatus === 'exists';
    const hasJointCollateral = body.hasJointCollateral ?? false;

    // ── IM 타입(Basic/Pro) 결정: 문서의 tier가 유일한 권한 (프리셋으로 결정하지 않음) ──
    const docTier = body.tier || tier; // body.tier 우선, 없으면 URL ?tier= (기본 'basic')
    const isBasicIM = docTier === 'basic';

    // 시각적 프리셋: 사용자가 선택한 프리셋을 존중하되, Basic IM이면 항상 credeal_basic 시퀀스를 사용
    const visualPreset = presetParam || body.preset || (isBasicIM ? 'credeal_basic' : 'credeal_signature');
    // Basic IM이면 시퀀스 결정용 프리셋은 항상 credeal_basic (시각 테마만 다를 수 있음)
    const resolvedPreset = isBasicIM ? 'credeal_basic' : visualPreset;

    // 브랜드 컬러(Basic 전용): 기본 스킨(credeal_basic) 또는 커스텀 프리셋 UUID 요청일 때만, 소유 중개사의
    // pptx_custom_presets 회사 기본값(또는 지정 프리셋)의 대표색을 팔레트로 파생. 실패/미설정 → 기본 팔레트 (차단 없음).
    let brandAccent: string | undefined;
    let brandLogoUrl: string | undefined;
    let effectiveBroker = broker;
    const bodyBroker = body.broker_contact || body.basicImDocument?.facts?.brokerOffice;
    if (bodyBroker) {
      const bName =
        cleanBrokerStr(bodyBroker.brokerName) ||
        cleanBrokerStr(bodyBroker.representative) ||
        (bodyBroker.company ? cleanBrokerStr(bodyBroker.name) : undefined);
      const bCompany =
        cleanBrokerStr(bodyBroker.brokerageName) ||
        cleanBrokerStr(bodyBroker.company) ||
        (bodyBroker.representative ? cleanBrokerStr(bodyBroker.name) : undefined);
      const bPhone = cleanBrokerStr(bodyBroker.brokerPhone) || cleanBrokerStr(bodyBroker.phone);
      const bEmail = cleanBrokerStr(bodyBroker.email);
      const bRegNo = cleanBrokerStr(bodyBroker.registrationNo) || cleanBrokerStr(bodyBroker.registration_no);
      if (bName || bCompany || bPhone || bEmail || bRegNo) {
        effectiveBroker = {
          display_name: bName || effectiveBroker?.display_name,
          company_name: bCompany || effectiveBroker?.company_name,
          phone: bPhone || effectiveBroker?.phone,
          email: bEmail || effectiveBroker?.email,
          registration_no: bRegNo || effectiveBroker?.registration_no,
          specialty: effectiveBroker?.specialty,
        };
      }
    }
    const isCustomPresetId = /^[0-9a-f-]{36}$/i.test(String(visualPreset));
    if (isBasicIM && (visualPreset === 'credeal_basic' || isCustomPresetId)) {
      const { resolveBrandAccent } = await import('@/domain/building/mobile-im/pptx/brand-skin');
      const brand = await resolveBrandAccent({ supabase: supabase as any, ownerId, presetParam: isCustomPresetId ? String(visualPreset) : null });
      brandAccent = brand?.accent;
      brandLogoUrl = brand?.logoUrl ?? undefined;
      if (brand?.companyName && (!effectiveBroker || !effectiveBroker.company_name)) {
        effectiveBroker = {
          display_name: effectiveBroker?.display_name,
          company_name: brand.companyName,
          phone: effectiveBroker?.phone,
          email: effectiveBroker?.email,
          registration_no: effectiveBroker?.registration_no,
          specialty: effectiveBroker?.specialty,
        };
      }
    }

    // P0-SEC: watermark=false(워터마크 해제)는 소유자·admin 만. 비소유자는 requester 지정 시 항상 워터마크.
    const watermarkParam = searchParams.get('watermark');
    const shouldWatermark = isPrivilegedViewer
      ? watermarkParam === 'true' || (watermarkParam !== 'false' && Boolean(searchParams.get('requester')))
      : watermarkParam === 'true' || Boolean(searchParams.get('requester'));

    const result = await renderer.render({
      buildingId,
      preset: resolvedPreset,
      visualPreset: isBasicIM ? (isCustomPresetId ? 'credeal_basic' : visualPreset) : undefined,
      brandAccent,
      logoUrl: brandLogoUrl,
      posture,
      grade,
      incomeArchetype,
      hasViolation,
      hasJointCollateral,
      releaseTier: isBasicIM ? 'fact_om' : ((body.releaseTier as ReleaseTier) || 'decision_im'),
      docno: body.docno ?? `IM-${buildingId.substring(0, 6).toUpperCase()}`,
      doc: {
        title: doc.title || body.buildingName || 'Mobile IM',
        body,
        sections: body.sections,
      },
      building: building || undefined,
      broker: effectiveBroker || undefined,
      watermark: shouldWatermark
        ? {
            requesterName: searchParams.get('requester') || 'CREDEAL',
            phoneLast4: searchParams.get('phone4') || '0000',
            timestamp: new Date().toISOString().split('T')[0],
          }
        : undefined,
      provenance: body.provenance ?? {},
      supabase: quickRec?.fullDocBody ? undefined : supabase,
    });

    // 6. Return PPTX (direct=1 또는 quick-generate 메모리 레코드 요청 시 감사 헤더·한글 파일명 보존을 위해 즉시 200 응답 반환)
    const buildingName = doc.title || body.buildingName || building?.address || '투자설명서';
    const safeName =
      buildingName.replace(
        /[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g,
        '_'
      ).replace(/_+/g, '_').replace(/^_|_$/g, '') + `_${tier === 'pro' ? 'Pro_IM' : 'Basic_IM'}.pptx`;

    if (!quickRec?.fullDocBody && searchParams.get('direct') !== '1') {
      const timestamp = Date.now();
      const filePath = `im-pptx/${buildingId}/${tier}_${timestamp}.pptx`;

      const { error: uploadError } = await supabase.storage
        .from('Exports')
        .upload(filePath, result.buffer, {
          contentType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          upsert: true,
        });

      if (uploadError) {
        log.warn('[PPTX] Storage upload failed, returning direct download:', uploadError);
      } else {
        const { data: signedData } = await supabase.storage
          .from('Exports')
          .createSignedUrl(filePath, 1800, { download: safeName });

        if (signedData?.signedUrl) {
          return NextResponse.redirect(signedData.signedUrl, 302);
        }
      }
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        'X-Safe-Filename': encodeURIComponent(safeName),
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Slide-Count': String(result.slideCount),
        'X-File-Size': String(result.fileSizeBytes),
        'X-Warnings': encodeURIComponent(JSON.stringify(result.warnings.slice(0, 10))),
        'X-Audit-Violations': String(result.auditReport?.totalViolations ?? 0),
        'X-Audit-Layout': encodeURIComponent(JSON.stringify(result.auditReport?.layoutViolations ?? [])),
        'X-Audit-Standard': encodeURIComponent(JSON.stringify(result.auditReport?.standardViolations ?? [])),
      },
    });
  } catch (err: any) {
    log.error(`[PPTX ${tier}] Generation failed:`, err);
    return NextResponse.json(
      {
        error: 'PPTX generation failed',
        reason: 'PPTX 슬라이드를 생성하는 중 일시적인 오류가 발생했습니다.',
        suggestion: '잠시 후 다시 시도하거나 [기본 IM 수정·재생성]을 실행해 주세요.',
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
