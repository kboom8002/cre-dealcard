"use client";

import { useState } from "react";
import { motion } from "motion/react";

interface VibeCardFlipProps {
  front: React.ReactNode;
  back: React.ReactNode;
  className?: string;
  hintText?: string;
  hintColor?: string;
}

export function VibeCardFlip({
  front,
  back,
  className,
  hintText = "카드를 탭하면 Vibe 분석 상세를 볼 수 있습니다",
  hintColor = "rgba(255, 255, 255, 0.4)",
}: VibeCardFlipProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  return (
    <div className="flex flex-col items-center w-full">
      {/* 3D Perspective Wrapper */}
      <div
        className="w-full cursor-pointer"
        onClick={handleFlip}
        style={{
          perspective: 1200,
        }}
      >
        <motion.div
          className={className}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          style={{
            transformStyle: "preserve-3d",
            position: "relative",
            width: "100%",
          }}
        >
          {/* Front Side */}
          <div
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              width: "100%",
            }}
          >
            {front}
          </div>

          {/* Back Side */}
          <div
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              transform: "rotateY(180deg)",
            }}
          >
            {back}
          </div>
        </motion.div>
      </div>

      {/* Floating Flip Guide Indicator */}
      <motion.p
        className="text-[10px] mt-4 font-medium tracking-wide flex items-center gap-1 opacity-70"
        style={{ color: hintColor }}
        animate={{ y: [0, -3, 0] }}
        transition={{
          repeat: Infinity,
          duration: 2,
          ease: "easeInOut",
        }}
      >
        <span>🔄</span> {isFlipped ? "카드를 다시 탭하면 전면을 보여줍니다" : hintText}
      </motion.p>
    </div>
  );
}
