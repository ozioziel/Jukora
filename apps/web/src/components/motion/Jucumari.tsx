import { FIGURES } from '@/scenes/figures';

const bear = FIGURES[0]!;

/** Jucumari: oso andino hecho solo de estrellas y líneas finas. Decorativo salvo que se le dé título. */
export function Jucumari({
  size = 120,
  title,
  glow = false,
  className = '',
}: {
  size?: number;
  title?: string;
  glow?: boolean;
  className?: string;
}) {
  const nodes = bear.nodes!;
  return (
    <svg
      viewBox="-1 -0.75 2 1.5"
      width={size}
      height={size * 0.75}
      className={`jucumari ${glow ? 'jucumari-glow' : ''} ${className}`}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <g stroke="currentColor" strokeWidth={0.012} strokeLinecap="round" opacity={0.6}>
        {bear.edges!.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={nodes[a]![0]} y1={nodes[a]![1]} x2={nodes[b]![0]} y2={nodes[b]![1]} />
        ))}
      </g>
      <g fill="var(--color-amber-2)">
        {nodes.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === nodes.length - 1 ? 0.035 : 0.022}
            className="jucumari-star"
            style={{ animationDelay: `${(i * 173) % 2400}ms` }}
          />
        ))}
      </g>
    </svg>
  );
}

/** Marca del header: estrella de cuatro puntas + oso diminuto. */
export function BrandMark({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <Jucumari size={44} className="text-cream" />
      <span className="display text-[22px] font-semibold tracking-tight">{label}</span>
    </span>
  );
}
