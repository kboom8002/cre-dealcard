"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, ArrowLeft, Building2, User, TrendingUp, Compass } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";

interface UnifiedSearchBarProps {
  placeholder?: string;
  initialValue?: string;
  type?: string;
  className?: string;
}

const RECENT_KEYWORDS_KEY = "dealcard_recent_searches";

function readInitialRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(RECENT_KEYWORDS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export function UnifiedSearchBar({
  placeholder = "권역, 매물, 또는 전문 중개인 검색...",
  initialValue = "",
  type,
  className = "",
}: UnifiedSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const haptic = useHaptic();

  const externalQuery = searchParams?.get("q") || initialValue || "";
  const [draftQuery, setDraftQuery] = useState<string | null>(null);
  const query = draftQuery !== null ? draftQuery : externalQuery;

  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(readInitialRecentSearches);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFocused) return;
    overlayInputRef.current?.focus();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFocused(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isFocused]);

  const saveRecentSearch = (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    try {
      const filtered = recentSearches.filter((s) => s !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, 5);
      setRecentSearches(updated);
      window.localStorage.setItem(RECENT_KEYWORDS_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
  };

  const handleSearch = (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    saveRecentSearch(trimmed);
    haptic.medium();
    setDraftQuery(null);
    setIsFocused(false);

    const params = new URLSearchParams();
    params.set("q", trimmed);

    const currentType = type || searchParams?.get("type");
    if (currentType) {
      params.set("type", currentType);
    } else {
      params.set("type", "deal");
    }

    router.push(`/search?${params.toString()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch(query);
    }
  };

  const clearQuery = () => {
    setDraftQuery("");
    haptic.light();
    if (isFocused) {
      overlayInputRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  };

  const handleRecommendClick = (kw: string, forceType?: string) => {
    haptic.light();
    setDraftQuery(null);
    saveRecentSearch(kw);
    setIsFocused(false);

    const params = new URLSearchParams();
    params.set("q", kw);

    const targetType = forceType || type || searchParams?.get("type") || "deal";
    params.set("type", targetType);

    router.push(`/search?${params.toString()}`);
  };

  const deleteRecentSearch = (kw: string) => {
    haptic.light();
    const updated = recentSearches.filter((s) => s !== kw);
    setRecentSearches(updated);
    try {
      window.localStorage.setItem(RECENT_KEYWORDS_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
  };

  const recommendedChips = [
    { label: "GBD 오피스 매물", query: "GBD 오피스", type: "deal", icon: Building2 },
    { label: "강남 전문 중개인", query: "강남", type: "broker", icon: User },
    { label: "여의도 시세", query: "여의도 시세", type: "market", icon: TrendingUp },
    { label: "성수 상가 임대", query: "성수 상가", type: "space", icon: Compass },
  ];

  return (
    <div className={`relative w-full ${className}`}>
      {/* Daylight Search Bar */}
      <div className="relative flex items-center w-full min-h-[48px] h-12 md:h-14 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 transition-all shadow-sm overflow-hidden">
        <div className="flex items-center justify-center pl-4 text-slate-600 pointer-events-none">
          <Search className="w-5 h-5" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          aria-label="검색어 입력"
          onClick={() => {
            setIsFocused(true);
            haptic.light();
          }}
          onChange={(e) => setDraftQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full h-full bg-transparent px-3 text-base text-slate-900 placeholder:text-slate-500 outline-none cursor-pointer"
          readOnly
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={clearQuery}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center mr-1 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => handleSearch(query)}
          className="min-h-[44px] h-full bg-blue-700 hover:bg-blue-800 px-5 md:px-7 text-sm font-semibold text-white transition-colors shrink-0"
        >
          검색
        </button>
      </div>

      {/* Fullscreen Mobile & Desktop Overlay for Autocomplete / Recommendations */}
      <AnimatePresence>
        {isFocused && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="통합 검색"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-white/98 backdrop-blur-md flex flex-col text-slate-900"
          >
            {/* Header / Search Input */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-200 bg-slate-50/80">
              <button
                type="button"
                aria-label="검색창 닫기"
                onClick={() => {
                  setIsFocused(false);
                  haptic.light();
                }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-slate-100 rounded-full text-slate-700 hover:text-slate-900 transition-all"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>

              <div className="flex-1 flex items-center h-12 bg-white rounded-xl border border-slate-200 px-3 overflow-hidden shadow-xs">
                <Search className="w-5 h-5 text-slate-600 mr-2 shrink-0" />
                <input
                  ref={overlayInputRef}
                  type="text"
                  value={query}
                  aria-label="통합 검색어 입력"
                  onChange={(e) => setDraftQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  className="w-full h-full bg-transparent text-slate-900 placeholder:text-slate-500 outline-none text-base"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={clearQuery}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleSearch(query)}
                className="min-h-[44px] bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold h-12 px-5 rounded-xl transition-all shrink-0"
              >
                검색
              </button>
            </div>

            {/* Recommendations Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl mx-auto w-full">
              {/* Popular recommendations */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-slate-600 tracking-wider mb-3">
                  추천 검색어
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {recommendedChips.map((chip) => {
                    const ChipIcon = chip.icon;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => handleRecommendClick(chip.query, chip.type)}
                        className="flex min-h-[44px] items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100 hover:border-slate-300 text-left transition-all group"
                      >
                        <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 group-hover:scale-105 transition-transform">
                          <ChipIcon className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900">
                          {chip.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-600 tracking-wider">
                      최근 검색어
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        haptic.light();
                        setRecentSearches([]);
                        try {
                          window.localStorage.removeItem(RECENT_KEYWORDS_KEY);
                        } catch {
                          // ignore
                        }
                      }}
                      className="min-h-[44px] px-3 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    >
                      전체 삭제
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {recentSearches.map((kw) => (
                      <li
                        key={kw}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50/80 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => handleRecommendClick(kw)}
                          className="flex-1 min-h-[44px] flex items-center gap-3 px-2 text-left text-sm font-medium text-slate-900 group"
                        >
                          <Search className="w-4 h-4 text-slate-600 group-hover:text-blue-700 transition-colors shrink-0" />
                          <span>{kw}</span>
                        </button>
                        <button
                          type="button"
                          aria-label="최근 검색어 삭제"
                          onClick={() => deleteRecentSearch(kw)}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-600 hover:text-rose-700 hover:bg-rose-50 transition-colors shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
