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
import { isImDocStatusPublic } from '@/domain/public-projection/visibility';

const log = createModuleLogger('im-lite-translate-route');

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
        return NextResponse.json(
          {
            ok: false,
            error: '담당 중개인에 의해 회수되었거나 유효하지 않은 공유 링크입니다.',
          },
          { status: tokenCheck.reason === 'revoked' ? 410 : 403 }
        );
      }
    }

    const inboxRevoked = getInboxState().revokedBuildings?.[buildingId]?.revoked;
    if (inboxRevoked || isBuildingShareLinkRevoked(buildingId)) {
      return NextResponse.json(
        { ok: false, error: '담당 중개인에 의해 회수된 공유 링크입니다.' },
        { status: 410 }
      );
    }

    const supabase = createServiceClient();

    // Check DB governance revocation events when available
    try {
      const govQuery: any = supabase
        .from('activity_events')
        .select('event_type, entity_id, metadata, created_at')
        .in('event_type', ['link_revoked', 'link_restored'])
        .order('created_at', { ascending: false })
        .limit(100);
      const govRes = await govQuery;
      if (Array.isArray(govRes?.data)) {
        for (const row of govRes.data) {
          const meta =
            row?.metadata && typeof row.metadata === 'object'
              ? (row.metadata as Record<string, unknown>)
              : {};
          const evBldId = String(meta.building_id || row?.entity_id || '').trim();
          if (evBldId !== buildingId) continue;
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
    } catch {
      // Non-blocking if activity_events is unavailable
    }

    // 2. Load existing document scoped strictly to buildingId & published status
    const { data: doc, error: docErr } = await supabase
      .from('document_objects')
      .select('id, building_id, body, metadata, status')
      .eq('id', docId)
      .eq('building_id', buildingId)
      .maybeSingle();

    if (docErr || !doc) {
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

    // 3. Check cache
    const meta = (doc.metadata ?? {}) as Record<string, unknown>;
    const cachedKey = `translated_${language}`;
    if (meta[cachedKey]) {
      return NextResponse.json({ ok: true, sections: meta[cachedKey], cached: true });
    }

    // 4. Extract sections from document body
    const rawSections = content?.sections as
      | Array<{ title?: string; markdown?: string; content?: string; section_type?: string }>
      | undefined;
    if (!rawSections || rawSections.length === 0) {
      return NextResponse.json({ error: 'No sections found in document' }, { status: 422 });
    }

    const sections = rawSections.map((s) => ({
      title: s.title ?? '',
      content: s.markdown ?? s.content ?? '',
      sectionId: s.section_type,
    }));

    if (language === 'ko') {
      return NextResponse.json({ ok: true, sections, cached: true });
    }

    const translated = await translateIMSections({ sections, language });

    // Cache back to document_objects.metadata
    try {
      const updatedMeta = { ...meta, [cachedKey]: translated };
      await supabase
        .from('document_objects')
        .update({ metadata: updatedMeta, updated_at: new Date().toISOString() })
        .eq('id', docId)
        .eq('building_id', buildingId);
    } catch {
      // Non-blocking cache write failure
    }

    return NextResponse.json({ ok: true, sections: translated, cached: false });
  } catch (err) {
    log.error('[translate] Translation failed', {
      message: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
    });
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
