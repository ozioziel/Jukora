/**
 * Figuras de la historia del Inicio, en coordenadas normalizadas (-1..1, y hacia abajo).
 * Son dibujos originales hechos con líneas: la misma población de partículas se reparte sobre
 * cada figura, así la siguiente "nace" de la anterior.
 */
export type Pt = [number, number];
export type Polyline = Pt[];

export interface Figure {
  id: string;
  lines: Polyline[];
  /** Nodos brillantes (estrellas principales) — solo el jucumari. */
  nodes?: Pt[];
  edges?: [number, number][];
  /** Cómo se forma: retraso por partícula según su posición. */
  stagger: 'draw' | 'layers' | 'groups' | 'orbit' | 'close' | 'rise';
}

// ───────────── Jucumari (oso andino de constelación, original) ─────────────
// Oso andino caminando: hocico corto, oreja redonda, joroba en los hombros y la línea de los
// «anteojos» alrededor del ojo. El último nodo es el ojo (estrella más brillante).
const BEAR_NODES: Pt[] = [
  [0.8, 0.02],
  [0.68, -0.06],
  [0.56, -0.2],
  [0.5, -0.34],
  [0.42, -0.39],
  [0.36, -0.3],
  [0.26, -0.25],
  [0.04, -0.4],
  [-0.3, -0.37],
  [-0.6, -0.27],
  [-0.77, -0.04],
  [-0.66, 0.18],
  [-0.62, 0.42],
  [-0.7, 0.58],
  [-0.47, 0.58],
  [-0.42, 0.3],
  [-0.1, 0.27],
  [0.12, 0.3],
  [0.1, 0.58],
  [0.33, 0.58],
  [0.34, 0.24],
  [0.47, 0.1],
  [0.66, 0.12],
  [0.6, -0.08],
];
const BEAR_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [12, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [16, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [20, 21],
  [21, 22],
  [22, 0],
  [2, 23],
  [23, 1],
];

const rect = (x0: number, y0: number, x1: number, y1: number): Polyline => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 24): Polyline =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });

function scallops(x0: number, x1: number, y: number, n: number, depth: number): Polyline {
  const out: Polyline = [];
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) out.push(...arc(x0 + w * i + w / 2, y, w / 2, depth, Math.PI, 0, 8).reverse());
  return out;
}

