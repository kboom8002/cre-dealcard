/**
 * POST /api/public/im-lite/[buildingId]/translate
 * { language: 'ko' | 'en' | 'zh' | 'ja', doc_id: string }
 * Translates published IM sections.
 * Caches translation back to document_objects metadata.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { translateIMSections, type IMLanguage } from '@/domain/building/mobile-im/translator';
import { createModuleLogger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/magazine/public-guard';
import {
  verifyShareLinkToken,
  isBuildingShareLinkRevoked,
} from '@/lib/security/share-link-tokens';
import { getInboxState } from '@/lib/im-lite/quick-generate-store';
import { isImDocStatusPublic, PUBLIC_IM_DOC_STATUSES } from '@/domain/public-projection/visibility';
import { getServerViewer } from '@/lib/server-viewer';
import { isOwnerOrAdmin } from '@/domain/public-projection/access';
import {
  allowDealPublicMemoryFallback,
  buildGovernanceUnavailableResponse,
  buildShareTokenRequiredResponse,
  isAllowedPublicDemoIm,
  isBuildingWideRevocationEvent,
  isDemoSeedDisabledForProd,
  isPreCutoverSchemaError,
  resolveWorkspaceImGuard,
} from '@/lib/im-lite/im-public-guard';

const log = createModuleLogger('im-lite-translate-route');

export const maxDuration = 120;

const ALLOWED_LANGUAGES = new Set<IMLanguage>(['ko', 'en', 'ja', 'zh']);
const MAX_BODY_BYTES = 8 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const ip = getClientIp(req) ?? 'unknown';
    const isAllowed = await checkRateLimit(ip, 'im_lite_translate', 20, 10 * 60 * 1000);
    if (!isAllowed) {
      return NextResponse.json(
        { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 }
      );
    }

    const declaredLen = Number(req.headers.get('content-length'));
    if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
    }
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
    }

    const { buildingId } = await params;
    if (!buildingId || buildingId.length > 128) {
      return NextResponse.json({ ok: false, error: 'Invalid buildingId' }, { status: 400 });
    }

    let language: IMLanguage;
    let docId: string;
    let bodyToken: string | null = null;
    try {
      const body = rawBody ? JSON.parse(rawBody) : {};
      const rawLang = typeof body?.language === 'string' ? body.language.trim() : '';
      if (!ALLOWED_LANGUAGES.has(rawLang as IMLanguage)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid language. Use: ko, en, ja, zh' },
          { status: 400 }
        );
      }
      language = rawLang as IMLanguage;
      docId = typeof body?.doc_id === 'string' ? body.doc_id.trim() : '';
      if (!docId || docId.length > 128) {
        return NextResponse.json({ ok: false, error: 'doc_id is required' }, { status: 400 });
      }
      if (typeof body?.token === 'string' && body.token.trim()) {
        bodyToken = body.token.trim();
      } else if (typeof body?.shareToken === 'string' && body.shareToken.trim()) {
        bodyToken = body.shareToken.trim();
      }
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
    }

    // 1. Share-link token & building-level revocation guard
    const token = req.nextUrl.searchParams.get('token')?.trim() || bodyToken;
    if (token) {
      const tokenCheck = await verifyShareLinkToken({ token, buildingId });
      if (!tokenCheck.valid) {
        if (tokenCheck.reason === 'lookup_failed') {
          return buildGovernanceUnavailableResponse();
        }
        return NextResponse.json(
          {
            ok: false,
            error: '담당 중개인에 의해 회수되었거나 유효하지 않은 공유 링크입니다.',
          },
          { status: tokenCheck.reason === 'revoked' ? 410 : 403 }
        );
      }
    }

    if (isDemoSeedDisabledForProd(buildingId)) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const memoryFallbackAllowed = allowDealPublicMemoryFallback();
    const inboxRevoked = memoryFallbackAllowed
      ? getInboxState().revokedBuildings?.[buildingId]?.revoked
      : false;
    if (inboxRevoked || (memoryFallbackAllowed && isBuildingShareLinkRevoked(buildingId))) {
      return NextResponse.json(
        { ok: false, error: '담당 중개인에 의해 회수된 공유 링크입니다.' },
        { status: 410 }
      );
    }

    const supabase = createServiceClient();

    // Check DB governance revocation events scoped to building_id (42703-safe)
    try {
      const safeBld = /^[A-Za-z0-9_.:-]+$/.test(buildingId) ? buildingId : '';
      const isBldUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeBld);
      let govQuery: any = supabase
        .from('activity_events')
        .select('event_type, entity_id, building_id, metadata, created_at')
        .in('event_type', ['link_revoked', 'link_restored']);
      if (safeBld) {
        if (typeof govQuery?.or === 'function') {
          govQuery = govQuery.or(
            isBldUuid
              ? `building_id.eq.${safeBld},entity_id.eq.${safeBld},metadata->>building_id.eq.${safeBld}`
              : `building_id.eq.${safeBld},metadata->>building_id.eq.${safeBld}`,
          );
        } else if (typeof govQuery?.eq === 'function') {
          govQuery = govQuery.eq('building_id', safeBld);
        }
      }
      let govRes = await govQuery.order('created_at', { ascending: false }).limit(50);
      if (
        govRes?.error &&
        (String(govRes.error.code || '') === '42703' ||
          String(govRes.error.code || '') === 'PGRST204' ||
          /column .* does not exist/i.test(String(govRes.error.message || '')))
      ) {
        let fbQuery: any = supabase
          .from('activity_events')
          .select('event_type, entity_id, metadata, created_at')
          .in('event_type', ['link_revoked', 'link_restored']);
        if (safeBld && typeof fbQuery?.or === 'function') {
          fbQuery = fbQuery.or(
            isBldUuid
              ? `entity_id.eq.${safeBld},metadata->>building_id.eq.${safeBld}`
              : `metadata->>building_id.eq.${safeBld}`,
          );
        }
        govRes = await fbQuery.order('created_at', { ascending: false }).limit(50);
      }
      if (govRes?.error && !isPreCutoverSchemaError(govRes.error)) {
        log.error(
          { code: govRes.error.code, message: govRes.error.message, buildingId },
          '[translate] revocation lookup failed'
        );
        return buildGovernanceUnavailableResponse();
      }
      if (Array.isArray(govRes?.data)) {
        for (const row of govRes.data) {
          const meta =
            row?.metadata && typeof row.metadata === 'object'
              ? (row.metadata as Record<string, unknown>)
              : {};
          const evBldId = String((row as any)?.building_id || meta.building_id || row?.entity_id || '').trim();
          if (evBldId !== buildingId) continue;
          if (!isBuildingWideRevocationEvent(meta)) continue;
          if (row.event_type === 'link_revoked') {
            return NextResponse.json(
              { ok: false, error: '담당 중개인에 의해 회수된 공유 링크입니다.' },
              { status: 410 }
            );
          }
          if (row.event_type === 'link_restored') {
            break;
          }
        }
      }
    } catch (govEx) {
      if (!isPreCutoverSchemaError(govEx)) {
        log.error({ buildingId, err: govEx }, '[translate] revocation lookup threw');
        return buildGovernanceUnavailableResponse();
      }
    }

    const wsGuard = await resolveWorkspaceImGuard(supabase, buildingId);
    if (wsGuard.governanceUnavailable) {
      return buildGovernanceUnavailableResponse();
    }
    if (wsGuard.isDeleted) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    if (wsGuard.isRevoked || wsGuard.itemRevoked) {
      return NextResponse.json(
        { ok: false, error: '담당 중개인에 의해 회수된 공유 링크입니다.' },
        { status: 410 }
      );
    }
    if (wsGuard.isDraft && !wsGuard.snapshot) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // 2. Load existing document scoped strictly to buildingId, active public status & owner_id
    let docLookup: any = supabase
      .from('document_objects')
      .select('id, owner_id, building_id, body, status, document_type')
      .eq('id', docId)
      .eq('building_id', buildingId)
      .in('document_type', ['mobile_im', 'im_lite', 'im_lite_draft'])
      .in('status', [...PUBLIC_IM_DOC_STATUSES]);
    if (wsGuard.ownerId) {
      docLookup = docLookup.eq('owner_id', wsGuard.ownerId);
    }
    const { data: dbDocRaw, error: docErr } = await docLookup.maybeSingle();
    const dbDoc =
      dbDocRaw &&
      (!wsGuard.ownerId || !dbDocRaw.owner_id || String(dbDocRaw.owner_id) === String(wsGuard.ownerId))
        ? dbDocRaw
        : null;

    const wsDocBody =
      wsGuard.snapshot && typeof wsGuard.snapshot === 'object'
        ? (wsGuard.snapshot.fullDocBody ||
            (Array.isArray(wsGuard.snapshot.sections) ? wsGuard.snapshot : null))
        : null;
    const doc =
      !docErr && dbDoc
        ? dbDoc
        : wsDocBody && wsGuard.item
        ? {
            id: wsGuard.item.id,
            building_id: wsGuard.item.buildingId || buildingId,
            body: wsDocBody,
            metadata: {},
            status: 'published',
          }
        : null;

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (doc.building_id && String(doc.building_id) !== buildingId) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // NEVER translate draft / non-public IMs
    if (!isImDocStatusPublic(doc.status)) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const content = (doc.body ?? {}) as Record<string, unknown>;
    if (content.is_revoked === true) {
      return NextResponse.json(
        { ok: false, error: '담당 중개인에 의해 회수된 공유 링크입니다.' },
        { status: 410 }
      );
    }

    if (!token && !(isAllowedPublicDemoIm(buildingId) && !wsGuard.item)) {
      let viewer: any = null;
      try {
        viewer = await getServerViewer();
      } catch {
        viewer = null;
      }
      if (!isOwnerOrAdmin(viewer, wsGuard.ownerId, (doc as any)?.owner_id)) {
        return buildShareTokenRequiredResponse();
      }
    }

    if ((doc as any).document_type === 'blind_teaser') {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // 3. Redact hidden, locked, and Pro-only sections BEFORE checking cache, returning 'ko', or sending to OpenAI
    const hiddenSet = new Set<string>(
      [
        ...(Array.isArray(content.hidden_sections) ? (content.hidden_sections as unknown[]) : []),
        ...(Array.isArray(content.hiddenSections) ? (content.hiddenSections as unknown[]) : []),
      ].map((v) => String(v))
    );
    const isProDoc = content.tier === 'pro';
    const docDataGrade = String(content.dataGrade || '');

    const rawSections = content?.sections as
      | Array<{
          id?: string;
          sectionId?: string;
          title?: string;
          markdown?: string;
          content?: string;
          section_type?: string;
          locked?: boolean;
          min_tier?: string;
        }>
      | undefined;
    if (!rawSections || rawSections.length === 0) {
      return NextResponse.json({ error: 'No sections found in document' }, { status: 422 });
    }

    const allowedRawSections = rawSections.filter((s) => {
      if (!s) return false;
      const keys = [s.section_type, s.sectionId, s.id].filter(Boolean).map(String);
      if (keys.some((k) => hiddenSet.has(k))) return false;
      if (s.locked === true) return false;
      if (!isProDoc && s.min_tier === 'premium') return false;
      if (s.min_tier === 'grade_a' && (docDataGrade === 'B' || docDataGrade === 'C')) return false;
      return true;
    });

    const allowedIds = new Set<string>(
      allowedRawSections
        .map((s) => String(s.section_type || s.sectionId || s.id || ''))
        .filter(Boolean)
    );

    const bodyObj = (doc.body && typeof doc.body === 'object' ? doc.body : {}) as Record<string, any>;
    const cachedKey = `translated_${language}`;
    const cachedTranslations =
      (bodyObj._translations && typeof bodyObj._translations === 'object'
        ? (bodyObj._translations as Record<string, unknown>)[cachedKey]
        : undefined) ?? (doc as any).metadata?.[cachedKey];
    if (Array.isArray(cachedTranslations)) {
      const filteredCached = (cachedTranslations as Array<Record<string, unknown>>).filter((cs) => {
        const cid = String(cs?.sectionId || cs?.section_type || cs?.id || '');
        if (!cid) return true;
        return allowedIds.has(cid) && !hiddenSet.has(cid);
      });
      return NextResponse.json({ ok: true, sections: filteredCached, cached: true });
    }

    const sections = allowedRawSections.map((s) => ({
      title: s.title ?? '',
      content: s.markdown ?? s.content ?? '',
      sectionId: s.section_type || s.sectionId || s.id,
    }));

    if (language === 'ko' || sections.length === 0) {
      return NextResponse.json({ ok: true, sections, cached: true });
    }

    const translated = await translateIMSections({ sections, language });

    // Cache back to document_objects.body._translations (scoped by building_id & owner_id when present)
    try {
      const prevTranslations =
        bodyObj._translations && typeof bodyObj._translations === 'object'
          ? (bodyObj._translations as Record<string, unknown>)
          : {};
      const updatedBody = {
        ...bodyObj,
        _translations: { ...prevTranslations, [cachedKey]: translated },
      };
      let cacheUpdate: any = supabase
        .from('document_objects')
        .update({ body: updatedBody, updated_at: new Date().toISOString() })
        .eq('id', docId)
        .eq('building_id', buildingId);
      const docOwner = (dbDoc as any)?.owner_id || wsGuard.ownerId;
      if (docOwner && typeof cacheUpdate?.eq === 'function') {
        cacheUpdate = cacheUpdate.eq('owner_id', docOwner);
      }
      const cacheRes = await cacheUpdate;
      if (cacheRes?.error) {
        log.warn(
          { code: cacheRes.error.code, message: cacheRes.error.message, docId, buildingId },
          '[translate] Non-fatal cache write error'
        );
      }
    } catch (cacheErr) {
      log.warn(
        { message: cacheErr instanceof Error ? cacheErr.message : String(cacheErr), docId, buildingId },
        '[translate] Non-fatal cache write exception'
      );
    }

    return NextResponse.json({ ok: true, sections: translated, cached: false });
  } catch (err) {
    log.error('[translate] Translation failed', {
      message: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
    });
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
