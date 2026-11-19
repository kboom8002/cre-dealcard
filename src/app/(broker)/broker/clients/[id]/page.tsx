'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';
import { ConfirmDeleteModal } from '@/components/workspace/ConfirmDeleteModal';
import { createClient } from '@/lib/supabase/client';

interface ClientDetail {
  id: string;
  client_type: string;
  display_name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  tier: string;
  tags: string[];
  notes: string | null;
  buildings: Array<{
    id: string;
    area_signal: string;
    asset_type: string;
    price_band: string | null;
    status: string;
  }>;
  buyerIntents: Array<{
    id: string;
    buyer_type: string;
    budget_display: string | null;
    preferred_regions: string[];
    purchase_purpose: string | null;
  }>;
  contacts: Array<{
    id: string;
    contact_type: string;
    summary: string;
    created_at: string;
  }>;
  bookings: Array<{
    id: string;
    status: string;
    created_at: string;
    slot?: {
      slot_start?: string | null;
      building?: {
        id: string;
        area_signal?: string | null;
      } | null;
    } | null;
  }>;
  created_at: string;
}

interface CurationSaleProperty {
  id: string;
  area_signal?: string;
  asset_type?: string;
  price_band?: string;
  is_cross?: boolean;
  reasons: string[];
  relevance: number;
}

interface CurationLeaseProperty {
  id: string;
  floor?: string;
  space_type?: string;
  area_pyeong?: number | string;
  is_cross?: boolean;
  deposit?: number | string;
  monthly_rent?: number | string;
}

interface ClientCurationData {
  saleProperties: CurationSaleProperty[];
  leaseProperties: CurationLeaseProperty[];
}