export const FIGURES: Figure[] = [
  {
    id: 'bear',
    nodes: BEAR_NODES,
    edges: BEAR_EDGES,
    lines: BEAR_EDGES.map(([a, b]) => [BEAR_NODES[a]!, BEAR_NODES[b]!]),
    stagger: 'draw',
  },
  {
    id: 'storefront',
    stagger: 'layers',
    lines: [
      rect(-0.6, -0.1, 0.6, 0.6),
      [
        [-0.74, -0.1],
        [0, -0.56],
        [0.74, -0.1],
      ],
      scallops(-0.62, 0.62, 0.02, 7, 0.07),
      [
        [-0.12, 0.6],
        [-0.12, 0.22],
        [0.12, 0.22],
        [0.12, 0.6],
      ],
      rect(-0.5, 0.2, -0.24, 0.42),
      rect(0.24, 0.2, 0.5, 0.42),
      [
        [-0.24, -0.3],
        [0.24, -0.3],
      ],
    ],
  },
  {
    id: 'resources',
    stagger: 'groups',
    lines: [
      // parrilla
      rect(-0.9, 0.06, -0.4, 0.3),
      arc(-0.65, 0.06, 0.25, 0.16, Math.PI, Math.PI * 2),
      [
        [-0.84, 0.18],
        [-0.46, 0.18],
      ],
      [
        [-0.84, 0.3],
        [-0.84, 0.6],
      ],
      [
        [-0.46, 0.3],
        [-0.46, 0.6],
      ],
      // refrigerador
      rect(-0.2, -0.5, 0.2, 0.6),
      [
        [-0.2, 0.0],
        [0.2, 0.0],
      ],
      [
        [0.13, -0.38],
        [0.13, -0.12],
      ],
      [
        [0.13, 0.12],
        [0.13, 0.36],
      ],
      // silla
      [
        [0.44, -0.24],
        [0.44, 0.6],
      ],
      [
        [0.44, 0.24],
        [0.82, 0.24],
        [0.82, 0.6],
      ],
      [
        [0.44, -0.08],
        [0.6, -0.08],
      ],
    ],
  },
  {
    id: 'globe',
    stagger: 'orbit',
    lines: [
      arc(0, 0, 0.62, 0.62, 0, Math.PI * 2, 64),
      arc(0, 0, 0.62, 0.2, 0, Math.PI * 2, 40),
      arc(0, -0.32, 0.53, 0.14, 0, Math.PI * 2, 36),
      arc(0, 0.32, 0.53, 0.14, 0, Math.PI * 2, 36),
      arc(0, 0, 0.3, 0.62, 0, Math.PI * 2, 40),
      arc(0, 0, 0.05, 0.62, 0, Math.PI * 2, 30),
      // rutas entre orígenes y destino
      arc(-0.1, -0.05, 0.55, 0.5, Math.PI * 1.05, Math.PI * 1.55, 20),
      arc(0.15, 0.05, 0.6, 0.45, Math.PI * 1.6, Math.PI * 1.95, 16),
    ],
  },
  {
    id: 'shield',
    stagger: 'close',
    lines: [
      [
        [0, -0.62],
        [0.5, -0.42],
        [0.46, 0.08],
        [0.3, 0.38],
        [0, 0.6],
        [-0.3, 0.38],
        [-0.46, 0.08],
        [-0.5, -0.42],
        [0, -0.62],
      ],
      // paquete isométrico
      [
        [-0.2, -0.06],
        [0, -0.16],
        [0.2, -0.06],
        [0, 0.04],
        [-0.2, -0.06],
      ],
      [
        [-0.2, -0.06],
        [-0.2, 0.18],
        [0, 0.28],
        [0.2, 0.18],
        [0.2, -0.06],
      ],
      [
        [0, 0.04],
        [0, 0.28],
      ],
    ],
  },
  {
    id: 'city',
    stagger: 'rise',
    lines: [
      [
        [-0.95, 0.6],
        [0.95, 0.6],
      ],
      rect(-0.86, 0.1, -0.62, 0.6),
      rect(-0.56, -0.2, -0.3, 0.6),
      [
        [-0.24, 0.6],
        [-0.24, 0.12],
        [-0.1, 0.0],
        [0.04, 0.12],
        [0.04, 0.6],
      ],
      rect(0.1, -0.42, 0.34, 0.6),
      rect(0.4, -0.05, 0.62, 0.6),
      [
        [0.68, 0.6],
        [0.68, 0.22],
        [0.8, 0.12],
        [0.92, 0.22],
        [0.92, 0.6],
      ],
      // red de negocios conectados
      [
        [-0.74, 0.1],
        [-0.43, -0.2],
        [-0.1, 0.0],
        [0.22, -0.42],
        [0.51, -0.05],
        [0.8, 0.12],
      ],
    ],
  },
];

/** Reparte `n` puntos a lo largo de las líneas, proporcional a su longitud. */
export function samplePoints(fig: Figure, n: number): { pts: Pt[]; seg: Int16Array } {
  const pts: Pt[] = [];
  const seg = new Int16Array(n);
  if (fig.nodes) {
    for (const p of fig.nodes) if (pts.length < n) pts.push(p);
    seg.fill(-1, 0, pts.length);
  }
  const lens = fig.lines.map((l) => l.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - l[i]![0], p[1] - l[i]![1]), 0));
  const total = lens.reduce((a, b) => a + b, 0);
  const remaining = n - pts.length;
  fig.lines.forEach((line, li) => {
    const count = li === fig.lines.length - 1 ? n - pts.length : Math.round((lens[li]! / total) * remaining);
    for (let k = 0; k < count && pts.length < n; k++) {
      let d = ((k + 0.5) / count) * lens[li]!;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!;
        const b = line[i]!;
        const s = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d <= s || i === line.length - 1) {
          const t = s === 0 ? 0 : Math.min(1, d / s);
          seg[pts.length] = li;
          pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
          break;
        }
        d -= s;
      }
    }
  });
  return { pts, seg };
}
