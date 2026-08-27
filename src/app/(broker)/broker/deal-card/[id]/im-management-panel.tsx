"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { toast } from "sonner";

interface ImManagementPanelProps {
  buildingId: string;
  currentGrade: 'A' | 'B' | 'C' | 'D';
  currentScore: number;
}

interface ImDocument {
  id: string;
  created_at: string;
  tier: 'basic' | 'pro';
  /** D37: 5종 발행 등급 */
  releaseTier?: 'internal_only' | 'fact_om' | 'analysis_im' | 'decision_im' | 'expert_required';
}

const PRESET_SWATCHES: Record<string, { accent: string; name: string }> = {
  credeal_signature: { accent: '#6B8E00', name: 'CREDEAL Signature' },
  golden_institutional: { accent: '#B98A2E', name: 'Golden Institutional' },
  executive_gold: { accent: '#B8862D', name: 'Executive Gold' },
  corporate_clean: { accent: '#059669', name: 'Corporate Clean' },
  pro_dark_obsidian: { accent: '#0284A8', name: 'Pro Dark Obsidian' },
};

export function ImManagementPanel({
  buildingId,
  currentGrade,
  currentScore,
}: ImManagementPanelProps) {
  const [docs, setDocs] = useState<ImDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState("credeal_signature");
  const [presets, setPresets] = useState<any[]>([]);

  // 비동기 생성 + 진행률 상태 (IM-1)
  const [generationStatus, setGenerationStatus] = useState<
    'idle' | 'analyzing' | 'writing' | 'validating' | 'complete' | 'error'
  >('idle');
  const [generationProgress, setGenerationProgress] = useState(0);

  const fetchDocs = async () => {
    try {
      const res = await fetch(`/api/broker/im-lite/${buildingId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.documents) {
          setDocs(data.documents.map((d: any) => ({
            id: d.id,
            created_at: d.created_at,
            tier: d.body?.tier || 'basic',
            releaseTier: d.body?.releaseTier,
          })));
        }
      }
    } catch (err) {
      console.error("Failed to fetch IM docs", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    async function fetchPresets() {
      try {
        const res = await fetch('/api/broker/pptx-preset');
        if (res.ok) {
          const data = await res.json();
          setPresets(data.presets || []);
        }
      } catch (err) {
        console.error("Failed to fetch presets", err);
      }
    }

    fetchDocs();
    fetchPresets();
  }, [buildingId]);

  const basicDoc = docs.find(d => d.tier === 'basic');
  const proDoc = docs.find(d => d.tier === 'pro');

  const handleCopyLink = (tier: 'basic' | 'pro') => {
    const url = `${window.location.origin}/im-${tier === 'basic' ? 'lite' : 'pro'}/${buildingId}`;
    navigator.clipboard.writeText(url);
    toast.success('링크가 복사되었습니다.');
  };

  // 비동기 IM 생성 핸들러 (IM-1 & IM-5)
  const handleGenerateIM = async (tier: 'basic' | 'pro') => {
    setGenerationStatus('analyzing');
    setGenerationProgress(15);
    try {
      const res = await fetch('/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId, tier }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const { jobId } = await res.json();

      // iOS visibilitychange 핸들러 — 앱 복귀 시 즉시 상태 확인
      const onVisibilityChange = async () => {
        if (document.hidden) return;
        try {
          const statusRes = await fetch(`/api/broker/im-lite/job-status?jobId=${jobId}`);
          if (!statusRes.ok) return;
          const { status } = await statusRes.json();
          if (status === 'completed' || status === 'complete') {
            setGenerationStatus('complete');
            setGenerationProgress(100);
            clearInterval(pollInterval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            toast.success(`${tier.toUpperCase()} IM 생성이 완료되었습니다.`);
            await fetchDocs();
            setTimeout(() => setGenerationStatus('idle'), 2500);
          }
          if (status === 'failed' || status === 'error') {
            setGenerationStatus('error');
            clearInterval(pollInterval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            toast.error('IM 생성 중 오류가 발생했습니다.');
            setTimeout(() => setGenerationStatus('idle'), 3000);
          }
        } catch { /* 네트워크 에러 — 다음 폴링에서 재시도 */ }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/broker/im-lite/job-status?jobId=${jobId}`);
          if (!statusRes.ok) return;
          const { status, progress } = await statusRes.json();
          setGenerationProgress(progress || 50);

          if (status === 'writing') setGenerationStatus('writing');
          if (status === 'validating') setGenerationStatus('validating');
          if (status === 'completed' || status === 'complete') {
            setGenerationStatus('complete');
            setGenerationProgress(100);
            clearInterval(pollInterval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            toast.success(`${tier.toUpperCase()} IM 생성이 완료되었습니다.`);
            await fetchDocs();
            setTimeout(() => setGenerationStatus('idle'), 2500);
          }
          if (status === 'failed' || status === 'error') {
            setGenerationStatus('error');
            clearInterval(pollInterval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            toast.error('IM 생성 중 오류가 발생했습니다.');
            setTimeout(() => setGenerationStatus('idle'), 3000);
          }
        } catch {
          // Keep polling
        }
      }, 2000);
    } catch {
      setGenerationStatus('error');
      toast.error('IM 생성 요청에 실패했습니다.');
      setTimeout(() => setGenerationStatus('idle'), 3000);
    }
  };

  // 내보내기 진행률 핸들러 (IM-3)
  const [isExporting, setIsExporting] = useState<string | null>(null); // 'pdf' | 'pptx' | null
  const [exportDone, setExportDone] = useState<string | null>(null);
  const handleExport = async (format: 'export' | 'pptx') => {
    const tier = proDoc ? 'pro' : 'basic';
    const ext = format === 'export' ? 'pdf' : 'pptx';
    setIsExporting(ext);
    setExportDone(null);
    const toastId = toast.loading(`${ext.toUpperCase()} 문서를 생성 중입니다...`);
    try {
      const url = `/api/public/im-lite/${buildingId}/${format}?tier=${tier}&preset=${selectedPreset}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `IM_${buildingId}_${selectedPreset}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success(`${ext.toUpperCase()} 다운로드가 완료되었습니다.`, { id: toastId });
      setExportDone(ext);
      setTimeout(() => setExportDone(null), 3000);
    } catch {
      toast.error(`${ext.toUpperCase()} 생성 중 오류가 발생했습니다.`, { id: toastId });
    } finally {
      setIsExporting(null);
    }
  };

  const isProLocked = currentGrade === 'C';

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-3 animate-pulse">
        <div className="h-5 bg-muted rounded w-1/3" />
        <div className="h-20 bg-muted/40 rounded-lg" />
        <div className="h-20 bg-muted/40 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="text-base font-semibold flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span>📄</span> IM 관리 패널
        </span>
        <div className="flex flex-col items-end text-right">
          <span className={`text-sm font-bold ${
            currentGrade === 'A' ? 'text-emerald-500' :
            currentGrade === 'B' ? 'text-blue-500' :
            currentGrade === 'C' ? 'text-amber-500' : 'text-red-500'
          }`}>
            현재 {currentGrade}등급 ({currentScore}점)
          </span>
          {isProLocked && (
            <span className="text-[10px] text-muted-foreground mt-0.5">
              💡 렌트롤·면적·가격 입력 시 등급 상승
            </span>
          )}
          {/* D37 H-8: ReleaseTier 라벨 */}
          {docs[0]?.releaseTier && (() => {
            const TIER_LABELS: Record<string, { label: string; color: string }> = {
              internal_only:   { label: '내부 전용',       color: 'text-neutral-400' },
              fact_om:         { label: 'Fact OM',        color: 'text-amber-400' },
              analysis_im:    { label: 'Analysis IM',    color: 'text-blue-400' },
              decision_im:    { label: 'Decision IM',    color: 'text-emerald-400' },
              expert_required: { label: '전문가 검토 필요', color: 'text-purple-400' },
            };
            const cfg = TIER_LABELS[docs[0].releaseTier!] ?? { label: docs[0].releaseTier, color: 'text-neutral-400' };
            return (
              <span className={`text-[10px] font-medium mt-0.5 ${cfg.color}`}>
                📋 {cfg.label}
              </span>
            );
          })()}
        </div>
      </h2>

      {/* 비동기 생성 진행률 바 (IM-1) */}
      {generationStatus !== 'idle' && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="flex items-center gap-2 text-primary font-bold">
              {generationStatus !== 'complete' && generationStatus !== 'error' && (
                <span className="animate-spin inline-block">⏳</span>
              )}
              {generationStatus === 'analyzing' && 'AI가 건물 데이터를 분석 중...'}
              {generationStatus === 'writing' && 'IM 섹션 및 재무 모델을 작성 중...'}
              {generationStatus === 'validating' && '품질 게이트 검증 중...'}
              {generationStatus === 'complete' && '✅ IM 생성 완료!'}
              {generationStatus === 'error' && '❌ 생성 실패'}
            </span>
            <span className="text-muted-foreground font-mono">{generationProgress}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                generationStatus === 'error' ? 'bg-rose-500' : 'bg-primary'
              }`}
              style={{ width: `${generationProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Basic/Pro IM 비교 인포카드 (IM-2) */}
      <details className="rounded-lg border border-border/80 bg-muted/20 p-3 text-xs group">
        <summary className="font-bold text-amber-400 cursor-pointer flex items-center justify-between">
          <span>ℹ️ 데이터 등급별 IM 구성</span>
          <span className="text-[10px] text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="mt-3 text-muted-foreground pt-2 border-t border-border/40">
          <div className="space-y-2 text-xs text-muted-foreground">
            <p><span className="font-bold text-foreground">🟢 A등급</span> — 건물 요약, 입지 분석, 임대 현황, 투자 하이라이트 + DCF 현금흐름, 수익률 민감도, 대출 시뮬레이션</p>
            <p><span className="font-bold text-foreground">🟡 B등급</span> — 건물 요약, 입지 분석, 임대 현황, 기본 투자 하이라이트</p>
            <p><span className="font-bold text-foreground">🟠 C등급</span> — 건물 기본 정보 요약 (데이터 보강 권장)</p>
          </div>
        </div>
      </details>

      {/* IM Card */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-sm">투자설명서 (IM)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">주소 입력만으로 즉시 생성 · 모바일 웹 뷰어 + 7p PPTX/PDF</p>
          </div>
          <div className="text-xs font-medium">
            {basicDoc ? (
              <span className="text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">✅ 생성됨 ({new Date(basicDoc.created_at).toLocaleDateString()})</span>
            ) : (
              <span className="text-blue-500 bg-blue-500/10 px-2 py-1 rounded-full">⚡ 즉시 생성 가능</span>
            )}
          </div>
        </div>
        
        {basicDoc ? (
          <div className="space-y-3 mt-2">
            <Link
              href={`/im-lite/${buildingId}`}
              target="_blank"
              className="flex items-center justify-center gap-2 w-full h-10 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98]"
            >
              <span>📱</span> IM 바로가기 (웹 뷰어 열기)
            </Link>

            <div className="flex items-center gap-2 pt-1">
              <span className="w-3 h-3 rounded-full flex-shrink-0 border border-border" style={{ background: PRESET_SWATCHES[selectedPreset]?.accent ?? '#6B8E00' }} />
              <select 
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value)}
                className="flex-1 h-7 rounded-md border border-border bg-background text-[11px] px-2 focus:ring-1 focus:ring-blue-500 outline-none"
              >
                {Object.entries(PRESET_SWATCHES).map(([id, s]) => (
                  <option key={id} value={id}>{s.name}</option>
                ))}
                {presets.map((p: any) => (
                  <option key={p.id} value={p.id}>🎨 {p.preset_name ?? p.name} (커스텀)</option>
                ))}
              </select>
              <Link 
                href={`/broker/deal-card/${buildingId}/pptx-editor`}
                className="text-[10px] text-amber-500 hover:text-amber-400 whitespace-nowrap"
              >
                ✏️ 편집
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <Button size="sm" variant="secondary" className="text-xs h-8 font-medium" onClick={() => handleExport('export')} disabled={!!isExporting}>
                {isExporting === 'pdf' ? '⏳ 생성중...' : exportDone === 'pdf' ? '✅ 완료' : '📄 PDF'}
              </Button>
              <Button size="sm" variant="secondary" className="text-xs h-8 font-medium" onClick={() => handleExport('pptx')} disabled={!!isExporting}>
                {isExporting === 'pptx' ? '⏳ 생성중...' : exportDone === 'pptx' ? '✅ 완료' : '📊 PPTX'}
              </Button>
              <Button size="sm" variant="secondary" className="text-xs h-8 font-medium" onClick={() => handleCopyLink('basic')}>
                🔗 링크복사
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-8 font-medium text-muted-foreground hover:text-foreground" onClick={() => handleGenerateIM('basic')}>
                ♻️ 재생성
              </Button>
            </div>
          </div>
        ) : (
          <Button 
            size="sm" 
            className="mt-2 h-9 w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-sm"
            onClick={() => handleGenerateIM('basic')}
            disabled={generationStatus !== 'idle'}
          >
            {generationStatus !== 'idle' ? '⏳ IM 생성 중...' : '⚡ IM 생성하기'}
          </Button>
        )}
      </div>

    </div>
  );
}
