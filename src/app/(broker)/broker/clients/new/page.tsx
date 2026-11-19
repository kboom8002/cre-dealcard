'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FieldCoachBanner } from '@/components/help/FieldCoachBanner';
import { formatKrPhoneInput } from '@/lib/magazine/phone-input';
import { createClient } from '@/lib/supabase/client';

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
  const [subscribeMagazine, setSubscribeMagazine] = useState(false);
  const [consentAttested, setConsentAttested] = useState(false);

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    const formattedPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
    const trimmedEmail = email.trim();
    if (subscribeMagazine) {
      if (!formattedPhone && !trimmedEmail) {
        setError('뉴스레터 구독자 등록을 위해 연락처 또는 이메일을 입력해주세요.');
        return;
      }
      if (!consentAttested) {
        setError('고객의 뉴스레터 수신 동의 확인 체크박스를 선택해주세요.');
        return;
      }
    }
    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      const res = await fetch('/api/broker/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          client_type: clientType,
          display_name: displayName.trim(),
          company: company.trim() || undefined,
          phone: phone.trim() || undefined,
          email: trimmedEmail || undefined,
          tier,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        const errMsg =
          errBody?.error?.message ||
          (typeof errBody?.error === 'string' ? errBody.error : '') ||
          '등록에 실패했습니다.';
        throw new Error(errMsg);
      }

      const { data } = await res.json();

      if (subscribeMagazine && data?.id) {
        const channel = formattedPhone && trimmedEmail ? 'both' : trimmedEmail ? 'email' : 'kakao';
        const subRes = await fetch('/api/broker/magazine/subscribers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name: displayName.trim(),
            ...(formattedPhone ? { phone: formattedPhone } : {}),
            ...(trimmedEmail ? { email: trimmedEmail } : {}),
            channel,
            client_id: data.id,
            consentAttested,
          }),
        });
        if (!subRes.ok) {
          const subErrBody = await subRes.json().catch(() => null);
          const subErrMsg =
            subErrBody?.error?.message ||
            (typeof subErrBody?.error === 'string' ? subErrBody.error : '') ||
            '고객은 등록되었으나 뉴스레터 구독자 등록에 실패했습니다.';
          throw new Error(subErrMsg);
        }
      }

      router.push(`/broker/clients/${data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pt-4">
          <Link
            href="/broker/clients"
            aria-label="고객 목록으로 돌아가기"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] w-11 h-11 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-base font-bold transition-colors"
          >
            ←
          </Link>
          <h1 className="text-xl font-bold text-slate-900">신규 고객 등록</h1>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* 고객 유형 */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-600 tracking-wide">고객 유형</h2>
          <div className="flex gap-2">
            {([
              { value: 'seller', label: '🏠 매도자' },
              { value: 'buyer', label: '🎯 매수자' },
              { value: 'both', label: '🔄 매도/매수' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setClientType(opt.value)}
                className={`flex-1 min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer ${
                  clientType === opt.value
                    ? 'bg-blue-50 text-blue-700 border-blue-400 font-semibold'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 기본 정보 */}
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-600 tracking-wide">기본 정보</h2>

          <div className="space-y-1.5">
            <label htmlFor="client-name" className="block text-sm font-semibold text-slate-800">이름 *</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
              placeholder="홍길동 / (주)ABC"
              id="client-name"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="client-company" className="block text-sm font-semibold text-slate-800">회사 / 법인명</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
              placeholder="(주) 부동산 투자법인"
              id="client-company"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="client-phone" className="block text-sm font-semibold text-slate-800">연락처</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatKrPhoneInput(e.target.value))}
                className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                placeholder="예: 휴대폰 번호 입력"
                id="client-phone"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="client-email" className="block text-sm font-semibold text-slate-800">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                placeholder="예: 수신 이메일 입력"
                id="client-email"
              />
            </div>
          </div>
        </section>

        {/* 등급 */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-600 tracking-wide">고객 등급</h2>
          <div className="flex gap-2">
            {([
              { value: 'vip', label: '⭐ VIP' },
              { value: 'normal', label: '일반' },
              { value: 'potential', label: '잠재' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTier(opt.value)}
                className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl text-sm font-medium border transition-all cursor-pointer ${
                  tier === opt.value
                    ? 'bg-blue-50 text-blue-700 border-blue-400 font-semibold'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 메모 */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-600 tracking-wide">메모</h2>

          <FieldCoachBanner
            headline="💡 고객 성향 및 매수 희망 조건 메모 코칭"
            guidance="고객의 매수 희망 가격대, 선호 지역, 자금 준비 현황을 메모해 두시면 신규 딜카드 등록 시 AI 매칭 추천과 주간 뉴스레터 발송에 자동으로 연동됩니다."
            sampleText="희망 조건: 강남·서초 역세권 80억~150억 수익형 빌딩&#10;선호 수익률: 3.8% 이상 희망 (법인 사옥 겸용 가능)&#10;자금 조달: 자기자본 50억 + 대출 50억 준비 완료&#10;특이사항: 매주 월요일 주간 뉴스레터 적극 열람 중, 급매물 발생 시 우선 연락 요망"
            sampleButtonLabel="✨ 1초 예시 채우기"
            onApplySample={(sample) => setNotes(sample)}
            mistakeWarning="주민등록번호나 금융계좌 등 불필요한 개인정보는 입력하지 마시고, 매수 의사결정에 필요한 예산·지역·용도 위주로 메모해 주세요."
            variant="amber"
          />

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors resize-none"
            placeholder="고객 특이사항, 선호 조건, 상담 내용 등을 자유롭게 작성하세요."
            id="client-notes"
          />
        </section>

        {/* 뉴스레터 동기화 */}
        <div className="space-y-2.5">
          <label className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={subscribeMagazine}
              onChange={(e) => {
                const checked = e.target.checked;
                setSubscribeMagazine(checked);
                if (!checked) setConsentAttested(false);
              }}
              className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            이 고객을 주간 뉴스레터 구독자로도 등록
          </label>

          {subscribeMagazine && (
            <label
              data-testid="new-client-consent-attested-box"
              className="flex min-h-[44px] items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/60 px-3.5 py-2.5 text-sm font-semibold text-slate-800 cursor-pointer"
            >
              <input
                id="client-consent-attested"
                data-testid="new-client-consent-attested-checkbox"
                type="checkbox"
                checked={consentAttested}
                onChange={(e) => setConsentAttested(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                고객 본인의 뉴스레터·매물 안내 수신 동의를 직접 확인했습니다 (필수 · 이메일 등록 시 본인 확인 메일이 발송됩니다)
              </span>
            </label>
          )}
        </div>

        {/* 저장 */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !displayName.trim()}
          className="w-full min-h-[48px] bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl px-4 py-3.5 text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  } catch {
    return '';
  }
}
