"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { toast } from "sonner";
import { PptxAuditReportView, type PptxAuditData } from "@/components/im/pptx-audit-report-view";
import { useDealcardRealtimeSync } from "@/platform/im-pipeline/realtime/use-dealcard-realtime-sync";
import { BrandColorCard } from "./brand-color-card";
import { humanizeImExportError, humanizeBrokerError } from "@/constants/ui-lexicon";

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
  approval_stage?: string;
  pptx_file_hash?: string;
  pptx_download_url?: string;
  status?: string;
}


const PRESET_SWATCHES: Record<string, { accent: string; name: string }> = {
  credeal_basic: { accent: '#B8860B', name: '📋 기본 표준 (브랜드 색상 적용)' },
  credeal_signature: { accent: '#6B8E00', name: '올리브 골드 (Signature)' },
  golden_institutional: { accent: '#B98A2E', name: '골든 클래식 (Institutional)' },
  executive_gold: { accent: '#B8862D', name: '이그제큐티브 골드' },
  corporate_clean: { accent: '#059669', name: '에메랄드 클린' },
  minimal_clean: { accent: '#3B5B8C', name: '네이비 미니멀' },
  warm_beige: { accent: '#8C5A2B', name: '웜 베이지' },
  wine_burgundy: { accent: '#8E2B3C', name: '와인 버건디' },
  mono_contrast: { accent: '#595959', name: '모노 고대비' },
  pro_dark_obsidian: { accent: '#0284A8', name: '다크 옵시디언' },
};

