'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Users, Send, Plus, Search, RefreshCw, Filter, MessageCircle, Mail, QrCode, ChevronRight, Building2, Link2, Share2 } from 'lucide-react';
import { MagazineQrModal } from './MagazineQrModal';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonGroup, SkeletonText } from '@/components/ui/Skeleton';
import { AddSubscriberForm } from './outreach/AddSubscriberForm';
import { SubscriberDetailModal, type DetailSubscriber } from './outreach/SubscriberDetailModal';
import {
  extractApiError,
  filterSubscribers,
  isUnsubscribedLike,
  networkErrorMessage,
  pendingReasonInfo,
  readSubscriberTags,
  statusLabel,
  stripWeekly,
  withWeekly,
} from './outreach/outreach-helpers';

// ── 타입 ──

/** E1(page.tsx)이 내려주는 정체성·설정. slug 는 props 로만 받는다 — 'demo' 폴백 없음. */
export interface EditorOutreachTabProps {
  brokerSlug: string;
  brokerName: string;
  baseUrl: string;
  /** 발송 요일 라벨 ('화요일' 또는 '매주 화요일') */
  sendDayLabel: string;
  /** 발송 기능이 꺼져 있으면 true */
  sendDisabled: boolean;
  editionDate?: string;
  shareTitle?: string;
}

interface Subscriber extends DetailSubscriber {
  segment?: string;
  source?: string;
  subscribed_at?: string;
  client_id?: string;
}

// ── 상수 ──

const CHANNEL_META: Record<string, { icon: typeof Mail; label: string; color: string }> = {
  kakao: { icon: MessageCircle, label: '카카오톡', color: '#FEE500' },
  email: { icon: Mail, label: '이메일', color: '#6366f1' },
  both: { icon: Send, label: '카카오+이메일', color: '#10b981' },
};

const TEMP_FILTERS = ['🔥 적극검토', '📈 관심', '⏸️ 관망', '❄️ 냉각', '⚪ 미확인'];

const STATUS_FILTERS: Array<{ key: 'active' | 'paused' | 'unsubscribed'; label: string }> = [
  { key: 'active', label: '수신 중' },
  { key: 'paused', label: '일시정지' },
  { key: 'unsubscribed', label: '수신거부' },
];

const FILTER_CHIP = (on: boolean) =>
  `min-h-11 rounded-md border px-2.5 text-caption font-bold transition-all ${
    on ? 'border-indigo-500/40 bg-indigo-500/20 text-indigo-200' : 'border-slate-700/50 bg-slate-900/40 text-ink-muted hover:text-slate-200'
  }`;

// ── 메인 컴포넌트 ──

