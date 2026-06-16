"use client";

import React, { useState, useEffect } from "react";
import { MagazineView } from "@/app/(public)/magazine/[brokerId]/[date]/magazine-view";
import { Save, Eye, ArrowLeft, Loader2, Info } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";

export default function MagazineEditorPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [magazineData, setMagazineData] = useState<any>(null);
  const [brokerSlug, setBrokerSlug] = useState<string | null>(null);
  
  // Edit states
  const [headline, setHeadline] = useState("");
  const [briefing, setBriefing] = useState("");
  
  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("broker_profiles")
          .select("slug")
          .eq("user_id", user.id)
          .single();
          
        const slug = profile?.slug || "demo";
        setBrokerSlug(slug);

        const res = await fetch(`/api/magazine/${slug}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setMagazineData(json.data);
            setHeadline(json.data.headline || "");
            setBriefing(json.data.briefing || "");
          }
        }
      } catch (err) {
        console.error("Failed to load magazine data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSave = async () => {
    if (!brokerSlug || !magazineData) return;
    setSaving(true);
    try {
      const updatedData = {
        ...magazineData,
        headline,
        briefing,
      };
      
      const res = await fetch(`/api/magazine/${brokerSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData),
      });
      
      if (res.ok) {
        setMagazineData(updatedData);
        alert("매거진이 성공적으로 저장되었습니다!");
      } else {
        alert("저장에 실패했습니다.");
      }
    } catch (err) {
      console.error(err);
      alert("오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1120]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!magazineData) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0B1120] text-slate-300">
        <p>오늘의 매거진 데이터를 불러오지 못했습니다.</p>
        <Link href="/broker" className="mt-4 text-indigo-400 hover:underline">브로커 홈으로 돌아가기</Link>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col md:flex-row font-sans">
      {/* 왼쪽 패널: 에디터 */}
      <div className="w-full md:w-[450px] bg-[#111827] border-r border-slate-800 flex flex-col h-[50vh] md:h-screen sticky top-0 overflow-y-auto">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[#111827]/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <Link href="/broker" className="p-2 -ml-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-sm font-bold text-slate-200">매거진 맞춤 편집</h1>
              <p className="text-[10px] text-slate-500">{today} 발행본</p>
            </div>
          </div>
          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-[11px] font-bold px-4 py-2 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            저장
          </motion.button>
        </div>

        <div className="p-5 space-y-6">
          <div className="flex items-start gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
            <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-indigo-200/80 leading-relaxed">
              AI가 작성한 초안을 고객의 성향에 맞게 직접 다듬을 수 있습니다. 변경사항은 실시간으로 우측 미리보기에 반영됩니다.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-300">헤드라인 (제목)</label>
            <input 
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full bg-[#0f1523] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
              placeholder="매거진 제목을 입력하세요"
            />
          </div>

          <div className="space-y-3 flex-1">
            <label className="text-xs font-semibold text-slate-300">핵심 브리핑 내용</label>
            <textarea 
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              className="w-full h-48 bg-[#0f1523] border border-slate-700 rounded-xl px-4 py-3 text-[13px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none"
              placeholder="고객에게 전달할 핵심 메시지를 입력하세요"
            />
          </div>
          
          <div className="pt-4 border-t border-slate-800">
             <Link href={`/magazine/${brokerSlug}/${today}`} target="_blank"
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-3 rounded-xl border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all">
                <Eye className="w-4 h-4" /> 실제 화면으로 보기
             </Link>
          </div>
        </div>
      </div>

      {/* 우측 패널: 미리보기 (모바일 크기로 컨테이닝) */}
      <div className="flex-1 bg-slate-950 flex items-center justify-center p-4 md:p-10 overflow-y-auto">
        <div className="w-[375px] h-[812px] bg-[#0B1120] border-[8px] border-slate-900 rounded-[3rem] overflow-hidden shadow-2xl relative flex flex-col shrink-0">
          <div className="absolute top-0 inset-x-0 h-6 bg-slate-900 rounded-b-xl z-20 mx-auto w-40" />
          
          <div className="flex-1 overflow-y-auto w-full no-scrollbar relative">
             <MagazineView 
               data={{...magazineData, headline, briefing}} 
               brokerId={brokerSlug || "demo"} 
               date={today} 
             />
          </div>
        </div>
      </div>
    </div>
  );
}
