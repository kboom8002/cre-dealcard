"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function BrokerStudioPage() {
  // State for Curation Editor
  const [selectedNews, setSelectedNews] = useState<string[]>([]);
  const [selectedDeals, setSelectedDeals] = useState<string[]>([]);
  const [customComment, setCustomComment] = useState("");
  const [aiExpandedComment, setAiExpandedComment] = useState("");
  const [isExpanding, setIsExpanding] = useState(false);

  // State for White-Label Link
  const [brokerSubdomain, setBrokerSubdomain] = useState("kim-broker");
  const [themeColor, setThemeColor] = useState("#6366f1"); // Indigo
  const [generatedLink, setGeneratedLink] = useState("");

  // State for Co-Brokerage (D1)
  const [coBrokerMessage, setCoBrokerMessage] = useState("");
  const [commissionSplit, setCommissionSplit] = useState("50:50 공동중개");

  // Simulated AI Commenting (F6) -> Real AI implementation
  const handleAiExpand = async () => {
    if (!customComment) return;
    setIsExpanding(true);
    try {
      const res = await fetch("/api/broker/studio/ai-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: customComment }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "AI 생성 실패");
      setAiExpandedComment(json.data);
    } catch (err: any) {
      alert(err.message || "AI 생성 중 오류가 발생했습니다.");
    } finally {
      setIsExpanding(false);
    }
  };

  // Generate White-Label Share Page (F4)
  const generateShareLink = () => {
    setGeneratedLink(`https://${brokerSubdomain}.dealcard.kr/share/seongsu-80b-valuable`);
  };

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans pb-12">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/90 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-white flex items-center gap-2">
            🎨 브로커 콘텐츠 스튜디오 & 생태계 (⑥ & ④)
          </h1>
          <p className="text-[10px] text-slate-400">
            나만의 뉴스레터 큐레이션 · AI 화법 비서 · 화이트라벨 공유 · 공동중개 허브
          </p>
        </div>
        <Link href="/broker" className="text-xs text-slate-400 hover:text-white">← Broker Home</Link>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Column 1 & 2: Editor & Studio */}
        <div className="md:col-span-2 space-y-6">

          {/* F1: 뉴스레터 큐레이션 편집기 */}
          <section className="bg-[#131b2e] border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">📰</span>
                <h2 className="text-sm font-bold text-white">나만의 브로커 뉴스레터 큐레이션 (F1)</h2>
              </div>
              <span className="text-[9px] text-indigo-400 font-semibold">드래그 & 드롭 선택식</span>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] text-slate-400 block">① 포함할 딜카드 / 매물 선택</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "deal-1", title: "성수동 2가 80억 근생빌딩" },
                  { id: "deal-2", title: "서초역 대로변 120억 오피스" }
                ].map((deal) => (
                  <div
                    key={deal.id}
                    onClick={() => {
                      setSelectedDeals(prev =>
                        prev.includes(deal.id) ? prev.filter(x => x !== deal.id) : [...prev, deal.id]
                      );
                    }}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      selectedDeals.includes(deal.id)
                        ? "bg-indigo-950/30 border-indigo-500"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    🏢 {deal.title}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] text-slate-400 block">② 포함할 오늘의 부동산 뉴스 큐레이션</label>
              <div className="space-y-2">
                {[
                  { id: "news-1", source: "한경", title: "성수동 IT밸리 평당 1억 5천 돌파" },
                  { id: "news-2", source: "매경", title: "테헤란로 오피스 공실률 2%대 철옹성" }
                ].map((news) => (
                  <div
                    key={news.id}
                    onClick={() => {
                      setSelectedNews(prev =>
                        prev.includes(news.id) ? prev.filter(x => x !== news.id) : [...prev, news.id]
                      );
                    }}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer flex justify-between items-center transition-all ${
                      selectedNews.includes(news.id)
                        ? "bg-indigo-950/30 border-indigo-500"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <span>🗞️ <strong className="text-indigo-400">[{news.source}]</strong> {news.title}</span>
                    <span className="text-[10px] text-slate-500">{selectedNews.includes(news.id) ? "✓ 담김" : "+ 추가"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* F6: AI 말투 코멘터 */}
            <div className="space-y-3 pt-3 border-t border-slate-800/80">
              <label className="text-[10px] text-slate-400 block">③ AI 코멘터 어시스턴트 (F6)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="예: '성수동 리모델링 매물 강추합니다'"
                  value={customComment}
                  onChange={(e) => setCustomComment(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
                <button
                  onClick={handleAiExpand}
                  disabled={isExpanding}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] px-4 py-2 rounded-xl transition-all"
                >
                  {isExpanding ? "AI 가공 중..." : "AI 말투 생성"}
                </button>
              </div>

              {aiExpandedComment && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs leading-relaxed text-slate-300 relative whitespace-pre-wrap">
                  <span className="absolute top-2 right-2 text-[8px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded">AI 말투 완료</span>
                  {aiExpandedComment}
                </div>
              )}
            </div>
          </section>

          {/* F4: 화이트라벨 공유 링크 빌더 */}
          <section className="bg-[#131b2e] border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔗</span>
              <h2 className="text-sm font-bold text-white">나만의 화이트라벨 모바일 공유 도구 (F4)</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">내 서브도메인 설정</label>
                <input
                  type="text"
                  value={brokerSubdomain}
                  onChange={(e) => setBrokerSubdomain(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">시그니처 테마 색상</label>
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="w-full h-8 bg-slate-950 border border-slate-800 rounded-xl px-1 py-1 cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={generateShareLink}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 rounded-xl transition-all"
            >
              화이트라벨 모바일 페이지 생성
            </button>

            {generatedLink && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
                <span className="text-[10px] text-indigo-400 font-mono select-all truncate">{generatedLink}</span>
                <span className="text-[9px] bg-indigo-500 text-white px-2 py-1 rounded cursor-pointer hover:bg-indigo-400">카톡 발송</span>
              </div>
            )}
          </section>

          {/* D1: 공동중개 제안 시스템 */}
          <section className="bg-[#131b2e] border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤝</span>
              <h2 className="text-sm font-bold text-white">JS 공동중개 파트너 매칭 & 제안 허브 (D1)</h2>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">수수료 공동분배 기준</label>
                  <select
                    value={commissionSplit}
                    onChange={(e) => setCommissionSplit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option>50:50 공동중개</option>
                    <option>60:40 (매수우위)</option>
                    <option>40:60 (매도우위)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">수신 공동중개사 지정</label>
                  <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white">
                    <option>제이에스부동산 꼬마빌딩 전담팀</option>
                    <option>용산구 연합 파트너 브로커</option>
                    <option>전체 브로커 공개 제안</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">공동중개 매칭 제안 메시지</label>
                <textarea
                  placeholder="예: '성수동 2가 80억 매수 희망 법인 확보 중입니다. 리모델링 가능한 근생 건물 보유하신 중개사분 매칭 요청드립니다.'"
                  value={coBrokerMessage}
                  onChange={(e) => setCoBrokerMessage(e.target.value)}
                  className="w-full h-16 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-xl transition-all">
                공동중개 제안 등록 (매칭 알림 즉시 발송)
              </button>
            </div>
          </section>

        </div>

        {/* Column 3: Stats & CRM */}
        <div className="space-y-6">

          {/* F5: 콘텐츠 마케팅 성과 대시보드 */}
          <section className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-4">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">📊 이번 주 큐레이션 성과 (F5)</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-center">
                <span className="text-[9px] text-slate-500 block">발송 건수</span>
                <span className="text-base font-extrabold text-white">18 건</span>
              </div>
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-center">
                <span className="text-[9px] text-slate-500 block">고객 열람</span>
                <span className="text-base font-extrabold text-emerald-400">12 건 (66%)</span>
              </div>
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-center">
                <span className="text-[9px] text-slate-500 block">Gate 추가 요청</span>
                <span className="text-base font-extrabold text-indigo-400">3 건</span>
              </div>
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-center">
                <span className="text-[9px] text-slate-500 block">공동중개 체결</span>
                <span className="text-base font-extrabold text-amber-400">1 건</span>
              </div>
            </div>
          </section>

          {/* F3: 실시간 고객 관심도 순위 (Lead Scoring) */}
          <section className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-3">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">🔥 실시간 매수자 관심 점수 (F3)</p>
            <div className="space-y-2">
              {[
                { name: "김*우 대표 (성수사옥)", score: 95, status: "Gate 상세 요청 완료" },
                { name: "이*혜 회장 (증여용)", score: 82, status: "뉴스레터 3회 중복 열람" },
                { name: "박*준 자산가 (강남오피스)", score: 48, status: "딜카드 1회 열람" }
              ].map((lead, idx) => (
                <div key={idx} className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <span className="text-xs font-semibold text-white block">{lead.name}</span>
                    <span className="text-[9px] text-slate-500">{lead.status}</span>
                  </div>
                  <span className="text-xs font-black text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">
                    {lead.score}점
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* D3: 상업용 Vendor 평점/리뷰 */}
          <section className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-3">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">👷 상업용 협력 Vendor 리뷰 (D3)</p>
            <div className="space-y-2">
              {[
                { name: "JS 건축설계사무소 (꼬마빌딩 증축 전문)", rating: "⭐️ 4.9", review: "기획설계 검토 피드백이 하루 만에 전달되어 미팅 수월했습니다." },
                { name: "바른 법무법인 (CRE 양도세 특화)", rating: "⭐️ 4.7", review: "법인 전환 증여 케이스 양도세 계산 피드백이 신속합니다." }
              ].map((vendor, idx) => (
                <div key={idx} className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white">{vendor.name}</span>
                    <span className="text-amber-400 font-semibold">{vendor.rating}</span>
                  </div>
                  <p className="text-[9px] text-slate-400 leading-relaxed">{vendor.review}</p>
                </div>
              ))}
            </div>
          </section>

        </div>

      </div>
    </main>
  );
}
