'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  life: number;
}

const COLORS = [
  '#f59e0b', '#10b981', '#6366f1', '#f43f5e',
  '#0ea5e9', '#a855f7', '#ec4899', '#84cc16',
];

interface ConfettiEffectProps {
  active?: boolean;
  duration?: number; // ms to keep emitting, default 3000
  particleCount?: number; // total particles, default 120
}

export function ConfettiEffect({
  active = true,
  duration = 3000,
  particleCount = 120,
}: ConfettiEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to window
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Spawn particles in bursts
    const spawnBurst = (count: number) => {
      for (let i = 0; i < count; i++) {
        const x = canvas.width * (0.2 + Math.random() * 0.6);
        particlesRef.current.push({
          x,
          y: -10,
          vx: (Math.random() - 0.5) * 8,
          vy: Math.random() * 4 + 2,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
          size: Math.random() * 8 + 4,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.2,
          opacity: 1,
          life: 1,
        });
      }
    };

    startTimeRef.current = performance.now();
    spawnBurst(particleCount * 0.6);

    // Second burst at 500ms
    const burst2 = setTimeout(() => spawnBurst(particleCount * 0.4), 500);

    const animate = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter((p) => p.opacity > 0.01);

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.vx *= 0.99; // air resistance
        p.rotation += p.rotationSpeed;

        // Fade out when approaching bottom
        if (p.y > canvas.height * 0.7) {
          p.opacity -= 0.02;
        }
        p.life = Math.max(0, p.life - 0.003);
        p.opacity = Math.min(p.opacity, p.life);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }

      if (particlesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(burst2);
      window.removeEventListener('resize', resize);
      particlesRef.current = [];
    };
  }, [active, duration, particleCount]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999]"
      aria-hidden="true"
    />
  );
}
