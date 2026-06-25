import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/app/(broker)/broker/magazine-editor/page.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add ChevronUp, ChevronDown to lucide-react imports if not there
if (!content.includes('ChevronUp,')) {
  content = content.replace('ChevronRight,', 'ChevronRight,\n  ChevronUp,\n  ChevronDown,');
}

// 2. Replace case "edit": section
const editCaseStart = content.indexOf('case "edit":');
const newsCaseStart = content.indexOf('// ━━━ 뉴스 탭 ━━━');

const editSectionCode = `case "edit":
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl mb-4">
              <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                매거진 섹션의 순서를 변경하거나 숨길 수 있습니다. 우측 토글을 눌러 가시성을 제어하고, 화살표를 눌러 순서를 조정하세요.
              </p>
            </div>

            {sectionOrder.map((sectionId, idx) => {
              const sectionDef = SECTIONS_DEF.find(s => s.id === sectionId);
              if (!sectionDef) return null;
              
              const isVisible = sectionVisibility[sectionId];
              
              const moveUp = () => {
                if (idx === 0) return;
                const newOrder = [...sectionOrder];
                [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
                setSectionOrder(newOrder);
              };
              const moveDown = () => {
                if (idx === sectionOrder.length - 1) return;
                const newOrder = [...sectionOrder];
                [newOrder[idx + 1], newOrder[idx]] = [newOrder[idx], newOrder[idx + 1]];
                setSectionOrder(newOrder);
              };
              const toggleVisibility = () => {
                setSectionVisibility({ ...sectionVisibility, [sectionId]: !isVisible });
              };

              return (
                <div key={sectionId} className={\`p-4 rounded-xl border transition-all \${isVisible ? "bg-slate-800/30 border-slate-700/50" : "bg-slate-800/10 border-slate-800 opacity-60"}\`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <button onClick={toggleVisibility} className="text-slate-400 hover:text-indigo-400 transition-colors">
                        {isVisible ? <ToggleRight className="w-5 h-5 text-indigo-400" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <span className="text-[13px] font-bold text-white">{sectionDef.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={moveUp} disabled={idx === 0} className="p-1 text-slate-500 hover:text-white disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={moveDown} disabled={idx === sectionOrder.length - 1} className="p-1 text-slate-500 hover:text-white disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                    </div>
                  </div>

                  {isVisible && sectionId === "ai_briefing" && (
                    <div className="space-y-4 mt-4 pt-4 border-t border-slate-700/50">
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-slate-400">헤드라인</label>
                        <input
                          value={headline}
                          onChange={(e) => setHeadline(e.target.value)}
                          className="w-full bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                          placeholder="매거진 제목을 입력하세요"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-slate-400">AI 브리핑 내용</label>
                        <textarea
                          value={briefing}
                          onChange={(e) => setBriefing(e.target.value)}
                          className="w-full h-32 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2 text-[12px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-slate-600"
                          placeholder="고객에게 전달할 핵심 메시지를 입력하세요"
                        />
                      </div>
                    </div>
                  )}

                  {isVisible && sectionId === "broker_comment" && (
                    <div className="space-y-3 mt-4 pt-4 border-t border-slate-700/50">
                      <textarea
                        value={brokerComment}
                        onChange={(e) => setBrokerComment(e.target.value)}
                        className="w-full h-20 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2.5 text-[12px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-slate-600"
                        placeholder="간단한 코멘트를 입력하세요"
                      />
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={handleAiExpand}
                        disabled={aiLoading || !brokerComment.trim()}
                        className="flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        ✨ AI 확장
                      </motion.button>
                      <AnimatePresence>
                        {aiExpandedComment && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="p-3 bg-indigo-500/8 border border-indigo-500/20 rounded-lg space-y-2">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Sparkles className="w-3 h-3 text-indigo-400" />
                                <span className="text-[10px] font-bold text-indigo-300">AI 확장 결과</span>
                              </div>
                              <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{aiExpandedComment}</p>
                              <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={insertCommentToBriefing}
                                className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 transition-all"
                              >
                                <Plus className="w-3 h-3" />
                                브리핑에 삽입
                              </motion.button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {isVisible && sectionId === "action_list" && (
                    <div className="space-y-2 mt-4 pt-4 border-t border-slate-700/50">
                      <label className="text-[11px] font-semibold text-slate-400">오늘의 추천 액션 (줄바꿈으로 구분)</label>
                      <textarea
                        value={actionList.join("\\n")}
                        onChange={(e) => setActionList(e.target.value.split("\\n").filter(a => a.trim().length > 0))}
                        className="w-full h-24 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2 text-[12px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-slate-600"
                        placeholder="예: 금리 인하 전 매수 타이밍 확보\\n강남권 꼬마빌딩 임장 예약"
                      />
                    </div>
                  )}

                  {isVisible && sectionId === "call_script" && (
                    <div className="space-y-2 mt-4 pt-4 border-t border-slate-700/50">
                      <label className="text-[11px] font-semibold text-slate-400">추천 상담 멘트</label>
                      <textarea
                        value={callScript}
                        onChange={(e) => setCallScript(e.target.value)}
                        className="w-full h-20 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2 text-[12px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-slate-600"
                        placeholder="고객 통화 시 사용할 추천 스크립트를 입력하세요"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

      `;

content = content.slice(0, editCaseStart) + editSectionCode + content.slice(newsCaseStart);

fs.writeFileSync(file, content);
console.log('Done refactoring UI');
