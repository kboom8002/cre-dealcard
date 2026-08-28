'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Send, Building2, Link2, Share2, Search, Plus, X, ChevronRight,
  Mail, MessageCircle, Phone, Tag, Flame, Target, Trash2, RefreshCw, Filter,
} from 'lucide-react';

// ── 타입 ──

interface Subscriber {
  id: string;
  subscriber_name: string;
  subscriber_phone: string;
  subscriber_email: string | null;
  channel: 'kakao' | 'email' | 'both';
  status: 'active' | 'paused' | 'unsubscribed';
  segment?: string;
  source?: string;
  interest_tags?: { regions?: string[]; assetTypes?: string[]; topics?: string[]; hobbies?: string[] };
  interest_profile?: Record<string, any>;
  subscribed_at?: string;
  client_id?: string;
  buyerTemperature?: string;
  temperatureConfig?: { label: string; color: string; badgeBg: string; minScore: number; description: string };
}

// ── 상수 ──

const CHANNEL_META: Record<string, { icon: typeof Mail; label: string; color: string }> = {
  kakao: { icon: MessageCircle, label: '카카오톡', color: '#FEE500' },
  email: { icon: Mail, label: '이메일', color: '#6366f1' },
  both: { icon: Send, label: '카카오+이메일', color: '#10b981' },
};

const SEGMENT_OPTIONS = ['꼬마빌딩', '오피스', '리테일', '개발', '기타'];
const TAG_PRESETS = {
  regions: ['강남', '서초', '마포', '종로', '영등포', '성동', '용산', '송파', '강동', '관악'],
  assetTypes: ['꼬마빌딩', '오피스텔', '상가', '지식산업센터', '토지', '다가구', '근생'],
  topics: ['경매', '공매', '재건축', '리모델링', '신축', 'NPL', '세금', '금리'],
  hobbies: ['골프', '와인', '미술', '자동차', '여행', '독서', '낚시'],
};

// ── 메인 컴포넌트 ──

