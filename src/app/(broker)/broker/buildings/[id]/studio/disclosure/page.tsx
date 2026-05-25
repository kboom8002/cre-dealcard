'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StudioTabs } from '@/components/studio/StudioTabs';

interface DisclosurePrefs {
  show_area_signal: boolean;
  show_asset_type: boolean;
  show_price_band: boolean;
  show_tenant_count: boolean;
  show_walt: boolean;
  show_vacancy_rate: boolean;
  hide_exact_address: boolean;
  hide_tenant_names: boolean;
  hide_unit_rent: boolean;
}

export default function StudioDisclosurePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [prefs, setPrefs] = useState<DisclosurePrefs>({
    show_area_signal: true,
    show_asset_type: true,
    show_price_band: true,
    show_tenant_count: false,
    show_walt: false,
    show_vacancy_rate: false,
    hide_exact_address: true,
    hide_tenant_names: true,
    hide_unit_rent: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load existing data
  useEffect(() => {
    async function loadData() {
      try {
        const token = localStorage.getItem('sb-access-token') || 'dummy-token';
        const res = await fetch(`/api/broker/buildings/${id}/studio`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('스튜디오 상태 정보를 불러올 수 없습니다.');
        const data = await res.json();
        
        if (data.disclosurePrefs && Object.keys(data.disclosurePrefs).length > 0) {
          setPrefs({
            show_area_signal: data.disclosurePrefs.show_area_signal ?? true,
            show_asset_type: data.disclosurePrefs.show_asset_type ?? true,
            show_price_band: data.disclosurePrefs.show_price_band ?? true,
            show_tenant_count: data.disclosurePrefs.show_tenant_count ?? false,
            show_walt: data.disclosurePrefs.show_walt ?? false,
            show_vacancy_rate: data.disclosurePrefs.show_vacancy_rate ?? false,
            hide_exact_address: data.disclosurePrefs.hide_exact_address ?? true,
            hide_tenant_names: data.disclosurePrefs.hide_tenant_names ?? true,
            hide_unit_rent: data.disclosurePrefs.hide_unit_rent ?? true,
          });
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const handleToggle = (key: keyof DisclosurePrefs) => {
    setPrefs({
      ...prefs,
      [key]: !prefs[key]
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    // Validate rules locally: blind teaser guardrails
    if (!prefs.hide_exact_address || !prefs.hide_tenant_names || !prefs.hide_unit_rent) {
      setError('⚠️ [필수 규제 준수 가드레일] 등기상 정확한 주소, 임차인명, 호실별 상세 월세는 외부 블라인드 공개용 티저에 포함될 수 없습니다. 반드시 보안 설정을 활성화해야 합니다.');
      setSaving(false);
      return;
    }

    try {
      const token = localStorage.getItem('sb-access-token') || 'dummy-token';
      const res = await fetch(`/api/broker/buildings/${id}/disclosure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ disclosurePrefs: prefs })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '저장 중 오류가 발생했습니다.');
      }

      setSuccess(true);
      setTimeout(() => {
        router.refresh();
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-neutral-900 border border-neutral-800 rounded-2xl min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
        <p className="text-xs text-neutral-400 mt-4">보안 및 정보 공개 설정 페이지 구성 중...</p>
      </div>
    );
  }

  const isTeaserViolated = !prefs.hide_exact_address || !prefs.hide_tenant_names || !prefs.hide_unit_rent;

  return (
    <div className="space-y-6">
      <StudioTabs buildingId={id} activeTab="disclosure" />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              🔒 Blind 자산 정보 공개 보안 설정
              <span className="text-[10px] bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono font-bold">
                +5점 확보 가능
              </span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              외부 투자자들에게 임대차 요약(WALT, 공실률 등) 및 자산의 비식별 신호(Asset Signals)를 어느 수준까지 공개할 것인지 제어합니다.
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-950/40 border border-red-900/30 rounded-xl text-xs font-bold text-red-400 leading-relaxed">
              {error}
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-900/30 rounded-xl text-xs font-bold text-emerald-400">
              ✓ 보안 설정이 업데이트되었습니다. 실시간 완성도 등급 점수를 반영하고 있습니다...
            </div>
          )}

          {/* Core Security Redactions (Must match blind safety) */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-primary uppercase tracking-widest border-b border-neutral-800 pb-2">
              🔴 필수 보안 마스킹 (Blind Teaser 필수)
            </h4>
            
            <div className="grid grid-cols-1 gap-3">
              {/* Hide Exact Address */}
              <div className="flex items-center justify-between p-4 bg-neutral-950 border border-red-900/10 rounded-xl hover:border-red-900/20 transition-all">
                <div>
                  <span className="block text-xs font-bold text-neutral-200">
                    📌 등기부등본상 정확한 지번 주소 숨기기
                  </span>
                  <span className="text-[10px] text-neutral-500 mt-1 block">
                    비활성화 시 불특정 다수에게 매물이 특정되므로 블라인드 티저 출력이 거부됩니다.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('hide_exact_address')}
                  className={`w-12 h-6 rounded-full p-1 transition-all ${
                    prefs.hide_exact_address ? 'bg-primary' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${
                    prefs.hide_exact_address ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Hide Tenant Names */}
              <div className="flex items-center justify-between p-4 bg-neutral-950 border border-red-900/10 rounded-xl hover:border-red-900/20 transition-all">
                <div>
                  <span className="block text-xs font-bold text-neutral-200">
                    🏢 개별 임차인명(상호명) 가림 처리
                  </span>
                  <span className="text-[10px] text-neutral-500 mt-1 block">
                    개별 임차인 상호(예: 스타벅스 등)를 Blind 처리하고 업종 분류(&apos;식음료 F&B&apos;)로 대체합니다.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('hide_tenant_names')}
                  className={`w-12 h-6 rounded-full p-1 transition-all ${
                    prefs.hide_tenant_names ? 'bg-primary' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${
                    prefs.hide_tenant_names ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Hide Unit Rent */}
              <div className="flex items-center justify-between p-4 bg-neutral-950 border border-red-900/10 rounded-xl hover:border-red-900/20 transition-all">
                <div>
                  <span className="block text-xs font-bold text-neutral-200">
                    💰 호실별 상세 보증금 및 월세 금액 숨기기
                  </span>
                  <span className="text-[10px] text-neutral-500 mt-1 block">
                    각 개별 임대 공간의 세부 수치 공개를 감추고 권한 등급(Gate-2) 이상 회원만 볼 수 있도록 격리합니다.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('hide_unit_rent')}
                  className={`w-12 h-6 rounded-full p-1 transition-all ${
                    prefs.hide_unit_rent ? 'bg-primary' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${
                    prefs.hide_unit_rent ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          {/* Optional Disclosures */}
          <div className="space-y-4 pt-2">
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest border-b border-neutral-800 pb-2">
              🟢 티저 공개 허용 범위 설정 (Asset Signals)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Show Area Signal */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-950 border border-neutral-850 rounded-xl">
                <div>
                  <span className="block text-xs font-bold text-neutral-200">대략적 권역 표시</span>
                  <span className="text-[10px] text-neutral-500">예: 강남구 역삼동 부근</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('show_area_signal')}
                  className={`w-10 h-5 rounded-full p-0.5 transition-all ${
                    prefs.show_area_signal ? 'bg-emerald-500' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${
                    prefs.show_area_signal ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Show Asset Type */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-950 border border-neutral-850 rounded-xl">
                <div>
                  <span className="block text-xs font-bold text-neutral-200">자산 유형 공개</span>
                  <span className="text-[10px] text-neutral-500">예: 꼬마빌딩, 복합근생 등</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('show_asset_type')}
                  className={`w-10 h-5 rounded-full p-0.5 transition-all ${
                    prefs.show_asset_type ? 'bg-emerald-500' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${
                    prefs.show_asset_type ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Show Price Band */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-950 border border-neutral-850 rounded-xl">
                <div>
                  <span className="block text-xs font-bold text-neutral-200">매각 희망 금액대 노출</span>
                  <span className="text-[10px] text-neutral-500">예: 100억대 초반</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('show_price_band')}
                  className={`w-10 h-5 rounded-full p-0.5 transition-all ${
                    prefs.show_price_band ? 'bg-emerald-500' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${
                    prefs.show_price_band ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Show Tenant Count */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-950 border border-neutral-850 rounded-xl">
                <div>
                  <span className="block text-xs font-bold text-neutral-200">총 임차인 구성 수</span>
                  <span className="text-[10px] text-neutral-500">예: 총 8개사 입점 중</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('show_tenant_count')}
                  className={`w-10 h-5 rounded-full p-0.5 transition-all ${
                    prefs.show_tenant_count ? 'bg-emerald-500' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${
                    prefs.show_tenant_count ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Show WALT */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-950 border border-neutral-850 rounded-xl">
                <div>
                  <span className="block text-xs font-bold text-neutral-200">평균 가중 잔여만기 (WALT)</span>
                  <span className="text-[10px] text-neutral-500">예: WALT 2.1년 등</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('show_walt')}
                  className={`w-10 h-5 rounded-full p-0.5 transition-all ${
                    prefs.show_walt ? 'bg-emerald-500' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${
                    prefs.show_walt ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Show Vacancy Rate */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-950 border border-neutral-850 rounded-xl">
                <div>
                  <span className="block text-xs font-bold text-neutral-200">공실 비율 공개</span>
                  <span className="text-[10px] text-neutral-500">예: 현재 공실률 3.5%</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('show_vacancy_rate')}
                  className={`w-10 h-5 rounded-full p-0.5 transition-all ${
                    prefs.show_vacancy_rate ? 'bg-emerald-500' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${
                    prefs.show_vacancy_rate ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push(`/broker/buildings/${id}/studio/briefing`)}
            className="px-5 py-2.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-xl text-xs font-bold text-neutral-300 transition-all cursor-pointer"
          >
            돌아가기
          </button>
          <button
            type="submit"
            disabled={saving || isTeaserViolated}
            className="px-6 py-2.5 bg-primary hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-lg shadow-primary/10 cursor-pointer"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-white"></div>
                <span>저장 중...</span>
              </>
            ) : (
              <span>✓ 보안 공개 범위 정책 저장</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
