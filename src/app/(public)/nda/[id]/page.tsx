import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveProGrantByAnyId } from "@/domain/gate/im-pro-grant-service";
import { getWorkspaceItemByAnyId } from "@/lib/workspace/workspace-repository";
import NDASignatureForm from "@/components/gate/NDASignatureForm";
import { NDA_FALLBACK_TITLE, resolveNdaPublicBuildingTitle } from "./nda-display";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ token?: string }>;
}

// P1-2 (WP-7.3A): pre-NDA gate pages are per-recipient and must never be indexed.
export const metadata: Metadata = {
  title: "비밀유지서약서 (NDA) 서명 | 크리딜",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default async function NDAPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams.catch(() => ({} as { token?: string })) : {};
  const initialToken =
    typeof resolvedSearchParams?.token === "string" && resolvedSearchParams.token.trim()
      ? resolvedSearchParams.token.trim()
      : undefined;

  const supabase = createServiceClient();

  // 1. Resolve strictly via im_pro_grants.id, grant_token, or gate_request_id (NEVER public building_id)
  const resolved = await resolveProGrantByAnyId(supabase, id, { allowBuildingLookup: false });
  const grant = resolved.grant;
  let gateReq = resolved.gateRequest;

  if (!grant && !gateReq) {
    try {
      const grTable = supabase.from("gate_requests") as unknown as {
        select?: (cols: string) => {
          eq?: (col: string, val: string) => {
            maybeSingle?: () => PromiseLike<{
              data?: Record<string, unknown> | null;
              error?: unknown;
            }>;
          };
        };
      };
      const grQuery = grTable?.select?.("*")?.eq?.("id", id);
      if (grQuery && typeof grQuery.maybeSingle === "function") {
        const grRes = await grQuery.maybeSingle();
        if (!grRes?.error && grRes?.data && String(grRes.data.id || "") === id) {
          gateReq = grRes.data as typeof resolved.gateRequest;
        }
      }
    } catch {
      gateReq = null;
    }
  }

  const buildingId: string | undefined =
    resolved.buildingId ||
    (gateReq?.building_id ? String(gateReq.building_id) : undefined) ||
    undefined;
  const requestId: string | undefined =
    (grant?.id ? String(grant.id) : undefined) ||
    (gateReq?.id ? String(gateReq.id) : undefined);
  const isAlreadySigned = Boolean(grant?.nda_signed_at || grant?.status === "active");

  if (!requestId) return notFound();

  // Load building metadata for display in NDA agreement.
  // P1-2 (WP-7.3A): the page is pre-NDA — only an area-level, masked label is shown.
  let buildingTitle = NDA_FALLBACK_TITLE;
  if (buildingId) {
    const { data: bldgInfo } = await supabase
      .from("building_ssot_lite")
      .select("address, asset_type, area_signal")
      .eq("id", buildingId)
      .maybeSingle();

    if (bldgInfo) {
      buildingTitle = resolveNdaPublicBuildingTitle({
        areaSignal: bldgInfo.area_signal,
        address: bldgInfo.address,
        assetType: bldgInfo.asset_type || "상업용 부동산",
      });
    } else {
      const wsItem = await getWorkspaceItemByAnyId(supabase, buildingId).catch(() => null);
      if (wsItem?.title) {
        buildingTitle = resolveNdaPublicBuildingTitle({ workspaceTitle: wsItem.title });
      }
    }
  }

  return (
    <main className="min-h-screen bg-[#FAF9F5] text-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm">
        <div className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 bg-blue-50 text-blue-700 border border-blue-200 rounded-full flex items-center justify-center text-xl mb-4">
            ✍️
          </div>
          <h1 className="text-xl font-bold text-slate-900">비밀유지서약서 (NDA)</h1>
          <p className="text-sm text-slate-600">
            상세 매물({buildingTitle}) 정보를 열람하기 위해
            <br />
            열람 요청 시 입력한 전체 연락처(010-XXXX-XXXX)로 본인 확인 후 서명해 주세요.
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 h-56 overflow-y-auto text-sm text-slate-700 leading-relaxed">
          <p className="font-bold text-slate-900 mb-2">[ 비밀유지서약서 ]</p>
          <p>
            본인은 대상 부동산(<strong className="text-slate-900">{buildingTitle}</strong>)의 매수 검토를 위하여 귀사가 제공하는 일체의 정보와 자료(이하 &quot;기밀정보&quot;)에 대하여 다음과 같이 서약합니다.
          </p>
          <p className="mt-3">
            1. <strong className="text-slate-900">목적</strong>: 본 서약서는 매도인이 제공하는 대상 부동산에 관한 기밀정보를 보호하기 위함입니다.
          </p>
          <p className="mt-2">
            2. <strong className="text-slate-900">비밀유지 의무</strong>: 제공받은 기밀정보를 대상 부동산의 매수 검토 목적 외의 다른 용도로 사용하지 않으며, 귀사의 사전 서면 동의 없이 제3자에게 유출하거나 공개하지 않습니다.
          </p>
          <p className="mt-2">
            3. <strong className="text-slate-900">정보의 반환/폐기</strong>: 매수 검토가 중단되거나 귀사의 요청이 있을 경우, 즉시 제공받은 모든 기밀정보를 반환하거나 영구적으로 폐기합니다.
          </p>
          <p className="mt-2">
            4. <strong className="text-slate-900">책임</strong>: 본인의 고의 또는 과실로 기밀정보가 유출되어 발생하는 매도인 및 귀사의 모든 직·간접적 손해에 대하여 배상할 책임을 집니다.
          </p>
          <p className="mt-4 text-center text-slate-500">- 이상 -</p>
        </div>

        <NDASignatureForm
          requestId={requestId || id}
          grantId={grant?.id ? String(grant.id) : undefined}
          buildingId={buildingId || id}
          initialGrantToken={initialToken}
          isAlreadySigned={isAlreadySigned}
        />
      </div>
    </main>
  );
}
