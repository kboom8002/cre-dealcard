'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';

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
  created_at: string;
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
  vip: { label: 'VIP', color: 'bg-grade-s/10 text-grade-s border-grade-s/20' },
  normal: { label: '일반', color: 'bg-primary/10 text-primary border-primary/20' },
  potential: { label: '잠재', color: 'bg-warning/10 text-warning border-warning/20' },
  dormant: { label: '휴면', color: 'bg-muted text-muted-foreground border-border' },
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactType, setContactType] = useState('phone');
  const [contactSummary, setContactSummary] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [curation, setCuration] = useState<any>(null);
  const [curationLoading, setCurationLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);

  const fetchClient = useCallback(async () => {
    try {
      const res = await fetch(`/api/broker/clients/${params.id}`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        setClient(data);
      }
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  useEffect(() => {
    const fetchCuration = async () => {
      try {
        const res = await fetch(`/api/broker/clients/${params.id}/curation`, {
          headers: { Authorization: `Bearer ${await getToken()}` },
        });
        if (res.ok) {
          const { data } = await res.json();
          setCuration(data);
        }
      } finally {
        setCurationLoading(false);
      }
    };
    fetchCuration();
  }, [params.id]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleCopyKakao = async (prop: any, type: 'sale' | 'lease') => {
    const text = type === 'sale'
      ? `[블라인드 매물 안내]\n\n📍 ${prop.area_signal} ${prop.asset_type}\n💰 ${prop.price_band}\n\n관심 있으시면 연락 부탁드립니다.\n자세한 내용은 직접 안내드리겠습니다.`
      : `[임대 공간 안내]\n\n🔑 ${prop.floor || ''} ${prop.space_type === 'office' ? '오피스' : '상가'} ${prop.area_pyeong}평\n💰 보증금 ${prop.deposit}만 / 월 ${prop.monthly_rent}만\n\n관심 있으시면 연락 부탁드립니다.`;
    await navigator.clipboard.writeText(text);
    setCopiedId(prop.id);
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
      if (res.ok) {
        setContactSummary('');
        setShowContactForm(false);
        fetchClient();
      }
    } finally {
      setSavingContact(false);
    }
  };

  if (loading) {
    return (
      <main className="flex flex-col items-center min-h-screen px-4 py-8">
        <div className="w-full max-w-md mx-auto space-y-4 pt-4">
          <div className="h-8 bg-muted rounded-lg animate-pulse w-48" />
          <div className="h-40 bg-muted rounded-xl animate-pulse" />
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
        </div>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="flex flex-col items-center min-h-screen px-4 py-8">
        <div className="w-full max-w-md mx-auto pt-20 text-center">
          <p className="text-muted-foreground">고객을 찾을 수 없습니다.</p>
          <Link href="/broker/clients" className="text-primary text-sm mt-2 inline-block">
            ← 목록으로 돌아가기
          </Link>
        </div>
      </main>
    );
  }

  const tier = TIER_LABELS[client.tier] ?? TIER_LABELS.normal;
  const typeLabel = client.client_type === 'seller' ? '매도자' : client.client_type === 'buyer' ? '매수자' : '매도/매수';

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pt-4">
          <Link
            href="/broker/clients"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-muted hover:bg-muted/80 text-sm transition-colors"
          >
            ←
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{client.display_name}</h1>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${tier.color}`}>
                {tier.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {typeLabel}{client.company ? ` · ${client.company}` : ''}
            </p>
          </div>
        </div>

        {/* 연락처 정보 */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">연락처</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {client.phone && (
              <div className="flex items-center gap-2">
                <span>📞</span>
                <a href={`tel:${client.phone}`} className="text-primary hover:underline">{client.phone}</a>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-2">
                <span>📧</span>
                <span className="truncate">{client.email}</span>
              </div>
            )}
          </div>
          {client.notes && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 mt-2">
              {client.notes}
            </p>
          )}
        </section>

        {/* 연결된 매물 */}
        {client.buildings.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              🏢 관련 매물 ({client.buildings.length}건)
            </h2>
            <div className="space-y-1.5">
              {client.buildings.map((b) => (
                <Link
                  key={b.id}
                  href={`/broker/deal-card/${b.id}`}
                  className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  <span className="text-xs font-medium">{b.area_signal} {b.asset_type}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{b.price_band}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 연결된 매수 의향서 */}
        {client.buyerIntents.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              🎯 매수 조건 ({client.buyerIntents.length}건)
            </h2>
            <div className="space-y-1.5">
              {client.buyerIntents.map((bi) => (
                <Link
                  key={bi.id}
                  href={`/broker/buyer-intents/${bi.id}`}
                  className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  <span className="text-xs font-medium">{bi.buyer_type}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{bi.budget_display}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 🎁 AI 추천 매물 */}
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h2 className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
            🎁 이 고객에게 추천할 매물
          </h2>

          {curationLoading ? (
            <div className="space-y-2">
              <div className="h-16 bg-muted rounded-lg animate-pulse" />
              <div className="h-16 bg-muted rounded-lg animate-pulse" />
            </div>
          ) : curation && (curation.saleProperties.length > 0 || curation.leaseProperties.length > 0) ? (
            <div className="space-y-3">
              {curation.saleProperties.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground font-medium">매매 추천 ({curation.saleProperties.length}건)</p>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {curation.saleProperties.map((prop: any) => (
                    <div key={prop.id} className="flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium">{prop.area_signal} {prop.asset_type}</span>
                          <span className="text-xs text-muted-foreground">{prop.price_band}</span>
                          {prop.is_cross && (
                            <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full font-medium">CROSS</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {prop.reasons.join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-bold text-primary">{prop.relevance}%</span>
                        <button
                          onClick={() => handleCopyKakao(prop, 'sale')}
                          className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-md hover:bg-primary/20 transition-colors"
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
                  <p className="text-[10px] text-muted-foreground font-medium">임대 추천 ({curation.leaseProperties.length}건)</p>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {curation.leaseProperties.map((prop: any) => (
                    <div key={prop.id} className="flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">
                            {prop.floor || ''} {prop.space_type === 'office' ? '오피스' : '상가'} {prop.area_pyeong}평
                          </span>
                          {prop.is_cross && (
                            <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full font-medium">CROSS</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          보증금 {prop.deposit}만 / 월 {prop.monthly_rent}만
                        </p>
                      </div>
                      <button
                        onClick={() => handleCopyKakao(prop, 'lease')}
                        className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-md hover:bg-primary/20 transition-colors shrink-0"
                      >
                        {copiedId === prop.id ? '✓ 복사됨' : '📋 카톡'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              매수 의향서를 연결하면 AI가 맞춤 매물을 추천합니다.
            </p>
          )}
        </section>

        {/* 연락 이력 */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              📋 연락 이력
            </h2>
            <button
              onClick={() => setShowContactForm(!showContactForm)}
              className="text-xs text-primary font-medium hover:underline"
            >
              + 기록 추가
            </button>
          </div>

          {/* 연락 기록 추가 폼 */}
          {showContactForm && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(CONTACT_TYPE_LABELS).map(([key, { emoji, label }]) => (
                  <button
                    key={key}
                    onClick={() => setContactType(key)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${
                      contactType === key
                        ? 'bg-primary/10 text-primary border-primary/40'
                        : 'bg-background text-muted-foreground border-border'
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
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors resize-none"
                placeholder="통화/미팅 내용을 간단히 기록하세요..."
              />
              <button
                onClick={handleAddContact}
                disabled={savingContact || !contactSummary.trim()}
                className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium disabled:opacity-60"
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
                return (
                  <div key={c.id} className="flex gap-2.5 text-sm">
                    <div className="flex flex-col items-center">
                      <span className="text-base">{ct.emoji}</span>
                      <div className="w-px flex-1 bg-border mt-1" />
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{ct.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString('ko-KR', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.summary}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">
              아직 기록된 연락 이력이 없어요.
            </p>
          )}
        </section>
      </div>

      <BrokerBottomNav />
    </main>
  );
}

async function getToken(): Promise<string> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  } catch {
    return '';
  }
}
