'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StudioTabs } from '@/components/studio/StudioTabs';

interface StudioStatus {
  ok: boolean;
  completenessScore: number;
  checklist: {
    buildingRegister: boolean;
    registry: boolean;
    landUsePlan: boolean;
    rentRoll: boolean;
    photos: boolean;
    floorPlan: boolean;
    repairHistory: boolean;
    vacancyStatus: boolean;
    askingPrice: boolean;
    disclosurePolicy: boolean;
  };
}

const CATEGORY_MAP = [
  { value: 'building_register', label: '🏢 건축물대장 증빙 (가중치 20점)', score: 20 },
  { value: 'registry_docs', label: '📜 등기부등본 증빙 (가중치 15점)', score: 15 },
  { value: 'land_use_plan', label: '📐 토지이용계획 증빙 (가중치 10점)', score: 10 },
  { value: 'rent_roll', label: '📊 임대차 현황 증빙 (가중치 25점)', score: 25 },
  { value: 'photos', label: '📸 건물 실사 사진 (가중치 10점)', score: 10 },
  { value: 'floor_plan', label: '🗺️ 층별 도면 자료 (가중치 10점)', score: 10 },
  { value: 'repair_history', label: '🔧 대수선/하자 보수 이력 (가중치 5점)', score: 5 },
  { value: 'vacancy_docs', label: '🏢 공실 현황 증빙 서류 (가중치 5점)', score: 5 },
  { value: 'disclosure_policy', label: '🔒 Blind 공개 정책 동의 서명본 (가중치 5점)', score: 5 },
  { value: 'other', label: '🎸 기타 증빙 서류 (가중치 0점)', score: 0 },
];