const CONTACT_TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  phone: { label: '전화', emoji: '📞' },
  kakao: { label: '카카오톡', emoji: '💬' },
  sms: { label: '문자', emoji: '📱' },
  email: { label: '이메일', emoji: '📧' },
  meeting: { label: '미팅', emoji: '🤝' },
  site_visit: { label: '현장 방문', emoji: '🏢' },
  note: { label: '메모', emoji: '📝' },
};

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  vip: { label: 'VIP', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  normal: { label: '일반', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  potential: { label: '잠재', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  dormant: { label: '휴면', color: 'bg-slate-100 text-slate-700 border-slate-300' },
};

function fallbackCopyTextToClipboard(text: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export default function ClientDetailPage() {
  const params = useParams();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFoundState, setNotFoundState] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{
    tone: 'error' | 'success';
    message: string;
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showContactForm, setShowContactForm] = useState(false);
  const [contactType, setContactType] = useState('phone');
  const [contactSummary, setContactSummary] = useState('');
  const [curation, setCuration] = useState<ClientCurationData | null>(null);
  const [curationLoading, setCurationLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Edit states
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editContactType, setEditContactType] = useState<string>('note');
  const [editSummary, setEditSummary] = useState<string>('');
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [pendingDeleteContactId, setPendingDeleteContactId] = useState<string | null>(null);

  const showFeedback = useCallback((tone: 'error' | 'success', message: string) => {
    setFeedbackToast({ tone, message });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setFeedbackToast(null);
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const fetchClient = useCallback(async () => {
    setLoadError(null);
    setNotFoundState(false);
    try {
      const res = await fetch(`/api/broker/clients/${params.id}`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      if (res.status === 404) {
        setClient(null);
        setNotFoundState(true);
        return;
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        setLoadError(
          typeof errJson?.error === 'string' && errJson.error.trim()
            ? errJson.error
            : '고객 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
        );
        return;
      }
      const { data } = await res.json();
      setClient(data);
    } catch {
      setLoadError('네트워크 오류로 고객 정보를 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void fetchClient();
  }, [fetchClient]);

  useEffect(() => {
    let cancelled = false;
    const fetchCuration = async () => {
      try {
        const res = await fetch(`/api/broker/clients/${params.id}/curation`, {
          headers: { Authorization: `Bearer ${await getToken()}` },
        });
        if (!cancelled && res.ok) {
          const { data } = await res.json();
          setCuration(data);
        }
      } catch {
        // non-blocking curation error
      } finally {
        if (!cancelled) {
          setCurationLoading(false);
        }
      }
    };
    void fetchCuration();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const handleCopyKakao = async (
    prop: CurationSaleProperty | CurationLeaseProperty,
    type: 'sale' | 'lease'
  ) => {
    const text =
      type === 'sale'
        ? `[블라인드 매물 안내]\n\n📍 ${(prop as CurationSaleProperty).area_signal || ''} ${(prop as CurationSaleProperty).asset_type || ''}\n💰 ${(prop as CurationSaleProperty).price_band || ''}\n\n관심 있으시면 연락 부탁드립니다.\n자세한 내용은 직접 안내드리겠습니다.`
        : `[임대 공간 안내]\n\n🔑 ${(prop as CurationLeaseProperty).floor || ''} ${(prop as CurationLeaseProperty).space_type === 'office' ? '오피스' : '상가'} ${(prop as CurationLeaseProperty).area_pyeong || ''}평\n💰 보증금 ${(prop as CurationLeaseProperty).deposit || ''}만 / 월 ${(prop as CurationLeaseProperty).monthly_rent || ''}만\n\n관심 있으시면 연락 부탁드립니다.`;

    let copied = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      } else {
        copied = fallbackCopyTextToClipboard(text);
      }
    } catch {
      copied = fallbackCopyTextToClipboard(text);
    }

    if (!copied) {
      showFeedback('error', '클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');
      return;
    }

    setCopiedId(prop.id);
    showFeedback('success', '카카오톡 안내 문구를 복사했습니다.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddContact = async () => {
    if (!contactSummary.trim()) return;
    setSavingContact(true);
    try {
      const res = await fetch(`/api/broker/clients/${params.id}/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({
          contact_type: contactType,
          summary: contactSummary.trim(),
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        showFeedback(
          'error',
          typeof errJson?.error === 'string' && errJson.error.trim()
            ? errJson.error
            : '연락 이력 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'
        );
        return;
      }
      setContactSummary('');
      setShowContactForm(false);
      showFeedback('success', '연락 이력을 저장했습니다.');
      await fetchClient();
    } catch {
      showFeedback('error', '네트워크 오류로 연락 이력을 저장하지 못했습니다.');
    } finally {
      setSavingContact(false);
    }
  };

  const handleEditSubmit = async (contactId: string) => {
    if (!editSummary.trim()) return;
    setIsEditingContact(true);
    try {
      const res = await fetch(`/api/broker/clients/${params.id}/contacts/${contactId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({
          contact_type: editContactType,
          summary: editSummary.trim(),
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        showFeedback(
          'error',
          typeof errJson?.error === 'string' && errJson.error.trim()
            ? errJson.error
            : '연락 이력 수정에 실패했습니다. 잠시 후 다시 시도해 주세요.'
        );
        return;
      }
      setEditingContactId(null);
      showFeedback('success', '연락 이력을 수정했습니다.');
      await fetchClient();
    } catch {
      showFeedback('error', '네트워크 오류로 연락 이력을 수정하지 못했습니다.');
    } finally {
      setIsEditingContact(false);
    }
  };

  const handleDeleteContact = (contactId: string) => {
    setPendingDeleteContactId(contactId);
  };

  const executeDeleteContact = async (contactId: string) => {
    try {
      const res = await fetch(`/api/broker/clients/${params.id}/contacts/${contactId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${await getToken()}`,
        },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        showFeedback(
          'error',
          typeof errJson?.error === 'string' && errJson.error.trim()
            ? errJson.error
            : '연락 이력 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.'
        );
        return;
      }
      showFeedback('success', '연락 이력을 삭제했습니다.');
      await fetchClient();
    } catch {
      showFeedback('error', '네트워크 오류로 연락 이력을 삭제하지 못했습니다.');
    }
  };

  if (loading) {
    return (
      <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
        <div className="w-full max-w-md mx-auto space-y-4 pt-4">
          <div className="h-8 bg-slate-200 rounded-lg animate-pulse w-48" />
          <div className="h-40 bg-slate-200 rounded-xl animate-pulse" />
          <div className="h-32 bg-slate-200 rounded-xl animate-pulse" />
        </div>
      </main>
    );
  }

  if (loadError && !client) {
    return (
      <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
        <div
          role="alert"
          data-testid="client-detail-error-banner"
          className="w-full max-w-md mx-auto mt-16 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center space-y-4"
        >
          <p className="text-base font-bold text-rose-900">
            고객 정보를 불러오지 못했습니다
          </p>
          <p className="text-sm text-rose-800 break-keep">{loadError}</p>
          <div className="flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void fetchClient();
              }}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              다시 시도
            </button>
            <Link
              href="/broker/clients"
              className="inline-flex min-h-[44px] items-center justify-center px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-sm font-semibold transition-colors"
            >
              목록으로 돌아가기
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (notFoundState || !client) {
    return (
      <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
        <div className="w-full max-w-md mx-auto pt-20 text-center">
          <p className="text-base text-slate-600">고객을 찾을 수 없습니다.</p>
          <Link
            href="/broker/clients"
            className="text-blue-700 hover:underline text-sm font-semibold mt-3 inline-flex min-h-[44px] items-center px-3"
          >
            ← 목록으로 돌아가기
          </Link>
        </div>
      </main>
    );
  }

  const tier = TIER_LABELS[client.tier] ?? TIER_LABELS.normal;
  const typeLabel =
    client.client_type === 'seller'
      ? '매도자'
      : client.client_type === 'buyer'
        ? '매수자'
        : '매도/매수';

  return (
    <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Toast / Feedback Banner */}
        {feedbackToast && (
          <div
            role="status"
            data-testid="client-detail-feedback-toast"
            className={`rounded-xl border px-4 py-3 text-sm font-medium break-keep ${
              feedbackToast.tone === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {feedbackToast.message}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 pt-4">
          <Link
            href="/broker/clients"
            aria-label="고객 목록으로 돌아가기"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] w-11 h-11 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-base font-bold transition-colors"
          >
            ←
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{client.display_name}</h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium border ${tier.color}`}>
                {tier.label}
              </span>
            </div>
            <p className="text-sm text-slate-600">
              {typeLabel}
              {client.company ? ` · ${client.company}` : ''}
            </p>
          </div>
          <Link
            href="/broker/w/inbox"
            className="shrink-0 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
            id="cta-open-client-in-inbox"
          >
            인박스에서 열기
          </Link>
        </div>

        {/* 연락처 정보 */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-600 tracking-wide">연락처</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {client.phone && (
              <div className="flex items-center gap-2">
                <span>📞</span>
                <a
                  href={`tel:${client.phone}`}
                  className="inline-flex min-h-[44px] items-center text-blue-700 font-medium hover:underline"
                >
                  {client.phone}
                </a>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-2">
                <span>📧</span>
                <span className="truncate text-slate-800">{client.email}</span>
              </div>
            )}
          </div>
          {client.notes && (
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2.5 mt-2">
              {client.notes}
            </p>
          )}
        </section>

        {/* 연결된 매물 */}
        {client.buildings.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-600 tracking-wide">
              🏢 관련 매물 ({client.buildings.length}건)
            </h2>
            <div className="space-y-1.5">
              {client.buildings.map((b) => (
                <Link
                  key={b.id}
                  href={`/broker/deal-card/${b.id}`}
                  className="flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-50 border border-slate-200/70 px-3 py-2 text-sm text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  <span className="text-sm font-medium">
                    {b.area_signal} {b.asset_type}
                  </span>
                  <span className="text-sm text-slate-600 ml-auto">{b.price_band}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 연결된 매수 의향서 */}
        {client.buyerIntents.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-600 tracking-wide">
              🎯 매수 조건 ({client.buyerIntents.length}건)
            </h2>
            <div className="space-y-1.5">
              {client.buyerIntents.map((bi) => (
                <Link
                  key={bi.id}
                  href={`/broker/buyer-intents/${bi.id}`}
                  className="flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-50 border border-slate-200/70 px-3 py-2 text-sm text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  <span className="text-sm font-medium">{bi.buyer_type}</span>
                  <span className="text-sm text-slate-600 ml-auto">{bi.budget_display}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 🎁 AI 추천 매물 */}
        <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-blue-800 tracking-wide flex items-center gap-1">
            🎁 이 고객에게 추천할 매물
          </h2>

          {curationLoading ? (
            <div className="space-y-2">
              <div className="h-16 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-16 bg-slate-200 rounded-lg animate-pulse" />
            </div>
          ) : curation && (curation.saleProperties.length > 0 || curation.leaseProperties.length > 0) ? (
            <div className="space-y-3">
              {curation.saleProperties.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm text-slate-700 font-semibold">
                    매매 추천 ({curation.saleProperties.length}건)
                  </p>
                  {curation.saleProperties.map((prop) => (
                    <div
                      key={prop.id}
                      className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900">
                            {prop.area_signal} {prop.asset_type}
                          </span>
                          <span className="text-sm text-slate-600">{prop.price_band}</span>
                          {prop.is_cross && (
                            <span className="text-sm bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                              CROSS
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5">{prop.reasons.join(' · ')}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-blue-700">{prop.relevance}%</span>
                        <button
                          type="button"
                          onClick={() => void handleCopyKakao(prop, 'sale')}
                          className="min-h-[44px] min-w-[44px] text-sm bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-lg font-medium hover:bg-blue-100 transition-colors cursor-pointer"
                        >
                          {copiedId === prop.id ? '✓ 복사됨' : '📋 카톡'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {curation.leaseProperties.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm text-slate-700 font-semibold">
                    임대 추천 ({curation.leaseProperties.length}건)
                  </p>
                  {curation.leaseProperties.map((prop) => (
                    <div
                      key={prop.id}
                      className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900">
                            {prop.floor || ''} {prop.space_type === 'office' ? '오피스' : '상가'}{' '}
                            {prop.area_pyeong}평
                          </span>
                          {prop.is_cross && (
                            <span className="text-sm bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                              CROSS
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5">
                          보증금 {prop.deposit}만 / 월 {prop.monthly_rent}만
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyKakao(prop, 'lease')}
                        className="min-h-[44px] min-w-[44px] text-sm bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-lg font-medium hover:bg-blue-100 transition-colors shrink-0 cursor-pointer"
                      >
                        {copiedId === prop.id ? '✓ 복사됨' : '📋 카톡'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600 text-center py-2">
              매수 의향서를 연결하면 AI가 맞춤 매물을 추천합니다.
            </p>
          )}
        </section>

        {/* 예약 이력 */}
        {client.bookings && client.bookings.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-600 tracking-wide flex items-center justify-between">
              <span>📅 임장/미팅 예약 ({client.bookings.length}건)</span>
            </h2>
            <div className="space-y-1.5">
              {client.bookings.map((booking) => {
                const rawSlotStart = booking.slot?.slot_start;
                const parsedDate = rawSlotStart ? new Date(rawSlotStart) : null;
                const dateStr =
                  parsedDate && !Number.isNaN(parsedDate.getTime())
                    ? parsedDate.toLocaleDateString('ko-KR', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '일정 정보 미상';
                const areaSignal = booking.slot?.building?.area_signal?.trim() || '외부·비공개 매물';
                return (
                  <div
                    key={booking.id}
                    className="flex flex-col gap-1 rounded-lg bg-slate-50 border border-slate-200/70 px-3 py-2.5 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">{areaSignal} 임장</span>
                      <span
                        className={`text-sm px-2 py-0.5 rounded-full font-medium ${
                          booking.status === 'confirmed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : booking.status === 'hold'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {booking.status === 'confirmed'
                          ? '확정'
                          : booking.status === 'hold'
                            ? '대기'
                            : '취소/완료'}
                      </span>
                    </div>
                    <span className="text-sm text-slate-600">{dateStr}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 연락 이력 */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-600 tracking-wide">📋 연락 이력</h2>
            <button
              type="button"
              onClick={() => setShowContactForm(!showContactForm)}
              className="min-h-[44px] px-3 text-sm text-blue-700 font-semibold hover:underline cursor-pointer"
            >
              + 기록 추가
            </button>
          </div>

          {/* 연락 기록 추가 폼 */}
          {showContactForm && (
            <div className="space-y-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(CONTACT_TYPE_LABELS).map(([key, { emoji, label }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setContactType(key)}
                    className={`min-h-[44px] px-3 py-1.5 rounded-full text-sm font-medium border transition-all cursor-pointer ${
                      contactType === key
                        ? 'bg-blue-50 text-blue-700 border-blue-400 font-semibold'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {emoji} {label}
                  </button>
                ))}
              </div>
              <textarea
                value={contactSummary}
                onChange={(e) => setContactSummary(e.target.value)}
                rows={2}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors resize-none"
                placeholder="통화/미팅 내용을 간단히 기록하세요..."
              />
              <button
                type="button"
                onClick={() => void handleAddContact()}
                disabled={savingContact || !contactSummary.trim()}
                className="w-full min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {savingContact ? '저장 중...' : '기록 저장'}
              </button>
            </div>
          )}

          {/* 연락 이력 타임라인 */}
          {client.contacts.length > 0 ? (
            <div className="space-y-2">
              {client.contacts.map((c) => {
                const ct = CONTACT_TYPE_LABELS[c.contact_type] ?? CONTACT_TYPE_LABELS.note;
                const isEditing = editingContactId === c.id;

                if (isEditing) {
                  return (
                    <div
                      key={c.id}
                      className="space-y-2.5 p-3 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <div className="flex gap-1.5 flex-wrap">
                        {Object.entries(CONTACT_TYPE_LABELS).map(([key, { emoji, label }]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setEditContactType(key)}
                            className={`min-h-[44px] px-3 py-1.5 rounded-full text-sm font-medium border transition-all cursor-pointer ${
                              editContactType === key
                                ? 'bg-blue-50 text-blue-700 border-blue-400 font-semibold'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {emoji} {label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        rows={2}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingContactId(null)}
                          className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-200/70 cursor-pointer"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleEditSubmit(c.id)}
                          disabled={isEditingContact || !editSummary.trim()}
                          className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50 cursor-pointer"
                        >
                          {isEditingContact ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={c.id} className="flex gap-2.5 text-sm">
                    <div className="flex flex-col items-center pt-1">
                      <span className="text-base">{ct.emoji}</span>
                      <div className="w-px flex-1 bg-slate-200 mt-1" />
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900">{ct.label}</span>
                          <span className="text-sm text-slate-600">
                            {new Date(c.created_at).toLocaleDateString('ko-KR', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingContactId(c.id);
                              setEditContactType(c.contact_type);
                              setEditSummary(c.summary || '');
                            }}
                            className="min-h-[44px] min-w-[44px] text-sm font-medium text-slate-600 hover:text-blue-700 px-2.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteContact(c.id)}
                            className="min-h-[44px] min-w-[44px] text-sm font-medium text-slate-600 hover:text-red-700 px-2.5 rounded-lg hover:bg-red-50 cursor-pointer"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 mt-1">{c.summary}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-600 text-center py-3">
              아직 기록된 연락 이력이 없어요.
            </p>
          )}
        </section>
      </div>

      <ConfirmDeleteModal
        isOpen={pendingDeleteContactId !== null}
        title="연락 이력을 삭제할까요?"
        description="선택한 통화·미팅 기록이 삭제됩니다."
        confirmLabel="삭제하기"
        cancelLabel="취소"
        onCancel={() => setPendingDeleteContactId(null)}
        onConfirm={() => {
          if (!pendingDeleteContactId) return;
          const targetId = pendingDeleteContactId;
          setPendingDeleteContactId(null);
          void executeDeleteContact(targetId);
        }}
      />

      <BrokerBottomNav />
    </main>
  );
}

async function getToken(): Promise<string> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  } catch {
    return '';
  }
}
