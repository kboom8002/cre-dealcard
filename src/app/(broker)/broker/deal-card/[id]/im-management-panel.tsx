"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ImManagementPanelProps {
  buildingId: string;
  currentGrade: 'A' | 'B' | 'C' | 'D';
  currentScore: number;
}

interface ImDocument {
  id: string;
  created_at: string;
  tier: 'basic' | 'pro';
}

export function ImManagementPanel({
  buildingId,
  currentGrade,
  currentScore,
}: ImManagementPanelProps) {
  const [docs, setDocs] = useState<ImDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState("credeal_signature");
  const [presets, setPresets] = useState<any[]>([]);
  
  useEffect(() => {
    async function fetchDocs() {
      try {
        const res = await fetch(`/api/broker/im-lite/${buildingId}`);
        if (res.ok) {
          const data = await res.json();
          // Assume data.documents is returned from the API, mapping them here
          // The API might just return all blind_teaser/mobile_im documents.
          if (data.documents) {
             setDocs(data.documents.map((d: any) => ({
               id: d.id,
               created_at: d.created_at,
               tier: d.body?.tier || 'basic'
             })));
          }
        }
      } catch (err) {
        console.error("Failed to fetch IM docs", err);
      } finally {
        setIsLoading(false);
      }
    }

    async function fetchPresets() {
      try {
        const res = await fetch('/api/broker/pptx-preset');
        if (res.ok) {
          const data = await res.json();
          setPresets(data.presets || []);
        }
      } catch (err) {
        console.error("Failed to fetch presets", err);
      }
    }

    fetchDocs();
    fetchPresets();
  }, [buildingId]);

  const basicDoc = docs.find(d => d.tier === 'basic');
  const proDoc = docs.find(d => d.tier === 'pro');

  const handleCopyLink = (tier: 'basic' | 'pro') => {
    const url = `${window.location.origin}/im-${tier === 'basic' ? 'lite' : 'pro'}/${buildingId}`;
    navigator.clipboard.writeText(url);
    alert('링크가 복사되었습니다.');
  };

  const isProLocked = currentGrade === 'D' || currentGrade === 'C'; // Or wait, if grade < B means C, D are locked. So if currentGrade is 'C' or 'D'.
  
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <span>📄</span> IM 관리 패널
      </h2>
      
      {/* Basic IM Card */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-sm">Basic IM</h3>
            <p className="text-xs text-muted-foreground mt-0.5">모바일 웹 IM 뷰어 + 7p 기본 PPTX/PDF 즉시 생성</p>
          </div>
          <div className="text-xs font-medium">
            {basicDoc ? (
              <span className="text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">✅ 생성됨 ({new Date(basicDoc.created_at).toLocaleDateString()})</span>
            ) : (
              <span className="text-blue-500 bg-blue-500/10 px-2 py-1 rounded-full">⚡ 즉시 생성 가능</span>
            )}
          </div>
        </div>
        
        {basicDoc && (
          <div className="flex flex-wrap gap-2 mt-2">
            <Button size="sm" variant="secondary" className="text-xs h-8" onClick={() => window.open(`/im-lite/${buildingId}`, '_blank')}>
              👁 열기
            </Button>
            <Button size="sm" variant="secondary" className="text-xs h-8" onClick={() => window.open(`/api/public/im-lite/${buildingId}/export?tier=basic`, '_blank')}>
              📄 PDF
            </Button>
            <Button size="sm" variant="secondary" className="text-xs h-8" onClick={() => window.open(`/api/public/im-lite/${buildingId}/pptx?tier=basic`, '_blank')}>
              📊 PPTX
            </Button>
            <Button size="sm" variant="secondary" className="text-xs h-8" onClick={() => handleCopyLink('basic')}>
              🔗 링크복사
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => document.getElementById('cta-mobile-im-basic')?.click()}>
              ♻️ 재생성
            </Button>
          </div>
        )}
      </div>

      {/* Pro IM Card */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 relative overflow-hidden">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-sm">Pro IM</h3>
            <p className="text-xs text-muted-foreground mt-0.5">10년 DCF·수익률 민감도·대출/세금 분석 24p 정밀 IM (워터마크 보안)</p>
          </div>
          <div className="text-xs font-medium">
            {isProLocked ? (
              <span className="text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full">🔒 잠김 (현재 {currentGrade}등급)</span>
            ) : proDoc ? (
              <span className="text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">✅ 생성됨 ({new Date(proDoc.created_at).toLocaleDateString()})</span>
            ) : (
              <span className="text-blue-500 bg-blue-500/10 px-2 py-1 rounded-full">✨ 생성 가능</span>
            )}
          </div>
        </div>

        {isProLocked ? (
          <div className="mt-2 text-xs text-muted-foreground">
            <p>Pro IM을 생성하려면 데이터 등급을 B등급 이상으로 올려야 합니다.</p>
            <Button size="sm" className="mt-2 h-8 w-full bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => document.getElementById('cta-mobile-im-pro')?.click()}>
              Pro로 업그레이드
            </Button>
          </div>
        ) : proDoc ? (
          <div className="flex flex-wrap gap-2 mt-2">
            <Button size="sm" variant="secondary" className="text-xs h-8" onClick={() => window.open(`/im-pro/${buildingId}`, '_blank')}>
              👁 열기
            </Button>
            <Button size="sm" variant="secondary" className="text-xs h-8" onClick={() => window.open(`/api/public/im-lite/${buildingId}/export?tier=pro`, '_blank')}>
              📄 PDF
            </Button>
            <Button size="sm" variant="secondary" className="text-xs h-8" onClick={() => window.open(`/api/public/im-lite/${buildingId}/pptx?tier=pro`, '_blank')}>
              📊 PPTX
            </Button>
            <Button size="sm" variant="secondary" className="text-xs h-8" onClick={() => handleCopyLink('pro')}>
              🔗 링크복사
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => document.getElementById('cta-mobile-im-pro')?.click()}>
              ♻️ 재생성
            </Button>
          </div>
        ) : (
          <Button size="sm" className="mt-2 h-8 w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:opacity-90 text-white" onClick={() => document.getElementById('cta-mobile-im-pro')?.click()}>
            Pro IM 생성하기
          </Button>
        )}
      </div>

      {/* Export Controls */}
      <div className="pt-3 border-t border-border space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium w-16">프리셋</label>
          <select 
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            className="flex-1 h-8 rounded-md border border-border bg-background text-xs px-2 focus:ring-1 focus:ring-blue-500 outline-none"
          >
            <option value="credeal_signature">CRE Deal Signature (기본)</option>
            <option value="golden_institutional">Golden Institutional</option>
            <option value="executive_gold">Executive Gold</option>
            <option value="corporate_clean">Corporate Clean</option>
            <option value="pro_dark_obsidian">Pro Dark Obsidian</option>
            {presets.map((p: any) => (
              <option key={p.id} value={p.id}>🎨 {p.preset_name ?? p.name} (커스텀)</option>
            ))}
          </select>
          <Link 
            href={`/broker/deal-card/${buildingId}/pptx-editor`}
            className="text-xs text-amber-400 hover:text-amber-300 border border-amber-400/30 hover:border-amber-400/60 px-2 py-1 rounded transition-colors"
          >
            ✏️ 템플릿 편집
          </Link>
        </div>
        
        {/* We can use either basic or pro for download here if they exist. Default to basic if only basic exists, else pro. 
            Or just separate logic. Assuming export button uses basic unless pro exists. */}
        <div className="flex gap-2">
          <Button 
            className="flex-1 text-xs h-9" 
            variant="outline"
            disabled={!basicDoc && !proDoc}
            onClick={() => {
              const tier = proDoc ? 'pro' : 'basic';
              window.open(`/api/public/im-lite/${buildingId}/export?tier=${tier}&preset=${selectedPreset}`, '_blank');
            }}
          >
            📄 현재 등급 PDF
          </Button>
          <Button 
            className="flex-1 text-xs h-9" 
            variant="outline"
            disabled={!basicDoc && !proDoc}
            onClick={() => {
              const tier = proDoc ? 'pro' : 'basic';
              window.open(`/api/public/im-lite/${buildingId}/pptx?tier=${tier}&preset=${selectedPreset}`, '_blank');
            }}
          >
            📊 현재 등급 PPTX
          </Button>
        </div>
      </div>
    </div>
  );
}
