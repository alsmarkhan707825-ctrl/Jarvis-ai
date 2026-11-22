import React, { useEffect, useRef, useState } from 'react';
import type { OrbState, PersonalityId } from '../types/jarvis';

interface FloatingJarvisBubbleProps {
  visible: boolean;
  orbState: OrbState;
  voiceLoopActive: boolean;
  personality: PersonalityId;
  onActivate: () => void;
  onDeactivate: () => void;
}

export const FloatingJarvisBubble: React.FC<FloatingJarvisBubbleProps> = ({
  visible,
  orbState,
  voiceLoopActive,
  personality,
  onActivate,
  onDeactivate,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 18, y: 120 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{
    dragging: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 18,
    originY: 120,
  });

  const lastTapAtRef = useRef<number>(0);
  const singleTapTimerRef = useRef<number | null>(null);

  const isActive =
    voiceLoopActive ||
    orbState === 'LISTENING' ||
    orbState === 'THINKING' ||
    orbState === 'SPEAKING';

  const stateRef = useRef({ orbState, personality, isActive });
  stateRef.current = { orbState, personality, isActive };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPos({
        x: Math.max(14, window.innerWidth - 82),
        y: Math.max(88, window.innerHeight - 170),
      });
    }
    return () => {
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
      }
    };
  }, []);

  // 60fps Animated Mini Siri Wave Orb Canvas
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 64;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let phase = 0;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 28;

    const draw = () => {
      const { orbState: curState, personality: curPerson, isActive: curActive } = stateRef.current;
      const speed =
        curState === 'SPEAKING'
          ? 0.085
          : curState === 'LISTENING'
            ? 0.065
            : curState === 'THINKING'
              ? 0.055
              : curActive
                ? 0.045
                : 0.025;
      phase += speed;

      ctx.clearRect(0, 0, size, size);

      // Clip into pure circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      // Deep luminous orb sphere gradient
      const bgGrad = ctx.createRadialGradient(cx - 6, cy - 8, 4, cx, cy, radius);
      if (curPerson === 'girl') {
        bgGrad.addColorStop(0, curActive ? '#FDA4AF' : '#4C1D95');
        bgGrad.addColorStop(0.48, curActive ? '#E11D48' : '#31105E');
        bgGrad.addColorStop(1, '#090D16');
      } else {
        bgGrad.addColorStop(0, curActive ? '#67E8F9' : '#1E3A8A');
        bgGrad.addColorStop(0.5, curActive ? '#2563EB' : '#0F172A');
        bgGrad.addColorStop(1, '#05070B');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, size, size);

      // Swirling multi-ribbon Siri waves inside the circle
      const palettes =
        curPerson === 'girl'
          ? [
              'rgba(244, 63, 94, 0.72)',
              'rgba(192, 132, 252, 0.72)',
              'rgba(56, 189, 248, 0.58)',
            ]
          : [
              'rgba(56, 189, 248, 0.78)',
              'rgba(99, 102, 241, 0.72)',
              'rgba(34, 211, 238, 0.62)',
            ];

      ctx.globalCompositeOperation = 'screen';
      palettes.forEach((strokeColor, idx) => {
        ctx.beginPath();
        const amp = curActive ? 5.2 + idx * 1.1 : 2.8 + idx * 0.6;
        const freq = 0.16 + idx * 0.04;
        const offset = idx * 2.1;

        for (let x = 2; x <= size - 2; x += 2) {
          const norm = Math.sin(((x - 2) / (size - 4)) * Math.PI);
          const y =
            cy +
            Math.sin(x * freq + phase * (idx % 2 === 0 ? 1 : -1.2) + offset) * amp * norm +
            Math.cos(x * 0.09 - phase * 0.7 + offset) * (amp * 0.35) * norm;
          if (x === 2) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = curActive ? 2.4 : 1.7;
        ctx.stroke();
      });

      // Rotating inner energy ring
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 4.5, phase * 1.1, phase * 1.1 + Math.PI * 0.95);
      ctx.strokeStyle =
        curPerson === 'girl'
          ? curActive
            ? 'rgba(253, 164, 175, 0.85)'
            : 'rgba(192, 132, 252, 0.45)'
          : curActive
            ? 'rgba(125, 211, 252, 0.9)'
            : 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Subtle glossy highlight at top
      const gloss = ctx.createRadialGradient(cx - 7, cy - 11, 1, cx - 5, cy - 8, 16);
      gloss.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gloss;
      ctx.fillRect(0, 0, size, size);

      ctx.restore();

      // Crisp luminous outer rim
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = curActive
        ? curPerson === 'girl'
          ? 'rgba(251, 113, 133, 0.95)'
          : 'rgba(56, 189, 248, 0.95)'
        : 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = curActive ? 2 : 1.2;
      ctx.stroke();

      rafRef.current = window.requestAnimationFrame(draw);
    };

    rafRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [visible]);

  if (!visible) return null;

  const handleTap = () => {
    const now = Date.now();
    const delta = now - lastTapAtRef.current;
    if (delta > 0 && delta < 320) {
      // Double Tap -> Activate JARVIS listening!
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapAtRef.current = 0;
      onActivate();
    } else {
      lastTapAtRef.current = now;
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = window.setTimeout(() => {
        singleTapTimerRef.current = null;
        // Single Tap -> Turn JARVIS OFF immediately
        onDeactivate();
      }, 320);
    }
  };

  return (
    <div
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        touchAction: 'none',
      }}
      className="fixed z-50 select-none"
    >
      <button
        type="button"
        onPointerDown={(e) => {
          dragRef.current = {
            dragging: true,
            moved: false,
            startX: e.clientX,
            startY: e.clientY,
            originX: pos.x,
            originY: pos.y,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.dragging) return;
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;
          if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
            dragRef.current.moved = true;
          }
          if (dragRef.current.moved) {
            const maxX = window.innerWidth - 72;
            const maxY = window.innerHeight - 80;
            setPos({
              x: Math.max(8, Math.min(maxX, dragRef.current.originX + dx)),
              y: Math.max(56, Math.min(maxY, dragRef.current.originY + dy)),
            });
          }
        }}
        onPointerUp={() => {
          const wasMoved = dragRef.current.moved;
          dragRef.current.dragging = false;
          if (!wasMoved) {
            handleTap();
          }
        }}
        aria-label="Floating JARVIS Animated Logo (Double tap to activate, Single tap to turn off)"
        title="Double-tap: Activate JARVIS · Single-tap: Turn OFF"
        className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-transform ${
          isActive
            ? personality === 'girl'
              ? 'scale-105 shadow-[0_0_26px_rgba(244,63,94,0.55)]'
              : 'scale-105 shadow-[0_0_26px_rgba(56,189,248,0.55)]'
            : 'shadow-[0_10px_28px_rgba(15,23,42,0.35)] hover:scale-105'
        }`}
      >
        {isActive && (
          <span
            aria-hidden="true"
            className={`absolute -inset-1 rounded-full border animate-ping ${
              personality === 'girl' ? 'border-rose-400/60' : 'border-cyan-400/60'
            }`}
          />
        )}
        <canvas
          ref={canvasRef}
          width={64}
          height={64}
          className="w-16 h-16 rounded-full block pointer-events-none"
        />
      </button>
    </div>
  );
};
