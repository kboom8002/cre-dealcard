"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export interface SurveyConfig {
  id: string;
  title: string;
  question: string;
  type: "rating" | "text" | "choice";
  options?: string[];
  metadata?: Record<string, any>;
}

interface SurveyContextProps {
  triggerSurvey: (config: SurveyConfig) => void;
}

const SurveyContext = createContext<SurveyContextProps | undefined>(undefined);

export function SurveyProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SurveyConfig | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [response, setResponse] = useState<string | number>("");
  const [submitted, setSubmitted] = useState(false);

  const triggerSurvey = (surveyConfig: SurveyConfig) => {
    setConfig(surveyConfig);
    setResponse("");
    setSubmitted(false);
    setIsOpen(true);
  };

  const handleSubmit = async () => {
    if (!config) return;

    try {
      const supabase = createClient();
      await supabase.from("activity_events").insert({
        actor_role: "user", // or broker if known
        event_type: "survey_response",
        metadata: {
          survey_id: config.id,
          response,
          ...config.metadata,
        },
      });
    } catch (e) {
      console.error(e);
    }
    setSubmitted(true);
    setTimeout(() => setIsOpen(false), 2000);
  };

  return (
    <SurveyContext.Provider value={{ triggerSurvey }}>
      {children}
      {isOpen && config && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative animate-in zoom-in-95 fade-in duration-200">
            {!submitted ? (
              <>
                <button onClick={() => setIsOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">✕</button>
                <h3 className="text-lg font-bold text-white mb-2">{config.title}</h3>
                <p className="text-sm text-slate-400 mb-6">{config.question}</p>

                {config.type === "rating" && (
                  <div className="flex gap-2 justify-between mb-6">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        onClick={() => setResponse(num)}
                        className={`w-12 h-12 rounded-xl border flex items-center justify-center font-bold text-lg transition-all active:scale-95 ${
                          response === num ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20" : "bg-slate-950 text-slate-400 border-slate-800 hover:border-indigo-500/50"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                )}
                {config.type === "choice" && config.options && (
                  <div className="space-y-2 mb-6">
                    {config.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setResponse(opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all active:scale-95 ${
                          response === opt ? "bg-indigo-600/20 text-indigo-400 border-indigo-500" : "bg-slate-950 text-slate-300 border-slate-800 hover:border-indigo-500/50"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
                {config.type === "text" && (
                  <textarea
                    value={response as string}
                    onChange={(e) => setResponse(e.target.value)}
                    className="w-full h-24 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white mb-6 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="의견을 남겨주세요..."
                  />
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!response}
                  className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  제출하기
                </button>
              </>
            ) : (
              <div className="text-center py-6">
                <div className="text-4xl mb-4">🎉</div>
                <h3 className="text-lg font-bold text-white mb-2">소중한 의견 감사합니다!</h3>
                <p className="text-sm text-slate-400">CRE DealCard는 중개사님의 의견으로 발전합니다.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </SurveyContext.Provider>
  );
}

export const useSurvey = () => {
  const context = useContext(SurveyContext);
  if (!context) throw new Error("useSurvey must be used within SurveyProvider");
  return context;
};
