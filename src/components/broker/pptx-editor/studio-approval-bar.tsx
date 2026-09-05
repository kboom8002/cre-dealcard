'use client';

import React from 'react';
import type { StudioStage } from '@/domain/building/pptx-studio/project/types';

interface StudioApprovalBarProps {
  projectId: string;
  stage: StudioStage;
  editorialApprovedBy?: string;
  editorialApprovedAt?: string;
  fileApprovedBy?: string;
  fileApprovedAt?: string;
  artifactFileHash?: string;
  onApproveEditorial: () => Promise<void>;
  onApproveFile: () => Promise<void>;
  onDownloadOfficial: () => void;
  onDownloadDraftPreview: () => void;
  isEditorialLoading?: boolean;
  isFileLoading?: boolean;
}

export function StudioApprovalBar({
  projectId,
  stage,
  editorialApprovedBy,
  editorialApprovedAt,
  fileApprovedBy,
  fileApprovedAt,
  artifactFileHash,
  onApproveEditorial,
  onApproveFile,
  onDownloadOfficial,
  onDownloadDraftPreview,
  isEditorialLoading = false,
  isFileLoading = false,
}: StudioApprovalBarProps) {
  const isS60Done = stage === 'S60_EDITORIAL_APPROVAL' || stage === 'S70_FILE_APPROVAL';
  const isS70Done = stage === 'S70_FILE_APPROVAL';

  return (
    <div className="w-full bg-slate-900/95 border-b border-slate-700/80 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-md backdrop-blur">
      {/* Left: Sequential Stage Pipeline Indicator */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-400 mr-1">발행 파이프라인:</span>

        {/* S40: Preview */}
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
            ✓
          </span>
          <span className="text-xs font-medium text-slate-200">S40 미리보기</span>
        </div>

        <span className="text-slate-600">→</span>

        {/* S60: Editorial Approval */}
        <div className="flex items-center gap-1.5">
          <span
            className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
              isS60Done
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-600 text-white animate-pulse'
            }`}
          >
            {isS60Done ? '✓' : '1'}
          </span>
          <span
            className={`text-xs font-medium ${
              isS60Done ? 'text-emerald-300' : 'text-slate-300'
            }`}
          >
            S60 편집 승인
          </span>
        </div>

        <span className="text-slate-600">→</span>

        {/* S70: File Binary Hash Approval */}
        <div className="flex items-center gap-1.5">
          <span
            className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
              isS70Done
                ? 'bg-emerald-600 text-white'
                : isS60Done
                ? 'bg-amber-600 text-white animate-pulse'
                : 'bg-slate-700 text-slate-400'
            }`}
          >
            {isS70Done ? '✓' : '2'}
          </span>
          <span
            className={`text-xs font-medium ${
              isS70Done
                ? 'text-emerald-300'
                : isS60Done
                ? 'text-slate-200'
                : 'text-slate-500'
            }`}
          >
            S70 파일 바이너리 승인
          </span>
        </div>

        <span className="text-slate-600">→</span>

        {/* Published */}
        <div className="flex items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
              isS70Done
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                : 'bg-slate-800 text-slate-500 border border-slate-700'
            }`}
          >
            {isS70Done ? 'PUBLISHED' : 'DRAFT'}
          </span>
        </div>

        {artifactFileHash && (
          <span className="hidden xl:inline-block ml-3 font-mono text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
            Hash: {artifactFileHash.substring(0, 16)}...
          </span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Stage 1: Editorial Approval (S60) */}
        {!isS60Done ? (
          <button
            type="button"
            onClick={onApproveEditorial}
            disabled={isEditorialLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors shadow-sm disabled:opacity-50"
          >
            {isEditorialLoading ? (
              <span className="animate-spin mr-1">⏳</span>
            ) : (
              <span>📝</span>
            )}
            1단계: 슬라이드 편집 승인 (S60)
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium bg-emerald-950/40 border border-emerald-800/50 px-3 py-1.5 rounded-lg">
            <span>✓</span> 1단계 승인 완료 ({editorialApprovedBy || '브로커'})
          </span>
        )}

        {/* Stage 2: File Binary Approval (S70) */}
        {!isS70Done ? (
          <button
            type="button"
            onClick={onApproveFile}
            disabled={!isS60Done || isFileLoading}
            title={
              !isS60Done
                ? 'S60 편집 승인이 선행되어야 파일 바이너리 승인이 가능합니다'
                : '최종 PPTX 바이너리 해시 승인'
            }
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm ${
              isS60Done
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            {isFileLoading ? (
              <span className="animate-spin mr-1">⏳</span>
            ) : (
              <span>🔒</span>
            )}
            2단계: PPTX 바이너리 해시 승인 (S70)
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium bg-emerald-950/40 border border-emerald-800/50 px-3 py-1.5 rounded-lg">
            <span>✓</span> 2단계 승인 완료 (원장 기록)
          </span>
        )}

        {/* Draft Download Button (Always available for testing/reviewing) */}
        <button
          type="button"
          onClick={onDownloadDraftPreview}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
        >
          초안 다운로드
        </button>

        {/* Official Download Action: Enabled upon S70 */}
        <button
          type="button"
          onClick={onDownloadOfficial}
          disabled={!isS70Done}
          title={
            isS70Done
              ? '원장에 등록된 공식 PPTX 다운로드'
              : 'S70 승인 완료 후 공식 다운로드가 활성화됩니다'
          }
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md ${
            isS70Done
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 ring-1 ring-emerald-400'
              : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-50'
          }`}
        >
          <span>📥</span> 공식 PPTX 다운로드
        </button>
      </div>
    </div>
  );
}
