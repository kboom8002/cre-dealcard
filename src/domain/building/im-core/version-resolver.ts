/**
 * @file src/domain/building/im-core/version-resolver.ts
 * @description WP-P4a1-07 & WP-P4a1-09: Single Source of Truth Version Resolver
 * Unifies all document query sites under resolveImVersion().
 * Handles pinned vs follow_latest modes, ownership/public/grant access checks,
 * and graceful backward-compatible fallback for unmigrated remote databases.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §5.7.5, §5.7.4
 * - PROJECT.md (resolveImVersion SSOT)
 */

export interface ResolveImVersionParams {
  buildingId?: string;
  seriesId?: string;
  versionId?: string;
  shareToken?: string;
  viewerId?: string;
  purpose?: string;
  mode?: 'pinned' | 'follow_latest';
  role?: string;
  versionNo?: number;
}

export interface ResolvedImVersion {
  version: {
    id: string;
    series_id?: string;
    version_no?: number;
    title: string;
    body: any;
    status: string;
    content_hash?: string;
    doc_hash?: string;
    sealed_at?: string;
    created_at?: string;
    updated_at?: string;
    owner_id?: string;
    broker_id?: string;
    building_id?: string;
  };
  series?: {
    id: string;
    building_id: string;
    owner_id?: string;
    label?: string;
    latest_version_no: number;
    published_version_id?: string;
    current_draft_version_id?: string;
  } | null;
  access: 'owner' | 'public' | 'grant';
  pinned: boolean;
  isSealed: boolean;
  releaseTier: string;
  status: string;
}

