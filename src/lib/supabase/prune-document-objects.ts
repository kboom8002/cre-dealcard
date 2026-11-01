import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Prunes superseded historical rows in `document_objects` for a given `(building_id, document_type)`,
 * keeping only the latest `keepCount` rows (default: 2 for IM documents so v1↔v2 comparison works,
 * 1 for blind_teaser). Also strips heavy inline base64 map images from non-latest historical rows
 * to prevent PostgreSQL TOAST Disk IO bloat while preserving the #1 latest row intact (Rule 66).
 */
export async function pruneSupersededDocumentObjects(
  supabase: SupabaseClient | any,
  buildingId: string,
  documentType: string,
  keepCount = 2
): Promise<{ deletedCount: number; strippedCount: number }> {
  let deletedCount = 0;
  let strippedCount = 0;

  if (!supabase || typeof supabase.from !== 'function' || !buildingId || !documentType) {
    return { deletedCount, strippedCount };
  }

  try {
    const query = supabase
      .from('document_objects')
      .select('id, created_at')
      .eq('building_id', buildingId)
      .eq('document_type', documentType);

    if (typeof query?.order !== 'function') {
      return { deletedCount, strippedCount };
    }

    const { data: rows, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error || !Array.isArray(rows) || rows.length <= 1) {
      return { deletedCount, strippedCount };
    }

    // 1. Delete rows older than keepCount
    if (rows.length > keepCount) {
      const idsToDelete = rows.slice(keepCount).map((r: any) => r.id).filter(Boolean);
      if (idsToDelete.length > 0) {
        const delQuery = supabase.from('document_objects').delete();
        if (typeof delQuery?.in === 'function') {
          const { error: delErr } = await delQuery.in('id', idsToDelete);
          if (!delErr) {
            deletedCount = idsToDelete.length;
          }
        }
      }
    }

    // 2. Strip heavy inline base64 map blobs from the 2nd-latest historical row (index 1)
    if (keepCount >= 2 && rows.length >= 2 && ['mobile_im', 'im_lite', 'im_lite_draft'].includes(documentType)) {
      const secondId = rows[1]?.id;
      if (secondId) {
        const { data: secondRow } = await supabase
          .from('document_objects')
          .select('id, body')
          .eq('id', secondId)
          .maybeSingle();
        const enrichment = secondRow?.body?.enrichment;
        if (
          enrichment &&
          ((typeof enrichment.cadastralMapImage === 'string' && enrichment.cadastralMapImage.startsWith('data:')) ||
            (typeof enrichment.locationMapImage === 'string' && enrichment.locationMapImage.startsWith('data:')))
        ) {
          const nextBody = {
            ...secondRow.body,
            enrichment: {
              ...enrichment,
              cadastralMapImage: null,
              locationMapImage: null,
            },
          };
          const { error: upErr } = await supabase
            .from('document_objects')
            .update({ body: nextBody })
            .eq('id', secondId);
          if (!upErr) {
            strippedCount = 1;
          }
        }
      }
    }
  } catch {
    // Non-blocking best-effort cleanup
  }

  return { deletedCount, strippedCount };
}
