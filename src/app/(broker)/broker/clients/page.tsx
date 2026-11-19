'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';
import { createClient } from '@/lib/supabase/client';
import { FieldCoachBanner } from '@/components/help/FieldCoachBanner';
import { SeniorTermTooltip } from '@/components/help/SeniorTermTooltip';

interface BrokerClient {
  id: string;
  client_type: 'seller' | 'buyer' | 'both';
  display_name: string;
  company: string | null;
  phone: string | null;
  tier: string;
  tags: string[];
  linked_building_ids: string[];
  linked_buyer_intent_ids: string[];
  created_at: string;
  updated_at: string;
}

const PAGE_LIMIT = 50;

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  vip: { label: 'VIP', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  normal: { label: '일반', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  potential: { label: '잠재', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  dormant: { label: '휴면', color: 'bg-slate-100 text-slate-700 border-slate-300' },
};

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  seller: { label: '매도자', emoji: '🏠' },
  buyer: { label: '매수자', emoji: '🎯' },
  both: { label: '매도/매수', emoji: '🔄' },
};

export default function ClientsPage() {
  const [clients, setClients] = useState<BrokerClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [filter, setFilter] = useState<'all' | 'seller' | 'buyer' | 'both'>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const buildQueryParams = useCallback(
    (offset: number) => {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('client_type', filter);
      if (tierFilter !== 'all') params.set('tier', tierFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('limit', String(PAGE_LIMIT));
      params.set('offset', String(offset));
      return params;
    },
    [filter, tierFilter, debouncedSearch]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setLoadMoreError(null);
    void (async () => {
      try {
        const params = buildQueryParams(0);
        const res = await fetch(`/api/broker/clients?${params}`, {
          headers: { Authorization: `Bearer ${await getToken()}` },
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          if (!cancelled) {
            setLoadError(
              typeof errJson?.error === 'string' && errJson.error.trim()
                ? errJson.error
                : '고객 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
            );
          }
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          const rows = Array.isArray(json?.data) ? (json.data as BrokerClient[]) : [];
          setClients(rows);
          setHasMore(Boolean(json?.pagination?.hasMore));
        }
      } catch {
        if (!cancelled) {
          setLoadError('네트워크 연결을 확인한 뒤 다시 시도해 주세요.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildQueryParams, reloadTick]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const params = buildQueryParams(clients.length);
      const res = await fetch(`/api/broker/clients?${params}`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        setLoadMoreError(
          typeof errJson?.error === 'string' && errJson.error.trim()
            ? errJson.error
            : '추가 고객 목록을 불러오지 못했습니다.'
        );
        return;
      }
      const json = await res.json();
      const nextRows = Array.isArray(json?.data) ? (json.data as BrokerClient[]) : [];
      setClients((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const uniqueNext = nextRows.filter((c) => !seen.has(c.id));
        return [...prev, ...uniqueNext];
      });
      setHasMore(Boolean(json?.pagination?.hasMore));
    } catch {
      setLoadMoreError('네트워크 오류로 추가 목록을 불러오지 못했습니다.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pt-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">고객 관리</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              총 {clients.length}명의 고객
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/broker/w/inbox"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100"
              id="cta-open-inbox-from-clients"
            >
              인박스에서 열기
            </Link>
            <Link
              href="/broker/clients/new"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              id="cta-new-client"
            >
              + 등록
            </Link>
          </div>
        </div>

        {/* 친절 코칭 배너 */}
        <FieldCoachBanner
          headline="👥 고객 명단 등록과 주간 뉴스레터 · 매칭 연동 안내"
          guidance="뉴스레터는 고객 본인의 수신동의 확인(더블 옵트인)이 완료된 구독자에 한해 중개사가 직접 검토·발행할 때 발송되며, 고객님이 희망하시는 매수 조건(금액·지역·용도)에 맞는 신규 딜카드가 등록되면 AI가 매칭 추천을 연결합니다."
          sampleText="[VIP 매수 고객 상담 메모 예시]&#10;희망 조건: 강남·서초 역세권 80억~150억 수익형 빌딩&#10;선호 수익률: 3.8% 이상 희망 (법인 사옥 겸용 가능)&#10;자금 조달: 자기자본 50억 + 대출 50억 준비 완료&#10;특이사항: 수신동의 확인 완료 후 주간 뉴스레터 열람 중, 급매물 발생 시 우선 연락 요망"
          sampleButtonLabel="📋 예시 메모 복사"
          copySample={true}
          mistakeWarning="고객 연락처나 상담 메모에 주민등록번호 등 민감한 개인정보를 직접 적지 마세요. 등록된 고객 명단은 수신동의 확인 기반 뉴스레터 발송과 딜 매칭에만 안전하게 연동됩니다."
          variant="amber"
        />

        {/* 검색 */}
        <input
          type="text"
          placeholder="이름, 회사, 연락처로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
          id="client-search"
        />

        {/* 필터 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm text-slate-600 px-1">
            <span className="font-semibold text-slate-800">고객 구분 필터</span>
            <div className="flex items-center gap-1.5">
              <SeniorTermTooltip termKey="고객 유형(매도/매수/양쪽)" buttonLabel="❓ 유형 안내" />
              <SeniorTermTooltip termKey="고객 등급(VIP/잠재)" buttonLabel="❓ 등급 안내" />
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {(['all', 'seller', 'buyer', 'both'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  if (filter !== t) setLoading(true);
                  setFilter(t);
                }}
                className={`shrink-0 min-h-[44px] px-4 py-2 rounded-full text-sm font-medium border transition-all cursor-pointer ${
                  filter === t
                    ? 'bg-blue-50 text-blue-700 border-blue-400 font-semibold'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                }`}
              >
                {t === 'all' ? '전체' : TYPE_LABELS[t]?.label ?? t}
              </button>
            ))}
            <span className="shrink-0 w-px h-6 bg-slate-200 self-center" />
            {(['all', 'vip', 'normal', 'potential', 'dormant'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  if (tierFilter !== t) setLoading(true);
                  setTierFilter(t);
                }}
                className={`shrink-0 min-h-[44px] px-4 py-2 rounded-full text-sm font-medium border transition-all cursor-pointer ${
                  tierFilter === t
                    ? 'bg-blue-50 text-blue-700 border-blue-400 font-semibold'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                }`}
              >
                {t === 'all' ? '전체 등급' : TIER_LABELS[t]?.label ?? t}
              </button>
            ))}
          </div>
        </div>

        {/* 고객 목록 */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <div
            role="alert"
            data-testid="clients-load-error-banner"
            className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-center space-y-3"
          >
            <p className="text-base font-semibold text-rose-900">
              고객 목록을 불러오지 못했습니다
            </p>
            <p className="text-sm text-rose-800 break-keep">{loadError}</p>
            <button
              type="button"
              onClick={() => setReloadTick((prev) => prev + 1)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              다시 시도
            </button>
          </div>
        ) : clients.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-2">
              {clients.map((client) => {
                const type = TYPE_LABELS[client.client_type] ?? TYPE_LABELS.buyer;
                const tier = TIER_LABELS[client.tier] ?? TIER_LABELS.normal;
                const buildingCount = client.linked_building_ids?.length ?? 0;
                const intentCount = client.linked_buyer_intent_ids?.length ?? 0;

                return (
                  <Link
                    key={client.id}
                    href={`/broker/clients/${client.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-4 space-y-2 transition-all hover:border-blue-400 active:scale-[0.98]"
                    id={`client-${client.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-lg">
                          {type.emoji}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-semibold text-slate-900">{client.display_name}</p>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium border ${tier.color}`}>
                              {tier.label}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600">
                            {type.label}
                            {client.company && ` · ${client.company}`}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm text-slate-500 shrink-0">→</span>
                    </div>

                    <div className="flex items-center gap-3 text-sm text-slate-600 flex-wrap">
                      {client.phone && <span>📞 {client.phone}</span>}
                      {buildingCount > 0 && (
                        <span className="text-blue-700 font-medium inline-flex items-center gap-1">
                          <span>🏢 {buildingCount}건</span>
                          <SeniorTermTooltip termKey="딜 매칭 연동" buttonLabel="❓" className="text-sm" />
                        </span>
                      )}
                      {intentCount > 0 && (
                        <span className="text-blue-700 font-medium inline-flex items-center gap-1">
                          <span>🎯 {intentCount}건</span>
                          <SeniorTermTooltip
                            termKey="뉴스레터 구독 연동"
                            title="📬 주간 뉴스레터 발송 연동"
                            easyMeaning="고객 본인의 수신동의 확인이 완료된 구독자에게 중개사가 직접 검토·발행한 모바일 뉴스레터를 전달하는 기능입니다."
                            tip="신규 고객 등록 시 뉴스레터 구독자 등록을 함께 신청하면 고객에게 수신동의 확인 안내가 발송되며, 확인 완료 후 중개사 검토·발행을 거쳐 발송됩니다."
                            buttonLabel="❓"
                            className="text-sm"
                          />
                        </span>
                      )}
                      <span className="ml-auto">
                        {new Date(client.created_at).toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {loadMoreError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-center justify-between gap-2"
              >
                <span className="break-keep">{loadMoreError}</span>
                <button
                  type="button"
                  onClick={() => void handleLoadMore()}
                  className="shrink-0 min-h-[44px] px-3 rounded-lg bg-white border border-rose-300 text-sm font-semibold text-rose-900 hover:bg-rose-100 cursor-pointer"
                >
                  다시 시도
                </button>
              </div>
            )}

            {hasMore && (
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                data-testid="clients-load-more-btn"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loadingMore ? '불러오는 중...' : '더 보기'}
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
            <p className="text-4xl">👥</p>
            <p className="text-base font-medium text-slate-900">등록된 고객이 없어요.</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              매도자나 매수자를 등록하고
              <br />
              체계적으로 관리해보세요.
            </p>
            <Link
              href="/broker/clients/new"
              className="inline-flex min-h-[44px] items-center justify-center mt-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              id="cta-first-client"
            >
              첫 고객 등록하기
            </Link>
          </div>
        )}
      </div>

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