export async function resolveImVersion(
  params: ResolveImVersionParams,
  supabaseClient?: any
): Promise<ResolvedImVersion | null> {
  let supabase = supabaseClient;
  if (!supabase) {
    try {
      const serviceModule = '@/lib/supabase/service';
      const mod = await import(/* webpackIgnore: true */ serviceModule);
      supabase = mod.createServiceClient();
    } catch {
      return null;
    }
  }
  const {
    buildingId,
    seriesId,
    versionId,
    shareToken,
    viewerId,
    mode = 'follow_latest',
    role,
    versionNo,
  } = params;

  // ─── Pathway 1: Share Token ───────────────────────────────────────────
  if (shareToken) {
    try {
      const { data: link, error: linkErr } = await supabase
        .from('im_share_links')
        .select('*')
        .eq('token', shareToken)
        .maybeSingle();

      if (!linkErr && link) {
        // Check revocation
        if (link.revoked_at) {
          return null;
        }
        // Check expiration
        if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
          return null;
        }

        const isPinned = link.mode === 'pinned' || Boolean(link.version_id);
        let targetDocId = link.version_id;

        // If follow_latest or version_id is null, resolve published_version_id from series
        if (!targetDocId && link.series_id) {
          const { data: series } = await supabase
            .from('im_series')
            .select('*')
            .eq('id', link.series_id)
            .maybeSingle();

          targetDocId = series?.published_version_id || series?.current_draft_version_id;
        }

        if (targetDocId) {
          const { data: doc } = await supabase
            .from('document_objects')
            .select('*')
            .eq('id', targetDocId)
            .maybeSingle();

          if (doc) {
            return formatResolvedResult(doc, null, 'public', isPinned);
          }
        }
      }
    } catch {
      // Graceful fallback if im_share_links table missing
    }
  }

  // ─── Pathway 2: Explicit versionId / docId ────────────────────────────
  if (versionId) {
    const { data: doc, error: docErr } = await supabase
      .from('document_objects')
      .select('*')
      .eq('id', versionId)
      .maybeSingle();

    if (docErr || !doc) {
      return null;
    }

    let series: any = null;
    if (doc.series_id) {
      try {
        const { data: s } = await supabase
          .from('im_series')
          .select('*')
          .eq('id', doc.series_id)
          .maybeSingle();
        series = s;
      } catch {
        // ignore missing table error
      }
    }

    const docOwnerId = doc.broker_id || doc.owner_id;
    const isOwner = Boolean(viewerId && (viewerId === docOwnerId || role === 'admin'));
    const isPublic =
      doc.status === 'published' ||
      doc.status === 'superseded' ||
      doc.status === 'approved_internal' ||
      doc.status === 'broker_reviewed' ||
      doc.status === 'shared_external';

    if (!isOwner && !isPublic) {
      // Unauthorized private draft
      return null;
    }

    const access = isOwner ? 'owner' : 'public';
    return formatResolvedResult(doc, series, access, true);
  }

  // ─── Pathway 3: seriesId ──────────────────────────────────────────────
  if (seriesId) {
    try {
      const { data: series, error: sErr } = await supabase
        .from('im_series')
        .select('*')
        .eq('id', seriesId)
        .maybeSingle();

      if (!sErr && series) {
        const isOwner = Boolean(viewerId && (viewerId === series.owner_id || role === 'admin'));
        let targetDocId: string | null = null;

        if (versionNo !== undefined) {
          // Query specific version number in series
          const { data: vDoc } = await supabase
            .from('document_objects')
            .select('*')
            .eq('series_id', seriesId)
            .eq('version_no', versionNo)
            .maybeSingle();

          if (vDoc) {
            const access = isOwner ? 'owner' : 'public';
            return formatResolvedResult(vDoc, series, access, true);
          }
        }

        if (isOwner && mode === 'pinned' && series.current_draft_version_id) {
          targetDocId = series.current_draft_version_id;
        } else {
          targetDocId = series.published_version_id || series.current_draft_version_id;
        }

        if (targetDocId) {
          const { data: doc } = await supabase
            .from('document_objects')
            .select('*')
            .eq('id', targetDocId)
            .maybeSingle();

          if (doc) {
            const access = isOwner ? 'owner' : 'public';
            return formatResolvedResult(doc, series, access, mode === 'pinned');
          }
        }
      }
    } catch {
      // Fallback if im_series missing
    }
  }

  // ─── Pathway 4: buildingId (Primary Web / Legacy Route) ─────────────────
  if (buildingId) {
    // 1. Try finding series first
    try {
      const { data: seriesList, error: sErr } = await supabase
        .from('im_series')
        .select('*')
        .eq('building_id', buildingId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!sErr && seriesList && seriesList.length > 0) {
        const series = seriesList[0];
        const isOwner = Boolean(viewerId && (viewerId === series.owner_id || role === 'admin'));
        const targetDocId = (isOwner && mode === 'pinned' && series.current_draft_version_id)
          ? series.current_draft_version_id
          : (series.published_version_id || series.current_draft_version_id);

        if (targetDocId) {
          const { data: doc } = await supabase
            .from('document_objects')
            .select('*')
            .eq('id', targetDocId)
            .maybeSingle();

          if (doc) {
            const access = isOwner ? 'owner' : 'public';
            return formatResolvedResult(doc, series, access, false);
          }
        }
      }
    } catch {
      // fallback to legacy query below
    }

    // 2. Legacy fallback: query document_objects directly by building_id
    const { data: docList, error: dErr } = await supabase
      .from('document_objects')
      .select('*')
      .eq('building_id', buildingId)
      .in('document_type', ['mobile_im_lite', 'mobile_im', 'im_lite', 'im_lite_draft'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (dErr || !docList || docList.length === 0) {
      return null;
    }

    const isOwner = Boolean(viewerId && (viewerId === docList[0].broker_id || viewerId === docList[0].owner_id || role === 'admin'));

    // If viewer is not owner, find the latest published doc
    if (!isOwner) {
      const pubDoc = docList.find(
        (d: any) =>
          d.status === 'published' ||
          d.status === 'superseded' ||
          d.status === 'broker_reviewed' ||
          d.status === 'shared_external'
      );
      if (pubDoc) {
        return formatResolvedResult(pubDoc, null, 'public', false);
      }
      return null;
    }

    // For owner, return latest doc
    return formatResolvedResult(docList[0], null, 'owner', false);
  }

  return null;
}

function formatResolvedResult(
  doc: any,
  series: any,
  access: 'owner' | 'public' | 'grant',
  pinned: boolean
): ResolvedImVersion {
  const isSealed = Boolean(doc.sealed_at || doc.status === 'published' || doc.status === 'superseded');
  const releaseTier = doc.body?.releaseTier || (doc.status === 'published' ? 'fact_om' : 'fact_om');

  return {
    version: {
      id: doc.id,
      series_id: doc.series_id,
      version_no: doc.version_no,
      title: doc.title,
      body: doc.body,
      status: doc.status,
      content_hash: doc.content_hash,
      doc_hash: doc.doc_hash,
      sealed_at: doc.sealed_at,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      owner_id: doc.owner_id,
      broker_id: doc.broker_id,
      building_id: doc.building_id,
    },
    series: series
      ? {
          id: series.id,
          building_id: series.building_id,
          owner_id: series.owner_id,
          label: series.label,
          latest_version_no: series.latest_version_no,
          published_version_id: series.published_version_id,
          current_draft_version_id: series.current_draft_version_id,
        }
      : null,
    access,
    pinned,
    isSealed,
    releaseTier,
    status: doc.status,
  };
}
