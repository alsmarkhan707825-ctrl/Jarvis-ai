import React, { useEffect, useRef } from 'react';
import type { EmotionType, OrbState, PersonalityId, ThemeMode } from '../types/jarvis';

interface SiriOrbProps {
  state: OrbState;
  personality: PersonalityId;
  emotion: EmotionType;
  themeMode: ThemeMode;
  audioLevel: number;
  frequencyBins: Uint8Array | null;
  paused?: boolean;
  onOrbTap?: () => void;
  onTouchStateChange?: (touching: boolean) => void;
}

interface RibbonLayer {
  phaseOffset: number;
  speed: number;
  freq: number;
  ampScale: number;
  rgbLight: [number, number, number];
  rgbDark: [number, number, number];
  alpha: number;
}

const JARVIS_RIBBONS: RibbonLayer[] = [
  { phaseOffset: 0.0, speed: 1.5, freq: 2.2, ampScale: 1.0, rgbLight: [37, 99, 235], rgbDark: [56, 189, 248], alpha: 0.72 },
  { phaseOffset: 1.6, speed: 2.1, freq: 3.1, ampScale: 0.85, rgbLight: [6, 182, 212], rgbDark: [34, 211, 238], alpha: 0.65 },
  { phaseOffset: 3.1, speed: 1.25, freq: 1.7, ampScale: 0.92, rgbLight: [99, 102, 241], rgbDark: [129, 140, 248], alpha: 0.58 },
  { phaseOffset: 4.5, speed: 2.6, freq: 3.8, ampScale: 0.68, rgbLight: [14, 165, 233], rgbDark: [16, 185, 129], alpha: 0.52 },
];

const GIRL_RIBBONS: RibbonLayer[] = [
  { phaseOffset: 0.0, speed: 1.5, freq: 2.2, ampScale: 1.0, rgbLight: [225, 29, 72], rgbDark: [251, 113, 133], alpha: 0.74 },
  { phaseOffset: 1.7, speed: 2.0, freq: 3.0, ampScale: 0.88, rgbLight: [168, 85, 247], rgbDark: [192, 132, 252], alpha: 0.65 },
  { phaseOffset: 3.3, speed: 1.35, freq: 1.8, ampScale: 0.9, rgbLight: [236, 72, 153], rgbDark: [244, 114, 182], alpha: 0.6 },
  { phaseOffset: 4.8, speed: 2.4, freq: 3.5, ampScale: 0.7, rgbLight: [56, 189, 248], rgbDark: [103, 232, 249], alpha: 0.48 },
];

