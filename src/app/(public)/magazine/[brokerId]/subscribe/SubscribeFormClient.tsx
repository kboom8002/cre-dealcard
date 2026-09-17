'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, Bell, ArrowRight, Phone, User,
  Sparkles, Check, AlertCircle, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface SubscribeFormClientProps {
  brokerId: string;
  brokerName: string;
  regions: string[];
  assets: string[];
  initialSource: string;
  referrer: string | null;
  latestDate: string;
}

const REGION_OPTIONS = ['강남·서초', '성수·성동', '마포·홍대', '종로·중구', '송파·잠실', '기타 수도권'];
const ASSET_OPTIONS = ['꼬마빌딩', '상가·근생', '사옥용 빌딩', '재건축·개발부지', '오피스텔'];

export function SubscribeFormClient({
  brokerId,
  brokerName,
  regions,
  assets,
  initialSource,
  referrer,
  latestDate,
}: SubscribeFormClientProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function toggleRegion(r: string) {
    setSelectedRegions(prev =>
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    );
  }

  function toggleAsset(a: string) {
    setSelectedAssets(prev =>
      prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      toast.error('올바른 휴대폰 번호를 입력해주세요.');
      return;
    }

    if (!agree) {
      toast.error('알림톡 수신 동의가 필요합니다.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/public/magazine/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker_id: brokerId,
          phone: cleanPhone,
          name: name.trim() || undefined,
          channel: 'kakao',
          source: initialSource || 'qr_card',
          interest_tags: {
            regions: selectedRegions,
            assetTypes: selectedAssets,
          },
          referrer: referrer || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || '구독 신청에 실패했습니다.');
      }

      setSubmitted(true);
      toast.success('구독이 정상적으로 완료되었습니다!');
    } catch (err: any) {
      console.error('[SubscribeForm] error:', err);
      toast.error(err.message || '서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white">구독이 완료되었습니다!</h3>
          <p className="text-xs text-slate-400">
            {brokerName} 중개사의 다음 주간 매거진이 발행되면 카카오톡 알림톡으로 가장 먼저 안내해 드립니다.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href={`/magazine/${brokerId}/${latestDate}`}
            className="flex items-center justify-center gap-1.5 w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-900/30"
          >
            <span>지금 최신 매거진 열람하기</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
      {/* 1. 이름 & 전화번호 */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-500" />
            성함 또는 닉네임 (선택)
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예: 김대표, 투자자"
            className="w-full bg-black/40 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-white flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-indigo-400" />
            휴대폰 번호 <span className="text-rose-400">*</span>
          </label>
          <input
            type="tel"
            required
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="010-1234-5678 (알림톡 수신용)"
            className="w-full bg-black/40 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>
      </div>

      {/* 2. 관심 권역 선택 */}
      <div className="space-y-1.5 pt-1">
        <label className="text-[11px] font-medium text-slate-400">
          관심 권역 (선택 · 맞춤 매물 안내)
        </label>
        <div className="flex flex-wrap gap-1.5">
          {REGION_OPTIONS.map(r => {
            const isSelected = selectedRegions.includes(r);
            return (
              <button
                type="button"
                key={r}
                onClick={() => toggleRegion(r)}
                className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200 font-medium'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 관심 자산 유형 선택 */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-400">
          관심 자산 (선택)
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ASSET_OPTIONS.map(a => {
            const isSelected = selectedAssets.includes(a);
            return (
              <button
                type="button"
                key={a}
                onClick={() => toggleAsset(a)}
                className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200 font-medium'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. 약관 동의 */}
      <div className="pt-2 border-t border-slate-800 flex items-start gap-2">
        <input
          type="checkbox"
          id="agree"
          checked={agree}
          onChange={e => setAgree(e.target.checked)}
          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 mt-0.5"
        />
        <label htmlFor="agree" className="text-[10px] text-slate-400 leading-relaxed cursor-pointer select-none">
          카카오 알림톡을 통한 주간 부동산 리포트 및 매물 안내 수신에 동의합니다. (언제든지 간편하게 수신거부 가능)
        </label>
      </div>

      {/* 5. 제출 버튼 */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-indigo-600 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white text-xs font-black transition-all shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>신청 처리 중...</span>
          </>
        ) : (
          <>
            <Bell className="w-4 h-4 fill-current text-amber-300" />
            <span>카카오톡으로 매거진 무료 구독하기</span>
          </>
        )}
      </button>
    </form>
  );
}
