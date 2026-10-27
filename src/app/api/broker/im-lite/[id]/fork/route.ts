/**
 * @file src/app/api/broker/im-lite/[id]/fork/route.ts
 * @description WP-P4a1-03: "새 버전으로 복사해서 고치기" (Fork Version) API
 * When a broker attempts to edit a sealed/approved document, this endpoint
 * creates a new draft version v(N+1) with parent_version_id pointing to vN.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('im-fork');

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

  const supabase = createServiceClient();

  // 1. Fetch source document (with unmigrated column fallback)
  let { data: doc, error: fetchErr } = await supabase
    .from('document_objects')
    .select('id, owner_id, broker_id, building_id, series_id, version_no, title, body, status, sealed_at')
    .eq('id', id)
    .maybeSingle();

  if (
    fetchErr &&
    (fetchErr.code === '42703' || String(fetchErr.message || '').toLowerCase().includes('column'))
  ) {
    const fallbackRes = await supabase
      .from('document_objects')
      .select('id, owner_id, broker_id, building_id, status, title, body')
      .eq('id', id)
      .maybeSingle();
    doc = fallbackRes.data as any;
    fetchErr = fallbackRes.error;
  }

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const ownerId = doc.broker_id || doc.owner_id;
  const isAdmin = guard.role === 'admin' || (guard.user as any)?.role === 'admin';
  if (ownerId !== guard.user!.id && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden: not your document' }, { status: 403 });
  }

  // 2. Resolve series and determine next version number
  let seriesId = (doc as any).series_id ?? (doc.body as any)?.versionMeta?.seriesId;
  let nextVersionNo = ((doc as any).version_no || (doc.body as any)?.versionMeta?.versionNo || 1) + 1;

  if (seriesId) {
    try {
      const { data: series } = await supabase
        .from('im_series')
        .select('id, latest_version_no')
        .eq('id', seriesId)
        .maybeSingle();

      if (series) {
        nextVersionNo = Math.max(series.latest_version_no || 0, doc.version_no || 0) + 1;
      }
    } catch {
      // ignore if im_series table not yet migrated
    }
  } else if (doc.building_id) {
    // Try finding or creating an im_series for this building
    try {
      const { data: existingSeries } = await supabase
        .from('im_series')
        .select('id, latest_version_no')
        .eq('building_id', doc.building_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSeries) {
        seriesId = existingSeries.id;
        nextVersionNo = (existingSeries.latest_version_no || 1) + 1;
      } else {
        const { data: newSeries } = await supabase
          .from('im_series')
          .insert({
            building_id: doc.building_id,
            owner_id: guard.user!.id,
            label: `${doc.title || 'IM'} 시리즈`,
            latest_version_no: 1,
            published_version_id: doc.status === 'published' ? doc.id : null,
          })
          .select('id')
          .single();

        if (newSeries) {
          seriesId = newSeries.id;
          nextVersionNo = 2;
        }
      }
    } catch {
      // fallback
    }
  }

  // 3. Create clean unsealed draft body
  const clonedBody = doc.body ? JSON.parse(JSON.stringify(doc.body)) : {};
  // Strip approval metadata from previous sealed version in new draft
  delete clonedBody.approval_target_hash;
  delete clonedBody.approved_at;
  delete clonedBody.targetHash;
  clonedBody.versionMeta = {
    seriesId: seriesId || null,
    versionNo: nextVersionNo,
    parentVersionId: doc.id,
    origin: 'duplicate',
    forkedAt: new Date().toISOString(),
  };

  const insertPayload: Record<string, any> = {
    building_id: doc.building_id,
    owner_id: doc.owner_id || guard.user!.id,
    broker_id: guard.user!.id,
    document_type: 'im_lite',
    title: doc.title,
    body: clonedBody,
    status: 'draft',
    series_id: seriesId || null,
    version_no: nextVersionNo,
    parent_version_id: doc.id,
    origin: 'duplicate',
    sealed_at: null,
    seal_hash: null,
    content_hash: null,
    doc_hash: null,
  };

  let { data: newDoc, error: insertErr } = await supabase
    .from('document_objects')
    .insert(insertPayload)
    .select('id, version_no')
    .single();

  if (
    insertErr &&
    (insertErr.code === '42703' || String(insertErr.message || '').toLowerCase().includes('column'))
  ) {
    const standardPayload = {
      building_id: doc.building_id,
      owner_id: doc.owner_id || guard.user!.id,
      broker_id: guard.user!.id,
      document_type: 'im_lite',
      status: 'draft',
      title: doc.title,
      body: clonedBody,
    };
    const fallbackInsert = await supabase
      .from('document_objects')
      .insert(standardPayload)
      .select('id')
      .single();
    newDoc = fallbackInsert.data ? { id: fallbackInsert.data.id, version_no: nextVersionNo } : null;
    insertErr = fallbackInsert.error;
  }

  if (insertErr || !newDoc) {
    log.error('[fork] Failed to create forked document:', insertErr);
    return NextResponse.json({ error: 'Failed to create fork' }, { status: 500 });
  }

  // 4. Update series latest_version_no & current_draft_version_id
  if (seriesId) {
    try {
      await supabase
        .from('im_series')
        .update({
          latest_version_no: nextVersionNo,
          current_draft_version_id: newDoc.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', seriesId);
    } catch {
      // fallback
    }
  }

  log.info(`[fork] Document ${id} (v${doc.version_no}) forked to ${newDoc.id} (v${nextVersionNo})`);

  return NextResponse.json({
    ok: true,
    forkedId: newDoc.id,
    newDocId: newDoc.id,
    versionNo: nextVersionNo,
    parentId: doc.id,
    seriesId,
    message: `v${nextVersionNo} 새 버전 초안이 생성되었습니다.`,
  });
}
