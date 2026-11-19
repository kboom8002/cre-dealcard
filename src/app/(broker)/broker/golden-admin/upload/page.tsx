"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export default function GoldenUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ fileUrl: string; fileName: string; message: string } | null>(null);
  const [error, setError] = useState('');

  const validateFile = (f: File): string | null => {
    if (!ACCEPTED_TYPES.includes(f.type) && !f.name.endsWith('.pdf') && !f.name.endsWith('.pptx')) {
      return 'PDF 또는 PPTX 파일만 업로드할 수 있습니다.';
    }
    if (f.size > MAX_SIZE_BYTES) {
      return `파일 크기가 ${MAX_SIZE_MB}MB를 초과합니다.`;
    }
    return null;
  };

  const handleFile = (f: File) => {
    const err = validateFile(f);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setResult(null);
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress('파일 업로드 중...');
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/golden-sets/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const json = await res.json();
        setResult(json?.data ?? json);
        setProgress('');
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMessage =
          typeof errData?.error === 'string'
            ? errData.error
            : errData?.error?.message || '업로드에 실패했습니다.';
        setError(errMessage);
        setProgress('');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
      setProgress('');
    }
    setUploading(false);
  };

  const fileSizeStr = file ? (file.size / 1024 / 1024).toFixed(1) + 'MB' : '';
  const fileExt = file?.name.split('.').pop()?.toUpperCase() || '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="sm" onClick={() => router.push('/broker/golden-admin')}>
          ← 목록
        </Button>
        <h1 className="text-xl font-bold text-slate-900">📄 PPTX/PDF 업로드</h1>
      </div>

      <p className="text-sm text-slate-600 mb-6">
        기존 투자설명서(IM) 파일을 업로드하면 AI가 섹션을 분리하여 골든셋으로 변환합니다.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
          ${dragActive
            ? 'border-blue-500 bg-blue-50 scale-[1.02]'
            : 'border-slate-300 hover:border-slate-400 bg-white'
          }
        `}
      >
        <div className="text-4xl mb-3">{file ? (fileExt === 'PDF' ? '📕' : '📊') : '📂'}</div>
        {file ? (
          <div>
            <p className="font-semibold text-slate-900">{file.name}</p>
            <p className="text-sm text-slate-600 mt-1">{fileExt} · {fileSizeStr}</p>
          </div>
        ) : (
          <div>
            <p className="font-semibold text-slate-900">파일을 드래그하거나 클릭하여 선택</p>
            <p className="text-sm text-slate-600 mt-1">PDF, PPTX (최대 {MAX_SIZE_MB}MB)</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="hidden"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* Upload button */}
      {file && !result && (
        <div className="mt-4 flex justify-center">
          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white px-8 py-2"
          >
            {uploading ? progress : '🚀 업로드 시작'}
          </Button>
        </div>
      )}

      {/* Result */}
      {result && (
        <Card className="mt-6 p-5 bg-emerald-50 border-emerald-200">
          <div className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-emerald-800">{result.message}</p>
              <p className="text-sm text-slate-700 mt-1">파일: {result.fileName}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Parsed sections placeholder */}
      {result && (
        <Card className="mt-4 p-8 bg-white border-slate-200 text-center">
          <p className="text-3xl mb-3">🔬</p>
          <p className="text-slate-700 text-sm">
            파싱 결과가 여기에 표시됩니다
          </p>
          <p className="text-sm text-slate-600 mt-2">
            AI 섹션 분리 기능 — 파일 파서 연동 후 활성화
          </p>
        </Card>
      )}
    </div>
  );
}