export default function StudioFilesPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('building_register');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load existing data
  async function loadData() {
    try {
      const token = localStorage.getItem('sb-access-token') ?? '' /* SEC-6: 더미 토큰 금지 — 비어 있으면 서버가 세션 쿠키로 인증 */;
      const res = await fetch(`/api/broker/buildings/${encodeURIComponent(id)}/studio`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('스튜디오 상태 정보를 불러올 수 없습니다.');
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('업로드할 파일을 선택하거나 드래그 앤 드롭해주세요.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const token = localStorage.getItem('sb-access-token') ?? '' /* SEC-6: 더미 토큰 금지 — 비어 있으면 서버가 세션 쿠키로 인증 */;
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('layerCategory', category);

      const res = await fetch(`/api/broker/buildings/${encodeURIComponent(id)}/evidence`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || resData?.ok === false) {
        throw new Error(resData?.error || '파일 업로드 처리 중 오류가 발생했습니다.');
      }

      setSuccess(`✓ '${selectedFile.name}' 파일이 '${CATEGORY_MAP.find(c => c.value === category)?.label}' 분류로 스토리지에 업로드 및 검증 저장되었습니다!`);
      setSelectedFile(null);
      
      // Reload score and status
      loadData();
      
      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (err: any) {
      setError(err?.message || '파일 업로드에 실패했습니다. 파일 형식과 용량(최대 10MB)을 확인해 주세요.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white border border-slate-200 rounded-2xl min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-700"></div>
        <p className="text-sm text-slate-700 mt-4">업로드 상태를 구성하는 중...</p>
      </div>
    );
  }

  const checklist = status?.checklist;

  // WP-7.3D P1-5: daylight palette (white/slate) + ≥14px text + 48px touch targets.
  return (
    <div className="space-y-6">
      <StudioTabs buildingId={id} activeTab="files" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: File Upload Form */}
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleUpload} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5 shadow-sm">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                📂 Drag-and-Drop 파일 업로드 위자드
              </h3>
              <p className="text-sm text-slate-700 mt-1 leading-relaxed">
                증빙 서류 파일을 업로드하여 완성도 점수를 획득하십시오. 파일의 메타데이터 및 유효성은 즉시 기계 검증을 거칩니다.
              </p>
            </div>

            {error && (
              <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700">
                ⚠️ {error}
              </div>
            )}

            {success && (
              <div role="status" className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-800 leading-relaxed">
                {success}
              </div>
            )}

            {/* Category Selector */}
            <div className="space-y-2">
              <label htmlFor="evidence-category" className="block text-sm font-bold text-slate-700">
                1단계: 증빙 서류 카테고리 선택
              </label>
              <select
                id="evidence-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[48px] bg-white border border-slate-300 rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600 cursor-pointer"
              >
                {CATEGORY_MAP.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Drag Area */}
            <div className="space-y-2">
              <span className="block text-sm font-bold text-slate-700">
                2단계: 파일 드래그 앤 드롭 또는 선택
              </span>
              
              <div
                className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all duration-200 ${
                  dragActive 
                    ? 'border-blue-600 bg-blue-50 scale-[1.01]' 
                    : selectedFile 
                      ? 'border-emerald-400 bg-emerald-50' 
                      : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400'
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="file-upload"
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                />

                <div className="space-y-2">
                  <span className="text-3xl">
                    {selectedFile ? '📄' : '📁'}
                  </span>
                  
                  {selectedFile ? (
                    <div>
                      <p className="text-sm font-bold text-slate-900">{selectedFile.name}</p>
                      <p className="text-sm text-slate-700 mt-1 font-mono">
                        {(selectedFile.size / 1024).toFixed(1)} KB ({selectedFile.type || '알 수 없는 형식'})
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        여기에 증빙 자료를 끌어놓거나, <label htmlFor="file-upload" className="inline-flex min-h-[48px] items-center text-blue-700 hover:underline cursor-pointer">파일 찾기</label>를 클릭하세요.
                      </p>
                      <p className="text-sm text-slate-700 mt-1.5">
                        지원 형식: PDF, PNG, JPG, WEBP (최대 10MB)
                      </p>
                    </div>
                  )}
                </div>

                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="absolute top-2 right-2 min-h-[48px] min-w-[48px] px-2 text-slate-700 hover:text-slate-900 text-sm font-black cursor-pointer"
                  >
                    ✕ 지우기
                  </button>
                )}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="w-full min-h-[48px] py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div>
                  <span>파일 진위 판별 및 서류 분석 중...</span>
                </>
              ) : (
                <span>🚀 파일 검증 및 증빙 제출</span>
              )}
            </button>
          </form>
        </div>

        {/* Right Col: Evidence Status Checklist */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                📂 실시간 에비던스 서류 상태
              </h3>
              <p className="text-sm text-slate-700 mt-1">
                스튜디오에 등록된 주요 원천자료 확보 및 점수 반영 현황
              </p>
            </div>

            <div className="space-y-2">
              {CATEGORY_MAP.filter(c => c.score > 0).map((cat) => {
                // Map DB category to checklist keys
                const checklistKeys: Record<string, string> = {
                  building_register: 'buildingRegister',
                  registry_docs: 'registry',
                  land_use_plan: 'landUsePlan',
                  rent_roll: 'rentRoll',
                  photos: 'photos',
                  floor_plan: 'floorPlan',
                  repair_history: 'repairHistory',
                  vacancy_docs: 'vacancyStatus',
                  disclosure_policy: 'disclosurePolicy',
                };
                const key = checklistKeys[cat.value];
                const isUploaded = checklist ? (checklist as any)[key] : false;

                return (
                  <div
                    key={cat.value}
                    className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isUploaded ? (
                        <span className="w-6 h-6 shrink-0 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm border border-emerald-200 font-black">
                          ✓
                        </span>
                      ) : (
                        <span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-sm border border-slate-200 font-bold">
                          -
                        </span>
                      )}
                      <span className="text-sm font-bold text-slate-900">
                        {cat.label.split(' (')[0]}
                      </span>
                    </div>
                    <span className="text-sm font-mono text-slate-700 font-bold shrink-0">
                      {isUploaded ? `+${cat.score}점` : `0/${cat.score}점`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
