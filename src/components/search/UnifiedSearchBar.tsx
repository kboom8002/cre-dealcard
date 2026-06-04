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

export function UnifiedSearchBar({
  placeholder = "권역, 매물, 또는 전문 중개인 검색...",
  initialValue = "",
  type,
  className = "",
}: UnifiedSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const haptic = useHaptic();
  
  const [query, setQuery] = useState(initialValue || searchParams?.get("q") || "");
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEYWORDS_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored).slice(0, 5));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Update query if search parameter change
  useEffect(() => {
    const q = searchParams?.get("q") || "";
    setQuery(q);
  }, [searchParams]);

  const saveRecentSearch = (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    try {
      const filtered = recentSearches.filter((s) => s !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem(RECENT_KEYWORDS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    
    saveRecentSearch(trimmed);
    haptic.medium();
    setIsFocused(false);
    
    const params = new URLSearchParams();
    params.set("q", trimmed);
    
    // Preserve or apply type parameter
    const currentType = type || searchParams?.get("type");
    if (currentType) {
      params.set("type", currentType);
    } else {
      params.set("type", "deal"); // default to deal
    }
    
    router.push(`/search?${params.toString()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch(query);
    }
  };

  const clearQuery = () => {
    setQuery("");
    haptic.light();
    if (inputRef.current) inputRef.current.focus();
    if (overlayInputRef.current) overlayInputRef.current.focus();
  };

  const handleRecommendClick = (kw: string, forceType?: string) => {
    haptic.light();
    setQuery(kw);
    saveRecentSearch(kw);
    setIsFocused(false);
    
    const params = new URLSearchParams();
    params.set("q", kw);
    
    const targetType = forceType || type || searchParams?.get("type") || "deal";
    params.set("type", targetType);
    
    router.push(`/search?${params.toString()}`);
  };

  const deleteRecentSearch = (e: React.MouseEvent, kw: string) => {
    e.stopPropagation();
    haptic.light();
    const updated = recentSearches.filter((s) => s !== kw);
    setRecentSearches(updated);
    try {
      localStorage.setItem(RECENT_KEYWORDS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
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
      {/* Desktop Search Bar (and mobile fallback when not focused) */}
      <div 
        className="relative flex items-center w-full h-12 md:h-14 glass-subtle rounded-2xl border border-white/10 hover:border-white/20 transition-all shadow-lg overflow-hidden cursor-pointer"
        onClick={() => {
          setIsFocused(true);
          haptic.light();
        }}
      >
        <div className="flex items-center justify-center pl-4 text-muted-foreground pointer-events-none">
          <Search className="w-5 h-5" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full h-full bg-transparent px-3 text-sm md:text-base text-foreground placeholder:text-muted-foreground outline-none pointer-events-none md:pointer-events-auto"
          readOnly // force overlay modal on click
        />
        {query && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearQuery();
            }}
            className="flex items-center justify-center p-2 mr-1 hover:text-foreground text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSearch(query);
          }}
          className="h-full bg-primary hover:bg-primary/95 px-5 md:px-7 text-sm font-semibold text-primary-foreground transition-colors shrink-0"
        >
          검색
        </button>
      </div>

      {/* Fullscreen Mobile & Desktop Overlay for Autocomplete / Recommendations */}
      <AnimatePresence>
        {isFocused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col"
          >
            {/* Header / Search Input */}
            <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-background/50">
              <button
                onClick={() => {
                  setIsFocused(false);
                  haptic.light();
                }}
                className="p-2 hover:bg-white/5 rounded-full text-foreground transition-all"
                type="button"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              
              <div className="flex-1 flex items-center h-12 glass-subtle rounded-xl border border-white/10 px-3 overflow-hidden">
                <Search className="w-5 h-5 text-muted-foreground mr-2 shrink-0" />
                <input
                  ref={overlayInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  className="w-full h-full bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-base"
                  autoFocus
                />
                {query && (
                  <button
                    onClick={clearQuery}
                    className="p-1 hover:text-foreground text-muted-foreground transition-colors shrink-0"
                    type="button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              <button
                onClick={() => handleSearch(query)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold h-12 px-5 rounded-xl transition-all"
                type="button"
              >
                검색
              </button>
            </div>

            {/* Recommendations Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl mx-auto w-full">
              {/* Popular recommendations */}
              <div className="mb-8">
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-3">추천 검색어</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {recommendedChips.map((chip) => {
                    const ChipIcon = chip.icon;
                    return (
                      <button
                        key={chip.label}
                        onClick={() => handleRecommendClick(chip.query, chip.type)}
                        className="flex items-center gap-2.5 p-3 rounded-xl border border-white/5 bg-white/2.5 hover:bg-white/5 hover:border-white/10 text-left transition-all group"
                        type="button"
                      >
                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                          <ChipIcon className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{chip.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">최근 검색어</h3>
                    <button
                      onClick={() => {
                        haptic.light();
                        setRecentSearches([]);
                        localStorage.removeItem(RECENT_KEYWORDS_KEY);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      type="button"
                    >
                      전체 삭제
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {recentSearches.map((kw) => (
                      <li
                        key={kw}
                        onClick={() => handleRecommendClick(kw)}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 cursor-pointer group transition-colors"
                      >
                        <div className="flex items-center gap-3 text-sm text-foreground">
                          <Search className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          <span>{kw}</span>
                        </div>
                        <button
                          onClick={(e) => deleteRecentSearch(e, kw)}
                          className="p-1 hover:text-destructive text-muted-foreground transition-colors"
                          type="button"
                        >
                          <X className="w-3.5 h-3.5" />
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
