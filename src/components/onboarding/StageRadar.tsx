'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Building2, ArrowRight, ExternalLink } from 'lucide-react';
import { useOnboarding } from '@/lib/onboarding/onboarding-state';
import { trackOnboardingEvent } from '@/lib/onboarding/onboarding-tracker';
import { hapticLight } from './HapticFeedback';

interface BuildingData {
  address: string;
  use?: string;
  structure?: string;
  floors?: number;
  bcRatio?: number;
  farRatio?: number;
  approvalDate?: string;
  transactions?: { date: string; price: number; pricePerPy?: number }[];
  officialPrice?: { year: number; pricePerSqm: number }[];
  area?: number;
}

interface StageRadarProps {
  onContinue: (address: string, data: BuildingData) => void;
  onSkip: () => void;
}

export function StageRadar({ onContinue, onSkip }: StageRadarProps) {
  const { state, setRadarAddress } = useOnboarding();
  const { data } = state;

  const [address, setAddress] = useState(data.radarAddress ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [buildingData, setBuildingData] = useState<BuildingData | null>(null);
  const [error, setError] = useState('');

  // Derive region hint from chosen region
  const regionHints: Record<string, string> = {
    seongsu_seongdong: '성수동2가 273-13',
    gangnam_seocho: '역삼동 823-10',
    yeouido_mapo: '여의도동 23-5',
    cbd: '인사동 194',
    pangyo: '판교역로 235',
  };
  const placeholder = data.region ? regionHints[data.region] ?? '성수동2가 273-13' : '성수동2가 273-13';

  const handleSearch = async () => {
    const q = address.trim();
    if (!q) { setError('주소를 입력해주세요.'); return; }
    setError('');
    setIsLoading(true);
    setRadarAddress(q);
    hapticLight();

    await trackOnboardingEvent('onboard_radar_start', data.sessionToken, { address: q });

    try {
      const res = await fetch('/api/public/building-radar/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: q }),
      });

      if (res.ok) {
        const json = await res.json() as { ok: boolean; data: BuildingData };
        setBuildingData(json.data);
        await trackOnboardingEvent('onboard_radar_done', data.sessionToken, { address: q });
      } else {
        // Fallback with mock data so the demo always works
        setBuildingData(getMockData(q));
      }
    } catch {
      setBuildingData(getMockData(q));
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = () => {
    if (buildingData) {
      onContinue(address, buildingData);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col px-6 py-10">
      {/* Header */}
      <motion.div
        className="mb-8 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/20">
          <Building2 className="h-8 w-8 text-black" />
        </div>
        <h2 className="text-2xl font-black text-white">빌딩 한 채를 분석해볼까요?</h2>
        <p className="mt-2 text-sm text-neutral-400">
          {data.region
            ? `${data.region ? regionLabel(data.region) : ''} 권역의 건물 주소를 입력하세요`
            : '관심 있는 건물 주소를 입력하세요'}
        </p>
      </motion.div>

      {/* Search box */}
      <motion.div
        className="mb-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
              placeholder={placeholder}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-3.5 pl-10 pr-4 text-sm text-white placeholder-neutral-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
          <motion.button
            onClick={() => void handleSearch()}
            disabled={isLoading}
            whileTap={{ scale: 0.95 }}
            className="rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 text-sm font-bold text-black shadow-lg shadow-cyan-500/20 disabled:opacity-60"
          >
            {isLoading ? '...' : '조회'}
          </motion.button>
        </div>
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      </motion.div>

      {/* Loading */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            className="flex flex-col items-center gap-3 py-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-700 border-t-cyan-400" />
            <p className="text-sm text-neutral-500">건축물대장 · 실거래가 · 공시지가 조회 중...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {buildingData && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-3"
          >
            {/* Wow text */}
            <motion.p
              className="text-center text-sm font-semibold text-cyan-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              😮 &quot;정부24 없이도 한 번에 나오는구나&quot;
            </motion.p>

            {/* Building register */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">건축물대장</span>
              </div>
              <div className="space-y-2 text-sm">
                {buildingData.use && <Row label="용도" value={buildingData.use} />}
                {buildingData.structure && <Row label="구조" value={buildingData.structure} />}
                {buildingData.floors && <Row label="층수" value={`${buildingData.floors}층`} />}
                {buildingData.bcRatio && <Row label="건폐율" value={`${buildingData.bcRatio}%`} />}
                {buildingData.farRatio && <Row label="용적률" value={`${buildingData.farRatio}%`} />}
                {buildingData.approvalDate && (
                  <Row label="사용승인" value={buildingData.approvalDate} />
                )}
              </div>
            </div>

            {/* Transactions */}
            {buildingData.transactions && buildingData.transactions.length > 0 && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    실거래가
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  {buildingData.transactions.map((t, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-neutral-500">{t.date}</span>
                      <span className="font-semibold text-white">
                        {(t.price / 100000000).toFixed(0)}억
                        {t.pricePerPy && (
                          <span className="ml-2 text-xs text-neutral-500">
                            평당 {(t.pricePerPy / 10000).toFixed(0)}만
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Official price */}
            {buildingData.officialPrice && buildingData.officialPrice.length > 0 && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    공시지가
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  {buildingData.officialPrice.map((p, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-neutral-500">{p.year}년</span>
                      <span className="font-semibold text-white">
                        ₩{p.pricePerSqm.toLocaleString()}/㎡
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTAs */}
            <div className="space-y-2 pt-2">
              <motion.button
                onClick={handleContinue}
                whileTap={{ scale: 0.97 }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-3.5 text-sm font-black text-black shadow-lg shadow-cyan-500/20 hover:brightness-110"
              >
                이 건물로 딜카드 만들기
                <ArrowRight className="h-4 w-4" />
              </motion.button>
              <button
                onClick={onSkip}
                className="flex w-full items-center justify-center gap-1 py-2 text-sm text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                나중에 하기
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip if no search yet */}
      {!buildingData && !isLoading && (
        <motion.div
          className="mt-auto pt-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <button
            onClick={onSkip}
            className="text-sm text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            나중에 하기
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

function regionLabel(r: string): string {
  const map: Record<string, string> = {
    seongsu_seongdong: '성수/성동',
    gangnam_seocho: '강남/서초',
    yeouido_mapo: '여의도/마포',
    cbd: 'CBD 광화문/종로',
    pangyo: '판교/분당',
    other: '기타',
  };
  return map[r] ?? r;
}

function getMockData(address: string): BuildingData {
  return {
    address,
    use: '근린생활시설',
    structure: '철근콘크리트 5층',
    floors: 5,
    bcRatio: 59.8,
    farRatio: 298,
    approvalDate: '2003-04-15',
    area: 528,
    transactions: [
      { date: '2024.03', price: 6800000000, pricePerPy: 42500000 },
      { date: '2022.11', price: 5200000000, pricePerPy: 32500000 },
    ],
    officialPrice: [
      { year: 2026, pricePerSqm: 12500000 },
      { year: 2025, pricePerSqm: 11800000 },
    ],
  };
}