export function EditorOutreachTab(props: EditorOutreachTabProps) {
  const [mainTab, setMainTab] = useState<'subscribers' | 'outreach'>('subscribers');

  return (
    <div className="space-y-4">
      {/* 메인 탭 */}
      <div className="flex gap-1 rounded-xl bg-slate-800/50 p-1" role="tablist" aria-label="구독자·아웃리치">
        {[
          { id: 'subscribers' as const, label: '구독자 관리', icon: Users },
          { id: 'outreach' as const, label: '아웃리치', icon: Send },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mainTab === tab.id}
              onClick={() => setMainTab(tab.id)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-label font-bold transition-colors ${
                mainTab === tab.id ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-ink-muted hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {mainTab === 'subscribers' ? <SubscriberManagement {...props} /> : <OutreachPanel />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 구독자 관리 패널
// ══════════════════════════════════════════════════════════════

function SubscriberManagement({ brokerSlug, brokerName, baseUrl, sendDayLabel, sendDisabled }: EditorOutreachTabProps) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTemp, setFilterTemp] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'active' | 'paused' | 'unsubscribed'>('active');
  const [selectedSub, setSelectedSub] = useState<Subscriber | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: filterStatus, limit: '100' });
      if (filterChannel) params.set('channel', filterChannel);
      const res = await fetch(`/api/broker/magazine/subscribers?${params}`);
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      if (!res.ok) {
        // 500 을 "구독자 없음"으로 위장하지 않는다
        setLoadError(extractApiError(json, res.status).message);
        return;
      }
      const body = (json && typeof json === 'object' ? json : {}) as { subscribers?: Subscriber[]; total?: number };
      setSubscribers(Array.isArray(body.subscribers) ? body.subscribers : []);
      setTotal(typeof body.total === 'number' ? body.total : 0);
      setLoadError(null);
    } catch (err) {
      console.error('[SubscriberMgmt] Fetch error:', err);
      setLoadError(networkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filterChannel, filterStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 필터 변경 시 목록 재조회(비동기 fetch 시작)
    void fetchSubscribers();
  }, [fetchSubscribers]);

  const filteredSubs = filterSubscribers(subscribers, searchQuery, filterTemp);
  const weeklyLabel = withWeekly(sendDayLabel);

  return (
    <div className="space-y-3">
      {sendDisabled ? (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-label text-amber-200">
          현재 발송 기능이 꺼져 있어요. 구독자를 추가해도 {weeklyLabel ? `${weeklyLabel}에도 ` : ''}매거진이 발송되지 않습니다.
        </p>
      ) : weeklyLabel ? (
        <p className="px-1 text-caption text-ink-muted">발송 일정: {weeklyLabel} 오전 · 수신 동의가 확인된 구독자에게만 발송돼요.</p>
      ) : null}

      {/* 검색 + 추가 + QR코드 */}
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <div className="relative min-w-[180px] flex-1">
          <label htmlFor="subscriber-search" className="sr-only">
            구독자 검색
          </label>
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
          <input
            id="subscriber-search"
            type="search"
            placeholder="이름, 전화번호, 이메일 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900/60 pl-8 pr-3 text-reader text-white outline-none placeholder:text-ink-subtle focus:border-indigo-500/50"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowQrModal(true)}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/20 px-3 text-label font-bold text-amber-200 transition-colors hover:bg-amber-500/30"
          title="명함/전단지용 오프라인 구독 QR 코드 생성 및 다운로드"
        >
          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
          <span>QR 코드</span>
        </button>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-600/20 px-3 text-label font-bold text-indigo-200 transition-colors hover:bg-indigo-600/30"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> 추가
        </button>
        <button
          type="button"
          onClick={() => void fetchSubscribers()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-ink-muted transition-colors hover:text-slate-100"
          aria-label="새로고침"
          title="새로고침"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {showQrModal ? (
        <MagazineQrModal
          brokerSlug={brokerSlug}
          brokerName={brokerName}
          baseUrl={baseUrl}
          sendDayLabel={stripWeekly(sendDayLabel) || undefined}
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
        />
      ) : null}

      {/* 상태 / 매수 온도 / 채널 필터 */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="구독 상태 필터">
        <Filter className="h-3 w-3 text-ink-subtle" aria-hidden="true" />
        {STATUS_FILTERS.map((s) => (
          <button key={s.key} type="button" aria-pressed={filterStatus === s.key} onClick={() => setFilterStatus(s.key)} className={FILTER_CHIP(filterStatus === s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="매수 온도 필터">
        <Filter className="h-3 w-3 text-ink-subtle" aria-hidden="true" />
        {TEMP_FILTERS.map((temp) => (
          <button key={temp} type="button" aria-pressed={filterTemp === temp} onClick={() => setFilterTemp(filterTemp === temp ? null : temp)} className={FILTER_CHIP(filterTemp === temp)}>
            {temp}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="수신 채널 필터">
        <MessageCircle className="h-3 w-3 text-ink-subtle" aria-hidden="true" />
        {Object.entries(CHANNEL_META).map(([key, meta]) => (
          <button key={key} type="button" aria-pressed={filterChannel === key} onClick={() => setFilterChannel(filterChannel === key ? null : key)} className={FILTER_CHIP(filterChannel === key)}>
            {meta.label}
          </button>
        ))}
      </div>

      {/* 구독자 수 */}
      {!loadError ? (
        <div className="flex items-center justify-between px-1 text-caption text-ink-muted">
          <span>
            총 {total}명 중 {filteredSubs.length}명 표시
          </span>
        </div>
      ) : null}

      {/* 구독자 리스트 */}
      {loading && subscribers.length === 0 && !loadError ? (
        <SkeletonGroup label="구독자 목록을 불러오는 중" className="py-4">
          <SkeletonText lines={4} />
        </SkeletonGroup>
      ) : loadError ? (
        <ErrorState title="구독자 목록을 불러오지 못했어요" description={loadError} onRetry={() => void fetchSubscribers()} />
      ) : filteredSubs.length === 0 ? (
        <EmptyState
          title={subscribers.length === 0 ? `${STATUS_FILTERS.find((s) => s.key === filterStatus)?.label ?? ''} 구독자가 없어요` : '검색 결과가 없어요'}
          description={subscribers.length === 0 && filterStatus === 'active' ? 'QR 코드나 추가 버튼으로 첫 구독자를 받아 보세요.' : undefined}
        />
      ) : (
        <ul className="max-h-[500px] space-y-1.5 overflow-y-auto pr-1" aria-label="구독자 목록">
          {filteredSubs.map((sub) => {
            const channelMeta = CHANNEL_META[sub.channel] || CHANNEL_META.kakao;
            const ChannelIcon = channelMeta.icon;
            const t = readSubscriberTags(sub);
            const allTags = [...t.assetTypes, ...t.regions].slice(0, 3);
            const unsub = isUnsubscribedLike(sub);
            const pendingInfo = pendingReasonInfo(sub.pendingReason);

            return (
              <li key={sub.id}>
                <button
                  type="button"
                  onClick={() => setSelectedSub(sub)}
                  className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 text-left transition-all hover:border-slate-600/50 hover:bg-slate-800/60"
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-body"
                    style={{ background: sub.temperatureConfig?.badgeBg || 'rgba(100,116,139,0.1)' }}
                    title={sub.temperatureConfig?.description || '미확인'}
                    aria-hidden="true"
                  >
                    {sub.buyerTemperature?.charAt(0) || '⚪'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-label font-bold text-slate-100">{sub.subscriber_name}</span>
                      {unsub ? (
                        <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-caption font-bold text-rose-200">{statusLabel(sub.status)}</span>
                      ) : (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-caption font-bold"
                          style={{ background: sub.temperatureConfig?.badgeBg || 'rgba(100,116,139,0.1)', color: sub.temperatureConfig?.color || '#94a3b8' }}
                        >
                          {sub.buyerTemperature || '⚪ 미확인'}
                        </span>
                      )}
                      {!unsub && pendingInfo ? (
                        <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-caption font-bold text-amber-200" title={pendingInfo.notice}>
                          {pendingInfo.badge}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-caption text-ink-muted">{sub.subscriber_phone}</span>
                      <ChannelIcon className="h-3 w-3" style={{ color: channelMeta.color }} role="img" aria-label={channelMeta.label} />
                    </div>
                  </div>

                  <div className="hidden shrink-0 items-center gap-1 sm:flex">
                    {allTags.map((tag) => (
                      <span key={tag} className="rounded border border-slate-700/50 bg-slate-900/80 px-1.5 py-0.5 text-caption text-ink-muted">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-subtle transition-colors group-hover:text-slate-300" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 신규 추가 폼 (Modal) */}
      {showAddForm ? (
        <AddSubscriberForm
          open={showAddForm}
          onClose={() => setShowAddForm(false)}
          onAdded={() => {
            setShowAddForm(false);
            void fetchSubscribers();
          }}
        />
      ) : null}

      {/* 상세 패널 (Modal, 오른쪽) */}
      <SubscriberDetailModal
        subscriber={selectedSub}
        onClose={() => setSelectedSub(null)}
        onUpdated={() => void fetchSubscribers()}
        onDeleted={() => {
          setSelectedSub(null);
          void fetchSubscribers();
        }}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 아웃리치 패널 — 동작하지 않는 버튼은 숨기고 준비 중임을 정직하게 안내 (T1-22, T2-29a)
// ══════════════════════════════════════════════════════════════

const PLANNED_OUTREACH = [
  { icon: Building2, title: '매각준비도 진단 발송', desc: '건물 소유주에게 매각 준비 상태와 보완점을 전달' },
  { icon: Share2, title: '공동중개 제안', desc: '협력 중개사에게 내 매물 리스트를 공유' },
  { icon: Link2, title: '벤더 연결', desc: '인테리어·대출·세무 등 협력 벤더 리스트 공유' },
];

function OutreachPanel() {
  return (
    <div className="space-y-3">
      <EmptyState
        title="아웃리치 기능은 준비 중이에요"
        description="아래 기능은 아직 제공되지 않아 버튼을 숨겼어요. 제공되면 이곳에서 바로 사용할 수 있습니다."
      />
      <ul className="space-y-2" aria-label="준비 중인 아웃리치 기능">
        {PLANNED_OUTREACH.map(({ icon: Icon, title, desc }) => (
          <li key={title} className="flex items-start gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            <div>
              <p className="text-label font-bold text-slate-300">{title}</p>
              <p className="text-caption text-ink-muted">{desc}</p>
            </div>
            <span className="ml-auto shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-caption text-ink-subtle">준비 중</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
