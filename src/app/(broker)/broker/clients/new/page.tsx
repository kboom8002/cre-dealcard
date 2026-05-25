'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewClientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientType, setClientType] = useState<'seller' | 'buyer' | 'both'>('buyer');
  const [displayName, setDisplayName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState<'vip' | 'normal' | 'potential'>('normal');
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/broker/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({
          client_type: clientType,
          display_name: displayName.trim(),
          company: company.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          tier,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '등록에 실패했습니다.');
      }

      const { data } = await res.json();
      router.push(`/broker/clients/${data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pt-4">
          <Link
            href="/broker/clients"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-muted hover:bg-muted/80 text-sm transition-colors"
          >
            ←
          </Link>
          <h1 className="text-xl font-bold">신규 고객 등록</h1>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}

        {/* 고객 유형 */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">고객 유형</h2>
          <div className="flex gap-2">
            {([
              { value: 'seller', label: '🏠 매도자' },
              { value: 'buyer', label: '🎯 매수자' },
              { value: 'both', label: '🔄 매도/매수' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setClientType(opt.value)}
                className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  clientType === opt.value
                    ? 'bg-primary/10 text-primary border-primary/40'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/30'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 기본 정보 */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">기본 정보</h2>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">이름 *</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
              placeholder="홍길동 / (주)ABC"
              id="client-name"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">회사 / 법인명</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
              placeholder="(주) 부동산 투자법인"
              id="client-company"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">연락처</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
                placeholder="010-0000-0000"
                id="client-phone"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
                placeholder="hong@example.com"
                id="client-email"
              />
            </div>
          </div>
        </section>

        {/* 등급 */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">고객 등급</h2>
          <div className="flex gap-2">
            {([
              { value: 'vip', label: '⭐ VIP' },
              { value: 'normal', label: '일반' },
              { value: 'potential', label: '잠재' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTier(opt.value)}
                className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                  tier === opt.value
                    ? 'bg-primary/10 text-primary border-primary/40'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/30'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 메모 */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">메모</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors resize-none"
            placeholder="고객 특이사항, 선호 조건, 상담 내용 등을 자유롭게 작성하세요."
            id="client-notes"
          />
        </section>

        {/* 저장 */}
        <button
          onClick={handleSubmit}
          disabled={saving || !displayName.trim()}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl px-4 py-3.5 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          id="save-client-btn"
        >
          {saving ? '등록 중...' : '고객 등록하기'}
        </button>
      </div>
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