export const SiriOrb: React.FC<SiriOrbProps> = ({
  state,
  personality,
  emotion,
  themeMode,
  audioLevel,
  frequencyBins,
  paused = false,
  onOrbTap,
  onTouchStateChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    state,
    personality,
    emotion,
    themeMode,
    audioLevel,
    frequencyBins,
    paused,
  });
  const rippleRef = useRef(0);
  const touchPosRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0.5,
    y: 0.5,
    active: false,
  });

  stateRef.current = {
    state,
    personality,
    emotion,
    themeMode,
    audioLevel,
    frequencyBins,
    paused,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    let phase = 0;
    let lastTs = performance.now();

    const size = 300;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const drawFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const cur = stateRef.current;
      const isDark = cur.themeMode === 'black';
      const isGirl = cur.personality === 'girl';
      const ribbons = isGirl ? GIRL_RIBBONS : JARVIS_RIBBONS;

      let speedMult = 1.0;
      let waveEnergy = 0.22;
      if (cur.state === 'LISTENING') {
        speedMult = 1.85;
        waveEnergy = 0.5 + Math.min(0.95, cur.audioLevel * 1.9);
      } else if (cur.state === 'SPEAKING') {
        speedMult = 2.25;
        waveEnergy = 0.58 + Math.min(1.05, cur.audioLevel * 2.1);
      } else if (cur.state === 'THINKING') {
        speedMult = 2.6;
        waveEnergy = 0.45;
      } else if (cur.state === 'TOUCH') {
        speedMult = 1.7;
        waveEnergy = 0.55;
      } else if (cur.state === 'ERROR') {
        speedMult = 1.4;
        waveEnergy = 0.42;
      }

      if (!cur.paused && !reducedMotion) {
        phase += dt * speedMult;
      }
      rippleRef.current = Math.max(0, rippleRef.current - dt * 1.8);

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const baseR = 98 + waveEnergy * 9 + rippleRef.current * 11;

      // Outer atmospheric Siri aura
      const auraGrad = ctx.createRadialGradient(cx, cy, baseR * 0.35, cx, cy, baseR * 1.45);
      if (cur.state === 'ERROR') {
        auraGrad.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
        auraGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      } else if (isGirl) {
        auraGrad.addColorStop(0, isDark ? 'rgba(244, 63, 94, 0.32)' : 'rgba(225, 29, 72, 0.2)');
        auraGrad.addColorStop(0.55, isDark ? 'rgba(168, 85, 247, 0.16)' : 'rgba(168, 85, 247, 0.1)');
        auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        auraGrad.addColorStop(0, isDark ? 'rgba(56, 189, 248, 0.34)' : 'rgba(37, 99, 235, 0.22)');
        auraGrad.addColorStop(0.55, isDark ? 'rgba(99, 102, 241, 0.18)' : 'rgba(6, 182, 212, 0.11)');
        auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 1.45, 0, Math.PI * 2);
      ctx.fill();

      // Clip inside main Siri sphere
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
      ctx.clip();

      // Deep spherical base gradient
      const sphereBg = ctx.createRadialGradient(
        cx - baseR * 0.28,
        cy - baseR * 0.3,
        baseR * 0.1,
        cx,
        cy,
        baseR
      );
      if (isDark) {
        sphereBg.addColorStop(0, isGirl ? '#2a1228' : '#102542');
        sphereBg.addColorStop(0.65, '#09101d');
        sphereBg.addColorStop(1, '#04070e');
      } else {
        sphereBg.addColorStop(0, '#ffffff');
        sphereBg.addColorStop(0.6, isGirl ? '#fdf2f8' : '#eff6ff');
        sphereBg.addColorStop(1, isGirl ? '#fbcfe8' : '#dbeafe');
      }
      ctx.fillStyle = sphereBg;
      ctx.fillRect(cx - baseR, cy - baseR, baseR * 2, baseR * 2);

      // Additive fluid Siri cosine/sine wave ribbons inside the sphere
      ctx.globalCompositeOperation = isDark ? 'screen' : 'multiply';
      for (let rIdx = 0; rIdx < ribbons.length; rIdx++) {
        const layer = ribbons[rIdx];
        const [r, g, b] =
          cur.state === 'ERROR'
            ? [239, 68, 68]
            : isDark
              ? layer.rgbDark
              : layer.rgbLight;

        const binVal =
          cur.frequencyBins && cur.frequencyBins.length > rIdx * 4
            ? cur.frequencyBins[rIdx * 4] / 255
            : 0;
        const amp = (14 + waveEnergy * 28 + binVal * 26) * layer.ampScale;

        ctx.beginPath();
        const startX = cx - baseR;
        const endX = cx + baseR;
        ctx.moveTo(startX, cy);

        for (let x = startX; x <= endX; x += 3) {
          const nx = (x - cx) / baseR; // -1..1
          const envelope = Math.pow(Math.max(0, 1 - nx * nx), 1.35);
          const yWave =
            Math.sin(nx * Math.PI * layer.freq + phase * layer.speed + layer.phaseOffset) *
            Math.cos(nx * Math.PI * 0.8 - phase * 0.9 + rIdx) *
            amp *
            envelope;
          ctx.lineTo(x, cy + yWave);
        }

        for (let x = endX; x >= startX; x -= 3) {
          const nx = (x - cx) / baseR;
          const envelope = Math.pow(Math.max(0, 1 - nx * nx), 1.35);
          const yWave =
            -Math.sin(nx * Math.PI * layer.freq + phase * layer.speed + layer.phaseOffset + 0.9) *
            amp *
            0.82 *
            envelope;
          ctx.lineTo(x, cy + yWave);
        }

        ctx.closePath();
        const ribbonGrad = ctx.createLinearGradient(startX, cy - amp, endX, cy + amp);
        ribbonGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.08)`);
        ribbonGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${layer.alpha})`);
        ribbonGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.08)`);
        ctx.fillStyle = ribbonGrad;
        ctx.fill();

        // Crisp glowing wave spine
        ctx.beginPath();
        for (let x = startX; x <= endX; x += 3) {
          const nx = (x - cx) / baseR;
          const envelope = Math.pow(Math.max(0, 1 - nx * nx), 1.25);
          const yWave =
            Math.sin(nx * Math.PI * layer.freq + phase * layer.speed + layer.phaseOffset) *
            Math.cos(nx * Math.PI * 0.8 - phase * 0.9 + rIdx) *
            amp *
            envelope;
          if (x === startX) ctx.moveTo(x, cy + yWave);
          else ctx.lineTo(x, cy + yWave);
        }
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(0.95, layer.alpha + 0.2)})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Specular glass highlight (gives genuine 3D Siri orb volume)
      const specGrad = ctx.createRadialGradient(
        cx - baseR * 0.34,
        cy - baseR * 0.42,
        4,
        cx - baseR * 0.2,
        cy - baseR * 0.25,
        baseR * 0.85
      );
      specGrad.addColorStop(0, isDark ? 'rgba(255, 255, 255, 0.26)' : 'rgba(255, 255, 255, 0.88)');
      specGrad.addColorStop(0.5, isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.2)');
      specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = specGrad;
      ctx.fillRect(cx - baseR, cy - baseR, baseR * 2, baseR * 2);

      // Touch shimmer
      if (touchPosRef.current.active) {
        const tx = touchPosRef.current.x * size;
        const ty = touchPosRef.current.y * size;
        const tGrad = ctx.createRadialGradient(tx, ty, 2, tx, ty, 44);
        tGrad.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
        tGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = tGrad;
        ctx.fillRect(cx - baseR, cy - baseR, baseR * 2, baseR * 2);
      }

      ctx.restore();

      // Rotating luminous outer orbital arc (Siri activation ring)
      const ringColor =
        cur.state === 'ERROR'
          ? 'rgba(239, 68, 68, 0.85)'
          : isGirl
            ? isDark
              ? 'rgba(244, 114, 182, 0.82)'
              : 'rgba(225, 29, 72, 0.68)'
            : isDark
              ? 'rgba(56, 189, 248, 0.85)'
              : 'rgba(37, 99, 235, 0.7)';

      ctx.beginPath();
      ctx.arc(cx, cy, baseR + 2, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (cur.state !== 'IDLE') {
        ctx.beginPath();
        ctx.arc(cx, cy, baseR + 7, phase * 1.4, phase * 1.4 + Math.PI * 1.15);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, baseR + 12, -phase * 1.1, -phase * 1.1 + Math.PI * 0.75);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Romantic heart pulse halo when emotion === Romantic
      if (cur.emotion === 'Romantic' && cur.state !== 'ERROR') {
        ctx.beginPath();
        ctx.arc(cx, cy, baseR + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.38)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();

      if (!reducedMotion) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    rafId = window.requestAnimationFrame(drawFrame);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      <button
        type="button"
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          touchPosRef.current = {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
            active: true,
          };
          rippleRef.current = 1;
          onTouchStateChange?.(true);
        }}
        onPointerMove={(e) => {
          if (!touchPosRef.current.active) return;
          const rect = e.currentTarget.getBoundingClientRect();
          touchPosRef.current = {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
            active: true,
          };
        }}
        onPointerUp={() => {
          touchPosRef.current.active = false;
          onTouchStateChange?.(false);
        }}
        onPointerLeave={() => {
          touchPosRef.current.active = false;
          onTouchStateChange?.(false);
        }}
        onClick={onOrbTap}
        aria-label="Siri Style JARVIS Orb"
        className="relative w-[240px] h-[240px] sm:w-[276px] sm:h-[276px] rounded-full flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-transform active:scale-[0.98]"
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-full pointer-events-none"
        />
      </button>
    </div>
  );
};
