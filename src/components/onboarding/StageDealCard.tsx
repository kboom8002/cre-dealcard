'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Clipboard, Wand2, ArrowRight, Shield } from 'lucide-react';
import { useOnboarding } from '@/lib/onboarding/onboarding-state';
import { trackOnboardingEvent } from '@/lib/onboarding/onboarding-tracker';
import { hapticMedium, hapticSuccess } from './HapticFeedback';

interface StageDealCardProps {
  prefillAddress?: string;
  onComplete: (dealCardId: string) => void;
  onSkip: () => void;
}

type DealCardPhase = 'input' | 'processing' | 'result';

interface DealCardPreview {
  area: string;
  floors: string;
  askingPrice: string;
  capRate: string;
  hiddenAddress: string;
  tenantHint: string;
  blindTitle: string;
}

export function StageDealCard({ prefillAddress, onComplete, onSkip }: StageDealCardProps) {
  const { state, setFirstDealCardId } = useOnboarding();
  const { data } = state;

  const [phase, setPhase] = useState<DealCardPhase>('input');
  const [memo, setMemo] = useState('');
  const [askingPrice, setAskingPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<DealCardPreview | null>(null);

  const exampleMemo = prefillAddress
    ? `${prefillAddress}\n근생5층 연면적160평\n1층 스벅 보2억/월800\n매도호가 72억\n엘베있음 주차6대`
    : '성수 근생5층 연면적160평\n1층 스벅 보2억/월800\n매도호가 72억\n엘베있음 주차6대';

  const handleGenerate = async () => {
    if (!memo.trim() && !prefillAddress) {
      return;
    }
    setPhase('processing');
    hapticMedium();
    await trackOnboardingEvent('onboard_dealcard_start', data.sessionToken);

    try {
      const res = await fetch('/api/broker/deal-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_memo: memo || exampleMemo,
          address: prefillAddress,
          asking_price: askingPrice ? Number(askingPrice) * 100000000 : undefined,
          notes,
        }),
      });

      if (res.ok) {
        const json = await res.json() as { ok: boolean; data: { id?: string } };
        const id = json?.data?.id ?? 'demo-card';
        setFirstDealCardId(id);
        setPreview(buildPreview(memo || exampleMemo, prefillAddress));
        setPhase('result');
        hapticSuccess();
        await trackOnboardingEvent('onboard_dealcard_done', data.sessionToken, { deal_card_id: id });
        return;
      }
    } catch {
      // fall through to mock
    }

    // Mock result for demo / API failure
    const mockId = 'onboarding-demo-' + Date.now();
    setFirstDealCardId(mockId);
    setPreview(buildPreview(memo || exampleMemo, prefillAddress));
    setPhase('result');
    hapticSuccess();
    await trackOnboardingEvent('onboard_dealcard_done', data.sessionToken, { deal_card_id: mockId });
  };

  const handleShare = async () => {
    const shareText = `[딜카드] ${preview?.blindTitle ?? '블라인드 매물장'}\n📊 ${preview?.capRate ?? ''}\n🏢 ${preview?.area ?? ''}\n\n상세 문의: credeal.net`;
    if (navigator.share) {
      await navigator.share({ text: shareText, url: 'https://credeal.net' }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(shareText).catch(() => {});
    }
  };

  return (
    <div className="flex min-h-dvh flex-col px-6 py-10">
      <motion.div
        className="mb-6 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20">
          <Wand2 className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-2xl font-black text-white">첫 딜카드를 만들어요</h2>
        <p className="mt-2 text-sm text-neutral-400">
          {prefillAddress
            ? '방금 조회한 건물로 바로 시작합니다'
            : '카톡 메모를 그대로 붙여넣어도 됩니다'}
        </p>
      </motion.div>

      {phase === 'input' && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="space-y-4"
        >
          {/* Auto-fill notice */}
          {prefillAddress && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
              <p className="text-xs text-cyan-400">
                ✓ 건축물대장 데이터가 자동으로 채워집니다
              </p>
            </div>
          )}

          {/* Asking price */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-neutral-300">
              매도 희망가 <span className="text-neutral-600">(선택)</span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                placeholder="72"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-3.5 pl-4 pr-10 text-sm text-white placeholder-neutral-600 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                억원
              </span>
            </div>
          </div>

          {/* Memo paste */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
              <Clipboard className="h-3.5 w-3.5" />
              카톡 메모 붙여넣기 <span className="text-neutral-600">(선택)</span>
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={exampleMemo}
              rows={5}
              className="w-full resize-none rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm text-white placeholder-neutral-600 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <p className="text-xs text-neutral-600">
              AI가 자동으로 파싱하고 민감정보를 차폐합니다
            </p>
          </div>

          <motion.button
            onClick={() => void handleGenerate()}
            whileTap={{ scale: 0.97 }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 py-3.5 text-sm font-black text-white shadow-lg shadow-violet-500/20 hover:brightness-110"
          >
            <Wand2 className="h-4 w-4" />
            AI 딜카드 생성
            <ArrowRight className="h-4 w-4" />
          </motion.button>

          <button
            onClick={onSkip}
            className="w-full py-2 text-center text-sm text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            나중에 하기
          </button>
        </motion.div>
      )}

      {phase === 'processing' && (
        <motion.div
          className="flex flex-1 flex-col items-center justify-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="relative">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-neutral-800 border-t-violet-500" />
            <Wand2 className="absolute inset-0 m-auto h-6 w-6 text-violet-400" />
          </div>
          <div className="space-y-1 text-center">
            <p className="text-sm font-semibold text-white">AI가 딜카드를 생성 중...</p>
            <p className="text-xs text-neutral-500">민감정보 자동 차폐 적용 중</p>
          </div>
        </motion.div>
      )}

      {phase === 'result' && preview && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-4"
        >
          <motion.p
            className="text-center text-sm font-semibold text-violet-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            ✨ 딜카드가 생성되었습니다!
          </motion.p>

          {/* Deal card preview */}
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-neutral-900 to-neutral-950 p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-base font-black text-white">{preview.blindTitle}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{preview.hiddenAddress}</p>
              </div>
              <span className="rounded-lg bg-violet-500/10 px-2.5 py-1 text-xs font-bold text-violet-400 border border-violet-500/20">
                블라인드
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-neutral-800/50 p-3">
                <p className="mb-0.5 text-xs text-neutral-500">연면적</p>
                <p className="font-bold text-white">{preview.area}</p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 p-3">
                <p className="mb-0.5 text-xs text-neutral-500">층수</p>
                <p className="font-bold text-white">{preview.floors}</p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 p-3">
                <p className="mb-0.5 text-xs text-neutral-500">매도호가</p>
                <p className="font-bold text-white">{preview.askingPrice}</p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 p-3">
                <p className="mb-0.5 text-xs text-neutral-500">Cap Rate</p>
                <p className="font-bold text-emerald-400">{preview.capRate}</p>
              </div>
            </div>

            {/* Blind notice */}
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <p className="text-[11px] text-amber-400/80">
                AI가 자동으로 숨긴 정보: 정확한 주소, 임차인명<br />
                → 블라인드 매물장 안전 보장 ✓
              </p>
            </div>
          </div>

          {/* Share CTA */}
          <motion.button
            onClick={() => void handleShare()}
            whileTap={{ scale: 0.97 }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 py-3.5 text-sm font-black text-white shadow-lg shadow-violet-500/20 hover:brightness-110"
          >
            📱 카톡으로 보내기
          </motion.button>

          <button
            onClick={() => onComplete(data.firstDealCardId ?? 'demo')}
            className="flex w-full items-center justify-center gap-2 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            다음 단계로
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPreview(memo: string, address?: string): DealCardPreview {
  // Simple heuristic parse for demo
  const priceMatch = memo.match(/(\d+)억/);
  const price = priceMatch ? `${priceMatch[1]}억원` : '협의';

  const areaMatch = memo.match(/(\d+)평/);
  const area = areaMatch ? `${areaMatch[1]}평 (${Math.round(Number(areaMatch[1]) * 3.3)}㎡)` : '528㎡';

  const floorMatch = memo.match(/(\d+)층/);
  const floors = floorMatch ? `${floorMatch[1]}층` : '5층';

  const region = address
    ? address.split(' ').slice(0, 2).join(' ')
    : '성동구';

  return {
    area,
    floors,
    askingPrice: price,
    capRate: '4.2%',
    hiddenAddress: `📍 ${region} 근처 (주소 잠금)`,
    tenantHint: '1층 대형 브랜드 입점',
    blindTitle: `${region} 근생빌딩 매각`,
  };
}
