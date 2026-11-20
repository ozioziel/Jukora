/* eslint-disable react-refresh/only-export-components -- proveedor + hook del cielo en un solo módulo */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Cielo fijo de toda la app: paisajes del altiplano renderizados en Blender (design/blender/escenas.py)
 * difuminados detrás de la interfaz, con estrellas nítidas encima, neblina que se desplaza y un halo
 * que sigue al cursor. Cada página o panel elige su paisaje con `useSky(key)`.
 */
export const SKY_KEYS = [
  'bg-noche',
  'bg-alba',
  'bg-ocaso',
  'card-restaurant',
  'card-cafe',
  'card-workshop',
  'card-store',
  'card-studio',
  'card-other',
] as const;
export type SkyKey = (typeof SKY_KEYS)[number];

interface SkyState {
  key: SkyKey;
  blur: number;
}
const SkyCtx = createContext<(s: SkyState) => void>(() => {});

export function SkyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SkyState>({ key: 'bg-noche', blur: 10 });
  const set = useCallback((s: SkyState) => setState((prev) => (prev.key === s.key && prev.blur === s.blur ? prev : s)), []);
  return (
    <SkyCtx.Provider value={set}>
      <SkyLayer state={state} />
      {children}
    </SkyCtx.Provider>
  );
}

/** Elige el paisaje de fondo mientras el componente está montado (o cuando cambia la clave). */
export function useSky(key: SkyKey, blur = 10) {
  const set = useContext(SkyCtx);
  useEffect(() => set({ key, blur }), [set, key, blur]);
}

/** Variante imperativa para paneles que cambian el cielo al hacer scroll. */
export function useSetSky() {
  return useContext(SkyCtx);
}

function SkyLayer({ state }: { state: SkyState }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const halo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cols = ['#fff6e8', '#fff6e8', '#fff6e8', '#dff3ff', '#ffe9b0', '#ffd6ea'];
    let W = 0;
    let H = 0;
    let raf = 0;
    let mx = 0;
    let my = 0;
    let stars: { x: number; y: number; r: number; p: number; s: number; c: string; d: number }[] = [];
    let shoot: { x: number; y: number; k: number } | null = null;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.width = window.innerWidth * dpr;
      H = cv.height = window.innerHeight * dpr;
      const n = Math.round((window.innerWidth * window.innerHeight) / 11000);
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H * 0.62,
        r: (Math.random() ** 3 * 1.5 + 0.4) * dpr,
        p: Math.random() * 6.28,
        s: 0.6 + Math.random() * 1.8,
        c: cols[(Math.random() * cols.length) | 0]!,
        d: Math.random(),
      }));
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        ctx.globalAlpha = reduce ? 0.7 : 0.45 + 0.4 * Math.sin((t / 1000) * s.s + s.p);
        ctx.fillStyle = s.c;
        ctx.beginPath();
        ctx.arc(s.x + mx * s.d * 10, s.y + my * s.d * 6, s.r, 0, 6.283);
        ctx.fill();
      }
      if (!reduce) {
        if (!shoot && Math.random() < 0.0025) shoot = { x: W * (0.25 + Math.random() * 0.65), y: H * Math.random() * 0.28, k: 0 };
        if (shoot) {
          shoot.k += 0.02;
          const len = 150 * (window.devicePixelRatio || 1);
          const x = shoot.x - shoot.k * 600;
          const y = shoot.y + shoot.k * 260;
          const g = ctx.createLinearGradient(x, y, x + len, y - len * 0.43);
          g.addColorStop(0, 'rgba(255,244,214,.95)');
          g.addColorStop(1, 'rgba(255,244,214,0)');
          ctx.globalAlpha = Math.sin(shoot.k * Math.PI);
          ctx.strokeStyle = g;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + len, y - len * 0.43);
          ctx.stroke();
          if (shoot.k >= 1) shoot = null;
        }
        raf = requestAnimationFrame(draw);
      }
      ctx.globalAlpha = 1;
    };
    // halo del cursor (solo punteros finos) con seguimiento suave
    let hx = window.innerWidth / 2;
    let hy = window.innerHeight / 2;
    let tx = hx;
    let ty = hy;
    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };
    let hraf = 0;
    const follow = () => {
      hx += (tx - hx) * 0.12;
      hy += (ty - hy) * 0.12;
      if (halo.current) halo.current.style.transform = `translate(${hx - 210}px, ${hy - 210}px)`;
      hraf = requestAnimationFrame(follow);
    };
    const vis = () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(hraf);
      if (!document.hidden) {
        raf = requestAnimationFrame(draw);
        if (!reduce) hraf = requestAnimationFrame(follow);
      }
    };
    resize();
    vis();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(hraf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  const layers = useMemo(
    () =>
      SKY_KEYS.map((k) => (
        <div
          key={k}
          className="sky-img"
          data-on={k === state.key}
          style={{ backgroundImage: `url(/escenas/${k}.webp)`, ['--sky-blur' as string]: `${state.blur}px` }}
        />
      )),
    [state.key, state.blur],
  );

  return (
    <>
      <div className="sky" aria-hidden="true">
        {layers}
        <canvas ref={canvas} />
        <div className="sky-fog" />
        <div className="sky-fog" style={{ bottom: 'auto', top: '38vh', height: '30vh', opacity: 0.55, animationDuration: '64s' }} />
        <div className="sky-veil" />
      </div>
      <div
        ref={halo}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-0 hidden h-[420px] w-[420px] rounded-full mix-blend-screen [@media(pointer:fine)]:block"
        style={{ background: 'radial-gradient(circle, rgb(232 191 69 / .09), rgb(204 58 128 / .05) 40%, transparent 68%)' }}
      />
    </>
  );
}
