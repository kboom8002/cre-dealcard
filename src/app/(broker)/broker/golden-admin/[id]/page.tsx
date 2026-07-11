"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SECTION_LABELS: Record<string, string> = {
  property_overview: '자산 개요',
  location_access: '입지 분석',
  lease_status: '임대차 현황',
  income_analysis: '수익 분석',
  risk_check: '리스크',
  investment_thesis: '투자 포인트',
  next_steps: '거래 일정',
};

interface GoldenSetDetail {
  id: string;
  document_id: string;
  section_type: string;
  section_alias: string;
  asset_type: string;
  price_band: string;
  markdown: string;
  judge_score: number;
  was_edited: boolean;
  source_type: string;
  tags: string[];
  version: number;
  usage_count: number;
  last_used_at: string | null;
  is_active: boolean;
  source_file_name: string | null;
  created_at: string;
  approved_at: string;
}

export default function GoldenSetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [gs, setGs] = useState<GoldenSetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [sectionType, setSectionType] = useState('');
  const [assetType, setAssetType] = useState('');
  const [priceBand, setPriceBand] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [judgeScore, setJudgeScore] = useState(4.0);
  const [tagsStr, setTagsStr] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/golden-sets/${id}`);
        if (res.ok) {
          const data = await res.json();
          setGs(data);
          setSectionType(data.section_type || '');
          setAssetType(data.asset_type || '');
          setPriceBand(data.price_band || '');
          setMarkdown(data.markdown || '');
          setJudgeScore(data.judge_score ?? 4.0);
          setTagsStr((data.tags || []).join(', '));
          setIsActive(data.is_active ?? true);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/golden-sets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_type: sectionType,
          asset_type: assetType,
          price_band: priceBand,
          markdown,
          judge_score: judgeScore,
          tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
          is_active: isActive,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (!gs) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground">골든셋을 찾을 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="sm" onClick={() => router.push('/broker/golden-admin')}>
          ← 목록
        </Button>
        <h1 className="text-xl font-bold">골든셋 편집</h1>
        {saved && <span className="text-sm text-emerald-400 animate-pulse">✅ 저장됨</span>}
      </div>

      {/* Meta info */}
      <Card className="p-4 bg-neutral-900 border-neutral-800 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">문서 ID</span>
            <p className="font-mono text-xs mt-0.5 truncate">{gs.document_id}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">소스</span>
            <p className="mt-0.5">{gs.source_type}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">버전</span>
            <p className="mt-0.5">v{gs.version}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">활용 횟수</span>
            <p className="mt-0.5">{gs.usage_count}회</p>
          </div>
          {gs.section_alias && (
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs">원본 섹션명</span>
              <p className="mt-0.5 italic">{gs.section_alias}</p>
            </div>
          )}
          {gs.source_file_name && (
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs">원본 파일</span>
              <p className="mt-0.5">{gs.source_file_name}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Editable form */}
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">섹션 타입</label>
            <select
              value={sectionType}
              onChange={e => setSectionType(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-800 border border-neutral-700"
            >
              {Object.entries(SECTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">자산 유형</label>
            <Input value={assetType} onChange={e => setAssetType(e.target.value)} className="bg-neutral-800 border-neutral-700" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">가격대</label>
            <Input value={priceBand} onChange={e => setPriceBand(e.target.value)} className="bg-neutral-800 border-neutral-700" />
          </div>
        </div>

        {/* Markdown editor + preview */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">마크다운 본문 ({markdown.length}자)</label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <textarea
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              rows={16}
              className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-800 border border-neutral-700 font-mono resize-y"
            />
            <div className="px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 overflow-auto max-h-[400px]">
              <p className="text-[10px] text-muted-foreground mb-2">미리보기</p>
              <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                {markdown}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              품질 점수: <span className="font-bold text-foreground">{judgeScore.toFixed(1)}</span>
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="0.1"
              value={judgeScore}
              onChange={e => setJudgeScore(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">태그 (쉼표 구분)</label>
            <Input
              value={tagsStr}
              onChange={e => setTagsStr(e.target.value)}
              placeholder="오피스, 강남, 50억이상"
              className="bg-neutral-800 border-neutral-700"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground">활성 상태</label>
          <button
            onClick={() => setIsActive(!isActive)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-400'
            }`}
          >
            {isActive ? '✅ 활성' : '⛔ 비활성'}
          </button>
        </div>

        <div className="flex gap-3 pt-4 border-t border-neutral-800">
          <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground px-8">
            {saving ? '저장 중...' : '💾 저장'}
          </Button>
          <Button variant="outline" onClick={() => router.push('/broker/golden-admin')}>
            취소
          </Button>
        </div>
      </div>
    </div>
  );
}
