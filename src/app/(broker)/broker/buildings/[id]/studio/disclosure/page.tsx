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

// WP-7.3D P1-5: daylight palette (white/slate) + ≥14px text + 48px touch targets.
function ToggleSwitch({
  checked,
  onToggle,
  label,
  tone,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  tone: 'required' | 'optional';
}) {
  const onColor = tone === 'required' ? 'bg-blue-700' : 'bg-emerald-600';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className="shrink-0 inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
    >
      <span
        className={`w-12 h-7 rounded-full p-1 transition-all flex items-center ${
          checked ? onColor : 'bg-slate-300'
        }`}
      >
        <span
          className={`w-5 h-5 rounded-full bg-white shadow-sm transition-all ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
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
        const token = localStorage.getItem('sb-access-token') ?? '' /* SEC-6: 더미 토큰 금지 — 비어 있으면 서버가 세션 쿠키로 인증 */;
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
      const token = localStorage.getItem('sb-access-token') ?? '' /* SEC-6: 더미 토큰 금지 — 비어 있으면 서버가 세션 쿠키로 인증 */;
      const res = await fetch(`/api/broker/buildings/${id}/disclosure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ disclosurePrefs: prefs })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '저장 중 오류가 발생했습니다.');
      }

      setSuccess(true);
      // WP-7.3D P1-5: no hard window reload — the local `prefs` state already reflects the
      // saved policy; router.refresh() re-renders the server layout (completeness score).
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white border border-slate-200 rounded-2xl min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-700"></div>
        <p className="text-sm text-slate-700 mt-4">보안 및 정보 공개 설정 페이지 구성 중...</p>
      </div>
    );
  }

  const isTeaserViolated = !prefs.hide_exact_address || !prefs.hide_tenant_names || !prefs.hide_unit_rent;

  const requiredRows: Array<{ key: keyof DisclosurePrefs; title: string; desc: string }> = [
    {
      key: 'hide_exact_address',
      title: '📌 등기부등본상 정확한 지번 주소 숨기기',
      desc: '비활성화 시 불특정 다수에게 매물이 특정되므로 블라인드 티저 출력이 거부됩니다.',
    },
    {
      key: 'hide_tenant_names',
      title: '🏢 개별 임차인명(상호명) 가림 처리',
      desc: "개별 임차인 상호(예: 스타벅스 등)를 Blind 처리하고 업종 분류('식음료 F&B')로 대체합니다.",
    },
    {
      key: 'hide_unit_rent',
      title: '💰 호실별 상세 보증금 및 월세 금액 숨기기',
      desc: '각 개별 임대 공간의 세부 수치 공개를 감추고 권한 등급(Gate-2) 이상 회원만 볼 수 있도록 격리합니다.',
    },
  ];

  const optionalRows: Array<{ key: keyof DisclosurePrefs; title: string; desc: string }> = [
    { key: 'show_area_signal', title: '대략적 권역 표시', desc: '예: 강남구 역삼동 부근' },
    { key: 'show_asset_type', title: '자산 유형 공개', desc: '예: 꼬마빌딩, 복합근생 등' },
    { key: 'show_price_band', title: '매각 희망 금액대 노출', desc: '예: 100억대 초반' },
    { key: 'show_tenant_count', title: '총 임차인 구성 수', desc: '예: 총 8개사 입점 중' },
    { key: 'show_walt', title: '평균 가중 잔여만기 (WALT)', desc: '예: WALT 2.1년 등' },
    { key: 'show_vacancy_rate', title: '공실 비율 공개', desc: '예: 현재 공실률 3.5%' },
  ];

  return (
    <div className="space-y-6">
      <StudioTabs buildingId={id} activeTab="disclosure" />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6 shadow-sm">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
              🔒 Blind 자산 정보 공개 보안 설정
              <span className="text-sm bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-bold">
                +5점 확보 가능
              </span>
            </h3>
            <p className="text-sm text-slate-700 mt-1 leading-relaxed">
              외부 투자자들에게 임대차 요약(WALT, 공실률 등) 및 자산의 비식별 신호(Asset Signals)를 어느 수준까지 공개할 것인지 제어합니다.
            </p>
          </div>

          {error && (
            <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          {success && (
            <div role="status" className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-800">
              ✓ 보안 설정이 업데이트되었습니다. 실시간 완성도 등급 점수에 반영됩니다.
            </div>
          )}

          {/* Core Security Redactions (Must match blind safety) */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-blue-800 tracking-wide border-b border-slate-200 pb-2">
              🔴 필수 보안 마스킹 (Blind Teaser 필수)
            </h4>

            <div className="grid grid-cols-1 gap-3">
              {requiredRows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">{row.title}</span>
                    <span className="text-sm text-slate-700 mt-1 block leading-relaxed">{row.desc}</span>
                  </div>
                  <ToggleSwitch
                    checked={prefs[row.key]}
                    onToggle={() => handleToggle(row.key)}
                    label={row.title}
                    tone="required"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Optional Disclosures */}
          <div className="space-y-4 pt-2">
            <h4 className="text-sm font-bold text-slate-700 tracking-wide border-b border-slate-200 pb-2">
              🟢 티저 공개 허용 범위 설정 (Asset Signals)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {optionalRows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">{row.title}</span>
                    <span className="text-sm text-slate-700">{row.desc}</span>
                  </div>
                  <ToggleSwitch
                    checked={prefs[row.key]}
                    onToggle={() => handleToggle(row.key)}
                    label={row.title}
                    tone="optional"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push(`/broker/buildings/${id}/studio/briefing`)}
            className="min-h-[48px] px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-700 transition-all cursor-pointer"
          >
            돌아가기
          </button>
          <button
            type="submit"
            disabled={saving || isTeaserViolated}
            className="min-h-[48px] px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div>
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
