'use client';

import React, { useState } from 'react';

export interface StudioPhotoItem {
  url: string;
  caption?: string;
  category?: string;
  included?: boolean;
}

interface GalleryCuratorProps {
  photos: StudioPhotoItem[];
  galleryLayout: string;
  onChangePhotos: (photos: StudioPhotoItem[]) => void;
  onChangeLayout: (layout: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  exterior: '외관 전면',
  entrance: '주출입구·로비',
  interior: '내부·기준층',
  road: '접면도로·전경',
  rooftop: '옥상·뷰',
  parking: '주차장·설비',
};

export function GalleryCurator({
  photos,
  galleryLayout,
  onChangePhotos,
  onChangeLayout,
}: GalleryCuratorProps) {
  const [newUrl, setNewUrl] = useState('');
  const [newCaption, setNewCaption] = useState('');

  const normalized: StudioPhotoItem[] = (Array.isArray(photos) ? photos : []).map((p: any, idx) =>
    typeof p === 'string'
      ? { url: p, caption: `현장 실사 사진 #${idx + 1}`, category: 'exterior', included: true }
      : {
          url: p?.url || '',
          caption: p?.caption || CATEGORY_LABELS[p?.category] || `현장 사진 #${idx + 1}`,
          category: p?.category || 'exterior',
          included: p?.included !== false && p?.excluded !== true,
        }
  );

  const toggleInclude = (idx: number) => {
    const next = normalized.map((item, i) =>
      i === idx ? { ...item, included: !item.included } : item
    );
    onChangePhotos(next);
  };

  const updateCaption = (idx: number, caption: string) => {
    const next = normalized.map((item, i) =>
      i === idx ? { ...item, caption } : item
    );
    onChangePhotos(next);
  };

  const movePhoto = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= normalized.length) return;
    const next = [...normalized];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    onChangePhotos(next);
  };

  const removePhoto = (idx: number) => {
    const next = normalized.filter((_, i) => i !== idx);
    onChangePhotos(next);
  };

  const handleAddPhoto = () => {
    if (!newUrl.trim()) return;
    const next: StudioPhotoItem[] = [
      ...normalized,
      {
        url: newUrl.trim(),
        caption: newCaption.trim() || `현장 사진 #${normalized.length + 1}`,
        category: 'exterior',
        included: true,
      },
    ];
    onChangePhotos(next);
    setNewUrl('');
    setNewCaption('');
  };

  const includedCount = normalized.filter(p => p.included !== false).length;

  return (
    <div className="space-y-4 text-[#0F172A]">
      {/* 갤러리 배치 스타일 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-[#0F172A]">
          사진 배치 레이아웃
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'grid_4', label: '2×2 4분할 그리드' },
            { id: 'hero_3', label: '대표 1 + 서브 3' },
            { id: 'split_2', label: '좌우 2분할 와이드' },
          ].map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => onChangeLayout(l.id)}
              className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all ${
                (galleryLayout || 'grid_4') === l.id
                  ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1E3A8A]'
                  : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* 사진 목록 및 순서/캡션 편집 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#0F172A]">
            등록된 현장 사진 ({includedCount}장 슬라이드 반영 / 총 {normalized.length}장)
          </span>
        </div>

        {normalized.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-dashed border-[#CBD5E1] text-center">
            <p className="text-xs font-bold text-[#334155]">
              등록된 현장 사진이 없습니다.
            </p>
            <p className="text-[11px] text-[#64748B] mt-0.5">
              아래에서 사진 URL을 추가하거나 딜카드 사진 탭에서 현장 사진을 업로드하세요.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {normalized.map((photo, idx) => (
              <div
                key={`${photo.url}-${idx}`}
                className={`p-2.5 rounded-xl border transition-all flex items-start gap-2.5 ${
                  photo.included !== false
                    ? 'border-[#CBD5E1] bg-white'
                    : 'border-[#E2E8F0] bg-[#F8FAFC] opacity-60'
                }`}
              >
                {/* Thumbnail preview */}
                <div className="w-16 h-12 rounded-lg overflow-hidden bg-[#E2E8F0] border border-[#CBD5E1] shrink-0 flex items-center justify-center relative">
                  {photo.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.url}
                      alt={photo.caption || '매물 사진'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-[#475569]">NO IMG</span>
                  )}
                  <span className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-black/75 text-white text-[9px] font-bold">
                    #{idx + 1}
                  </span>
                </div>

                {/* Caption & Controls */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input
                    type="text"
                    value={photo.caption || ''}
                    onChange={e => updateCaption(idx, e.target.value)}
                    placeholder="사진 캡션 입력 (예: 전면 외관 및 주출입구)"
                    className="w-full px-2 py-1 text-xs font-medium bg-white border border-[#CBD5E1] rounded-md text-[#0F172A]"
                  />
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => toggleInclude(idx)}
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                        photo.included !== false
                          ? 'bg-[#D1FAE5] text-[#065F46]'
                          : 'bg-[#E2E8F0] text-[#475569]'
                      }`}
                    >
                      {photo.included !== false ? '✓ 슬라이드 포함' : '제외됨'}
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => movePhoto(idx, -1)}
                        disabled={idx === 0}
                        className="px-1.5 py-0.5 text-[10px] font-bold border border-[#CBD5E1] rounded bg-white text-[#334155] disabled:opacity-30"
                        title="위로 이동"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => movePhoto(idx, 1)}
                        disabled={idx === normalized.length - 1}
                        className="px-1.5 py-0.5 text-[10px] font-bold border border-[#CBD5E1] rounded bg-white text-[#334155] disabled:opacity-30"
                        title="아래로 이동"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="px-1.5 py-0.5 text-[10px] font-bold border border-[#FECACA] rounded bg-[#FEF2F2] text-[#991B1B]"
                        title="사진 삭제"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 새 사진 추가 */}
      <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
        <div className="text-xs font-bold text-[#0F172A]">➕ 현장 사진 URL 직접 추가</div>
        <input
          type="url"
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          placeholder="사진 이미지 URL (https://...)"
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={newCaption}
            onChange={e => setNewCaption(e.target.value)}
            placeholder="사진 설명 캡션 (예: 1층 전면 상가)"
            className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
          />
          <button
            type="button"
            onClick={handleAddPhoto}
            className="px-3 py-1.5 text-xs font-extrabold rounded-lg bg-[#0F172A] text-white hover:bg-[#1E293B] shrink-0"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
