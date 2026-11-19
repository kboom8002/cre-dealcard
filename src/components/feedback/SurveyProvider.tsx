"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface SurveyConfig {
  id: string;
  title: string;
  question: string;
  type: "rating" | "text" | "choice";
  options?: string[];
  metadata?: Record<string, unknown>;
}

interface SurveyContextProps {
  triggerSurvey: (config: SurveyConfig) => void;
}

const SurveyContext = createContext<SurveyContextProps | undefined>(undefined);

const SURVEY_SUBMIT_ERROR_MESSAGE =
  "의견 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.";

export function SurveyProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SurveyConfig | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [response, setResponse] = useState<string | number>("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const triggerSurvey = (surveyConfig: SurveyConfig) => {
    setConfig(surveyConfig);
    setResponse("");
    setSubmitted(false);
    setIsSubmitting(false);
    setErrorMessage(null);
    setIsOpen(true);
  };

  const handleSubmit = async () => {
    if (!config || isSubmitting) return;
    setErrorMessage(null);
    setIsSubmitting(true);

    const structuredField =
      config.type === "rating"
        ? { rating: Number(response) }
        : config.type === "choice"
          ? { choice: String(response) }
          : { comment: String(response).slice(0, 500) };

    try {
      const res = await fetch("/api/public/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "activity_event",
          eventType: "survey_response",
          entityType: "system",
          metadata: {
            survey_id: config.id,
            ...structuredField,
            ...(config.metadata ?? {}),
          },
        }),
      });
      if (!res.ok) {
        setErrorMessage(SURVEY_SUBMIT_ERROR_MESSAGE);
        return;
      }
      setSubmitted(true);
      setTimeout(() => setIsOpen(false), 2000);
    } catch {
      setErrorMessage(SURVEY_SUBMIT_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SurveyContext.Provider value={{ triggerSurvey }}>
      {children}
      {isOpen && config && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={config.title}
            className="bg-white text-slate-900 border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl relative animate-in zoom-in-95 fade-in duration-200"
          >
            {!submitted ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="설문 닫기"
                  className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  ✕
                </button>
                <h3 className="text-lg font-bold text-slate-900 mb-2 pr-10">{config.title}</h3>
                <p className="text-sm text-slate-700 mb-6">{config.question}</p>

                {config.type === "rating" && (
                  <div className="flex gap-2 justify-between mb-6">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setErrorMessage(null);
                          setResponse(num);
                        }}
                        className={`min-h-[48px] min-w-[48px] w-12 h-12 rounded-xl border flex items-center justify-center font-bold text-lg transition-all active:scale-95 cursor-pointer ${
                          response === num
                            ? "bg-blue-700 text-white border-blue-700 shadow-sm"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-400 hover:bg-blue-50/50"
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
                        type="button"
                        onClick={() => {
                          setErrorMessage(null);
                          setResponse(opt);
                        }}
                        className={`w-full min-h-[44px] text-left px-4 py-3 rounded-xl border text-sm transition-all active:scale-95 cursor-pointer ${
                          response === opt
                            ? "bg-blue-50 text-blue-800 border-blue-600 font-semibold"
                            : "bg-slate-50 text-slate-800 border-slate-200 hover:border-blue-400"
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
                    onChange={(e) => {
                      setErrorMessage(null);
                      setResponse(e.target.value);
                    }}
                    aria-label={config.question}
                    className="w-full h-24 bg-slate-50 border border-slate-300 rounded-xl p-3 text-base text-slate-900 placeholder:text-slate-500 mb-6 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    placeholder="의견을 남겨주세요..."
                  />
                )}

                {errorMessage && (
                  <p
                    role="alert"
                    className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800"
                  >
                    {errorMessage}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!response || isSubmitting}
                  className="w-full min-h-[48px] bg-blue-700 text-white text-sm font-bold py-3 rounded-xl hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isSubmitting ? "전송 중..." : "제출하기"}
                </button>
              </>
            ) : (
              <div className="text-center py-6">
                <div className="text-4xl mb-4">🎉</div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  소중한 의견 감사합니다!
                </h3>
                <p className="text-sm text-slate-600">
                  CRE DealCard는 중개사님의 의견으로 발전합니다.
                </p>
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
