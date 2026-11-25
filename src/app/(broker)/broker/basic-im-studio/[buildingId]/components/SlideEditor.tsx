'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import type { PptxSlide } from '@/domain/building/pptx-studio/studio-service';
import { m2ToPyeong as sqmToPyeong, pyeongToM2 } from '@/domain/building/im-core/facts/area';
import {
  resolveLeaseOccupancy,
  summarizeLeaseOccupancy,
  sumLeasedRentRoll,
} from '@/domain/building/mobile-im/lease-vacancy';
import { PresetGallery } from '@/components/broker/im-studio/PresetGallery';
import { HeaderFooterEditor } from '@/components/broker/im-studio/HeaderFooterEditor';
import { ArchetypeSelector } from '@/components/broker/im-studio/ArchetypeSelector';
import { AiTextGenerator } from '@/components/broker/im-studio/AiTextGenerator';
import { GalleryCurator, type StudioPhotoItem } from '@/components/broker/im-studio/GalleryCurator';

const MAX_STUDIO_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_STUDIO_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const DISALLOWED_STUDIO_FILE_EXT_RE = /\.(?:svg|svgz|html?|xml|js|mjs)$/i;

export type RightPanelTab = 'content' | 'theme' | 'branding';

interface SlideEditorProps {
  projectId: string;
  slide: PptxSlide;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  onChange: (key: string, value: unknown) => void;
  onLayoutChange: (layoutType: string) => void;
  onSave: () => void;
  onResetSlide: () => void;
  saving: boolean;
}

interface FieldSpec {
  key: string;
  label: string;
  multiline?: boolean;
  aiEnabled?: boolean;
  placeholder?: string;
}

