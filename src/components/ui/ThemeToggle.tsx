"use client";

import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { Sun, Moon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export function isFixedLightPaperRoute(
  pathname: string | null | undefined
): boolean {
  if (!pathname) return false;
  return (
    pathname === "/" ||
    pathname === "/broker" ||
    pathname.startsWith("/broker/") ||
    pathname === "/dc" ||
    pathname.startsWith("/dc/") ||
    pathname === "/d" ||
    pathname.startsWith("/d/") ||
    pathname === "/deal" ||
    pathname.startsWith("/deal/") ||
    pathname === "/im-lite" ||
    pathname.startsWith("/im-lite/") ||
    pathname === "/im-pro" ||
    pathname.startsWith("/im-pro/") ||
    pathname === "/magazine" ||
    pathname.startsWith("/magazine/") ||
    pathname === "/terms" ||
    pathname.startsWith("/terms/") ||
    pathname === "/privacy" ||
    pathname.startsWith("/privacy/") ||
    pathname === "/powered-by" ||
    pathname.startsWith("/powered-by/") ||
    pathname === "/guide" ||
    pathname.startsWith("/guide/") ||
    pathname === "/broker-profile" ||
    pathname.startsWith("/broker-profile/") ||
    pathname === "/hub" ||
    pathname.startsWith("/hub/") ||
    pathname === "/search" ||
    pathname.startsWith("/search/") ||
    pathname === "/space" ||
    pathname.startsWith("/space/") ||
    pathname === "/nda" ||
    pathname.startsWith("/nda/")
  );
}

export function doesPublicBottomNavSuppressOnRoute(
  pathname: string | null | undefined
): boolean {
  if (!pathname) return false;
  return (
    pathname === "/broker" ||
    pathname.startsWith("/broker/") ||
    pathname === "/dc" ||
    pathname.startsWith("/dc/") ||
    pathname === "/d" ||
    pathname.startsWith("/d/") ||
    pathname === "/deal" ||
    pathname.startsWith("/deal/") ||
    pathname === "/im-lite" ||
    pathname.startsWith("/im-lite/") ||
    pathname === "/im-pro" ||
    pathname.startsWith("/im-pro/") ||
    pathname.startsWith("/magazine/") ||
    pathname === "/nda" ||
    pathname.startsWith("/nda/") ||
    pathname === "/terms" ||
    pathname.startsWith("/terms/") ||
    pathname === "/privacy" ||
    pathname.startsWith("/privacy/") ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/reset-password" ||
    pathname === "/update-password"
  );
}

export function PublicContentShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideBottomGap = doesPublicBottomNavSuppressOnRoute(pathname);
  return (
    <div className={hideBottomGap ? undefined : "pb-16 md:pb-0"}>
      {children}
    </div>
  );
}

interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "md";
}

export function ThemeToggle({ className, size = "md" }: ThemeToggleProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  // Prevent hydration mismatch (서버/첫 하이드레이션은 false, 클라이언트 이후 true)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (isFixedLightPaperRoute(pathname)) {
    return null;
  }

  if (!mounted) {
    return (
      <div
        className={cn(
          "rounded-xl bg-slate-200 animate-pulse min-h-[44px] min-w-[44px]",
          size === "sm" ? "w-11 h-11" : "w-11 h-11",
          className
        )}
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className={cn(
        "relative flex items-center justify-center rounded-xl transition-all min-h-[44px] min-w-[44px]",
        "border border-slate-200 hover:border-slate-300",
        "bg-white/90 hover:bg-slate-100",
        "active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        size === "sm" ? "w-11 h-11" : "w-11 h-11",
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
