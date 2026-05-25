'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';

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

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  vip: { label: 'VIP', color: 'bg-grade-s/10 text-grade-s border-grade-s/20' },
  normal: { label: '일반', color: 'bg-primary/10 text-primary border-primary/20' },
  potential: { label: '잠재', color: 'bg-warning/10 text-warning border-warning/20' },
  dormant: { label: '휴면', color: 'bg-muted text-muted-foreground border-border' },
};

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  seller: { label: '매도자', emoji: '🏠' },
  buyer: { label: '매수자', emoji: '🎯' },
  both: { label: '매도/매수', emoji: '🔄' },
};

export default function ClientsPage() {
  const [clients, setClients] = useState<BrokerClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'seller' | 'buyer' | 'both'>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('client_type', filter);
      if (tierFilter !== 'all') params.set('tier', tierFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/broker/clients?${params}`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        setClients(data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter, tierFilter, search]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-xl font-bold">고객 관리</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              총 {clients.length}명의 고객
            </p>
          </div>
          <Link
            href="/broker/clients/new"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            id="cta-new-client"
          >
            + 등록
          </Link>
        </div>

        {/* 검색 */}
        <input
          type="text"
          placeholder="이름, 회사, 연락처로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
          id="client-search"
        />

        {/* 필터 */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {(['all', 'seller', 'buyer', 'both'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
                filter === t
                  ? 'bg-primary/10 text-primary border-primary/40'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/30'
              }`}
            >
              {t === 'all' ? '전체' : TYPE_LABELS[t]?.label ?? t}
            </button>
          ))}
          <span className="shrink-0 w-px h-6 bg-border self-center" />
          {(['all', 'vip', 'normal', 'potential', 'dormant'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                tierFilter === t
                  ? 'bg-primary/10 text-primary border-primary/40'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/30'
              }`}
            >
              {t === 'all' ? '전체 등급' : TIER_LABELS[t]?.label ?? t}
            </button>
          ))}
        </div>

        {/* 고객 목록 */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : clients.length > 0 ? (
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
                  className="block rounded-xl border border-border bg-card p-4 space-y-2 transition-all hover:border-primary/40 active:scale-[0.98]"
                  id={`client-${client.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/5 text-lg">
                        {type.emoji}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{client.display_name}</p>
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${tier.color}`}>
                            {tier.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {type.label}
                          {client.company && ` · ${client.company}`}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">→</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {client.phone && <span>📞 {client.phone}</span>}
                    {buildingCount > 0 && (
                      <span className="text-primary font-medium">🏢 {buildingCount}건</span>
                    )}
                    {intentCount > 0 && (
                      <span className="text-primary font-medium">🎯 {intentCount}건</span>
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
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
            <p className="text-4xl">👥</p>
            <p className="text-sm font-medium">등록된 고객이 없어요.</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              매도자나 매수자를 등록하고
              <br />
              체계적으로 관리해보세요.
            </p>
            <Link
              href="/broker/clients/new"
              className="inline-flex items-center justify-center mt-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
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
