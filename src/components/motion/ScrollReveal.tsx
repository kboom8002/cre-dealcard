"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  /** Delay before animation starts (ms) */
  delay?: number;
  /** How much of the element must be visible to trigger (0-1) */
  amount?: number;
  /** Direction of the reveal */
  direction?: "up" | "down" | "left" | "right" | "scale";
  /** Only trigger once (standard for scroll reveals) */
  once?: boolean;
}

const directionVariants = {
  up: { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } },
  down: { hidden: { opacity: 0, y: -24 }, visible: { opacity: 1, y: 0 } },
  left: { hidden: { opacity: 0, x: 24 }, visible: { opacity: 1, x: 0 } },
  right: { hidden: { opacity: 0, x: -24 }, visible: { opacity: 1, x: 0 } },
  scale: {
    hidden: { opacity: 0, scale: 0.92 },
    visible: { opacity: 1, scale: 1 },
  },
};

export function ScrollReveal({
  children,
  className,
  delay = 0,
  amount = 0.2,
  direction = "up",
  once = true,
}: ScrollRevealProps) {
  const variants = directionVariants[direction];

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      transition={{
        duration: 0.5,
        delay: delay / 1000,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggered list wrapper — children animate in sequence.
 * Pair with ScrollRevealItem for each child.
 */
interface ScrollRevealListProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
  amount?: number;
}

export function ScrollRevealList({
  children,
  className,
  staggerDelay = 0.08,
  amount = 0.1,
}: ScrollRevealListProps) {
  return (
    <motion.div
      className={cn(className)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: 0.05,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Individual item within a ScrollRevealList.
 */
interface ScrollRevealItemProps {
  children: React.ReactNode;
  className?: string;
}

export function ScrollRevealItem({ children, className }: ScrollRevealItemProps) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
