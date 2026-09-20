'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Slide {
  id: string;
  slideIndex: number;
  layoutType: string;
  title: string;
  kicker: string;
  dataKey: string;
  slideOverrides: Record<string, any>;
}

interface EditorField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'image';
  placeholder?: string;
  rows?: number;
}

const SLIDE_FIELDS: Record<string, EditorField[]> = {
  cover: [
    { key: 'title', label: '제목', type: 'text', placeholder: '건물명 또는 투자 제안서 제목' },
    { key: 'subtitle', label: '부제목', type: 'text', placeholder: '예: 서울특별시 영등포구 당산동' },
    { key: 'date', label: '날짜', type: 'text', placeholder: '2026-09-20' },
  ],
  highlights: [
    { key: 'keyInvestmentPoint', label: '투자 핵심 포인트', type: 'textarea', placeholder: '주요 투자 포인트를 입력하세요', rows: 3 },
    { key: 'askingPrice', label: '매각 희망가 (억원)', type: 'text', placeholder: '예: 85.0' },
    { key: 'grossYield', label: '총 수익률 (%)', type: 'text', placeholder: '예: 5.85' },
    { key: 'vacancySignal', label: '공실 현황', type: 'text', placeholder: '예: 만실 운영' },
  ],
  overview: [
    { key: 'buildingOverview', label: '건물 개요', type: 'textarea', placeholder: '건물 개요 정보를 입력하세요', rows: 4 },
    { key: 'rightCallout', label: '권리 분석 콜아웃', type: 'textarea', placeholder: '권리 분석 내용', rows: 3 },
  ],
  location: [
    { key: 'address', label: '주소', type: 'text', placeholder: '서울시 영등포구 ...' },
    { key: 'mapImageUrl', label: '지도 이미지', type: 'image' },
    { key: 'transitInfo', label: '대중교통', type: 'text', placeholder: '예: 당산역 2분' },
    { key: 'roadInfo', label: '도로 접면', type: 'text', placeholder: '예: 8m 도로 2면 접면' },
    { key: 'areaInfo', label: '상권 권역', type: 'text', placeholder: '예: 영등포/당산 업무 권역' },
  ],
  land: [
    { key: 'zoningInfo', label: '용도지역', type: 'text', placeholder: '예: 제2종일반주거지역' },
    { key: 'landCallout', label: '토지 분석 내용', type: 'textarea', placeholder: '토지 관련 상세 정보', rows: 3 },
  ],
  gallery: [
    { key: 'photos', label: '사진 업로드', type: 'image' },
  ],
  rentroll: [
    { key: 'rentrollNotes', label: '렌트롤 안내', type: 'textarea', placeholder: '렌트롤 관련 안내 사항', rows: 3 },
  ],
  yield: [
    { key: 'yieldNotes', label: '수익률 안내', type: 'textarea', placeholder: '수익률 산정 방식 안내', rows: 3 },
  ],
  closing: [
    { key: 'brokerName', label: '담당자명', type: 'text', placeholder: '홍길동' },
    { key: 'brokerPhone', label: '연락처', type: 'text', placeholder: '010-0000-0000' },
    { key: 'brokerCompany', label: '중개법인명', type: 'text', placeholder: '주)쿠레딴' },
  ],
};

export function SlideEditor({
  slide,
  onSave,
  onMapUpload,
  saving,
}: {
  slide: Slide;
  onSave: (slideId: string, overrides: Record<string, any>) => Promise<void>;
  onMapUpload: (slideId: string, file: File, fieldName: string) => Promise<void>;
  saving: boolean;
}) {
  const [localOverrides, setLocalOverrides] = useState<Record<string, any>>({});

  // Reset local state when slide changes
  useEffect(() => {
    setLocalOverrides({ ...slide.slideOverrides });
  }, [slide.id, slide.slideOverrides]);

  const fields = SLIDE_FIELDS[slide.dataKey] || [];

  const handleFieldChange = (key: string, value: any) => {
    setLocalOverrides(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    await onSave(slide.id, localOverrides);
  };

  const handleFileChange = async (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onMapUpload(slide.id, file, key);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {slide.slideIndex}. {slide.title}
          </h2>
          <p className="text-sm text-gray-400">{slide.kicker} · {slide.layoutType}</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '💾 저장'}
        </Button>
      </div>

      <div className="space-y-5">
        {fields.map(field => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {field.label}
            </label>
            {field.type === 'text' && (
              <Input
                value={localOverrides[field.key] || ''}
                onChange={e => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            )}
            {field.type === 'number' && (
              <Input
                type="number"
                value={localOverrides[field.key] || ''}
                onChange={e => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            )}
            {field.type === 'textarea' && (
              <textarea
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={field.rows || 3}
                value={localOverrides[field.key] || ''}
                onChange={e => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            )}
            {field.type === 'image' && (
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleFileChange(field.key, e)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {localOverrides[field.key] && typeof localOverrides[field.key] === 'string' && localOverrides[field.key].startsWith('data:') && (
                  <img
                    src={localOverrides[field.key]}
                    alt={field.label}
                    className="mt-2 rounded-md border max-h-48 object-contain"
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {fields.length === 0 && (
          <p className="text-gray-400 text-center py-8">
            이 섹션은 자동으로 생성됩니다.
          </p>
        )}
      </div>
    </Card>
  );
}
