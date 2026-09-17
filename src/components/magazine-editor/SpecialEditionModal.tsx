'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap, Users, Send, CheckCircle2, AlertCircle, X,
  Flame, Sparkles, Building2, ExternalLink, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface SpecialEditionModalProps {
  buildingId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (edition: any) => void;
}

export function SpecialEditionModal({
  buildingId,
  isOpen,
  onClose,
  onSuccess,
}: SpecialEditionModalProps) {
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [data, setData] = useState<{
    building: { areaSignal: string; assetType: string; priceDisplay: string };
    totalSubscribers: number;
    targetCount: number;
    hotLeadCount: number;
    matchedPreview: Array<{ id: string; name: string; temperature: string; badgeBg: string; color: string }>;
    defaultHeadline: string;
  } | null>(null);

  const [headline, setHeadline] = useState('');
  const [urgentNote, setUrgentNote] = useState('');
  const [autoDistribute, setAutoDistribute] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);

    fetch(`/api/broker/magazine/special?buildingId=${buildingId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('타깃 정보를 불러오지 못했습니다.');
        const json = await res.json();
        if (isMounted) {
          setData(json);
          setHeadline(json.defaultHeadline || '');
        }
      })
      .catch((err) => {
        console.error('[SpecialEditionModal] load failed:', err);
        toast.error('매물 타깃 독자 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [buildingId, isOpen]);

  if (!isOpen) return null;

  async function handlePublish() {
    if (!headline.trim()) {
      toast.error('속보 헤드라인을 입력해주세요.');
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch('/api/broker/magazine/special', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingId,
          headline: headline.trim(),
          urgentNote: urgentNote.trim() || undefined,
          autoDistribute,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || '속보 발행에 실패했습니다.');
      }

      toast.success(
        autoDistribute && result.distributionResult?.sent > 0
          ? `⚡ 속보 매거진이 발행되고 ${result.distributionResult.sent}명에게 즉시 발송되었습니다!`
          : '⚡ 속보 매거진이 성공적으로 발행되었습니다!'
      );

      if (onSuccess) {
        onSuccess(result.edition);
      }
      onClose();
    } catch (err: any) {
      console.error('[SpecialEditionModal] publish failed:', err);
      toast.error(err.message || '속보 발행 중 오류가 발생했습니다.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-5 text-slate-200">
        {/* 헤더 */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-rose-500/20 text-rose-400">
                <Zap className="w-4 h-4 fill-current" />
              </span>
              <h3 className="text-base font-bold text-white">프리미엄 속보 매거진 발행</h3>
            </div>
            <p className="text-xs text-slate-400">
              신규 급매/추천 매물을 관심 구독자에게 단독 속보로 즉시 배포합니다.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={publishing}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
            <p className="text-xs">매물 타깃 관심 독자를 실시간 분석 중입니다...</p>
          </div>
        ) : data ? (
          <div className="space-y-4">
            {/* 매물 및 타깃 분석 배너 */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                  <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                  {data.building.areaSignal} · {data.building.assetType}
                </span>
                <span className="font-bold text-emerald-400">{data.building.priceDisplay}</span>
              </div>

              {/* 매칭 타깃 통계 */}
              <div className="bg-rose-950/20 border border-rose-500/20 rounded-lg p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-rose-400" />
                  <div>
                    <div className="text-xs font-bold text-white">
                      매칭 타깃 독자: <span className="text-rose-400">{data.targetCount}명</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      권역 및 자산유형 관심 구독자 자동 필터링
                    </p>
                  </div>
                </div>
                {data.hotLeadCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 flex items-center gap-1">
                    <Flame className="w-3 h-3 text-rose-400" />
                    핫리드 {data.hotLeadCount}명 포함
                  </span>
                )}
              </div>

              {/* 타깃 독자 미리보기 */}
              {data.matchedPreview.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {data.matchedPreview.slice(0, 5).map((m) => (
                    <span
                      key={m.id}
                      className="text-[10px] px-2 py-0.5 rounded-md border border-white/5 bg-slate-900 text-slate-300 flex items-center gap-1"
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                      {m.name}
                    </span>
                  ))}
                  {data.matchedPreview.length > 5 && (
                    <span className="text-[10px] text-slate-500 self-center">
                      외 {data.targetCount - 5}명
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 속보 헤드라인 입력 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                속보 헤드라인
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="[단독 속보] 성수동 꼬마빌딩 급매 안내"
                className="w-full bg-black/30 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* 브로커 긴급 전달 메모 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                브로커 한줄 강조 코멘트 (선택)
              </label>
              <input
                type="text"
                value={urgentNote}
                onChange={(e) => setUrgentNote(e.target.value)}
                placeholder="예: 단독 전속 협의 매물로 이번 주 한정 조건입니다."
                className="w-full bg-black/30 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* 즉시 발송 토글 */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/20">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-indigo-200 block">
                  카카오 알림톡 & 이메일 즉시 배포
                </span>
                <span className="text-[10px] text-slate-400 block">
                  발행과 동시에 타깃 독자 {data.targetCount}명에게 다이렉트 전송
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoDistribute}
                onChange={(e) => setAutoDistribute(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 focus:ring-offset-slate-900"
              />
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            데이터를 불러올 수 없습니다.
          </div>
        )}

        {/* 하단 액션 버튼 */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            disabled={publishing}
            className="px-3.5 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold transition-all shadow-lg shadow-rose-900/30 disabled:opacity-50"
          >
            {publishing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>속보 발행 및 배포 중...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>⚡ 지금 속보 발행 및 전송</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
