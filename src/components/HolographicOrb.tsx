import React, { useEffect, useRef } from 'react';
import type { EmotionType, OrbState, PersonalityId } from '../types/jarvis';

interface HolographicOrbProps {
  state: OrbState;
  personality: PersonalityId;
  emotion?: EmotionType;
  audioLevel: number;
  frequencyBins?: Uint8Array | null;
  paused?: boolean;
  onOrbTap?: () => void;
  onTouchStateChange?: (isTouching: boolean) => void;
}

interface OrbitalParticle {
  angle: number;
  orbitRadiusMult: number;
  speed: number;
  tilt: number;
  size: number;
  gold: boolean;
}

function createParticles(count: number): OrbitalParticle[] {
  const list: OrbitalParticle[] = [];
  for (let i = 0; i < count; i++) {
    list.push({
      angle: (i / count) * Math.PI * 2,
      orbitRadiusMult: 1.06 + ((i * 17) % 35) / 100,
      speed: (0.25 + ((i * 13) % 40) / 100) * (i % 2 === 0 ? 1 : -1),
      tilt: ((i * 29) % 100) / 100 - 0.5,
      size: 1.1 + ((i * 7) % 15) / 10,
      gold: i % 3 === 0,
    });
  }
  return list;
}

export const HolographicOrb: React.FC<HolographicOrbProps> = ({
  state,
  personality,
  emotion = 'Normal',
  audioLevel,
  frequencyBins,
  paused = false,
  onOrbTap,
  onTouchStateChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<OrbitalParticle[]>(createParticles(64));
  const stateRef = useRef({
    state,
    personality,
    emotion,
    audioLevel,
    frequencyBins,
  });
  const pointerRef = useRef({
    active: false,
    targetDx: 0,
    targetDy: 0,
    dx: 0,
    dy: 0,
    ripple: 0,
    downAt: 0,
  });

  stateRef.current = { state, personality, emotion, audioLevel, frequencyBins };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    let time = 0;
    let smoothLevel = 0;
    let smoothSpeed = 0.6;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      if (paused) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const {
        state: orbState,
        personality: mode,
        emotion: currentEmotion,
        audioLevel: rawLevel,
        frequencyBins: bins,
      } = stateRef.current;
      const ptr = pointerRef.current;

      const emotionBoost =
        currentEmotion === 'Excited' || currentEmotion === 'Laughing'
          ? 1.25
          : currentEmotion === 'Angry'
            ? 1.32
            : currentEmotion === 'Sad' || currentEmotion === 'Calm'
              ? 0.78
              : 1.0;

      const targetSpeed = prefersReducedMotion
        ? 0.1
        : (orbState === 'THINKING'
            ? 2.85
            : orbState === 'SPEAKING'
              ? 1.75
              : orbState === 'LISTENING'
                ? 1.4
                : orbState === 'ERROR'
                  ? 2.0
                  : 0.6) * emotionBoost;

      smoothSpeed += (targetSpeed - smoothSpeed) * 0.08;
      time += 0.016 * smoothSpeed;
      smoothLevel += (rawLevel - smoothLevel) * 0.24;

      ptr.dx += (ptr.targetDx - ptr.dx) * 0.15;
      ptr.dy += (ptr.targetDy - ptr.dy) * 0.15;
      ptr.ripple = Math.max(0, ptr.ripple * 0.94 - 0.004);

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2 + ptr.dx * 18;
      const cy = h / 2 + ptr.dy * 18;
      const baseRadius = Math.min(w, h) * 0.285;
      const dynamicBoost =
        orbState === 'LISTENING' || orbState === 'SPEAKING'
          ? smoothLevel * baseRadius * 0.22
          : orbState === 'TOUCH' || ptr.active
            ? baseRadius * 0.08
            : Math.sin(time * 1.4) * 2.5;

      const radius = baseRadius + dynamicBoost;
      const isError = orbState === 'ERROR';

      const primaryRgb = isError
        ? '239, 68, 68'
        : currentEmotion === 'Angry'
          ? '220, 68, 55'
          : mode === 'jadavis'
            ? '14, 165, 233'
            : mode === 'girl'
              ? '79, 108, 247'
              : '37, 99, 235';

      const accentRgb = isError
        ? '245, 158, 11'
        : mode === 'girl'
          ? '245, 196, 81'
          : mode === 'jadavis'
            ? '251, 191, 36'
            : '212, 175, 55';

      const glowRgb = isError ? '220, 38, 38' : mode === 'jadavis' ? '3, 105, 161' : '30, 64, 175';

      // 1. Volumetric Multi-Stop Royal Blue & Gold Aura
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius * 1.85);
      halo.addColorStop(0, `rgba(${primaryRgb}, ${0.3 + smoothLevel * 0.24})`);
      halo.addColorStop(0.45, `rgba(${glowRgb}, ${0.15 + smoothLevel * 0.1})`);
      halo.addColorStop(0.75, `rgba(${accentRgb}, 0.05)`);
      halo.addColorStop(1, 'rgba(4, 9, 24, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.85, 0, Math.PI * 2);
      ctx.fill();

      // 2. 3D-Projected Orbital Micro-Particle Constellation
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const a = p.angle + time * p.speed * (orbState === 'THINKING' ? 1.8 : 0.8);
        const radialExpand =
          p.orbitRadiusMult * radius +
          (orbState === 'LISTENING' || orbState === 'SPEAKING' ? smoothLevel * 22 : 0) +
          (ptr.active ? 10 : 0);
        const px = cx + Math.cos(a) * radialExpand + ptr.dx * 12;
        const py = cy + Math.sin(a) * radialExpand * (0.72 + p.tilt * 0.32) + ptr.dy * 12;
        const depthAlpha = 0.25 + (Math.sin(a) + 1) * 0.35;
        ctx.fillStyle = p.gold
          ? `rgba(${accentRgb}, ${depthAlpha})`
          : `rgba(147, 197, 253, ${depthAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size * (0.85 + smoothLevel * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Touch Interaction Shockwave Ripple
      if (ptr.ripple > 0.01) {
        const rippleR = radius * (1 + (1 - ptr.ripple) * 0.8);
        ctx.strokeStyle = `rgba(${accentRgb}, ${ptr.ripple * 0.72})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, rippleR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 4. Precision Degree-Tick Reticle Ring
      const reticleR = radius * 1.33;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.22);
      for (let t = 0; t < 36; t++) {
        const ta = (t / 36) * Math.PI * 2;
        const isMajor = t % 9 === 0;
        const innerTick = reticleR - (isMajor ? 6 : 3);
        ctx.strokeStyle = isMajor ? `rgba(${accentRgb}, 0.7)` : `rgba(96, 165, 250, 0.24)`;
        ctx.lineWidth = isMajor ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ta) * innerTick, Math.sin(ta) * innerTick);
        ctx.lineTo(Math.cos(ta) * reticleR, Math.sin(ta) * reticleR);
        ctx.stroke();
      }
      ctx.restore();

      // 5. Outer Rotating Holographic Ring
      const outerR = radius * 1.22;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.48);
      ctx.strokeStyle = `rgba(${primaryRgb}, 0.38)`;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([28, 12, 10, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, outerR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${accentRgb}, ${orbState === 'THINKING' ? 0.95 : 0.75})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, outerR, -0.4, 0.95);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, outerR, Math.PI - 0.3, Math.PI + 0.75);
      ctx.stroke();
      ctx.restore();

      // 6. Counter-Rotating Energy Vortex Ring
      const midR = radius * 1.08;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-time * (orbState === 'THINKING' ? 1.55 : 0.7));
      const segments = orbState === 'THINKING' ? 6 : 3;
      for (let i = 0; i < segments; i++) {
        const startA = (i * Math.PI * 2) / segments;
        const span = orbState === 'THINKING' ? 0.55 : 0.85;
        ctx.strokeStyle =
          i % 2 === 0
            ? `rgba(${accentRgb}, ${orbState === 'THINKING' ? 0.9 : 0.48})`
            : `rgba(96, 165, 250, ${orbState === 'THINKING' ? 0.88 : 0.52})`;
        ctx.lineWidth = orbState === 'THINKING' ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, midR, startA, startA + span);
        ctx.stroke();
      }
      ctx.restore();

      // 7. Audio-Reactive Harmonic Waveform Membrane
      const wavePoints = 108;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= wavePoints; i++) {
        const angle = (i / wavePoints) * Math.PI * 2;
        let displacement = 0;

        if (orbState === 'LISTENING' && bins && bins.length > 0) {
          const binIndex = Math.floor(
            ((i % (wavePoints / 2)) / (wavePoints / 2)) * (bins.length * 0.65)
          );
          const binAmp = (bins[binIndex] || 0) / 255;
          displacement = binAmp * 20 + Math.sin(angle * 4 + time * 3.2) * 2.5;
        } else if (orbState === 'SPEAKING') {
          displacement =
            Math.sin(angle * 5 + time * 5.4) * (3.5 + smoothLevel * 15) +
            Math.cos(angle * 3 - time * 3.6) * (2.5 + smoothLevel * 9);
        } else if (orbState === 'THINKING') {
          displacement = Math.sin(angle * 6 - time * 4.8) * 4.8;
        } else if (orbState === 'ERROR') {
          displacement = Math.sin(angle * 10 + time * 9) * 3.8;
        } else {
          displacement = Math.sin(angle * 3 + time * 1.6) * 2.2;
        }

        const pull = ptr.active
          ? (Math.cos(angle) * ptr.dx + Math.sin(angle) * ptr.dy) * 9
          : 0;

        const r = radius * 0.93 + displacement + pull;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      const coreGrad = ctx.createRadialGradient(
        cx - radius * 0.24,
        cy - radius * 0.24,
        radius * 0.06,
        cx,
        cy,
        radius
      );
      coreGrad.addColorStop(0, 'rgba(255, 250, 232, 0.95)');
      coreGrad.addColorStop(0.24, `rgba(${accentRgb}, 0.82)`);
      coreGrad.addColorStop(0.58, `rgba(${primaryRgb}, 0.88)`);
      coreGrad.addColorStop(1, 'rgba(8, 20, 58, 0.96)');

      ctx.fillStyle = coreGrad;
      ctx.shadowColor = `rgba(${primaryRgb}, 0.8)`;
      ctx.shadowBlur = 30 + smoothLevel * 26;
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(${accentRgb}, 0.85)`;
      ctx.lineWidth = 1.75;
      ctx.stroke();
      ctx.restore();

      // 8. Inner Holographic Geometric Ribbons
      const innerR = radius * 0.56;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.95);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, innerR, 0, Math.PI * 1.45);
      ctx.stroke();

      ctx.rotate(-time * 1.75);
      ctx.strokeStyle = `rgba(${accentRgb}, 0.72)`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, innerR * 0.68, 0.4, Math.PI * 1.6);
      ctx.stroke();
      ctx.restore();

      rafId = requestAnimationFrame(draw);
    };

    if (!paused) {
      rafId = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [paused]);

  const updatePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    pointerRef.current.targetDx = Math.max(-1, Math.min(1, nx));
    pointerRef.current.targetDy = Math.max(-1, Math.min(1, ny));
  };

  return (
    <div className="relative flex items-center justify-center w-full select-none">
      <canvas
        ref={canvasRef}
        aria-label={`Holographic AI Orb in ${state} state`}
        onPointerDown={(e) => {
          pointerRef.current.active = true;
          pointerRef.current.ripple = 1;
          pointerRef.current.downAt = Date.now();
          updatePointer(e);
          onTouchStateChange?.(true);
        }}
        onPointerMove={(e) => {
          if (pointerRef.current.active) {
            updatePointer(e);
          }
        }}
        onPointerUp={() => {
          const elapsed = Date.now() - pointerRef.current.downAt;
          pointerRef.current.active = false;
          pointerRef.current.targetDx = 0;
          pointerRef.current.targetDy = 0;
          onTouchStateChange?.(false);
          if (elapsed < 260) {
            onOrbTap?.();
          }
        }}
        onPointerLeave={() => {
          if (pointerRef.current.active) {
            pointerRef.current.active = false;
            pointerRef.current.targetDx = 0;
            pointerRef.current.targetDy = 0;
            onTouchStateChange?.(false);
          }
        }}
        className="w-[260px] h-[260px] sm:w-[310px] sm:h-[310px] cursor-pointer touch-none"
      />
    </div>
  );
};
