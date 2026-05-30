"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "md";
}

export function ThemeToggle({ className, size = "md" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "rounded-xl bg-white/10 animate-pulse",
          size === "sm" ? "w-8 h-8" : "w-9 h-9",
          className
        )}
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className={cn(
        "relative flex items-center justify-center rounded-xl transition-all",
        "border border-white/10 hover:border-white/20",
        "bg-white/5 hover:bg-white/10",
        "active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        size === "sm" ? "w-8 h-8" : "w-9 h-9",
        className
      )}
    >
      {isDark ? (
        <Sun
          className={cn(
            "text-amber-400 transition-transform",
            size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"
          )}
          strokeWidth={2}
        />
      ) : (
        <Moon
          className={cn(
            "text-blue-400 transition-transform",
            size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"
          )}
          strokeWidth={2}
        />
      )}
    </button>
  );
}
