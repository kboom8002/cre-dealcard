'use client';

import React, { useRef, useState } from 'react';

interface TenantRow {
  floor: string;
  area_sqm: number;
  tenant_type: string;
  monthly_rent: number | null;
  deposit: number | null;
  contract_end: string | null;
  is_anchor: boolean;
  tenant_name: string | null;
}

interface LeasePhotoOcrProps {
  onImport: (tenants: TenantRow[]) => void;
}

/**
 * 임대현황표 사진 OCR 진입점.
 *
 * P0-SEC(SEC-6): 서버 OCR 라우트(`/api/broker/studio/lease/ocr`)가 아직 구현되지 않았다.
 * 과거에는 실패 시 가짜 임차인 데이터를 렌트롤에 주입하고 `dummy-token` 을 보냈다 — 실제 매물 IM 에
 * 허위 임차인이 섞이는 결함이므로 제거했다. 라우트가 준비될 때까지 진입점은 "준비 중" 비활성 상태로 노출한다.
 * 라우트 구현 후 이 플래그를 true 로 바꾸면 업로드가 활성화된다(인증은 세션 쿠키, 실패 시 아무것도 삽입하지 않음).
 */
export const LEASE_PHOTO_OCR_ENABLED = false;
const OCR_ENDPOINT = '/api/broker/studio/lease/ocr';

export function LeasePhotoOcr({ onImport }: LeasePhotoOcrProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // 인증은 same-origin 세션 쿠키로만 수행한다(임의 토큰 헤더를 만들지 않음).
      const res = await fetch(OCR_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('사진 인식에 실패했습니다. 임대 정보는 추가되지 않았습니다. 파일 업로드 또는 직접 입력을 이용해 주세요.');
      }

      const data = await res.json();
      if (!Array.isArray(data?.tenants) || data.tenants.length === 0) {
        throw new Error('사진에서 임대 정보를 찾지 못했습니다. 임대 정보는 추가되지 않았습니다.');
      }
      onImport(data.tenants as TenantRow[]);
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : '사진 분석 중 오류가 발생했습니다. 임대 정보는 추가되지 않았습니다.',
      );
    } finally {
      setLoading(false);
      resetInput();
    }
  };

  if (!LEASE_PHOTO_OCR_ENABLED) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="임대현황표 사진 인식 기능은 준비 중입니다. 파일 업로드 또는 직접 입력을 이용해 주세요."
        className="px-4 py-2 bg-neutral-900 border border-neutral-800 text-neutral-500 rounded-xl text-xs font-bold flex items-center gap-2 cursor-not-allowed opacity-60"
      >
        <span>📸 사진 인식 (준비 중)</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => fileInputRef.current?.click()}
        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-white"></div>
            <span>사진 분석 중...</span>
          </>
        ) : (
          <span>📸 임대현황표 사진 촬영</span>
        )}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-400 font-bold">
          {error}
        </span>
      )}
    </div>
  );
}
