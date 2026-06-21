"use client";

import React, { useState } from "react";
import type { MobileIMSectionType } from "@/domain/building/mobile-im/types";

interface IMEditorProps {
  initialSections: Record<MobileIMSectionType, string>;
  onSave: (sections: Record<MobileIMSectionType, string>) => void;
  onCancel: () => void;
}

const SECTION_LABELS: Record<string, string> = {
  property_overview: "자산 개요",
  income_analysis: "수익 분석",
  risk_check: "리스크/공법 제한",
  investment_thesis: "투자 논거 (Valuation)",
  next_steps: "다음 단계 (Next Steps)",
};

export function ImEditor({ initialSections, onSave, onCancel }: IMEditorProps) {
  const [sections, setSections] = useState<Record<string, string>>(initialSections);
  const [activeTab, setActiveTab] = useState<string>("property_overview");

  const handleChange = (sectionType: string, value: string) => {
    setSections(prev => ({
      ...prev,
      [sectionType]: value
    }));
  };

  const handleSave = () => {
    // onSave expecting typed sections
    onSave(sections as Record<MobileIMSectionType, string>);
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col h-[600px]">
      <div className="bg-secondary/50 p-3 border-b border-border flex justify-between items-center">
        <h3 className="font-bold">📝 생성된 IM 수동 편집</h3>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded bg-background border border-input hover:bg-accent">
            취소
          </button>
          <button onClick={handleSave} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90">
            저장
          </button>
        </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Tabs */}
        <div className="w-48 bg-secondary/20 border-r border-border flex flex-col">
          {Object.keys(initialSections).map(key => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-3 text-left text-sm transition-colors ${
                activeTab === key 
                  ? "bg-background border-l-2 border-primary font-bold text-primary" 
                  : "hover:bg-secondary/40 text-muted-foreground"
              }`}
            >
              {SECTION_LABELS[key] || key}
            </button>
          ))}
        </div>
        
        {/* Editor Area */}
        <div className="flex-1 p-4 bg-background">
          <div className="mb-2 text-sm text-muted-foreground">마크다운(Markdown) 형식으로 편집 가능합니다.</div>
          <textarea
            value={sections[activeTab] || ""}
            onChange={(e) => handleChange(activeTab, e.target.value)}
            className="w-full h-[calc(100%-2rem)] p-4 rounded-md border border-input bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-ring font-mono text-sm leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}