export function ImManagementPanel({
  buildingId,
  currentGrade,
  currentScore,
}: ImManagementPanelProps) {
  const [docs, setDocs] = useState<ImDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState("credeal_basic");
  const [presets, setPresets] = useState<any[]>([]);

  // 비동기 생성 + 진행률 상태 (IM-1)
  const [generationStatus, setGenerationStatus] = useState<
    'idle' | 'analyzing' | 'writing' | 'validating' | 'complete' | 'error'
  >('idle');
  const [generationProgress, setGenerationProgress] = useState(0);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visibilityListenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (visibilityListenerRef.current) document.removeEventListener('visibilitychange', visibilityListenerRef.current);
    };
  }, []);

  const fetchDocs = async () => {
    try {
      const res = await fetch(`/api/broker/im-lite/${buildingId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.documents) {
          if (data.documents.length > 0) {
            const latestDoc = data.documents[0];
            const presetFromDoc = latestDoc.body?.preset || (latestDoc.body?.tier === 'basic' ? 'credeal_basic' : undefined);
            if (presetFromDoc) {
              setSelectedPreset(presetFromDoc);
            }
          }
          setDocs((data.documents || []).map((d: any) => ({
            id: d.id,
            created_at: d.created_at,
            tier: d.body?.tier || 'basic',
            releaseTier: d.body?.releaseTier,
            approval_stage: d.approval_stage || d.body?.approval_stage,
            pptx_file_hash: d.pptx_file_hash || d.body?.pptx_file_hash,
            pptx_download_url: d.pptx_download_url || d.body?.pptx_download_url,
            status: d.status,
          })));
        }
      }
    } catch (err) {
      console.error("Failed to fetch IM docs", err);
    } finally {
      setIsLoading(false);
    }
  };

  useDealcardRealtimeSync(buildingId, {
    onContentMutated: () => {
      fetchDocs();
    },
    onApprovalChanged: () => {
      fetchDocs();
    },
  });

  useEffect(() => {
    async function fetchPresets() {
      try {
        const res = await fetch('/api/broker/pptx-preset');
        if (res.ok) {
          const data = await res.json();
          setPresets(data.presets || [...(data.my_presets || []), ...(data.company_presets || [])]);
        }
      } catch (err) {
        console.error("Failed to fetch presets", err);
      }
    }

    fetchDocs();
    fetchPresets();
  }, [buildingId]);


  const basicDoc = docs.find(d => d.tier === 'basic') || docs[0];

  const handleCopyLink = (tier: 'basic' | 'pro') => {
    const url = `${window.location.origin}/im-${tier === 'basic' ? 'lite' : 'pro'}/${buildingId}`;
    navigator.clipboard.writeText(url);
    toast.success('모바일 투자설명서 링크가 복사되었습니다. 카카오톡에 붙여넣으세요.');
  };

  // 비동기 IM 생성 핸들러 (IM-1 & IM-5)
  const handleGenerateIM = async (tier: 'basic' | 'pro') => {
    setGenerationStatus('analyzing');
    setGenerationProgress(15);
    try {
      const res = await fetch('/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingId,
          tier,
          preset: tier === 'basic' ? 'credeal_basic' : selectedPreset,
        }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const { jobId } = await res.json();

      const onVisibilityChange = async () => {
        if (document.hidden) return;
        try {
          const statusRes = await fetch(`/api/broker/im-lite/job-status?jobId=${jobId}`);
          if (!statusRes.ok) return;
          const job = await statusRes.json();
          const { status } = job;
          if (status === 'completed' || status === 'complete') {
            setGenerationStatus('complete');
            setGenerationProgress(100);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (visibilityListenerRef.current) document.removeEventListener('visibilitychange', visibilityListenerRef.current);
            pollIntervalRef.current = null;
            visibilityListenerRef.current = null;
            toast.success('투자설명서(IM) 생성이 완료되었습니다.');
            await fetchDocs();
            setTimeout(() => setGenerationStatus('idle'), 2500);
          }
          if (status === 'failed' || status === 'error') {
            setGenerationStatus('error');
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (visibilityListenerRef.current) document.removeEventListener('visibilitychange', visibilityListenerRef.current);
            pollIntervalRef.current = null;
            visibilityListenerRef.current = null;
            const errorMsg = humanizeBrokerError(job.result?.error || job.error, '투자설명서 생성 중 오류가 발생했습니다.');
            toast.error(errorMsg);
            setTimeout(() => setGenerationStatus('idle'), 3000);
          }
        } catch { /* 네트워크 에러 — 다음 폴링에서 재시도 */ }
      };
      visibilityListenerRef.current = onVisibilityChange;
      document.addEventListener('visibilitychange', onVisibilityChange);

      const MAX_POLL_MS = 300_000;
      const pollStart = Date.now();
      const pollInterval = setInterval(async () => {
        const elapsedSec = Math.floor((Date.now() - pollStart) / 1000);
        if (Date.now() - pollStart > MAX_POLL_MS) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (visibilityListenerRef.current) document.removeEventListener('visibilitychange', visibilityListenerRef.current);
          pollIntervalRef.current = null;
          visibilityListenerRef.current = null;
          setGenerationStatus('error');
          toast.error('투자설명서 생성 시간이 초과되었습니다. 다시 시도해 주세요.');
          setTimeout(() => setGenerationStatus('idle'), 3000);
          return;
        }
        try {
          const statusRes = await fetch(`/api/broker/im-lite/job-status?jobId=${jobId}`);
          if (!statusRes.ok) return;
          const job = await statusRes.json();
          const { status, progress } = job;
          // 실제 경과 시간 기반 점진 진행률 표시 (50% 고정 현상 방지)
          const dynamicProgress = progress || Math.min(92, 15 + Math.floor(elapsedSec * 0.8));
          setGenerationProgress(dynamicProgress);

          if (status === 'writing' || elapsedSec > 18) setGenerationStatus('writing');
          if (status === 'validating' || elapsedSec > 55) setGenerationStatus('validating');
          if (status === 'completed' || status === 'complete') {
            setGenerationStatus('complete');
            setGenerationProgress(100);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (visibilityListenerRef.current) document.removeEventListener('visibilitychange', visibilityListenerRef.current);
            pollIntervalRef.current = null;
            visibilityListenerRef.current = null;
            toast.success('투자설명서(IM) 생성이 완료되었습니다.');
            await fetchDocs();
            setTimeout(() => setGenerationStatus('idle'), 2500);
          }
          if (status === 'failed' || status === 'error') {
            setGenerationStatus('error');
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (visibilityListenerRef.current) document.removeEventListener('visibilitychange', visibilityListenerRef.current);
            pollIntervalRef.current = null;
            visibilityListenerRef.current = null;
            const errorMsg = humanizeBrokerError(job.result?.error || job.error, '투자설명서 생성 중 오류가 발생했습니다.');
            toast.error(errorMsg);
            setTimeout(() => setGenerationStatus('idle'), 3000);
          }
        } catch {
          // Keep polling
        }
      }, 2000);
      pollIntervalRef.current = pollInterval;
    } catch {
      setGenerationStatus('error');
      toast.error('투자설명서 생성 요청에 실패했습니다.');
      setTimeout(() => setGenerationStatus('idle'), 3000);
    }
  };

  // 내보내기 진행률 핸들러 (IM-3)
  const [isExporting, setIsExporting] = useState<string | null>(null); // 'pdf' | 'pptx' | null
  const [exportDone, setExportDone] = useState<string | null>(null);
  const [exportError, setExportError] = useState<{ title: string; detail: string } | null>(null);
  // D35 §4: PPTX 셀프 검증 감사 결과
  const [lastAudit, setLastAudit] = useState<PptxAuditData | null>(null);

  const handleExport = async (format: 'export' | 'pptx') => {
    const tier = 'basic';
    const ext = format === 'export' ? 'pdf' : 'pptx';
    setIsExporting(ext);
    setExportDone(null);
    setExportError(null);
    const toastId = toast.loading(`${ext.toUpperCase()} 투자설명서 파일을 준비하고 있습니다 (약 10~20초)...`);
    try {
      const url = `/api/public/im-lite/${buildingId}/${format}?tier=${tier}&preset=${selectedPreset}&watermark=false&direct=1`;
      const res = await fetch(url);
      if (!res.ok) {
        let errPayload: any = null;
        try {
          errPayload = await res.json();
        } catch {
          errPayload = null;
        }
        const humanized = humanizeImExportError(res.status, errPayload, ext as 'pptx' | 'pdf');
        setExportError(humanized);
        toast.error(`${humanized.title} ${humanized.detail}`, { id: toastId, duration: 6000 });
        return;
      }

      // D35 §4: PPTX 셀프 검증 감사 결과 추출 (direct=1 응답으로 헤더 보존됨)
      if (ext === 'pptx') {
        try {
          const auditViolations = parseInt(res.headers.get('X-Audit-Violations') ?? '0', 10);
          const layoutRaw = res.headers.get('X-Audit-Layout');
          const standardRaw = res.headers.get('X-Audit-Standard');
          const layoutViolations = layoutRaw ? JSON.parse(decodeURIComponent(layoutRaw)) : [];
          const standardViolations = standardRaw ? JSON.parse(decodeURIComponent(standardRaw)) : [];
          const slideCount = parseInt(res.headers.get('X-Slide-Count') ?? '0', 10);

          setLastAudit({
            layoutViolations,
            standardViolations,
            totalViolations: auditViolations,
            slideCount,
          });
        } catch {
          // 감사 헤더 파싱 실패 — 무시
        }
      }

      const safeHeader = res.headers.get('X-Safe-Filename');
      const downloadName = safeHeader
        ? decodeURIComponent(safeHeader)
        : `투자설명서_Basic_IM.${ext}`;

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success(`${ext.toUpperCase()} 파일 다운로드가 완료되었습니다.`, { id: toastId });
      setExportDone(ext);
      setTimeout(() => setExportDone(null), 3000);
    } catch {
      const humanized = humanizeImExportError(500, null, ext as 'pptx' | 'pdf');
      setExportError(humanized);
      toast.error(humanized.title, { id: toastId });
    } finally {
      setIsExporting(null);
    }
  };

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
      <h2 className="text-[16px] font-bold flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span>📊</span> 투자설명서 (Basic IM) 관리
        </span>
        <div className="flex flex-col items-end text-right">
          <span className={`text-[14px] font-bold ${
            currentGrade === 'A' ? 'text-emerald-400' :
            currentGrade === 'B' ? 'text-blue-400' :
            currentGrade === 'C' ? 'text-amber-400' : 'text-rose-400'
          }`}>
            정보 충실도 {currentGrade}등급 ({currentScore}점)
          </span>
          {(currentGrade === 'C' || currentGrade === 'D') && (
            <span className="text-[13px] text-slate-300 mt-0.5">
              💡 주소·매매가·임대료 입력 시 품질 향상
            </span>
          )}
          {docs[0]?.releaseTier && (() => {
            const TIER_LABELS: Record<string, { label: string; color: string }> = {
              internal_only:   { label: '내부 검토용',       color: 'text-neutral-300' },
              fact_om:         { label: '기본 사실 요약본',  color: 'text-amber-300' },
              analysis_im:     { label: '표준 투자설명서',   color: 'text-blue-300' },
              decision_im:     { label: '심층 투자설명서',   color: 'text-emerald-300' },
              expert_required: { label: '전문가 확인 권장',  color: 'text-purple-300' },
            };
            const cfg = TIER_LABELS[docs[0].releaseTier!] ?? { label: '표준 투자설명서', color: 'text-neutral-300' };
            return (
              <span className={`text-[13px] font-medium mt-0.5 ${cfg.color}`}>
                📋 {cfg.label}
              </span>
            );
          })()}
        </div>
      </h2>

      {/* 비동기 생성 진행률 바 (IM-1) */}
      {generationStatus !== 'idle' && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between text-[14px] font-medium">
            <span className="flex items-center gap-2 text-primary font-bold">
              {generationStatus !== 'complete' && generationStatus !== 'error' && (
                <span className="animate-spin inline-block">⏳</span>
              )}
              {generationStatus === 'analyzing' && '건물 대장·토지·공시지가를 조회하고 있습니다...'}
              {generationStatus === 'writing' && '표준 9면 투자설명서 문구와 수익률을 작성 중입니다...'}
              {generationStatus === 'validating' && '수치와 면적 정확도를 최종 점검하고 있습니다...'}
              {generationStatus === 'complete' && '✅ 투자설명서 생성 완료!'}
              {generationStatus === 'error' && '❌ 생성 실패'}
            </span>
            <span className="text-slate-300 font-mono">{generationProgress}%</span>
          </div>
          <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                generationStatus === 'error' ? 'bg-rose-500' : 'bg-primary'
              }`}
              style={{ width: `${generationProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* 다운로드 실패 시 명확한 한국어 안내 박스 */}
      {exportError && (
        <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
          <p className="text-[15px] font-bold text-amber-300">⚠️ {exportError.title}</p>
          <p className="text-[14px] text-slate-200 leading-relaxed">{exportError.detail}</p>
          <button
            type="button"
            onClick={() => {
              setExportError(null);
              window.dispatchEvent(new CustomEvent("open-mobile-im-sheet", { detail: { stage: "basic" } }));
            }}
            className="mt-1 inline-flex items-center justify-center rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[14px] px-4 py-2 min-h-[42px] transition-colors"
          >
            ✏️ 건물 정보 보완하고 다시 만들기
          </button>
        </div>
      )}

      {/* IM Card */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3.5">
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <div>
            <h3 className="font-bold text-[16px]">한국형 표준 투자설명서 (Basic IM)</h3>
            <p className="text-[13px] text-slate-300 mt-0.5">PC 인쇄·편집용 9면 PPTX + 고객 공유용 웹 뷰어</p>
          </div>
          <div className="text-[13px] font-medium">
            {basicDoc ? (
              basicDoc.approval_stage === 'S70_FILE_APPROVAL' || basicDoc.status === 'published' ? (
                <span className="text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 rounded-full font-bold">
                  ✓ 공개 승인 완료 ({new Date(basicDoc.created_at).toLocaleDateString()})
                </span>
              ) : basicDoc.approval_stage === 'S60_EDITORIAL_APPROVAL' ? (
                <span className="text-blue-300 bg-blue-500/20 border border-blue-500/40 px-2.5 py-1 rounded-full font-bold">
                  📋 내용 확인 완료 ({new Date(basicDoc.created_at).toLocaleDateString()})
                </span>
              ) : (
                <span className="text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full font-bold">
                  ✅ 다운로드 준비됨 ({new Date(basicDoc.created_at).toLocaleDateString()})
                </span>
              )
            ) : (
              <span className="text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full font-bold">⚡ 생성 가능</span>
            )}
          </div>
        </div>
        
        {basicDoc ? (
          <div className="space-y-3 mt-2">
            {/* 1순위: 슬라이드 미리보기·편집 스튜디오 (Primary) + 바로 다운로드 (Secondary) 병렬 배치 */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <Link
                href={`/broker/basic-im-studio/${buildingId}?preset=${encodeURIComponent(selectedPreset)}`}
                className="sm:col-span-7 flex items-center justify-center gap-2 min-h-[54px] px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-[15px] sm:text-[16px] shadow-lg transition-all active:scale-[0.99]"
              >
                <span>📐</span>
                <span>슬라이드 미리보기 · 편집 후 다운로드</span>
              </Link>
              <button
                type="button"
                onClick={() => handleExport('pptx')}
                disabled={!!isExporting}
                className="sm:col-span-5 flex items-center justify-center gap-1.5 min-h-[54px] px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 font-extrabold text-[14px] sm:text-[15px] shadow-sm transition-all active:scale-[0.99] disabled:opacity-60"
              >
                <span>⚡</span>
                <span>
                  {isExporting === 'pptx'
                    ? '생성 중...(10~20초)'
                    : exportDone === 'pptx'
                    ? '✅ 다운로드 완료!'
                    : 'PPTX 바로 다운로드'}
                </span>
              </button>
            </div>

            {/* 프리셋 테마 선택 + 실시간 스튜디오 안내 */}
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[13px] font-bold text-slate-200 shrink-0">🎨 PPTX 테마:</span>
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0 border border-white/30 shadow-sm"
                    style={{ background: PRESET_SWATCHES[selectedPreset]?.accent ?? '#B8860B' }}
                  />
                  <select 
                    value={selectedPreset}
                    onChange={(e) => setSelectedPreset(e.target.value)}
                    aria-label="PPTX 색상 테마 프리셋 선택"
                    className="flex-1 h-9 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 text-[13px] font-semibold px-2.5 focus:ring-1 focus:ring-amber-500 outline-none"
                  >
                    {Object.entries(PRESET_SWATCHES).map(([id, s]) => (
                      <option key={id} value={id}>{s.name}</option>
                    ))}
                    {presets.map((p: any) => (
                      <option key={p.id} value={p.id}>🎨 {p.preset_name ?? p.name} (내 브랜드)</option>
                    ))}
                  </select>
                </div>
                <Link 
                  href={`/broker/basic-im-studio/${buildingId}?preset=${encodeURIComponent(selectedPreset)}`}
                  className="text-[12px] font-bold text-amber-300 hover:text-amber-200 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 transition-colors"
                >
                  ✨ 10종 테마 미리보기
                </Link>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {Object.entries(PRESET_SWATCHES).map(([id, s]) => {
                  const active = selectedPreset === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedPreset(id)}
                      title={s.name}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold shrink-0 border transition-all ${
                        active
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.accent }} />
                      <span>{s.name.replace(/^📋\s*/, '').split(' (')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/im-lite/${buildingId}`}
                target="_blank"
                className="flex items-center justify-center gap-1.5 min-h-[46px] rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-[14px] shadow-sm transition-all"
              >
                <span>🖥️</span> 웹 화면으로 보기
              </Link>
              <button
                type="button"
                onClick={() => handleCopyLink('basic')}
                className="flex items-center justify-center gap-1.5 min-h-[46px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-[14px] transition-all"
              >
                <span>📋</span> 카톡 공유용 주소 복사
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" className="text-[14px] h-10 font-semibold" onClick={() => handleExport('export')} disabled={!!isExporting}>
                {isExporting === 'pdf' ? '⏳ PDF 준비 중...' : exportDone === 'pdf' ? '✅ PDF 완료' : '📄 PDF로 받기'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-[14px] h-10 font-semibold text-slate-300 hover:text-white"
                onClick={() => window.dispatchEvent(new CustomEvent("open-mobile-im-sheet", { detail: { stage: "basic" } }))}
              >
                ♻️ 입력 정보 수정 후 재생성
              </Button>
            </div>

            {/* D35 §4: PPTX 셀프 검증 감사 리포트 */}
            {lastAudit && (
              <div className="mt-3">
                <PptxAuditReportView audit={lastAudit} />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2">
            <Button 
              size="sm" 
              className="w-full min-h-[48px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-[15px] shadow-sm"
              onClick={() => window.dispatchEvent(new CustomEvent("open-mobile-im-sheet", { detail: { stage: "basic" } }))}
              disabled={generationStatus !== 'idle'}
            >
              {generationStatus !== 'idle' ? '⏳ 투자설명서 생성 중...' : '⚡ 표준 투자설명서 (Basic IM) 만들기'}
            </Button>
            {/* DORMANT: ux60-focus — Pro IM 버튼 숨김 (복원 시 docs/rollback/2026-10-18-dormant-features.md 참조)
            <Button 
              size="sm" 
              variant="outline"
              className="h-9 font-bold text-xs border-amber-600/50 text-amber-700 hover:bg-amber-50"
              onClick={() => handleGenerateIM('pro')}
              disabled={generationStatus !== 'idle'}
            >
              🎯 전문 IM
            </Button>
            */}
          </div>
        )}
        <BrandColorCard />
      </div>

    </div>
  );
}
