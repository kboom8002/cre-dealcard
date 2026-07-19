import React, { useState } from 'react';
import { Users, Send, Building2, Link2, Share2 } from 'lucide-react';

export function EditorOutreachTab() {
  const [activeSubTab, setActiveSubTab] = useState<'readiness' | 'cobroker' | 'vendor'>('readiness');

  return (
    <div className="space-y-4">
      {/* Sub Tabs */}
      <div className="flex gap-1 p-1 bg-slate-800/50 rounded-xl">
        {[
          { id: 'readiness', label: '매각준비' },
          { id: 'cobroker', label: '공동중개' },
          { id: 'vendor', label: '벤더' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeSubTab === tab.id
                ? 'bg-slate-700 text-slate-200 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'readiness' && (
        <div className="space-y-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-200">매각준비도 진단 발송</h2>
          </div>
          <p className="text-xs text-slate-400">
            건물 소유주에게 현재 매물의 매각 준비 상태와 보완점을 카카오톡으로 발송합니다.
          </p>
          <button className="w-full py-2.5 bg-emerald-500/20 text-emerald-300 font-bold text-sm rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center justify-center gap-2 border border-emerald-500/30">
            <Send className="w-4 h-4" /> 소유주에게 발송하기
          </button>
        </div>
      )}

      {activeSubTab === 'cobroker' && (
        <div className="space-y-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-slate-200">공동중개 제안</h2>
          </div>
          <p className="text-xs text-slate-400">
            협력 중개사에게 내 매물 리스트를 공유하고 공동중개를 제안하세요.
          </p>
          <button className="w-full py-2.5 bg-amber-500/20 text-amber-300 font-bold text-sm rounded-lg hover:bg-amber-500/30 transition-colors flex items-center justify-center gap-2 border border-amber-500/30">
            <Share2 className="w-4 h-4" /> 제안서 링크 복사
          </button>
        </div>
      )}

      {activeSubTab === 'vendor' && (
        <div className="space-y-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-slate-200">벤더 연결</h2>
          </div>
          <p className="text-xs text-slate-400">
            인테리어, 대출, 세무 등 협력 벤더 리스트를 고객에게 공유합니다.
          </p>
          <button className="w-full py-2.5 bg-blue-500/20 text-blue-300 font-bold text-sm rounded-lg hover:bg-blue-500/30 transition-colors flex items-center justify-center gap-2 border border-blue-500/30">
            <Share2 className="w-4 h-4" /> 벤더 리스트 전송
          </button>
        </div>
      )}
    </div>
  );
}
