import { resolveWorkspaceImGuard } from '@/lib/im-lite/im-public-guard';

export const ALLOWED_PUBLIC_IM_PRO_STATUSES = new Set([
  'published',
  'sent',
  'approved',
  'broker_reviewed',
  'shared_external',
]);

export const PUBLIC_IM_PRO_DOC_TYPES = [
  'mobile_im',
  'im_lite',
  'im_pro',
] as const;

export type ImProDocGuardResult =
  | { ok: true; doc: Record<string, any> }
  | {
      ok: false;
      status: 403 | 404;
      reason: 'deleted' | 'revoked' | 'not_published' | 'not_found';
      error: string;
    };

export async function resolvePublishedImProDocument(params: {
  supabase: any;
  buildingId: string;
  quickLookupId?: string | null;
}): Promise<ImProDocGuardResult> {
  const { supabase, buildingId, quickLookupId } = params;
  const cleanBuildingId = String(buildingId || '').trim();

  if (cleanBuildingId) {
    const wsGuard = await resolveWorkspaceImGuard(supabase, cleanBuildingId);
    if (wsGuard.isDeleted) {
      return {
        ok: false,
        status: 404,
        reason: 'deleted',
        error: 'IM document deleted',
      };
    }
    if (wsGuard.isRevoked) {
      return {
        ok: false,
        status: 403,
        reason: 'revoked',
        error: 'IM document link has been revoked',
      };
    }
    if (wsGuard.item) {
      const wsStatus = String(wsGuard.item.status ?? '').trim().toLowerCase();
      if (!ALLOWED_PUBLIC_IM_PRO_STATUSES.has(wsStatus)) {
        return {
          ok: false,
          status: 403,
          reason: 'not_published',
          error: 'IM document is not published for export',
        };
      }
    }
  }

  const { data: docRows } = await supabase
    .from('document_objects')
    .select('*')
    .eq('building_id', cleanBuildingId)
    .in('document_type', [...PUBLIC_IM_PRO_DOC_TYPES])
    .order('created_at', { ascending: false })
    .limit(5);

  const rows = Array.isArray(docRows) ? docRows : [];
  const sectionDocs = rows.filter(
    (d: any) =>
      Array.isArray(d?.body?.sections) &&
      d.body.sections.length > 0 &&
      !Array.isArray(d?.body?.slides)
  );

  const latestSectionDoc = sectionDocs[0];
  if (
    latestSectionDoc?.is_revoked === true ||
    latestSectionDoc?.body?.is_revoked === true
  ) {
    return {
      ok: false,
      status: 403,
      reason: 'revoked',
      error: 'IM document link has been revoked',
    };
  }

  const hasRevoked = rows.some(
    (d: any) => d?.is_revoked === true || d?.body?.is_revoked === true
  );

  const doc =
    sectionDocs.find((d: any) => {
      if (d?.is_revoked === true || d?.body?.is_revoked === true) return false;
      const statusNorm = String(d?.status ?? '').trim().toLowerCase();
      return ALLOWED_PUBLIC_IM_PRO_STATUSES.has(statusNorm);
    }) ?? null;

  if (doc) {
    return { ok: true, doc };
  }

  if (hasRevoked) {
    return {
      ok: false,
      status: 403,
      reason: 'revoked',
      error: 'IM document link has been revoked',
    };
  }

  if (sectionDocs.length > 0) {
    return {
      ok: false,
      status: 403,
      reason: 'not_published',
      error: 'IM document is not published for export',
    };
  }

  const quickLookup = String(quickLookupId || cleanBuildingId || '').trim();
  if (quickLookup) {
    const { resolveOrSynthesizeQuickImRecord } = await import(
      '@/lib/im-lite/quick-generate-store'
    );
    const quickRec = await resolveOrSynthesizeQuickImRecord(quickLookup, supabase);
    if (quickRec?.fullDocBody) {
      if (
        (quickRec as any).isRevoked === true ||
        (quickRec.fullDocBody as any)?.is_revoked === true
      ) {
        return {
          ok: false,
          status: 403,
          reason: 'revoked',
          error: 'IM document link has been revoked',
        };
      }
      const quickStatusNorm = String(
        (quickRec as any)?.status ?? (quickRec.fullDocBody as any)?.status ?? ''
      )
        .trim()
        .toLowerCase();
      if (quickStatusNorm && !ALLOWED_PUBLIC_IM_PRO_STATUSES.has(quickStatusNorm)) {
        return {
          ok: false,
          status: 403,
          reason: 'not_published',
          error: 'IM document is not published for export',
        };
      }
      return {
        ok: true,
        doc: {
          id: quickRec.documentId,
          building_id: quickRec.buildingId,
          owner_id: quickRec.ownerId ?? null,
          title: quickRec.buildingName,
          status: quickStatusNorm || 'published',
          body: { ...quickRec.fullDocBody },
        },
      };
    }
  }

  return {
    ok: false,
    status: 404,
    reason: 'not_found',
    error: 'IM document not found',
  };
}
