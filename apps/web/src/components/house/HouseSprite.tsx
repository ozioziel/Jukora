import type { Sector } from './House2D';

/**
 * Casa ilustrada del entorno (renders de design/blender/casas_entorno.py con la luz de crepúsculo de
 * los paisajes). Tres cuadros de la puerta (cerrada, entreabierta, abierta) apilados:
 *  - al pasar el cursor por un contenedor `.house-hover`, la puerta se abre y salen chispas;
 *  - dentro del recorrido fijo del inicio (`.story-stage`), la puerta se abre con el scroll (--lp).
 * Decorativa: el nombre del negocio va siempre en texto junto a ella.
 */
export function HouseSprite({ sector, className = '', reflect = false }: { sector: Sector; className?: string; reflect?: boolean }) {
  const s = sector === 'new' ? 'other' : sector;
  const frames = s === 'other' ? [0] : [0, 1, 2];
  return (
    <span className={`house-sprite ${className}`} aria-hidden="true">
      <span className="hs-shadow" />
      {frames.map((f) => (
        <img key={f} className={`hs-f hs-${f}`} src={`/casas/casa-${s}-${f}.webp`} alt="" draggable={false} loading="lazy" decoding="async" />
      ))}
      {s !== 'other' &&
        [0, 1, 2].map((k) => (
          <svg key={k} className="hs-spark" viewBox="0 0 10 10" style={{ left: `${44 + k * 6}%`, animationDelay: `${k * 0.32}s` }}>
            <path d="M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2z" fill="#fff3d6" />
          </svg>
        ))}
      {reflect && <img className="hs-reflect" src={`/casas/casa-${s}-0.webp`} alt="" draggable={false} loading="lazy" />}
    </span>
  );
}
