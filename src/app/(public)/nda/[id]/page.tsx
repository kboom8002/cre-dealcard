import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import NDASignatureForm from "./NDASignatureForm";

interface PageProps { params: Promise<{ id: string }> }

export const metadata = {
  title: "비밀유지서약서 (NDA) 서명",
};

export default async function NDAPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: request, error } = await supabase
    .from("gate_requests")
    .select("id, building_id, status")
    .eq("id", id)
    .single();

  if (error || !request) return notFound();

  return (
    <main className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#131b2e] rounded-2xl border border-slate-800 p-6 space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xl mb-4">
            ✍️
          </div>
          <h1 className="text-xl font-bold text-white">비밀유지서약서 (NDA)</h1>
          <p className="text-sm text-slate-400">
            상세 매물 정보를 열람하기 위해<br />아래 내용에 동의하고 서명해 주세요.
          </p>
        </div>
        
        <div className="bg-[#0b0f19] border border-slate-800 rounded-xl p-5 h-56 overflow-y-auto text-xs text-slate-300 leading-relaxed custom-scrollbar">
          <p className="font-bold text-slate-200 mb-2">[ 비밀유지서약서 ]</p>
          <p>본인은 대상 부동산의 매수 검토를 위하여 귀사가 제공하는 일체의 정보와 자료(이하 "기밀정보")에 대하여 다음과 같이 서약합니다.</p>
          <p className="mt-3">1. <strong>목적</strong>: 본 서약서는 매도인이 제공하는 대상 부동산에 관한 기밀정보를 보호하기 위함입니다.</p>
          <p className="mt-2">2. <strong>비밀유지 의무</strong>: 제공받은 기밀정보를 대상 부동산의 매수 검토 목적 외의 다른 용도로 사용하지 않으며, 귀사의 사전 서면 동의 없이 제3자에게 유출하거나 공개하지 않습니다.</p>
          <p className="mt-2">3. <strong>정보의 반환/폐기</strong>: 매수 검토가 중단되거나 귀사의 요청이 있을 경우, 즉시 제공받은 모든 기밀정보를 반환하거나 영구적으로 폐기합니다.</p>
          <p className="mt-2">4. <strong>책임</strong>: 본인의 고의 또는 과실로 기밀정보가 유출되어 발생하는 매도인 및 귀사의 모든 직·간접적 손해에 대하여 배상할 책임을 집니다.</p>
          <p className="mt-4 text-center text-slate-500">- 이상 -</p>
        </div>

        <NDASignatureForm 
          requestId={id} 
          buildingId={request.building_id} 
          isAlreadySigned={request.status === 'approved'} 
        />
      </div>
    </main>
  );
}
