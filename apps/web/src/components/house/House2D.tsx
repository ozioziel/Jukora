/* eslint-disable react-refresh/only-export-components -- componente + mapa de colores por sector */
import type { CSSProperties } from 'react';

export type Sector = 'restaurant' | 'cafe' | 'workshop' | 'store' | 'studio' | 'other' | 'new';

/** Color del aguayo (atenuado) por sector: tiñe el techo y la carta que contiene la casa. */
export const SECTOR_COLOR: Record<Sector, string> = {
  restaurant: 'var(--color-rojo)',
  cafe: 'var(--color-naranja)',
  workshop: 'var(--color-verde)',
  store: 'var(--color-amarillo)',
  studio: 'var(--color-fucsia)',
  other: 'var(--color-morado)',
  new: 'var(--color-morado)',
};

const HB = '#15121f';
const EDGE = 'rgba(255,236,214,.18)';
const LIT = '#ffcf85';
const GLASS = '#a8e2f2';

/** Puerta: hueco iluminado detrás + hoja de madera que gira al pasar el cursor (CSS `.house-hover`). */
function Door({ x, y, w, h, arch = false }: { x: number; y: number; w: number; h: number; arch?: boolean }) {
  const shape = arch ? `M${x} ${y + h}V${y + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y + h}z` : undefined;
  return (
    <g>
      {shape ? <path className="doorway" d={shape} fill="#ffe2a8" /> : <rect className="doorway" x={x} y={y} width={w} height={h} fill="#ffe2a8" />}
      {shape ? <path d={shape} fill="#ffb35c" opacity=".35" /> : <rect x={x} y={y} width={w} height={h} fill="#ffb35c" opacity=".35" />}
      <g className="door">
        {shape ? <path d={shape} fill="#3a2416" /> : <rect x={x} y={y} width={w} height={h} fill="#3a2416" />}
        <circle cx={x + w - 2.4} cy={y + h * 0.58} r="0.9" fill={LIT} />
      </g>
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          className="spark"
          d={`M${x + w / 2 + (i - 1) * 4} ${y - 2}l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z`}
          fill="#fff3d6"
        />
      ))}
    </g>
  );
}

export function House2D({ sector, className = '', style }: { sector: Sector; className?: string; style?: CSSProperties }) {
  const color = SECTOR_COLOR[sector];
  return (
    <svg viewBox="0 0 120 100" className={`house2d ${className}`} style={{ color, ...style }} aria-hidden="true">
      {sector === 'restaurant' && (
        <>
          <rect x="75" y="24" width="7" height="16" fill={HB} stroke={EDGE} />
          <rect x="30" y="46" width="60" height="46" fill={HB} stroke={EDGE} />
          <path d="M21 48 60 20l39 28z" fill="currentColor" />
          <rect x="44" y="51" width="32" height="14" rx="1.5" fill="currentColor" opacity=".55" />
          <rect className="win" x="47" y="53.5" width="26" height="8" fill={LIT} />
          <path d="M53.5 53.5v8M60 53.5v8M66.5 53.5v8" stroke={HB} strokeWidth="1.6" />
          <rect className="win" x="35" y="70" width="9" height="10" fill={LIT} />
          <rect className="win" x="76" y="70" width="9" height="10" fill={LIT} />
          <Door x={54} y={73} w={12} h={19} arch />
        </>
      )}
      {sector === 'cafe' && (
        <>
          <rect x="28" y="50" width="64" height="42" fill={HB} stroke={EDGE} />
          <rect x="24" y="44" width="72" height="7" rx="1.5" fill="currentColor" />
          <circle cx="60" cy="33" r="8.5" fill={HB} stroke="currentColor" strokeWidth="2.5" />
          <path d="M56.5 30.5h7v3.5a3.5 3.5 0 0 1-7 0z" fill={LIT} />
          <path d="M26 57h68l-4 9H30z" fill="currentColor" opacity=".9" />
          <path d="M38 57l-1.4 9M49.5 57l-.5 9M61 57v9M72.5 57l.5 9M84 57l1.4 9" stroke={HB} strokeWidth="4" opacity=".55" />
          <rect className="win" x="64" y="71" width="20" height="12" fill={LIT} />
          <Door x={37} y={71} w={12} h={21} />
        </>
      )}
      {sector === 'workshop' && (
        <>
          <path d="M22 60 98 49v43H22z" fill={HB} stroke={EDGE} />
          <path d="M15 56 105 43v5L15 61z" fill="currentColor" />
          <rect x="55" y="63" width="33" height="29" fill="currentColor" opacity=".3" />
          <path d="M55 68h33M55 73h33M55 78h33M55 83h33M55 88h33" stroke={HB} strokeWidth="1.6" />
          <rect className="win" x="30" y="64" width="9" height="5" fill={LIT} />
          <rect className="win" x="42" y="62.5" width="9" height="5" fill={LIT} />
          <Door x={31} y={73} w={12} h={19} />
        </>
      )}
      {sector === 'store' && (
        <>
          <rect x="24" y="50" width="72" height="42" fill={HB} stroke={EDGE} />
          <path d="M21 50v-4h12v-4h12v-4h30v4h12v4h12v4z" fill="currentColor" />
          <rect x="42" y="53.5" width="36" height="5" rx="1" fill="currentColor" opacity=".45" />
          <path d="M30 56l3-3 3 3-3 3zM84 56l3-3 3 3-3 3z" fill="currentColor" />
          <rect className="win" x="30" y="64" width="38" height="18" fill={LIT} />
          <path d="M39.5 64v18M49 64v18M58.5 64v18" stroke={HB} strokeWidth="2" />
          <Door x={76} y={70} w={12} h={22} />
        </>
      )}
      {sector === 'studio' && (
        <>
          <rect x="32" y="36" width="56" height="56" fill={HB} stroke={EDGE} />
          <path d="M29 36v-4h14v-4h34v4h14v4z" fill="currentColor" />
          <rect x="38" y="42" width="11" height="12" fill={GLASS} />
          <rect x="54.5" y="42" width="11" height="12" fill={GLASS} />
          <rect x="71" y="42" width="11" height="12" fill={GLASS} />
          <path d="M41 61l3-3 3 3-3 3zM55 61l3-3 3 3-3 3z" fill="currentColor" />
          <circle cx="74" cy="74" r="8" fill={GLASS} stroke="currentColor" strokeWidth="3" />
          <Door x={39} y={70} w={12} h={22} />
        </>
      )}
      {(sector === 'other' || sector === 'new') && (
        <>
          <path
            d="M30 92V50l30-24 30 24v42z"
            fill="rgba(21,18,31,.55)"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
          <path d="M60 57v20M50 67h20" stroke={LIT} strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
