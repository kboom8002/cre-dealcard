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
      const token = localStorage.getItem('sb-access-token') || 'dummy-token';
      const res = await fetch(`/api/broker/buildings/${id}/studio`, {
        headers: { 'Authorization': `Bearer ${token}` }
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
      const token = localStorage.getItem('sb-access-token') || 'dummy-token';
      
      // Simulate presigned path & bucket
      const bucket = 'evidence';
      const path = `evidence-private/${id}/${category}/${Date.now()}_${selectedFile.name}`;

      const res = await fetch(`/api/broker/buildings/${id}/evidence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size,
          mimeType: selectedFile.type,
          layerCategory: category,
          storageBucket: bucket,
          storagePath: path,
          visibility: 'private',
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '업로드 처리 중 서버 에러가 발생했습니다.');
      }

      const resData = await res.json();
      setSuccess(`✓ '${selectedFile.name}' 파일이 '${CATEGORY_MAP.find(c => c.value === category)?.label}' 분류로 성공적으로 검증 및 저장되었습니다!`);
      setSelectedFile(null);
      
      // Reload score and status
      loadData();
      
      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-neutral-900 border border-neutral-800 rounded-2xl min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
        <p className="text-xs text-neutral-400 mt-4">업로드 상태를 구성하는 중...</p>
      </div>
    );
  }

  const checklist = status?.checklist;

  return (
    <div className="space-y-6">
      <StudioTabs buildingId={id} activeTab="files" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: File Upload Form */}
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleUpload} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-5">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                📂 Drag-and-Drop 파일 업로드 위자드
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                증빙 서류 파일을 업로드하여 완성도 점수를 획득하십시오. 파일의 메타데이터 및 유효성은 즉시 기계 검증을 거칩니다.
              </p>
            </div>

            {error && (
              <div className="p-4 bg-red-950/40 border border-red-900/30 rounded-xl text-xs font-bold text-red-400">
                ⚠️ {error}
              </div>
            )}

            {success && (
              <div className="p-4 bg-emerald-950/40 border border-emerald-900/30 rounded-xl text-xs font-bold text-emerald-400 leading-relaxed">
                {success}
              </div>
            )}

            {/* Category Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-neutral-300">
                1단계: 증빙 서류 카테고리 선택
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-xs font-bold text-white focus:outline-none focus:border-primary cursor-pointer"
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
              <label className="block text-xs font-bold text-neutral-300">
                2단계: 파일 드래그 앤 드롭 또는 선택
              </label>
              
              <div
                className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all duration-200 ${
                  dragActive 
                    ? 'border-primary bg-primary/5 scale-[1.01]' 
                    : selectedFile 
                      ? 'border-emerald-500/40 bg-emerald-500/5' 
                      : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-900/20 hover:border-neutral-700'
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
                  accept=".pdf,.png,.jpg,.jpeg,.zip"
                />

                <div className="space-y-2">
                  <span className="text-3xl">
                    {selectedFile ? '📄' : '📁'}
                  </span>
                  
                  {selectedFile ? (
                    <div>
                      <p className="text-xs font-bold text-white">{selectedFile.name}</p>
                      <p className="text-[10px] text-neutral-500 mt-1 font-mono">
                        {(selectedFile.size / 1024).toFixed(1)} KB ({selectedFile.type || '알 수 없는 형식'})
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-neutral-200">
                        여기에 증빙 자료를 끌어놓거나, <label htmlFor="file-upload" className="text-primary hover:underline cursor-pointer">파일 찾기</label>를 클릭하세요.
                      </p>
                      <p className="text-[10px] text-neutral-500 mt-1.5">
                        지원 형식: PDF, PNG, JPG, ZIP (최대 50MB)
                      </p>
                    </div>
                  )}
                </div>

                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="absolute top-3 right-3 text-neutral-500 hover:text-white text-xs font-black p-1 cursor-pointer"
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
              className="w-full py-3 bg-primary hover:scale-[1.01] active:scale-[0.99] disabled:scale-100 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-primary/10 cursor-pointer"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-white"></div>
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
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                📂 실시간 에비던스 서류 상태
              </h3>
              <p className="text-[10px] text-neutral-400 mt-1">
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
                    className="flex items-center justify-between p-2.5 bg-neutral-950 border border-neutral-850 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      {isUploaded ? (
                        <span className="w-4 h-4 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[10px] border border-emerald-500/20 font-black">
                          ✓
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-neutral-850 text-neutral-600 flex items-center justify-center text-[10px] border border-neutral-800 font-bold">
                          -
                        </span>
                      )}
                      <span className="text-[11px] font-bold text-neutral-300">
                        {cat.label.split(' (')[0]}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-500 font-bold">
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
