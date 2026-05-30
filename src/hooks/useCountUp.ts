"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts from 0 to `end` when the element enters the viewport.
 * Respects prefers-reduced-motion (skips animation).
 */
export function useCountUp(
  end: number,
  options: {
    duration?: number; // ms
    delay?: number; // ms before start
    decimals?: number;
    separator?: string;
  } = {}
) {
  const { duration = 1200, delay = 0, decimals = 0, separator = "," } = options;
  const [value, setValue] = useState(0);
  const ref = useRef<Element | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Respect prefers-reduced-motion
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(end);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;

          const timer = setTimeout(() => {
            const startTime = performance.now();
            const animate = (now: number) => {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / duration, 1);
              // Ease out cubic
              const eased = 1 - Math.pow(1 - progress, 3);
              const current = Math.round(eased * end * Math.pow(10, decimals)) / Math.pow(10, decimals);
              setValue(current);
              if (progress < 1) requestAnimationFrame(animate);
            };
            requestAnimationFrame(animate);
          }, delay);

          return () => clearTimeout(timer);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration, delay, decimals]);

  const formatted =
    decimals > 0
      ? value.toFixed(decimals)
      : new Intl.NumberFormat("ko-KR", {}).format(value).replace(/,/g, separator);

  return { value, formatted, ref };
}
