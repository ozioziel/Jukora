import { type CSSProperties, useEffect, useId, useRef } from 'react';

/**
 * Emblema animado de Montuno: la montaña (silueta del logo) con la luna creciente.
 *  - la luna flota y la montaña respira levemente;
 *  - con el cursor, la luna y la montaña se desplazan en paralaje (la luna más, como si estuviera lejos);
 *  - `mode="constellation"` dibuja la cresta y la luna como constelación (transición estrella → panel).
 * Conserva el nombre y las props del antiguo guía para no tocar las páginas que lo usan.
 * Con movimiento reducido queda quieto.
 */
export function Jucumari2D({
  mode = 'bear',
  className = '',
  style,
  interactive = true,
  title,
}: {
  mode?: 'bear' | 'constellation';
  className?: string;
  style?: CSSProperties;
  interactive?: boolean;
  title?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const moon = useRef<SVGGElement>(null);
  const peak = useRef<SVGGElement>(null);

  useEffect(() => {
    const el = svg.current;
    if (!el || mode !== 'bear' || !interactive) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / Math.max(320, r.width)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / Math.max(320, r.height)));
      el.dataset.happy = String(Math.hypot(tx, ty) < 0.6);
    };
    const leave = () => {
      tx = 0;
      ty = 0;
      el.dataset.happy = 'false';
    };
    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      moon.current?.setAttribute('transform', `translate(${(cx * -18).toFixed(2)} ${(cy * -12).toFixed(2)})`);
      peak.current?.setAttribute('transform', `translate(${(cx * 6).toFixed(2)} ${(cy * 3).toFixed(2)})`);
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
    };
  }, [mode, interactive]);

  const id = (n: string) => `${n}-${uid}`;

  if (mode === 'constellation') {
    // Cresta de la montaña y arco de la luna unidos como constelación.
    const P: [number, number][] = [
      [30, 400],
      [78, 328],
      [124, 272],
      [168, 152],
      [200, 64],
      [222, 150],
      [262, 248],
      [318, 300],
      [370, 400],
      [96, 150],
      [86, 110],
      [104, 74],
      [140, 58],
    ];
    const L: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [9, 10],
      [10, 11],
      [11, 12],
    ];
    return (
      <svg
        ref={svg}
        viewBox="0 0 400 440"
        className={`jk jk-cons ${className}`}
        style={style}
        role={title ? 'img' : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
      >
        <g stroke="#fff3d6" strokeWidth="1.6" strokeOpacity="0.6" strokeLinecap="round">
          {L.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={P[a]![0]} y1={P[a]![1]} x2={P[b]![0]} y2={P[b]![1]} />
          ))}
        </g>
        {P.map(([x, y], i) => (
          <path
            key={i}
            className="jk-twinkle"
            style={{ animationDelay: `${(i % 7) * 0.35}s` }}
            d={`M${x} ${y - 7}l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2-5.2-1.8 5.2-1.8z`}
            fill="#fff6e0"
            filter="drop-shadow(0 0 4px #ffd27a)"
          />
        ))}
      </svg>
    );
  }

  return (
    <svg
      ref={svg}
      viewBox="0 0 400 440"
      className={`jk mt-emblem ${interactive ? 'jk-live' : ''} ${className}`}
      style={style}
      data-happy="false"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={id('rock')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2230" />
          <stop offset="1" stopColor="#0b0b0c" />
        </linearGradient>
        <mask id={id('crescent')}>
          <rect width="400" height="440" fill="#000" />
          <circle cx="120" cy="112" r="52" fill="#fff" />
          <circle cx="146" cy="96" r="46" fill="#000" />
        </mask>
        <radialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6e0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff6e0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Luna creciente, en su propio plano de paralaje */}
      <g ref={moon}>
        <g className="mt-moon">
          <circle cx="108" cy="118" r="92" fill={`url(#${id('glow')})`} />
          <rect width="400" height="440" fill="#f7f1e3" mask={`url(#${id('crescent')})`} />
        </g>
      </g>

      {/* Montaña: aguja central y rocas laterales, como en el logo */}
      <g ref={peak}>
        <g className="mt-peak">
          <path
            d="M18 410 L60 356 L72 362 L96 318 L108 326 L126 270 L140 282 L160 196 L170 204 L184 120 L194 128 L202 54 L214 92 L222 86 L230 154 L244 166 L256 244 L270 236 L286 290 L300 284 L324 334 L340 330 L382 410 Z"
            fill={`url(#${id('rock')})`}
          />
          <path d="M202 54 L214 92 L206 90 L200 132 L194 128 L196 88 Z" fill="#f7f1e3" opacity="0.9" />
          <path d="M60 356 L96 318 L84 352 L70 360 Z M340 330 L324 334 L330 352 Z" fill="#f7f1e3" opacity="0.35" />
          <path d="M18 410 L382 410" stroke="#0b0b0c" strokeWidth="2" />
        </g>
      </g>
    </svg>
  );
}