export function EditorOutreachTab() {
  const [mainTab, setMainTab] = useState<'subscribers' | 'outreach'>('subscribers');

  return (
    <div className="space-y-4">
      {/* 메인 탭 */}
      <div className="flex gap-1 p-1 bg-slate-800/50 rounded-xl">
        {[
          { id: 'subscribers' as const, label: '구독자 관리', icon: Users },
          { id: 'outreach' as const, label: '아웃리치', icon: Send },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setMainTab(tab.id)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                mainTab === tab.id
                  ? 'bg-slate-700 text-slate-200 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {mainTab === 'subscribers' ? <SubscriberManagement /> : <OutreachPanel />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 구독자 관리 패널
// ══════════════════════════════════════════════════════════════

function SubscriberManagement() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTemp, setFilterTemp] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<Subscriber | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'active', limit: '100' });
      if (filterChannel) params.set('channel', filterChannel);
      const res = await fetch(`/api/broker/magazine/subscribers?${params}`);
      if (res.ok) {
        const json = await res.json();
        setSubscribers(json.subscribers || []);
        setTotal(json.total || 0);
      }
    } catch (err) {
      console.error('[SubscriberMgmt] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filterChannel]);

  useEffect(() => { fetchSubscribers(); }, [fetchSubscribers]);

  // 검색 + 온도 필터 적용
  const filteredSubs = subscribers.filter((s) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !s.subscriber_name?.toLowerCase().includes(q) &&
        !s.subscriber_phone?.includes(q) &&
        !s.subscriber_email?.toLowerCase().includes(q)
      ) return false;
    }
    if (filterTemp && s.buyerTemperature !== filterTemp) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      {/* 검색 + 필터 + 추가 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="이름, 전화번호, 이메일 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs bg-slate-900/60 border border-slate-700 rounded-lg text-white placeholder-slate-500 outline-none focus:border-indigo-500/50"
          />
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 rounded-lg hover:bg-indigo-600/30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> 추가
        </button>
        <button
          onClick={fetchSubscribers}
          className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          title="새로고침"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 매수 온도 필터 */}
      <div className="flex items-center gap-1.5">
        <Filter className="w-3 h-3 text-slate-500" />
        {['🔥 적극검토', '📈 관심', '⏸️ 관망', '❄️ 냉각', '⚪ 미확인'].map((temp) => (
          <button
            key={temp}
            onClick={() => setFilterTemp(filterTemp === temp ? null : temp)}
            className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all ${
              filterTemp === temp
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : 'bg-slate-900/40 text-slate-500 border-slate-700/50 hover:text-slate-300'
            }`}
          >
            {temp}
          </button>
        ))}
      </div>

      {/* 채널 필터 */}
      <div className="flex items-center gap-1.5">
        <MessageCircle className="w-3 h-3 text-slate-500" />
        {Object.entries(CHANNEL_META).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setFilterChannel(filterChannel === key ? null : key)}
            className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all ${
              filterChannel === key
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : 'bg-slate-900/40 text-slate-500 border-slate-700/50 hover:text-slate-300'
            }`}
          >
            {meta.label}
          </button>
        ))}
      </div>

      {/* 구독자 수 */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
        <span>총 {total}명 중 {filteredSubs.length}명 표시</span>
      </div>

      {/* 구독자 리스트 */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-xs">구독자 로딩 중...</div>
      ) : filteredSubs.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs">
          {subscribers.length === 0 ? '등록된 구독자가 없습니다.' : '검색 결과가 없습니다.'}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
          {filteredSubs.map((sub) => {
            const channelMeta = CHANNEL_META[sub.channel] || CHANNEL_META.kakao;
            const ChannelIcon = channelMeta.icon;
            const tags = sub.interest_tags;
            const allTags = [
              ...(tags?.assetTypes || []),
              ...(tags?.regions || []),
            ].slice(0, 3);

            return (
              <button
                key={sub.id}
                onClick={() => setSelectedSub(sub)}
                className="w-full flex items-center gap-3 p-3 bg-slate-800/30 border border-slate-700/50 rounded-xl hover:bg-slate-800/60 hover:border-slate-600/50 transition-all text-left group"
              >
                {/* 매수 온도 뱃지 */}
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                  style={{
                    background: sub.temperatureConfig?.badgeBg || 'rgba(100,116,139,0.1)',
                  }}
                  title={sub.temperatureConfig?.description || '미확인'}
                >
                  {sub.buyerTemperature?.charAt(0) || '⚪'}
                </div>

                {/* 이름/전화 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-200 truncate">{sub.subscriber_name}</span>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        background: sub.temperatureConfig?.badgeBg || 'rgba(100,116,139,0.1)',
                        color: sub.temperatureConfig?.color || '#64748b',
                      }}
                    >
                      {sub.buyerTemperature || '⚪ 미확인'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-500">{sub.subscriber_phone}</span>
                    <ChannelIcon className="w-3 h-3" style={{ color: channelMeta.color }} />
                  </div>
                </div>

                {/* 관심사 태그 */}
                <div className="flex-shrink-0 flex items-center gap-1">
                  {allTags.map((t) => (
                    <span
                      key={t}
                      className="text-[9px] bg-slate-900/80 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/50"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* 신규 추가 폼 */}
      {showAddForm && (
        <AddSubscriberForm
          onClose={() => setShowAddForm(false)}
          onAdded={() => { setShowAddForm(false); fetchSubscribers(); }}
        />
      )}

      {/* 상세 슬라이드 패널 */}
      {selectedSub && (
        <SubscriberDetailPanel
          subscriber={selectedSub}
          onClose={() => setSelectedSub(null)}
          onUpdated={() => { setSelectedSub(null); fetchSubscribers(); }}
          onDeleted={() => { setSelectedSub(null); fetchSubscribers(); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 구독자 상세 슬라이드 패널
// ══════════════════════════════════════════════════════════════

function SubscriberDetailPanel({
  subscriber,
  onClose,
  onUpdated,
  onDeleted,
}: {
  subscriber: Subscriber;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentResult, setIntentResult] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 편집 상태
  const [channel, setChannel] = useState(subscriber.channel);
  const [tags, setTags] = useState(subscriber.interest_tags || {});
  const [tagInput, setTagInput] = useState({ category: '' as keyof typeof TAG_PRESETS, value: '' });

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/broker/magazine/subscribers/${subscriber.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, interest_tags: tags }),
      });
      if (res.ok) {
        onUpdated();
      }
    } catch (err) {
      console.error('[Detail] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/broker/magazine/subscribers/${subscriber.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
    } catch (err) {
      console.error('[Detail] Delete error:', err);
    }
  };

  const handleAutoIntent = async () => {
    setIntentLoading(true);
    setIntentResult(null);
    try {
      const res = await fetch(`/api/broker/magazine/subscribers/${subscriber.id}/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (res.ok) {
        setIntentResult(`✅ ${json.created || 0}건의 매수 의향서가 생성되었습니다.`);
      } else {
        setIntentResult(`⚠️ ${json.error || '생성 실패'}`);
      }
    } catch {
      setIntentResult('❌ 서버 오류가 발생했습니다.');
    } finally {
      setIntentLoading(false);
    }
  };

  const removeTag = (category: string, value: string) => {
    setTags((prev) => ({
      ...prev,
      [category]: ((prev as any)[category] || []).filter((t: string) => t !== value),
    }));
  };

  const addTag = (category: string, value: string) => {
    if (!value.trim()) return;
    setTags((prev) => {
      const existing = (prev as any)[category] || [];
      if (existing.includes(value)) return prev;
      return { ...prev, [category]: [...existing, value] };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-sm bg-slate-900 border-l border-slate-700 h-full overflow-y-auto animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-700/50 p-4 flex items-center justify-between z-10">
          <h3 className="text-sm font-bold text-white">구독자 상세</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 프로필 헤더 */}
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
              style={{ background: subscriber.temperatureConfig?.badgeBg || 'rgba(100,116,139,0.1)' }}
            >
              {subscriber.buyerTemperature?.charAt(0) || '⚪'}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{subscriber.subscriber_name}</p>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Phone className="w-3 h-3" /> {subscriber.subscriber_phone}
              </p>
              {subscriber.subscriber_email && (
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Mail className="w-3 h-3" /> {subscriber.subscriber_email}
                </p>
              )}
            </div>
          </div>

          {/* 매수 온도 */}
          <div className="p-3 rounded-xl border border-slate-700/50" style={{ background: subscriber.temperatureConfig?.badgeBg }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold" style={{ color: subscriber.temperatureConfig?.color }}>
                {subscriber.buyerTemperature || '⚪ 미확인'}
              </span>
              <Flame className="w-4 h-4" style={{ color: subscriber.temperatureConfig?.color }} />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{subscriber.temperatureConfig?.description || '데이터 부족'}</p>
          </div>

          {/* 채널 설정 */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">수신 채널</span>
            <div className="flex gap-1.5">
              {(Object.entries(CHANNEL_META) as [string, typeof CHANNEL_META.kakao][]).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    onClick={() => { setChannel(key as any); setEditing(true); }}
                    className={`flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-bold rounded-lg border transition-all ${
                      channel === key
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                        : 'bg-slate-800/50 text-slate-500 border-slate-700/50 hover:text-slate-300'
                    }`}
                  >
                    <Icon className="w-3 h-3" /> {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 관심사 태그 편집 */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">관심사 태그</span>

            {(['regions', 'assetTypes', 'topics', 'hobbies'] as const).map((category) => {
              const labels: Record<string, string> = { regions: '📍 관심 권역', assetTypes: '🏢 자산 유형', topics: '📰 관심 토픽', hobbies: '🎯 취미' };
              const currentTags = (tags as any)[category] || [];
              return (
                <div key={category} className="space-y-1">
                  <p className="text-[10px] font-semibold text-slate-400">{labels[category]}</p>
                  <div className="flex flex-wrap gap-1">
                    {currentTags.map((t: string) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-0.5 text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/20"
                      >
                        {t}
                        <button
                          onClick={() => { removeTag(category, t); setEditing(true); }}
                          className="hover:text-rose-400 ml-0.5"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  {/* 프리셋 추가 버튼 */}
                  <div className="flex flex-wrap gap-1">
                    {(TAG_PRESETS[category] || [])
                      .filter((p) => !currentTags.includes(p))
                      .slice(0, 5)
                      .map((preset) => (
                        <button
                          key={preset}
                          onClick={() => { addTag(category, preset); setEditing(true); }}
                          className="text-[9px] text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-700/30 hover:text-indigo-300 hover:border-indigo-500/30 transition-colors"
                        >
                          + {preset}
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 저장 버튼 */}
          {editing && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs rounded-xl hover:bg-indigo-600/40 transition-colors disabled:opacity-50"
            >
              {saving ? '저장 중...' : '💾 변경사항 저장'}
            </button>
          )}

          {/* AutoIntent CTA */}
          <div className="p-3 bg-gradient-to-br from-rose-950/30 to-orange-950/20 border border-rose-500/20 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-bold text-rose-300">AutoIntent 생성</span>
            </div>
            <p className="text-[10px] text-slate-400">
              이 구독자의 관심사 프로필을 기반으로 매수 의향서 초안을 자동 생성합니다.
            </p>
            <button
              onClick={handleAutoIntent}
              disabled={intentLoading}
              className="w-full py-2 bg-rose-500/20 border border-rose-500/30 text-rose-300 font-bold text-xs rounded-lg hover:bg-rose-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Target className="w-3.5 h-3.5" />
              {intentLoading ? '생성 중...' : '🎯 AutoIntent 생성하기'}
            </button>
            {intentResult && (
              <p className="text-[10px] text-center text-slate-300 bg-black/20 py-1.5 rounded-lg">{intentResult}</p>
            )}
          </div>

          {/* 삭제 */}
          <div className="pt-2 border-t border-slate-800">
            {confirmDelete ? (
              <div className="space-y-2">
                <p className="text-[11px] text-rose-400 font-semibold text-center">정말 이 구독자를 삭제하시겠습니까?</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    className="flex-1 py-2 bg-rose-600/20 border border-rose-500/30 text-rose-300 text-xs font-bold rounded-lg"
                  >
                    삭제
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2 bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-slate-500 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> 구독자 삭제
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 신규 구독자 추가 폼
// ══════════════════════════════════════════════════════════════

function AddSubscriberForm({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [channel, setChannel] = useState<'kakao' | 'email' | 'both'>('kakao');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('이름과 전화번호는 필수입니다.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/broker/magazine/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          channel,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onAdded();
      } else {
        setError(json.error || '추가에 실패했습니다.');
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 bg-slate-800/50 border border-indigo-500/20 rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-indigo-400" /> 새 구독자 추가
        </h4>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="이름 *" value={name} onChange={(e) => setName(e.target.value)}
            className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500/50"
          />
          <input type="tel" placeholder="전화번호 *" value={phone} onChange={(e) => setPhone(e.target.value)}
            className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500/50"
          />
        </div>
        <input type="email" placeholder="이메일 (선택)" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500/50"
        />
        <div className="flex gap-1.5">
          {(Object.entries(CHANNEL_META) as [string, typeof CHANNEL_META.kakao][]).map(([key, meta]) => {
            const Icon = meta.icon;
            return (
              <button key={key} type="button" onClick={() => setChannel(key as any)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                  channel === key ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : 'bg-slate-800/50 text-slate-500 border-slate-700/50'
                }`}
              >
                <Icon className="w-3 h-3" /> {meta.label}
              </button>
            );
          })}
        </div>
        {error && <p className="text-[10px] text-rose-400">{error}</p>}
        <button type="submit" disabled={saving}
          className="w-full py-2.5 bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-bold text-xs rounded-xl hover:bg-indigo-600/30 transition-colors disabled:opacity-50"
        >
          {saving ? '추가 중...' : '구독자 추가'}
        </button>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 아웃리치 패널 (기존 유지)
// ══════════════════════════════════════════════════════════════

function OutreachPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'readiness' | 'cobroker' | 'vendor'>('readiness');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-slate-800/50 rounded-xl">
        {[
          { id: 'readiness' as const, label: '매각준비', icon: Building2 },
          { id: 'cobroker' as const, label: '공동중개', icon: Users },
          { id: 'vendor' as const, label: '벤더', icon: Link2 },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeSubTab === tab.id
                  ? 'bg-slate-700 text-slate-200 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-3 h-3" /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeSubTab === 'readiness' && (
        <div className="space-y-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-200">매각준비도 진단 발송</h2>
          </div>
          <p className="text-xs text-slate-400">
            건물 소유주에게 현재 매물의 매각 준비 상태와 보완점을 카카오톡으로 발송합니다.
          </p>
          <button className="w-full py-2.5 bg-emerald-500/20 text-emerald-300 font-bold text-sm rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center justify-center gap-2 border border-emerald-500/30">
            <Send className="w-4 h-4" /> 소유주에게 발송하기
          </button>
        </div>
      )}

      {activeSubTab === 'cobroker' && (
        <div className="space-y-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-slate-200">공동중개 제안</h2>
          </div>
          <p className="text-xs text-slate-400">
            협력 중개사에게 내 매물 리스트를 공유하고 공동중개를 제안하세요.
          </p>
          <button className="w-full py-2.5 bg-amber-500/20 text-amber-300 font-bold text-sm rounded-lg hover:bg-amber-500/30 transition-colors flex items-center justify-center gap-2 border border-amber-500/30">
            <Share2 className="w-4 h-4" /> 제안서 링크 복사
          </button>
        </div>
      )}

      {activeSubTab === 'vendor' && (
        <div className="space-y-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-slate-200">벤더 연결</h2>
          </div>
          <p className="text-xs text-slate-400">
            인테리어, 대출, 세무 등 협력 벤더 리스트를 고객에게 공유합니다.
          </p>
          <button className="w-full py-2.5 bg-blue-500/20 text-blue-300 font-bold text-sm rounded-lg hover:bg-blue-500/30 transition-colors flex items-center justify-center gap-2 border border-blue-500/30">
            <Share2 className="w-4 h-4" /> 벤더 리스트 전송
          </button>
        </div>
      )}
    </div>
  );
}
