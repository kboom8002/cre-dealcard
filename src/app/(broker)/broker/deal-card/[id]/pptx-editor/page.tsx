'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { SlidePreviewSVG } from '@/components/broker/pptx-editor/slide-preview-svg';
import { TokenEditorPanel } from '@/components/broker/pptx-editor/token-editor-panel';
import { PPTX_PRESET_TEMPLATES, PptxThemeTokens, DEFAULT_PPTX_PRESET } from '@/domain/building/mobile-im/pptx/pptx-theme';

export default function PptxEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tokens, setTokens] = useState<PptxThemeTokens>(PPTX_PRESET_TEMPLATES[DEFAULT_PPTX_PRESET]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(DEFAULT_PPTX_PRESET);
  const [isSaving, setIsSaving] = useState(false);
  const [presetName, setPresetName] = useState('');

  const handleTokenChange = (key: keyof PptxThemeTokens, value: string) => {
    setTokens((prev) => ({ ...prev, [key]: value }));
  };

  const handleBasePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (PPTX_PRESET_TEMPLATES[presetId]) {
      setTokens(PPTX_PRESET_TEMPLATES[presetId]);
    }
  };

  const handleSave = async () => {
    if (!presetName.trim()) {
      alert('프리셋 이름을 입력하세요');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/broker/pptx-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: presetName,
          tokens,
        }),
      });
      if (res.ok) {
        alert('저장되었습니다.');
      } else {
        alert('저장 실패');
      }
    } catch (e) {
      console.error(e);
      alert('오류 발생');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviewDownload = () => {
    const presetParam = selectedPresetId !== DEFAULT_PPTX_PRESET ? `&preset=${selectedPresetId}` : '';
    window.open(`/api/public/im-lite/${id}/pptx?preview=true${presetParam}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#0A1628] text-[#E7ECF2] flex flex-col font-sans">
      <header className="h-16 border-b border-slate-700/50 flex items-center px-6 bg-slate-900/50">
        <Link href={`/broker/deal-card/${id}`} className="text-slate-400 hover:text-white transition-colors mr-4">
          ← 딜카드로
        </Link>
        <h1 className="text-lg font-bold">PPTX 템플릿 에디터</h1>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <TokenEditorPanel 
          tokens={tokens} 
          presetName={presetName}
          onTokenChange={handleTokenChange}
          onPresetNameChange={setPresetName}
          onBasePresetChange={handleBasePresetChange}
          onSave={handleSave}
          onDownloadPreview={handlePreviewDownload}
          isSaving={isSaving}
        />

        <div className="flex-1 overflow-auto p-8 flex flex-col items-center bg-slate-900/30">
          <div className="mb-4 text-sm text-amber-500/80 bg-amber-500/10 px-4 py-2 rounded-full flex items-center gap-2">
            <span>⚠</span> 미리보기는 SVG 렌더링에 의한 근사치이며, 실제 PPTX와 약간의 차이가 있을 수 있습니다
          </div>
          <SlidePreviewSVG tokens={tokens} width={960} />
        </div>
      </main>
    </div>
  );
}