const SLIDE_FIELD_SPECS: Record<string, FieldSpec[]> = {
  cover: [
    { key: 'title', label: '표지 메인 타이틀 (건물명·매각명)' },
    { key: 'subtitle', label: '표지 서브타이틀 (용도·핵심 문구)' },
    { key: 'askingPrice', label: '매매 희망가 표기 (예: 95억 원)' },
    { key: 'address', label: '소재지 표기' },
    { key: 'date', label: '작성 기준일 (YYYY-MM-DD)' },
    { key: 'brokerCompany', label: '담당 중개법인 명칭' },
    { key: 'representativeName', label: '대표자(개업공인중개사) 성명' },
    { key: 'brokerName', label: '담당 컨설턴트 성명' },
    { key: 'brokerPhone', label: '담당자 연락처' },
    { key: 'brokerRegNo', label: '중개사무소 등록번호' },
    { key: 'officeAddress', label: '중개사무소 소재지' },
  ],
  highlights: [
    { key: 'leadSentence', label: '슬라이드 상단 핵심 리드 문장', aiEnabled: true },
    { key: 'askingPrice', label: '핵심 지표 1: 매매 희망가' },
    { key: 'grossYield', label: '핵심 지표 2: 현행 임대수익률 (%)' },
    { key: 'stabilizedYield', label: '핵심 지표 3: 안정화 기대수익률 (%)' },
    { key: 'vacancySignal', label: '핵심 지표 4: 임대 가동 현황 / 공실률' },
    { key: 'keyInvestmentPoint', label: '투자 포인트 01 (입지·수익 구조)', aiEnabled: true },
    { key: 'investmentPoint2', label: '투자 포인트 02 (토지·건물 제원 강점)', aiEnabled: true },
    { key: 'investmentPoint3', label: '투자 포인트 03 (밸류애드·상승 여력)', aiEnabled: true },
  ],
  overview: [
    { key: 'buildingName', label: '건물명' },
    { key: 'address', label: '소재지 (도로명 · 지번)' },
    { key: 'landArea', label: '대지면적 (㎡ / 평)' },
    { key: 'archArea', label: '건축면적 (㎡ / 평)' },
    { key: 'grossArea', label: '연면적 (㎡ / 평)' },
    { key: 'floors', label: '건축규모 (지하 / 지상 층수)' },
    { key: 'zoning', label: '용도지역' },
    { key: 'bcrFar', label: '건폐율 / 용적률 (%)' },
    { key: 'completionYear', label: '사용승인연도 (준공연도)' },
    { key: 'parkingElevator', label: '주차대수 / 승강기' },
    { key: 'mainUse', label: '주용도' },
    { key: 'structureType', label: '주구조' },
    { key: 'askingPrice', label: '하단 매매 희망가' },
    { key: 'landUnitPrice', label: '하단 토지 평당가' },
    { key: 'rightCallout', label: '우측 자산 핵심 체크포인트 (줄바꿈 구분)', multiline: true, aiEnabled: true },
  ],
  location: [
    { key: 'address', label: '소재지' },
    { key: 'transitInfo', label: '대중교통 · 역세권 도보 시간' },
    { key: 'roadInfo', label: '접면도로 및 차량 진입 여건' },
    { key: 'areaInfo', label: '배후 상권 및 권역 특성' },
    { key: 'locationCallout', label: '입지 및 상권 종합 의견', multiline: true, aiEnabled: true },
    { key: 'mapImageUrl', label: '커스텀 위치도 이미지 URL (선택)' },
  ],
  land: [
    { key: 'landArea', label: '대지면적 (㎡ / 평)' },
    { key: 'landCategory', label: '지목 (예: 대)' },
    { key: 'zoningInfo', label: '용도지역 · 지구' },
    { key: 'bcrFar', label: '건폐율 / 용적률' },
    { key: 'officialLandPrice', label: '개별공시지가 (원/㎡ · 평당)' },
    { key: 'nationalLaw', label: '국토의 계획 및 이용에 관한 법률 사항' },
    { key: 'otherLaws', label: '다른 법령 등에 따른 지역·지구' },
    { key: 'landCallout', label: '토지 규제 및 공법 종합 검토 의견', multiline: true, aiEnabled: true },
    { key: 'cadastralMapImage', label: '커스텀 지적도·토지계획도 이미지 URL (선택)' },
  ],
  rentroll: [
    { key: 'depositTotal', label: '총 보증금 합계' },
    { key: 'monthlyRentTotal', label: '월 임대료 합계' },
    { key: 'occupancyRate', label: '임대 가동률 (%)' },
    { key: 'vacancySignal', label: '공실 현황 요약' },
    { key: 'stabilizedYieldTitle', label: '하단 매입 후 전략 배너 제목' },
    { key: 'turnaroundStrategy', label: '매입 후 임대차 재구성(Value-Add) 전략 상세', multiline: true, aiEnabled: true },
    { key: 'rentrollNotes', label: '렌트롤 각주 / 기준 안내 문구' },
  ],
  yield: [
    { key: 'capRateBase', label: '현행 임대수익률 (%)' },
    { key: 'capRateStabilized', label: '안정화 기대수익률 (%)' },
    { key: 'stabilizedAssumption', label: '안정화 수익률 산출 가정 설명', aiEnabled: true },
    { key: 'askingPrice', label: '매매 희망가 (A)' },
    { key: 'totalDeposit', label: '총 임대보증금 (B)' },
    { key: 'annualRent', label: '연간 임대수익 (C = 월세×12)' },
    { key: 'pricePerPyeong', label: '토지 평당 단가' },
    { key: 'yieldNotes', label: '수익률 및 공시지가 추이 해설', multiline: true, aiEnabled: true },
  ],
  comps: [
    { key: 'compsTitle', label: '시세 비교 표 제목' },
    { key: 'targetLandPricePerPy', label: '본건 토지 평당가' },
    { key: 'compsNotes', label: '인근 실거래 비교 시사점 코멘트', multiline: true, aiEnabled: true },
  ],
  gallery: [
    { key: 'galleryTitle', label: '갤러리 슬라이드 부제' },
  ],
  closing: [
    { key: 'closingLine', label: '매수 제안 한 줄 요약 문구', multiline: true, aiEnabled: true },
    { key: 'brokerCompany', label: '중개법인 · 사무소 명칭' },
    { key: 'representativeName', label: '대표자(개업공인중개사) 성명' },
    { key: 'brokerName', label: '담당자 성명 · 직책' },
    { key: 'brokerPhone', label: '담당자 직통 연락처' },
    { key: 'brokerEmail', label: '담당자 이메일' },
    { key: 'brokerRegNo', label: '중개사무소 등록번호' },
    { key: 'officeAddress', label: '중개사무소 소재지' },
    { key: 'disclaimer', label: '법적 면책 고지 문구', multiline: true },
  ],
};

