"use client";

import { useEffect, useRef, useState } from "react";

export interface CountUpNumberProps {
  from: number;
  to: number;
  /** Total animation duration in ms (default 1500) */
  duration?: number;
  suffix?: string;
  className?: string;
  onComplete?: () => void;
}

export function CountUpNumber({
  from,
  to,
  duration = 1500,
  suffix = "",
  className,
  onComplete,
}: CountUpNumberProps) {
  const [current, setCurrent] = useState(from);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Keep ref in sync so we don't need to re-run effect on callback change
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Reset when from/to/duration changes
    setCurrent(from);
    startTimeRef.current = null;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    const range = to - from;

    function tick(timestamp: number) {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(from + range * eased);
      setCurrent(value);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setCurrent(to);
        rafRef.current = null;
        onCompleteRef.current?.();
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [from, to, duration]);

  return (
    <span className={className}>
      {current}
      {suffix}
    </span>
  );
}
