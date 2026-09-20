'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { SlideNavigator } from './components/SlideNavigator';
import { SlideEditor } from './components/SlideEditor';
import { SlidePreview } from './components/SlidePreview';

interface PptxSlide {
  id: string;
  slideIndex: number;
  layoutType: string;
  title: string;
  kicker: string;
  dataKey: string;
  slideOverrides: Record<string, any>;
  hidden: boolean;
}

interface PptxProject {
  id: string;
  dealId: string;
  title: string;
  themeId: string;
  lockVersion: number;
  stage: string;
  slides: PptxSlide[];
}

export default function BasicImStudioPage() {
  const params = useParams();
  const buildingId = params.buildingId as string;

  const [project, setProject] = useState<PptxProject | null>(null);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Initialize project
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const res = await fetch('/api/broker/basic-im-studio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ buildingId }),
        });
        const data = await res.json();
        if (data.ok && data.project) {
          setProject(data.project);
          if (data.project.slides.length > 0) {
            setSelectedSlideId(data.project.slides[0].id);
          }
          if (data.isExisting) {
            toast.info('기존 프로젝트를 불러왔습니다');
          } else {
            toast.success('Basic IM 프로젝트가 생성되었습니다');
          }
        } else {
          toast.error(data.error || '프로젝트 초기화 실패');
        }
      } catch (err) {
        toast.error('서버 연결 실패');
      } finally {
        setLoading(false);
      }
    }
    if (buildingId) init();
  }, [buildingId]);

  const selectedSlide = project?.slides.find(s => s.id === selectedSlideId) ?? null;

  // Save slide overrides
  const handleSaveOverrides = useCallback(async (slideId: string, overrides: Record<string, any>) => {
    if (!project) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/broker/basic-im-studio/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideId,
          overrides,
          expectedLockVersion: project.lockVersion,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setProject(data.project);
        toast.success('저장되었습니다');
      } else if (res.status === 409) {
        // B4 Fix: 409 자동 복구 — 서버에서 최신 프로젝트 재조회
        toast.warning('다른 탭에서 수정이 감지되었습니다. 최신 상태를 불러옵니다.');
        try {
          const refreshRes = await fetch('/api/broker/basic-im-studio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buildingId }),
          });
          const refreshData = await refreshRes.json();
          if (refreshData.ok && refreshData.project) {
            setProject(refreshData.project);
            // 로컬 변경사항 유지 — 사용자가 재시도 가능
            toast.info('최신 상태를 불러왔습니다. 다시 저장해 주세요.');
          }
        } catch {
          toast.error('최신 상태를 불러오는데 실패했습니다. 페이지를 새로고침해 주세요.');
        }
      } else {
        toast.error(data.error || '저장 실패');
      }
    } catch {
      toast.error('저장 중 오류 발생');
    } finally {
      setSaving(false);
    }
  }, [project, buildingId]);

  // Download PPTX
  const handleDownload = useCallback(async () => {
    if (!project) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/broker/basic-im-studio/${project.id}/download`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.title || 'Basic_IM'}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PPTX 다운로드 완료');
    } catch {
      toast.error('PPTX 다운로드 실패');
    } finally {
      setDownloading(false);
    }
  }, [project]);

  // Map upload handler
  const handleMapUpload = useCallback(async (slideId: string, file: File, fieldName: string) => {
    if (!project) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('slideId', slideId);
    formData.append('fieldName', fieldName);
    try {
      const res = await fetch(`/api/broker/basic-im-studio/${project.id}/map-upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.ok) {
        setProject(data.project);
        toast.success('이미지가 업로드되었습니다');
      } else {
        toast.error(data.error || '업로드 실패');
      }
    } catch {
      toast.error('이미지 업로드 실패');
    }
  }, [project]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Basic IM 스튜디오 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="p-8 text-center">
          <p className="text-red-500 text-lg">프로젝트를 불러올 수 없습니다</p>
          <p className="text-gray-500 mt-2">buildingId: {buildingId}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{project.title}</h1>
          <p className="text-sm text-gray-500">
            Basic IM · {project.slides.filter(s => !s.hidden).length}면 · {project.stage}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleDownload} disabled={downloading}>
            {downloading ? '다운로드 중...' : '📥 PPTX 다운로드'}
          </Button>
        </div>
      </header>

      {/* Body: 3-column */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Slide Navigator */}
        <div className="w-64 border-r bg-white overflow-y-auto shrink-0">
          <SlideNavigator
            slides={project.slides}
            selectedSlideId={selectedSlideId}
            onSelect={setSelectedSlideId}
          />
        </div>

        {/* Center: Editor */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedSlide ? (
            <SlideEditor
              slide={selectedSlide}
              onSave={handleSaveOverrides}
              onMapUpload={handleMapUpload}
              saving={saving}
            />
          ) : (
            <div className="text-center text-gray-400 mt-20">
              좌측에서 슬라이드를 선택하세요
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="w-96 border-l bg-gray-100 overflow-y-auto shrink-0">
          <SlidePreview slide={selectedSlide} />
        </div>
      </div>
    </div>
  );
}
