'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface JobStage {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface WorkspaceJob {
  id: string;
  title: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  stage?: string;
  progress?: number; // 0 to 100
  stages?: JobStage[];
  error?: string | null;
  startedAt?: string;
  resultUrl?: string;
}

export interface GlobalJobTrayProps {
  jobs?: WorkspaceJob[];
  activeJob?: WorkspaceJob | null;
  onCancel?: (jobId: string) => Promise<void> | void;
  onRetry?: (jobId: string) => void;
  onOpenResult?: (jobId: string, resultUrl?: string) => void;
  onReportIssue?: (jobId: string, error?: string) => void;
  defaultExpanded?: boolean;
}

export function GlobalJobTray({
  jobs = [],
  activeJob: propActiveJob,
  onCancel,
  onRetry,
  onOpenResult,
  onReportIssue,
  defaultExpanded = true,
}: GlobalJobTrayProps) {
  // Combine propActiveJob with jobs array if provided
  const allJobs = React.useMemo(() => {
    if (propActiveJob) {
      const exists = jobs.some((j) => j.id === propActiveJob.id);
      return exists ? jobs : [propActiveJob, ...jobs];
    }
    return jobs;
  }, [jobs, propActiveJob]);

  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [cancellingIds, setCancellingIds] = useState<Record<string, boolean>>({});
  const [lastAnnouncedStage, setLastAnnouncedStage] = useState<string>('');

  const runningJobs = allJobs.filter((j) => j.status === 'running' || j.status === 'queued');
  const completedJobs = allJobs.filter((j) => j.status === 'completed');
  const failedJobs = allJobs.filter((j) => j.status === 'failed');

  const currentJob = runningJobs[0] || failedJobs[0] || completedJobs[0] || allJobs[0];

  // Announce stage changes via aria-live
  useEffect(() => {
    if (currentJob?.stage && currentJob.stage !== lastAnnouncedStage) {
      setLastAnnouncedStage(currentJob.stage);
    }
  }, [currentJob?.stage, lastAnnouncedStage]);

  const handleCancelClick = useCallback(
    async (jobId: string) => {
      setCancellingIds((prev) => ({ ...prev, [jobId]: true }));
      try {
        if (onCancel) {
          await onCancel(jobId);
        } else {
          // Default: call cancel API route
          await fetch(`/api/broker/jobs/${jobId}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch (err) {
        console.error('Failed to cancel job:', err);
      } finally {
        setCancellingIds((prev) => ({ ...prev, [jobId]: false }));
      }
    },
    [onCancel]
  );

  if (allJobs.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="서버 작업 진행 상태 트레이"
      className="fixed bottom-4 right-4 z-50 max-w-md w-[calc(100vw-2rem)] sm:w-96 select-none"
    >
      <div
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {currentJob
          ? `${currentJob.title}: 상태 ${currentJob.status}, ${currentJob.stage || ''}`
          : ''}
      </div>

      <div className="bg-white text-slate-900 rounded-2xl shadow-2xl border-2 border-[#64748B] overflow-hidden">
        {/* Tray Header */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {runningJobs.length > 0 ? (
              <span className="inline-block w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
            ) : completedJobs.length > 0 ? (
              <span className="inline-block w-3 h-3 rounded-full bg-emerald-400" />
            ) : (
              <span className="inline-block w-3 h-3 rounded-full bg-rose-400" />
            )}
            <h3 className="font-extrabold text-[16px] tracking-tight">
              {runningJobs.length > 0
                ? `진행 중인 작업 (${runningJobs.length}건)`
                : '작업 완료'}
            </h3>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm font-bold text-slate-300 hover:text-white px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
            aria-expanded={isExpanded}
          >
            {isExpanded ? '접기 ▲' : '자세히 보기 ▼'}
          </button>
        </div>

        {/* Tray Content */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="p-4 space-y-4"
            >
              {allJobs.map((job) => {
                const isRunning = job.status === 'running' || job.status === 'queued';
                const isCompleted = job.status === 'completed';
                const isFailed = job.status === 'failed';
                const isCancelling = !!cancellingIds[job.id];
                const progressPct = Math.min(100, Math.max(0, job.progress ?? (isCompleted ? 100 : 35)));

                return (
                  <div
                    key={job.id}
                    className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 space-y-3"
                  >
                    {/* Job Title & Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[15px] text-slate-900 truncate">
                        {job.title}
                      </span>
                      <span
                        className={`text-sm px-2.5 py-0.5 rounded-full font-extrabold shrink-0 ${
                          isRunning
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : isCompleted
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-rose-100 text-rose-900 border border-rose-300'
                        }`}
                      >
                        {isRunning
                          ? '⏳ 만드는 중'
                          : isCompleted
                          ? '✓ 완성됨'
                          : '✕ 오류'}
                      </span>
                    </div>

                    {/* Progress Bar (0-100%) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm font-bold text-slate-600">
                        <span>{job.stage || (isRunning ? '작업 처리 중...' : isCompleted ? '완료' : '중단됨')}</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            isCompleted
                              ? 'bg-emerald-500'
                              : isFailed
                              ? 'bg-rose-500'
                              : 'bg-blue-600'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Server Stages Checklist (if available) */}
                    {job.stages && job.stages.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {job.stages.map((st) => (
                          <div
                            key={st.id}
                            className="flex items-center gap-2 text-sm font-medium text-slate-700"
                          >
                            {st.status === 'completed' && (
                              <span className="text-emerald-600 font-bold">✓</span>
                            )}
                            {st.status === 'in_progress' && (
                              <span className="text-blue-600 animate-spin">●</span>
                            )}
                            {st.status === 'pending' && (
                              <span className="text-slate-400">○</span>
                            )}
                            {st.status === 'failed' && (
                              <span className="text-rose-600 font-bold">✕</span>
                            )}
                            <span
                              className={
                                st.status === 'in_progress'
                                  ? 'font-bold text-blue-900'
                                  : st.status === 'completed'
                                  ? 'text-slate-600'
                                  : 'text-slate-400'
                              }
                            >
                              {st.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Helpful senior notice */}
                    {isRunning && (
                      <p className="text-sm text-slate-600 font-medium">
                        💡 다른 일을 하셔도 됩니다. 작업이 끝나면 알려 드립니다.
                      </p>
                    )}

                    {/* Failure details */}
                    {isFailed && job.error && (
                      <div className="text-sm text-rose-800 bg-rose-50 p-2 rounded border border-rose-200 font-medium">
                        {job.error}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      {isRunning && (
                        <button
                          type="button"
                          onClick={() => handleCancelClick(job.id)}
                          disabled={isCancelling}
                          className="w-full py-2 px-3 text-sm font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-sm transition disabled:opacity-50"
                        >
                          {isCancelling ? '멈추는 중...' : '작업 멈추기'}
                        </button>
                      )}

                      {isCompleted && (
                        <button
                          type="button"
                          onClick={() => onOpenResult?.(job.id, job.resultUrl)}
                          className="w-full py-2 px-3 text-sm font-extrabold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm transition"
                        >
                          결과 열기 →
                        </button>
                      )}

                      {isFailed && (
                        <>
                          <button
                            type="button"
                            onClick={() => onRetry?.(job.id)}
                            className="flex-1 py-2 px-3 text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
                          >
                            다시 만들기
                          </button>
                          <button
                            type="button"
                            onClick={() => onReportIssue?.(job.id, job.error || undefined)}
                            className="flex-1 py-2 px-3 text-sm font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition"
                          >
                            문제 알리기
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}
