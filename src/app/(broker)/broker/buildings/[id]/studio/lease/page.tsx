'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StudioTabs } from '@/components/studio/StudioTabs';
import { LeaseFileImport } from './components/lease-file-import';
import { LeasePhotoOcr } from './components/lease-photo-ocr';

interface TenantRow {
  floor: string;
  area_sqm: number;
  tenant_type: string;
  monthly_rent: number | null;
  deposit: number | null;
  contract_end: string | null;
  is_anchor: boolean;
  tenant_name: string | null;
}

export default function StudioLeasePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
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
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('임대차 정보를 불러올 수 없습니다.');
        const data = await res.json();

        if (data.leaseSummary && Array.isArray(data.leaseSummary.tenants) && data.leaseSummary.tenants.length > 0) {
          setTenants(data.leaseSummary.tenants);
        } else {
          // Initialize with one empty row
          setTenants([
            {
              floor: '1F',
              area_sqm: 0,
              tenant_type: 'office',
              monthly_rent: 0,
              deposit: 0,
              contract_end: '',
              is_anchor: false,
              tenant_name: '',
            },
          ]);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const addRow = () => {
    setTenants([
      ...tenants,
      {
        floor: '',
        area_sqm: 0,
        tenant_type: 'office',
        monthly_rent: 0,
        deposit: 0,
        contract_end: '',
        is_anchor: false,
        tenant_name: '',
      },
    ]);
  };

  const removeRow = (index: number) => {
    const nextTenants = tenants.filter((_, i) => i !== index);
    if (nextTenants.length === 0) {
      setTenants([
        {
          floor: '',
          area_sqm: 0,
          tenant_type: 'office',
          monthly_rent: 0,
          deposit: 0,
          contract_end: '',
          is_anchor: false,
          tenant_name: '',
        },
      ]);
    } else {
      setTenants(nextTenants);
    }
  };

  const handleFieldChange = (index: number, field: keyof TenantRow, value: TenantRow[keyof TenantRow]) => {
    const updated = tenants.map((row, i) => {
      if (i !== index) return row;
      return { ...row, [field]: value };
    });
    setTenants(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const formattedTenants = tenants.map((t) => ({
        floor: t.floor || '1F',
        area_sqm: Number(t.area_sqm) || 0,
        tenant_type: t.tenant_type || 'office',
        monthly_rent: t.monthly_rent !== null ? Number(t.monthly_rent) : null,
        deposit: t.deposit !== null ? Number(t.deposit) : null,
        contract_end: t.contract_end || null,
        is_anchor: !!t.is_anchor,
        tenant_name: t.tenant_name || null,
      }));

      const token = localStorage.getItem('sb-access-token') ?? '' /* SEC-6: 더미 토큰 금지 — 비어 있으면 서버가 세션 쿠키로 인증 */;
      const res = await fetch(`/api/broker/buildings/${id}/lease`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenants: formattedTenants }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '저장 중 오류가 발생했습니다.');
      }

      setSuccess(true);
      // WP-7.3D P1-5: no hard window reload — local tenant state already reflects the saved
      // rent roll; router.refresh() re-renders the server layout (completeness score).
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
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-700" />
        <p className="text-sm text-slate-600 mt-4">임대차 입력 폼을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StudioTabs buildingId={id} activeTab="lease" />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
                <span>📜 Rent Roll 멀티로우 동적 입력폼</span>
                <span className="text-sm bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded font-mono font-bold">
                  +25점 확보 가능
                </span>
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                층별 임대 내역을 정확하게 기입해주세요. 개인정보 보호를 위해 임차인명, 상세 금액 정보 등은 대외 공개 시 자동으로 가림(Blind) 처리됩니다.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <LeaseFileImport
                onImport={(newTenants) =>
                  setTenants([...tenants.filter((t) => t.floor || t.tenant_name), ...newTenants])
                }
              />
              <LeasePhotoOcr
                onImport={(newTenants) =>
                  setTenants([...tenants.filter((t) => t.floor || t.tenant_name), ...newTenants])
                }
              />
              <button
                type="button"
                onClick={addRow}
                className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-xl text-sm font-bold transition-all border border-slate-300 active:scale-[0.98] shrink-0 cursor-pointer"
              >
                ➕ 임차인(층) 추가
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700">
              ⚠️ {error}
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-700">
              ✓ 성공적으로 저장되었습니다! 실시간 완성도 점수를 반영하고 있습니다...
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-3 px-4 text-sm font-bold text-slate-700 w-24">층수</th>
                  <th className="py-3 px-4 text-sm font-bold text-slate-700">임차인명 (민감)</th>
                  <th className="py-3 px-4 text-sm font-bold text-slate-700 w-32">전용면적 (㎡)</th>
                  <th className="py-3 px-4 text-sm font-bold text-slate-700 w-32">업종 유형</th>
                  <th className="py-3 px-4 text-sm font-bold text-slate-700 w-36">보증금 (만원)</th>
                  <th className="py-3 px-4 text-sm font-bold text-slate-700 w-36">월 차임 (만원)</th>
                  <th className="py-3 px-4 text-sm font-bold text-slate-700 w-36">만기일 (YYYY-MM)</th>
                  <th className="py-3 px-4 text-sm font-bold text-slate-700 w-24 text-center">앵커 여부</th>
                  <th className="py-3 px-4 text-sm font-bold text-slate-700 w-16 text-center">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {tenants.map((tenant, index) => (
                  <tr key={index} className="hover:bg-slate-50/80 transition-colors">
                    {/* Floor */}
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={tenant.floor}
                        onChange={(e) => handleFieldChange(index, 'floor', e.target.value)}
                        placeholder="예: 1F, B1"
                        className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg py-2 px-2.5 text-base text-slate-900 focus:outline-none focus:border-blue-600 font-bold"
                        required
                      />
                    </td>
                    {/* Tenant Name */}
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={tenant.tenant_name || ''}
                        onChange={(e) => handleFieldChange(index, 'tenant_name', e.target.value)}
                        placeholder="스타벅스 등"
                        className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg py-2 px-2.5 text-base text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </td>
                    {/* Area Sqm */}
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        value={tenant.area_sqm || ''}
                        onChange={(e) => handleFieldChange(index, 'area_sqm', Number(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg py-2 px-2.5 text-base text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                        required
                      />
                    </td>
                    {/* Tenant Type */}
                    <td className="py-2.5 px-3">
                      <select
                        value={tenant.tenant_type}
                        onChange={(e) => handleFieldChange(index, 'tenant_type', e.target.value)}
                        className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg py-2 px-2.5 text-base text-slate-900 focus:outline-none focus:border-blue-600 cursor-pointer"
                      >
                        <option value="office">💻 오피스</option>
                        <option value="retail">🛍️ 리테일</option>
                        <option value="food">☕ 식음료/F&B</option>
                        <option value="vacant">📭 공실</option>
                        <option value="other">🎸 기타</option>
                      </select>
                    </td>
                    {/* Deposit (만원) */}
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        value={tenant.deposit === null ? '' : tenant.deposit}
                        onChange={(e) =>
                          handleFieldChange(index, 'deposit', e.target.value === '' ? null : Number(e.target.value))
                        }
                        placeholder="0"
                        className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg py-2 px-2.5 text-base text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                      />
                    </td>
                    {/* Monthly Rent (만원) */}
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        value={tenant.monthly_rent === null ? '' : tenant.monthly_rent}
                        onChange={(e) =>
                          handleFieldChange(
                            index,
                            'monthly_rent',
                            e.target.value === '' ? null : Number(e.target.value),
                          )
                        }
                        placeholder="0"
                        className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg py-2 px-2.5 text-base text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                      />
                    </td>
                    {/* Contract End */}
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={tenant.contract_end || ''}
                        onChange={(e) => handleFieldChange(index, 'contract_end', e.target.value)}
                        placeholder="YYYY-MM"
                        className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg py-2 px-2.5 text-base text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                      />
                    </td>
                    {/* Is Anchor */}
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={!!tenant.is_anchor}
                        onChange={(e) => handleFieldChange(index, 'is_anchor', e.target.checked)}
                        className="w-5 h-5 bg-white border border-slate-300 rounded accent-blue-700 cursor-pointer"
                      />
                    </td>
                    {/* Remove */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        aria-label="행 삭제"
                        className="min-w-[44px] min-h-[44px] mx-auto rounded-lg bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 border border-slate-200 hover:border-red-200 transition-all flex items-center justify-center text-sm font-black cursor-pointer"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push(`/broker/buildings/${id}/studio/briefing`)}
            className="min-h-[44px] px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-700 transition-all cursor-pointer"
          >
            돌아가기
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white" />
                <span>저장 중...</span>
              </>
            ) : (
              <span>✓ 임대차 현황 저장 및 점수 갱신</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