function normalizeRowForLeaseSsot(row: Record<string, any>): Record<string, any> {
  const rawStatus = String(row?.status || '').trim().toLowerCase();
  const explicitState =
    row?.lease_state ??
    row?.leaseState ??
    (rawStatus === '공실' || rawStatus === 'vacant'
      ? '공실'
      : rawStatus === '자가사용' ||
        rawStatus === '자가' ||
        rawStatus === 'owner' ||
        rawStatus === 'owner_use'
      ? '자가사용'
      : undefined);
  return explicitState ? { ...row, lease_state: explicitState } : row;
}

export function SlideEditor({
  projectId,
  slide,
  activeTab,
  onTabChange,
  onChange,
  onLayoutChange,
  onSave,
  onResetSlide,
  saving,
}: SlideEditorProps) {
  const dataKey = slide.dataKey || 'overview';
  const overrides = (slide.slideOverrides || {}) as Record<string, any>;
  const fields = SLIDE_FIELD_SPECS[dataKey] || SLIDE_FIELD_SPECS[dataKey.toLowerCase()] || SLIDE_FIELD_SPECS.overview;

  // Quick-add comparable state for 'comps' slide
  const [compName, setCompName] = useState('');
  const [compDate, setCompDate] = useState('2025.12');
  const [compPrice, setCompPrice] = useState('');
  const [compLandPy, setCompLandPy] = useState('');
  const [compUnitManwon, setCompUnitManwon] = useState('');
  const [uploadingImageKey, setUploadingImageKey] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  // Quick-add tenant row state for 'rentroll' slide
  const [rrFloor, setRrFloor] = useState('');
  const [rrUnit, setRrUnit] = useState('');
  const [rrTenant, setRrTenant] = useState('');
  const [rrAreaPy, setRrAreaPy] = useState('');
  const [rrDeposit, setRrDeposit] = useState('');
  const [rrRent, setRrRent] = useState('');
  const [rrIsVacant, setRrIsVacant] = useState(false);

  const rawTenantList: any[] = Array.isArray(overrides.tenantData) ? overrides.tenantData : [];

  const handleRecalculateRentRollTotals = () => {
    if (rawTenantList.length === 0) return;
    const normalizedRows = rawTenantList.map(r => normalizeRowForLeaseSsot(r || {}));
    const occSummary = summarizeLeaseOccupancy(normalizedRows);
    const leasedTotals = sumLeasedRentRoll(normalizedRows);
    const vacPct = occSummary.vacancyPct ?? 0;
    const occPct =
      occSummary.vacancyPct !== null
        ? Math.round((100 - occSummary.vacancyPct) * 10) / 10
        : 100;

    onChange('depositTotal', `${leasedTotals.depositManwon.toLocaleString()}만 원`);
    onChange('monthlyRentTotal', `${leasedTotals.monthlyRentManwon.toLocaleString()}만 원/월`);
    onChange('occupancyRate', `${occPct}%`);
    onChange(
      'vacancySignal',
      occSummary.vacant === 0
        ? occSummary.ownerUse > 0
          ? `임대 만실 (자가사용 ${occSummary.ownerUse}실 별도)`
          : '전실 임대 가동'
        : `공실 ${occSummary.vacant}실 (공실률 ${vacPct}%)`
    );
  };

  const handleToggleTenantVacant = (idx: number) => {
    const next = rawTenantList.map((r: any, i: number) => {
      if (i !== idx) return r;
      const curOcc = resolveLeaseOccupancy(normalizeRowForLeaseSsot(r || {}));
      const nextVac = curOcc !== '공실';
      return {
        ...r,
        is_vacant: nextVac,
        lease_state: nextVac ? '공실' : '임대중',
        status: nextVac ? '공실' : '임대중',
        tenant_name: nextVac ? '공실' : r.tenant_name === '공실' ? '임차중' : r.tenant_name,
        tenant: nextVac ? '공실' : r.tenant === '공실' ? '임차중' : r.tenant,
      };
    });
    onChange('tenantData', next);
  };

  const handleRemoveTenantRow = (idx: number) => {
    const next = rawTenantList.filter((_: any, i: number) => i !== idx);
    onChange('tenantData', next);
  };

  const handleAddTenantRow = () => {
    if (!rrFloor.trim() && !rrTenant.trim()) return;
    const parseNum = (v: string) => {
      const n = parseFloat(String(v || '').replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const areaPy = parseNum(rrAreaPy);
    const depositVal = parseNum(rrDeposit) ?? 0;
    const rentVal = parseNum(rrRent) ?? 0;
    const floorLabel = rrFloor.trim() || '1F';
    const unitLabel = rrUnit.trim();
    const tenantLabel = rrIsVacant ? '공실' : rrTenant.trim() || '임차중';

    const newRow = {
      floor: floorLabel,
      unit_label: unitLabel || undefined,
      unit_number: unitLabel || undefined,
      tenant_name: tenantLabel,
      tenant: tenantLabel,
      area_pyeong: areaPy,
      area_sqm: areaPy ? Number(pyeongToM2(areaPy).toFixed(2)) : undefined,
      deposit_manwon: depositVal,
      rent_manwon: rentVal,
      is_vacant: rrIsVacant,
      lease_state: rrIsVacant ? '공실' : '임대중',
      status: rrIsVacant ? '공실' : '임대중',
    };
    const next = [...rawTenantList, newRow];
    onChange('tenantData', next);
    setRrFloor('');
    setRrUnit('');
    setRrTenant('');
    setRrAreaPy('');
    setRrDeposit('');
    setRrRent('');
    setRrIsVacant(false);
  };

  const rawCompsList: any[] = Array.isArray(overrides.comparables)
    ? overrides.comparables
    : Array.isArray(overrides.compsRows)
    ? overrides.compsRows
    : [];

  const handleAddComp = () => {
    if (!compName.trim()) return;
    const parseNum = (v: string) => {
      const n = parseFloat(String(v || '').replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const priceEok = parseNum(compPrice);
    const landPy = parseNum(compLandPy);
    const unitManwon =
      parseNum(compUnitManwon) ??
      (priceEok && landPy ? Math.round((priceEok * 10000) / landPy) : undefined);

    const newItem = {
      location: compName.trim(),
      name: compName.trim(),
      as_of: compDate.trim() || '-',
      trade_date: compDate.trim() || '-',
      price_eok: priceEok,
      price: compPrice.trim() || (priceEok ? `${priceEok}억` : '-'),
      land_area_pyeong: landPy,
      land_pyeong: compLandPy.trim() || (landPy ? String(landPy) : '-'),
      land_price_per_pyeong_manwon: unitManwon,
      land_unit_manwon: compUnitManwon.trim() || (unitManwon ? unitManwon.toLocaleString() : '-'),
    };
    const next = [...rawCompsList, newItem];
    onChange('comparables', next);
    onChange('compsRows', next);
    setCompName('');
    setCompPrice('');
    setCompLandPy('');
    setCompUnitManwon('');
  };

  const handleRemoveComp = (idx: number) => {
    const next = rawCompsList.filter((_: any, i: number) => i !== idx);
    onChange('comparables', next);
    onChange('compsRows', next);
  };

  const handleMapFileUpload = async (fieldName: string, file?: File | null) => {
    if (!file) return;
    setImageUploadError(null);

    if (file.size <= 0 || file.size > MAX_STUDIO_IMAGE_BYTES) {
      const msg = '이미지 파일 크기는 5MB 이하여야 합니다.';
      setImageUploadError(msg);
      toast.error(msg);
      return;
    }

    const declaredMime = String(file.type || '').trim().toLowerCase();
    if (
      !ALLOWED_STUDIO_IMAGE_MIMES.has(declaredMime) ||
      DISALLOWED_STUDIO_FILE_EXT_RE.test(file.name || '')
    ) {
      const msg = 'JPG, PNG, WEBP, GIF 이미지 형식만 업로드할 수 있습니다.';
      setImageUploadError(msg);
      toast.error(msg);
      return;
    }

    setUploadingImageKey(fieldName);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('slideId', slide.id);
      formData.append('fieldName', fieldName);

      const res = await fetch(`/api/broker/basic-im-studio/${encodeURIComponent(projectId)}/map-upload`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const msg =
          (typeof json?.error === 'string' && json.error.trim()) ||
          (typeof json?.message === 'string' && json.message.trim()) ||
          '지도 이미지 검증 및 업로드에 실패했습니다. 유효한 이미지 파일인지 확인해 주세요.';
        setImageUploadError(msg);
        toast.error(msg);
        return;
      }

      const updatedSlide = json.project?.slides?.find((s: any) => s.id === slide.id);
      const savedDataUrl = updatedSlide?.slideOverrides?.[fieldName];
      if (savedDataUrl) {
        onChange(fieldName, savedDataUrl);
      }
    } catch {
      const msg = '네트워크 오류로 지도 이미지를 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      setImageUploadError(msg);
      toast.error(msg);
    } finally {
      setUploadingImageKey(null);
    }
  };

  const kickerInputId = `studio-slide-kicker-${slide.id}`;
  const titleInputId = `studio-slide-title-${slide.id}`;

  return (
    <aside
      data-testid="studio-slide-editor"
      className="w-full sm:w-80 xl:w-96 max-w-full border-l border-[#CBD5E1] bg-white flex flex-col shrink-0 h-full overflow-hidden"
    >
      {/* Top 3-Tab Switcher */}
      <div
        data-testid="studio-right-tabs"
        className="grid grid-cols-3 border-b border-[#CBD5E1] bg-[#F8FAFC] p-1.5 gap-1 shrink-0"
      >
        {([
          { id: 'content', label: '📝 슬라이드 편집' },
          { id: 'theme', label: '🎨 테마·프리셋' },
          { id: 'branding', label: '🏢 헤더·푸터' },
        ] as const).map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`studio-tab-${tab.id}`}
              data-active-pill={active ? 'true' : undefined}
              onClick={() => onTabChange(tab.id)}
              className={`min-h-[44px] py-2 px-2 rounded-lg text-sm font-extrabold transition-all cursor-pointer ${
                active
                  ? 'bg-[#1D4ED8] text-white shadow-xs'
                  : 'text-[#334155] hover:text-[#0F172A] hover:bg-[#E2E8F0]/60'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'theme' ? (
          <PresetGallery />
        ) : activeTab === 'branding' ? (
          <HeaderFooterEditor />
        ) : (
          /* TAB 1: SLIDE CONTENT EDITOR */
          <div className="space-y-4 text-[#0F172A]">
            {/* Slide Common Title & Kicker */}
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold uppercase tracking-wider text-[#1E3A8A]">
                  슬라이드 {String(slide.slideIndex).padStart(2, '0')} 헤더 설정
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label htmlFor={kickerInputId} className="block text-sm font-bold text-[#334155] mb-1">
                    머리말 작은 제목
                  </label>
                  <input
                    id={kickerInputId}
                    type="text"
                    value={String(overrides.kicker ?? slide.kicker ?? '')}
                    onChange={e => onChange('kicker', e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-base font-bold bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                </div>
                <div>
                  <label htmlFor={titleInputId} className="block text-sm font-bold text-[#334155] mb-1">
                    슬라이드 큰 제목
                  </label>
                  <input
                    id={titleInputId}
                    type="text"
                    value={String(overrides.title ?? slide.title ?? '')}
                    onChange={e => onChange('title', e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-base font-bold bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                </div>
              </div>
            </div>

            {/* Compatible Layout / Archetype Switcher */}
            <ArchetypeSelector
              dataKey={dataKey}
              currentLayoutType={slide.layoutType}
              onSelectLayout={onLayoutChange}
            />

            {/* Gallery Curator if Gallery Slide */}
            {dataKey === 'gallery' && (
              <GalleryCurator
                buildingId={projectId}
                photos={(overrides.photos as StudioPhotoItem[]) || []}
                galleryLayout={String(overrides.galleryLayout || 'grid_4')}
                onChangePhotos={nextPhotos => onChange('photos', nextPhotos)}
                onChangeLayout={nextLayout => onChange('galleryLayout', nextLayout)}
              />
            )}

            {imageUploadError && (
              <div
                role="alert"
                className="px-3 py-2 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm font-bold text-[#B91C1C]"
              >
                {imageUploadError}
              </div>
            )}

            {/* Structured Field Inputs */}
            <div className="space-y-3">
              {fields.map(f => {
                const currentVal = String(overrides[f.key] ?? '');
                const isImageUploadField = f.key === 'mapImageUrl' || f.key === 'cadastralMapImage';
                const fieldInputId = `studio-field-${slide.id}-${f.key}`;
                const fileUploadId = `studio-upload-${slide.id}-${f.key}`;
                return (
                  <div key={f.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <label htmlFor={fieldInputId} className="block text-sm font-bold text-[#0F172A]">
                        {f.label}
                      </label>
                      {f.aiEnabled && (
                        <AiTextGenerator
                          projectId={projectId}
                          slideId={slide.id}
                          dataKey={dataKey}
                          fieldKey={f.key}
                          currentText={currentVal}
                          onApply={refined => onChange(f.key, refined)}
                        />
                      )}
                      {isImageUploadField && (
                        <label
                          htmlFor={fileUploadId}
                          className="cursor-pointer min-h-[44px] inline-flex items-center px-3 py-1.5 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-sm font-extrabold text-[#1E3A8A] hover:bg-[#DBEAFE]"
                        >
                          {uploadingImageKey === f.key ? '업로드 중…' : '📁 이미지 파일 업로드'}
                          <input
                            id={fileUploadId}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            disabled={uploadingImageKey === f.key}
                            onChange={e => {
                              void handleMapFileUpload(f.key, e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {f.multiline ? (
                      <textarea
                        id={fieldInputId}
                        rows={3}
                        value={currentVal}
                        onChange={e => onChange(f.key, e.target.value)}
                        placeholder={f.placeholder || `${f.label} 입력`}
                        className="w-full min-h-[44px] px-3 py-2 text-base font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] resize-y"
                      />
                    ) : (
                      <input
                        id={fieldInputId}
                        type="text"
                        value={currentVal}
                        onChange={e => onChange(f.key, e.target.value)}
                        placeholder={f.placeholder || `${f.label} 입력`}
                        className="w-full min-h-[44px] px-3 py-2 text-base font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Interactive Rent Roll Row Manager for 'rentroll' slide */}
            {(dataKey === 'rentroll' || dataKey === 'rentRoll') && (
              <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-extrabold text-[#0F172A]">
                    🏢 층·호수별 임대차 행 관리 ({rawTenantList.length}건)
                  </div>
                </div>

                {rawTenantList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRecalculateRentRollTotals}
                    className="w-full min-h-[44px] py-2 px-3 text-sm font-extrabold rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] hover:bg-[#DBEAFE] transition-colors cursor-pointer"
                  >
                    🔄 행 기준 보증금·월세·가동률 합계 자동 계산
                  </button>
                )}

                {rawTenantList.length > 0 && (
                  <div className="space-y-1.5">
                    {rawTenantList.map((r: any, idx: number) => {
                      const unitStr = r.unit_label || r.unit_number || r.unit || '';
                      const occState = resolveLeaseOccupancy(normalizeRowForLeaseSsot(r || {}));
                      const isVac = occState === '공실';
                      const isOwnerUse = occState === '자가사용';
                      const tenantStr = isVac
                        ? '공실'
                        : isOwnerUse
                        ? r.tenant_name || r.tenant || '자가사용'
                        : r.tenant_name || r.tenant || r.use || '임차중';
                      const areaStr = r.area_pyeong
                        ? `${r.area_pyeong}평`
                        : r.area_sqm
                        ? `${sqmToPyeong(Number(r.area_sqm)).toFixed(1)}평`
                        : '-';
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] flex items-center justify-between gap-2 text-sm"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-extrabold text-[#1E3A8A] shrink-0">
                                {r.floor || '-'}
                                {unitStr ? ` · ${unitStr}` : ''}
                              </span>
                              <span className="font-bold text-[#0F172A] truncate">
                                {tenantStr}
                              </span>
                              <span className="text-sm text-[#475569] shrink-0">
                                ({areaStr})
                              </span>
                            </div>
                            <div className="text-sm font-medium text-[#334155]">
                              보증금 {(r.deposit_manwon ?? r.depositManwon ?? r.deposit ?? 0).toLocaleString()}만 / 월세 {(r.rent_manwon ?? r.monthlyRentManwon ?? r.monthly_rent_manwon ?? r.monthlyRent ?? r.rent ?? 0).toLocaleString()}만
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleTenantVacant(idx)}
                              className={`min-h-[44px] px-2.5 py-1 rounded-lg text-sm font-extrabold border cursor-pointer ${
                                isVac
                                  ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                                  : isOwnerUse
                                  ? 'bg-[#FEF3C7] border-[#FDE68A] text-[#92400E]'
                                  : 'bg-[#D1FAE5] border-[#A7F3D0] text-[#065F46]'
                              }`}
                            >
                              {isVac ? '공실' : isOwnerUse ? '자가사용' : '임차중'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveTenantRow(idx)}
                              className="min-h-[44px] px-2.5 py-1 text-sm font-bold text-[#B91C1C] hover:underline cursor-pointer"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                  <div className="text-sm font-bold text-[#0F172A]">➕ 임대차 호실 직접 추가</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      aria-label="임대차 층 입력"
                      value={rrFloor}
                      onChange={e => setRrFloor(e.target.value)}
                      placeholder="층, 예: 1F, 2F, B1"
                      className="min-h-[44px] px-2.5 py-2 text-base bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      aria-label="임대차 호수 입력"
                      value={rrUnit}
                      onChange={e => setRrUnit(e.target.value)}
                      placeholder="호수, 예: 101호 (선택)"
                      className="min-h-[44px] px-2.5 py-2 text-base bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      aria-label="임차인 또는 업종 입력"
                      value={rrTenant}
                      onChange={e => setRrTenant(e.target.value)}
                      placeholder="임차인·업종, 예: 메디컬의원"
                      className="min-h-[44px] px-2.5 py-2 text-base bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      aria-label="전용면적 평수 입력"
                      value={rrAreaPy}
                      onChange={e => setRrAreaPy(e.target.value)}
                      placeholder="전용면적(평)"
                      className="min-h-[44px] px-2.5 py-2 text-base bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      aria-label="보증금 만원 입력"
                      value={rrDeposit}
                      onChange={e => setRrDeposit(e.target.value)}
                      placeholder="보증금(만원)"
                      className="min-h-[44px] px-2.5 py-2 text-base bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      aria-label="월임대료 만원 입력"
                      value={rrRent}
                      onChange={e => setRrRent(e.target.value)}
                      placeholder="월임대료(만원)"
                      className="min-h-[44px] px-2.5 py-2 text-base bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                  </div>
                  <label
                    htmlFor={`studio-rr-vacant-${slide.id}`}
                    className="flex items-center gap-2 min-h-[44px] text-sm font-bold text-[#334155] cursor-pointer"
                  >
                    <input
                      id={`studio-rr-vacant-${slide.id}`}
                      type="checkbox"
                      checked={rrIsVacant}
                      onChange={e => setRrIsVacant(e.target.checked)}
                      className="w-5 h-5 rounded border-[#CBD5E1]"
                    />
                    공실 여부 체크박스
                  </label>
                  <button
                    type="button"
                    onClick={handleAddTenantRow}
                    className="w-full min-h-[44px] py-2 text-sm font-extrabold rounded-lg bg-[#0F172A] text-white hover:bg-[#1E293B] cursor-pointer"
                  >
                    임대차 호실 추가
                  </button>
                </div>
              </div>
            )}

            {/* Market Comparables List Editor for 'comps' slide */}
            {dataKey === 'comps' && (
              <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                <div className="text-sm font-extrabold text-[#0F172A]">
                  📊 비교 사례 행 관리 ({rawCompsList.length}건)
                </div>
                {rawCompsList.length > 0 && (
                  <div className="space-y-1.5">
                    {rawCompsList.map((c: any, i: number) => (
                      <div
                        key={i}
                        className="px-3 py-2 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] flex items-center justify-between text-sm"
                      >
                        <div className="truncate pr-2">
                          <span className="font-bold text-[#0F172A]">{c.location || c.name || c.address}</span>
                          <span className="text-[#475569] ml-1.5">
                            ({c.price || `${c.price_eok || '-'}억`} · 평당 {c.land_price_per_pyeong_manwon?.toLocaleString?.() || c.land_unit_manwon || '-'}만)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveComp(i)}
                          className="min-h-[44px] px-2 text-sm font-bold text-[#B91C1C] hover:underline shrink-0 cursor-pointer"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                  <div className="text-sm font-bold text-[#0F172A]">➕ 인근 비교사례 직접 추가</div>
                  <input
                    type="text"
                    aria-label="비교사례 소재지 또는 건물명 입력"
                    value={compName}
                    onChange={e => setCompName(e.target.value)}
                    placeholder="소재지 또는 건물명 (예: 당산동4가 근생빌딩)"
                    className="w-full min-h-[44px] px-2.5 py-2 text-base bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      aria-label="비교사례 거래시점 입력"
                      value={compDate}
                      onChange={e => setCompDate(e.target.value)}
                      placeholder="거래시점 (예: 25.11)"
                      className="min-h-[44px] px-2.5 py-2 text-base bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      aria-label="비교사례 거래가 입력"
                      value={compPrice}
                      onChange={e => setCompPrice(e.target.value)}
                      placeholder="거래가 (예: 88억)"
                      className="min-h-[44px] px-2.5 py-2 text-base bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      aria-label="비교사례 대지면적 평수 입력"
                      value={compLandPy}
                      onChange={e => setCompLandPy(e.target.value)}
                      placeholder="대지면적(평) (예: 112)"
                      className="min-h-[44px] px-2.5 py-2 text-base bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                    <input
                      type="text"
                      aria-label="비교사례 토지평당가 만원 입력"
                      value={compUnitManwon}
                      onChange={e => setCompUnitManwon(e.target.value)}
                      placeholder="토지평당가(만) (예: 7,850)"
                      className="min-h-[44px] px-2.5 py-2 text-base bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddComp}
                    className="w-full min-h-[44px] py-2 text-sm font-extrabold rounded-lg bg-[#0F172A] text-white hover:bg-[#1E293B] cursor-pointer"
                  >
                    비교사례 행 추가
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="p-3.5 border-t border-[#CBD5E1] bg-[#F8FAFC] flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onResetSlide}
          disabled={saving}
          className="min-h-[44px] px-3 py-2 text-sm font-bold text-[#334155] hover:text-[#0F172A] bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] rounded-xl transition-colors cursor-pointer"
          title="이 슬라이드의 텍스트·수치를 공부/초기 추출값으로 되돌립니다"
        >
          ↺ 초기값 복원
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex-1 min-h-[44px] py-2 px-4 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-extrabold rounded-xl text-sm transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
        >
          {saving ? '⏳ 저장 중...' : '💾 현재 슬라이드 저장'}
        </button>
      </div>
    </aside>
  );
}
