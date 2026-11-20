import type { ProjectSummary } from '@/lib/types';

type Sector = ProjectSummary['sector'] | 'new';

/** Silueta por sector (pocas formas, misma estética). Puerta con bisagra animada por CSS. */
function Roof({ sector }: { sector: Sector }) {
  switch (sector) {
    case 'restaurant':
      return (
        <>
          <path d="M14 58 L60 22 L106 58" />
          <path d="M84 40 V26 H92 V46" />
          <path d="M22 66 h76 M22 66 l6 8 l6 -8 l6 8 l6 -8 l6 8 l6 -8 l6 8 l6 -8 l6 8 l6 -8 l6 8 l6 -8 l4 6" opacity={0.7} />
        </>
      );
    case 'cafe':
      return (
        <>
          <path d="M18 58 H102 V50 H18 Z" />
          <circle cx="60" cy="36" r="10" />
          <path d="M55 36 h10 M57 31 q3 -3 6 0" opacity={0.7} />
        </>
      );
    case 'workshop':
      return <path d="M16 58 V40 L36 26 V40 L56 26 V40 L76 26 V40 L96 26 V40 L104 34 V58" />;
    case 'store':
      return (
        <>
          <path d="M16 58 H104 V52 H16 Z" />
          <rect x="34" y="34" width="52" height="14" rx="3" />
        </>
      );
    case 'studio':
      return (
        <>
          <path d="M18 58 V30 H102 V58" />
          <circle cx="86" cy="44" r="6" />
        </>
      );
    case 'new':
      return <path d="M16 58 L60 24 L104 58" strokeDasharray="4 5" />;
    default:
      return <path d="M16 58 L60 26 L104 58" />;
  }
}

export function HouseIllustration({ sector, className = '' }: { sector: Sector; className?: string }) {
  const dashed = sector === 'new';
  return (
    <svg
      viewBox="0 0 120 110"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <defs>
        <radialGradient id="warm" cx="50%" cy="80%" r="80%">
          <stop offset="0%" stopColor="#ffd38a" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f2a93b" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      <g className="house-stars" fill="var(--color-amber-2)" stroke="none">
        <circle cx="22" cy="14" r="1.3" />
        <circle cx="38" cy="8" r="1" />
        <circle cx="96" cy="12" r="1.4" />
        <circle cx="108" cy="24" r="0.9" />
      </g>
      <g className="house-stars" stroke="var(--color-amber)" strokeWidth={0.5} opacity={0.6}>
        <path d="M22 14 L38 8 M96 12 L108 24" />
      </g>
      <Roof sector={sector} />
      <path d={`M20 58 V100 H100 V58`} strokeDasharray={dashed ? '4 5' : undefined} />
      {!dashed && (
        <>
          <rect x="28" y="70" width="18" height="14" rx="2" opacity={0.75} />
          <rect x="74" y="70" width="18" height="14" rx="2" opacity={0.75} />
        </>
      )}
      <rect className="house-light" x="51" y="72" width="18" height="28" fill="url(#warm)" stroke="none" />
      <g className="house-door">
        <rect x="51" y="72" width="18" height="28" rx="1.5" fill="var(--color-night-2)" strokeDasharray={dashed ? '3 4' : undefined} />
        <circle cx="65" cy="87" r="1.1" fill="currentColor" />
      </g>
      <path d="M8 100 H112" opacity={0.5} />
    </svg>
  );
}
