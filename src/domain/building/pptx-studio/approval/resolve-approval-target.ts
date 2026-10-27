/**
 * resolve-approval-target.ts — S70 파일 승인(approve-file) 대상 IM 문서를 정확히 1건으로 확정한다 (P0-SEC).
 *
 * 이전 결함: `.or(building_id.eq.X,id.eq.X).maybeSingle()` 이 2건 이상이면 오류 → docData null → 승인 게이트 생략,
 * 이어서 `update(...).or(building_id.eq.X,id.eq.X)` 가 해당 매물의 **모든 문서**를 published 로 바꿨다.
 *
 * 규칙 (fail-closed):
 *  1) dealId 가 IM 문서(mobile_im/im_lite, archived 아님) id 이면 그 문서 = 프로젝트 원본 문서.
 *  2) 아니면 dealId 를 매물 id 로 보고, 해당 매물의 최신 non-archived `mobile_im` 문서 중 ownerUserId 소유 문서 1건.
 *  3) 후보 없음 → 404, 최신 후보가 동률(created_at 동일)로 2건 이상 → 409, 조회 오류 → 500.
 */
export interface ApprovalTargetDoc {
  id: string;
  body: Record<string, any> | null;
  content: Record<string, any> | null;
  status: string | null;
  owner_id: string | null;
  building_id: string | null;
  created_at?: string | null;
}

export type ApprovalTargetResult =
  | { ok: true; doc: ApprovalTargetDoc; via: 'source_doc' | 'latest_building_doc' }
  | { ok: false; status: 404 | 409 | 500; code: 'TARGET_DOC_NOT_FOUND' | 'TARGET_DOC_AMBIGUOUS' | 'TARGET_LOOKUP_FAILED'; message: string };

interface QueryClient { from: (table: string) => any }

const SELECT = 'id, body, content, status, owner_id, building_id, document_type, created_at';
const SOURCE_DOC_TYPES = ['mobile_im', 'im_lite'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveApprovalTargetDoc(
  svc: QueryClient,
  dealId: string,
  ownerUserId: string | null,
): Promise<ApprovalTargetResult> {
  const notFound: ApprovalTargetResult = {
    ok: false, status: 404, code: 'TARGET_DOC_NOT_FOUND',
    message: '승인 대상 IM 문서를 찾을 수 없습니다. 먼저 IM 을 생성해 주세요.',
  };
  if (!dealId || !UUID_RE.test(dealId) || !ownerUserId) return notFound;

  try {
    // 1) 프로젝트 원본 문서 (dealId = 문서 id)
    const { data: source, error: sourceErr } = await svc
      .from('document_objects')
      .select(SELECT)
      .eq('id', dealId)
      .maybeSingle();
    if (sourceErr) throw sourceErr;
    if (source && SOURCE_DOC_TYPES.includes(source.document_type) && source.status !== 'archived') {
      return { ok: true, doc: source as ApprovalTargetDoc, via: 'source_doc' };
    }

    // 2) 매물의 최신 non-archived mobile_im 문서 (소유자 문서만)
    const { data: rows, error: listErr } = await svc
      .from('document_objects')
      .select(SELECT)
      .eq('building_id', dealId)
      .eq('document_type', 'mobile_im')
      .eq('owner_id', ownerUserId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(2);
    if (listErr) throw listErr;
    const list = (rows ?? []) as ApprovalTargetDoc[];
    if (list.length === 0) return notFound;
    if (list.length > 1 && (!list[0].created_at || list[0].created_at === list[1].created_at)) {
      return {
        ok: false, status: 409, code: 'TARGET_DOC_AMBIGUOUS',
        message: '승인 대상 IM 문서를 하나로 특정할 수 없습니다. IM 승인 화면에서 문서를 선택해 승인해 주세요.',
      };
    }
    return { ok: true, doc: list[0], via: 'latest_building_doc' };
  } catch {
    return {
      ok: false, status: 500, code: 'TARGET_LOOKUP_FAILED',
      message: '승인 대상 문서를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}
