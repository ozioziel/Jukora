import { type CSSProperties, useEffect, useId, useRef } from 'react';

/**
 * El jucumari (oso andino) en 2D, dibujado por partes para animarlo:
 *  - respira, parpadea y mueve las orejas solo;
 *  - la cabeza y los ojos siguen al cursor; si el cursor se acerca, sonríe y saluda;
 *  - al pasar el cursor por encima da un saltito.
 * Rasgos de la especie: pelaje negro-café, «gafas» y pechera color crema. Detalle cultural: una
 * bufanda de aguayo con franjas k'isa y flecos. `mode="constellation"` dibuja la misma silueta como
 * constelación (para la transición oso → estrella). Con movimiento reducido queda quieto.
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
  const head = useRef<SVGGElement>(null);
  const eyes = useRef<SVGGElement>(null);

  useEffect(() => {
    const el = svg.current;
    if (!el || mode !== 'bear' || !interactive) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let near = false;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const ox = r.left + r.width / 2;
      const oy = r.top + r.height * 0.32;
      const dx = e.clientX - ox;
      const dy = e.clientY - oy;
      const dist = Math.hypot(dx, dy);
      tx = Math.max(-1, Math.min(1, dx / Math.max(260, r.width)));
      ty = Math.max(-1, Math.min(1, dy / Math.max(260, r.height)));
      const isNear = dist < Math.max(240, r.width * 0.9);
      if (isNear !== near) {
        near = isNear;
        el.dataset.happy = String(near);
      }
    };
    const leave = () => {
      tx = 0;
      ty = 0;
      near = false;
      el.dataset.happy = 'false';
    };
    const tick = () => {
      cx += (tx - cx) * 0.1;
      cy += (ty - cy) * 0.1;
      head.current?.setAttribute('transform', `rotate(${(cx * 9).toFixed(2)} 200 178) translate(${(cx * 7).toFixed(2)} ${(cy * 5).toFixed(2)})`);
      eyes.current?.setAttribute('transform', `translate(${(cx * 5).toFixed(2)} ${(cy * 4).toFixed(2)})`);
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
    // Puntos de la silueta (orejas, cabeza, hocico, hombros, patas) unidos como constelación.
    const P: [number, number][] = [
      [132, 62], [104, 92], [106, 150], [150, 204], [200, 214], [250, 204], [294, 150], [296, 92], [268, 62],
      [200, 52], [168, 124], [232, 124], [200, 150], [96, 260], [84, 330], [120, 405], [200, 410], [280, 405],
      [316, 330], [304, 260], [150, 334], [256, 336],
    ];
    const L: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 0], [10, 12], [11, 12], [10, 11],
      [3, 13], [13, 14], [14, 15], [15, 16], [16, 17], [17, 18], [18, 19], [19, 5], [13, 20], [19, 21], [4, 12],
    ];
    return (
      <svg ref={svg} viewBox="0 0 400 440" className={`jk jk-cons ${className}`} style={style} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
        <g stroke="#fff3d6" strokeWidth="1.6" strokeOpacity="0.55" strokeLinecap="round">
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
      className={`jk ${interactive ? 'jk-live' : ''} ${className}`}
      style={style}
      data-happy="false"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <radialGradient id={id('fur')} cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#56463d" />
          <stop offset="0.45" stopColor="#2e2521" />
          <stop offset="1" stopColor="#161110" />
        </radialGradient>
        <radialGradient id={id('head')} cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor="#5c4b41" />
          <stop offset="0.5" stopColor="#32281f" />
          <stop offset="1" stopColor="#1a1412" />
        </radialGradient>
        <linearGradient id={id('cream')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3e5c8" />
          <stop offset="1" stopColor="#d9bf96" />
        </linearGradient>
        <linearGradient id={id('rim')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.6" stopColor="#9fb0ff" stopOpacity="0" />
          <stop offset="1" stopColor="#b9c4ff" stopOpacity="0.55" />
        </linearGradient>
        {/* aguayo: campo granate (pampa) con franjas k'isa finas en los bordes, como los tejidos andinos */}
        <linearGradient id={id('kisa')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4e1428" />
          <stop offset="0.1" stopColor="#4e1428" />
          <stop offset="0.1" stopColor="#c8743f" />
          <stop offset="0.16" stopColor="#c8743f" />
          <stop offset="0.16" stopColor="#d9b556" />
          <stop offset="0.21" stopColor="#d9b556" />
          <stop offset="0.21" stopColor="#962b49" />
          <stop offset="0.74" stopColor="#962b49" />
          <stop offset="0.74" stopColor="#3f7f5a" />
          <stop offset="0.79" stopColor="#3f7f5a" />
          <stop offset="0.79" stopColor="#d9b556" />
          <stop offset="0.84" stopColor="#d9b556" />
          <stop offset="0.84" stopColor="#c8743f" />
          <stop offset="0.9" stopColor="#c8743f" />
          <stop offset="0.9" stopColor="#4e1428" />
          <stop offset="1" stopColor="#4e1428" />
        </linearGradient>
        <pattern id={id('flap')} width="34" height="34" patternUnits="userSpaceOnUse">
          <rect width="34" height="34" fill="#962b49" />
          <rect y="0" width="34" height="3" fill="#4e1428" />
          <rect y="3" width="34" height="2" fill="#c8743f" />
          <rect y="5" width="34" height="2" fill="#d9b556" />
          <rect y="7" width="34" height="2" fill="#3f7f5a" />
          <path d="M17 13l5 5-5 5-5-5z" fill="none" stroke="#efe2c6" strokeWidth="1.6" />
          <path d="M17 16.5l1.5 1.5-1.5 1.5-1.5-1.5z" fill="#d9b556" />
        </pattern>
      </defs>

      <ellipse cx="200" cy="424" rx="132" ry="13" fill="rgb(16 14 36 / 0.32)" />

      {/* cuerpo (respira) */}
      <g className="jk-body">
        <path
          d="M200 168c92 0 132 82 124 152-6 58-52 92-124 92s-118-34-124-92c-8-70 32-152 124-152z"
          fill={`url(#${id('fur')})`}
        />
        <path d="M200 168c92 0 132 82 124 152-6 58-52 92-124 92" fill="none" stroke={`url(#${id('rim')})`} strokeWidth="6" />
        {/* pechera crema */}
        <path d="M156 214c16 30 30 62 44 88 14-26 28-58 44-88-14 10-29 15-44 16-15-1-30-6-44-16z" fill={`url(#${id('cream')})`} opacity="0.95" />
        {/* patas traseras */}
        <ellipse cx="138" cy="404" rx="46" ry="24" fill="#241c19" />
        <ellipse cx="262" cy="404" rx="46" ry="24" fill="#241c19" />
        <ellipse cx="138" cy="409" rx="24" ry="12" fill="#6b5446" />
        <ellipse cx="262" cy="409" rx="24" ry="12" fill="#6b5446" />
        {[118, 131, 145, 158].map((x) => (
          <circle key={x} cx={x} cy="392" r="5" fill="#6b5446" />
        ))}
        {[242, 255, 269, 282].map((x) => (
          <circle key={x} cx={x} cy="392" r="5" fill="#6b5446" />
        ))}
        {/* brazo izquierdo, apoyado en la panza */}
        <path d="M120 248c-20 42-14 82 18 92 22 6 34-8 26-24-12-18-22-38-22-64z" fill="#2a211d" stroke="#4a3b33" strokeWidth="2.5" />
        <ellipse cx="150" cy="332" rx="21" ry="16" fill="#3a2e28" stroke="#4a3b33" strokeWidth="2" />
      </g>

      {/* bufanda de aguayo con un faldón y flecos */}
      <g className="jk-scarf">
        <path d="M108 204c40 30 144 30 184 0l9 34c-44 30-158 30-202 0z" fill={`url(#${id('kisa')})`} />
        <path d="M108 204c40 30 144 30 184 0" fill="none" stroke="#3a1726" strokeOpacity="0.35" strokeWidth="2" />
        {/* rombos del pallay a lo largo de la bufanda */}
        {[128, 150, 174, 200, 226, 250, 272].map((x) => {
          const y = 221 + 21 * (1 - ((x - 200) / 92) ** 2);
          return (
            <g key={x}>
              <path d={`M${x} ${y - 5.5}l5.5 5.5-5.5 5.5-5.5-5.5z`} fill="none" stroke="#efe2c6" strokeWidth="1.6" />
              <path d={`M${x} ${y - 1.8}l1.8 1.8-1.8 1.8-1.8-1.8z`} fill="#d9b556" />
            </g>
          );
        })}
        <g className="jk-flap">
          <path d="M120 230l40 18-12 62-36-14z" fill={`url(#${id('flap')})`} />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <line key={k} x1={113 + k * 6.5} y1={296 + k * 2.4} x2={111 + k * 6.5} y2={308 + k * 2.4} stroke="#efe2c6" strokeWidth="2.4" strokeLinecap="round" />
          ))}
        </g>
      </g>

      {/* brazo derecho (saluda) */}
      <g className="jk-arm">
        <path d="M280 248c20 42 14 82-18 92-22 6-34-8-26-24 12-18 22-38 22-64z" fill="#2a211d" stroke="#4a3b33" strokeWidth="2.5" />
        <ellipse cx="250" cy="332" rx="21" ry="16" fill="#3a2e28" stroke="#4a3b33" strokeWidth="2" />
        {/* palma clara: se ve cuando levanta la pata para saludar */}
        <ellipse cx="248" cy="336" rx="11" ry="8" fill="#6b5446" />
        {[238, 246, 255].map((x) => (
          <circle key={x} cx={x} cy="324" r="3.4" fill="#6b5446" />
        ))}
      </g>

      {/* cabeza (sigue al cursor) */}
      <g ref={head} className="jk-head">
        <g className="jk-ear jk-ear-l">
          <circle cx="132" cy="74" r="31" fill="#241c19" />
          <circle cx="134" cy="77" r="16" fill="#5a463c" />
        </g>
        <g className="jk-ear jk-ear-r">
          <circle cx="268" cy="74" r="31" fill="#241c19" />
          <circle cx="266" cy="77" r="16" fill="#5a463c" />
        </g>
        <path d="M200 50c64 0 100 42 98 92-2 48-44 74-98 74s-96-26-98-74c-2-50 34-92 98-92z" fill={`url(#${id('head')})`} />
        <path d="M200 50c64 0 100 42 98 92" fill="none" stroke={`url(#${id('rim')})`} strokeWidth="5" />
        {/* «gafas» crema del oso andino */}
        <path d="M146 112c10-18 36-20 46-2 6 12 0 28-12 36-4-12-16-17-28-17-8-5-10-11-6-17z" fill={`url(#${id('cream')})`} />
        <path d="M254 112c-10-18-36-20-46-2-6 12 0 28 12 36 4-12 16-17 28-17 8-5 10-11 6-17z" fill={`url(#${id('cream')})`} />
        <path d="M192 100c4 16 12 16 16 0-1 20 4 36 10 50h-36c6-14 11-30 10-50z" fill={`url(#${id('cream')})`} opacity="0.9" />
        {/* mejillas */}
        <ellipse className="jk-blush" cx="146" cy="160" rx="15" ry="8" fill="#e58fa8" />
        <ellipse className="jk-blush" cx="254" cy="160" rx="15" ry="8" fill="#e58fa8" />
        {/* hocico */}
        <ellipse cx="200" cy="166" rx="46" ry="33" fill={`url(#${id('cream')})`} />
        <path d="M185 148c0-9 30-9 30 0 0 11-11 17-15 17s-15-6-15-17z" fill="#1a1412" />
        <ellipse cx="194" cy="147" rx="5" ry="2.4" fill="#fff" opacity="0.55" />
        <g fill="none" stroke="#3a2a24" strokeWidth="3.2" strokeLinecap="round">
          <path d="M200 165v8" />
          <path className="jk-mouth" d="M186 175q14 10 28 0" />
          <path className="jk-mouth-happy" d="M184 174q16 18 32 0" />
        </g>
        <path className="jk-tongue" d="M193 180q7 9 14 0z" fill="#d9707f" />
        {/* ojos (miran al cursor) y párpados (parpadean) */}
        <g ref={eyes}>
          <g className="jk-eyes-open">
            <circle cx="168" cy="126" r="10" fill="#120e0d" />
            <circle cx="232" cy="126" r="10" fill="#120e0d" />
            <circle cx="171.5" cy="122" r="3.4" fill="#fff" />
            <circle cx="235.5" cy="122" r="3.4" fill="#fff" />
            <circle cx="165" cy="130" r="1.5" fill="#fff" opacity="0.8" />
            <circle cx="229" cy="130" r="1.5" fill="#fff" opacity="0.8" />
          </g>
          <g className="jk-eyes-happy" fill="none" stroke="#120e0d" strokeWidth="4.5" strokeLinecap="round">
            <path d="M157 129q11-12 22 0" />
            <path d="M221 129q11-12 22 0" />
          </g>
        </g>
        <g className="jk-lids" fill="#2a211d">
          <ellipse cx="168" cy="126" rx="12.5" ry="12.5" />
          <ellipse cx="232" cy="126" rx="12.5" ry="12.5" />
        </g>
      </g>
    </svg>
  );
}
