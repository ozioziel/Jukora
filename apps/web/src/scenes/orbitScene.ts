import { FIGURES } from './figures';

export type OrbitPhase = 'bear' | 'morph' | 'orbit' | 'reveal' | 'settled';

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Escena de búsqueda: el jucumari se concentra en una estrella, aparece la Tierra de puntos y la
 * estrella la orbita mientras el backend trabaja. La órbita no simula un porcentaje: dura lo que
 * dure el trabajo real y se detiene al llegar resultados, errores o cancelación.
 */
export class OrbitScene {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private phase: OrbitPhase = 'bear';
  private phaseAt = performance.now();
  private readonly sphere: [number, number, number][];
  private readonly bear = FIGURES[0]!.nodes!;
  private readonly edges = FIGURES[0]!.edges!;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_2d_unavailable');
    this.ctx = ctx;
    // Esfera de Fibonacci: puntos uniformes para una Tierra esquemática (no es un mapa real).
    const n = 520;
    this.sphere = Array.from({ length: n }, (_, i) => {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = Math.PI * (3 - Math.sqrt(5)) * i;
      return [Math.cos(th) * r, y, Math.sin(th) * r];
    });
  }

  resize(w: number, h: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  setPhase(p: OrbitPhase) {
    if (p === this.phase) return;
    this.phase = p;
    this.phaseAt = performance.now();
  }

  start() {
    const loop = (t: number) => {
      this.draw(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  private draw(time: number) {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const since = time - this.phaseAt;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.3;

    // 1) Oso → estrella
    const morph = this.phase === 'bear' ? 0 : this.phase === 'morph' ? ease(clamp(since / 1100)) : 1;
    const star = { x: cx - R * 1.25, y: cy - R * 0.55 };
    const bearScale = Math.min(w, h) * 0.32;
    if (morph < 1) {
      const pts = this.bear.map(([x, y]) => ({
        x: cx + x * bearScale * (1 - morph) + (star.x - cx) * morph,
        y: cy + y * bearScale * (1 - morph) + (star.y - cy) * morph,
      }));
      ctx.strokeStyle = '#f2a93b';
      ctx.globalAlpha = 0.5 * (1 - morph);
      ctx.lineWidth = 1;
      for (const [a, b] of this.edges) {
        ctx.beginPath();
        ctx.moveTo(pts[a]!.x, pts[a]!.y);
        ctx.lineTo(pts[b]!.x, pts[b]!.y);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd38a';
      for (const p of pts) {
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2) Tierra de puntos
    const globeIn = this.phase === 'bear' ? 0 : this.phase === 'morph' ? ease(clamp((since - 500) / 900)) : 1;
    if (globeIn > 0) {
      const rot = time / 7000;
      for (const [x, y, z] of this.sphere) {
        const xr = x * Math.cos(rot) - z * Math.sin(rot);
        const zr = x * Math.sin(rot) + z * Math.cos(rot);
        if (zr < -0.15) continue;
        const depth = (zr + 1) / 2;
        ctx.globalAlpha = globeIn * (0.12 + 0.55 * depth);
        ctx.fillStyle = depth > 0.82 ? '#3fb8b0' : '#f3e9d7';
        ctx.fillRect(cx + xr * R * globeIn, cy + y * R * globeIn, 1.6, 1.6);
      }
      ctx.globalAlpha = 0.18 * globeIn;
      ctx.strokeStyle = '#f3e9d7';
      ctx.beginPath();
      ctx.arc(cx, cy, R * globeIn, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3) Estrella en órbita (solo mientras hay trabajo real)
    const orbiting = this.phase === 'orbit' || this.phase === 'morph';
    const settle = this.phase === 'reveal' || this.phase === 'settled' ? ease(clamp(since / 900)) : 0;
    if (morph > 0.6) {
      const a = orbiting || settle < 1 ? time / 1300 : 0;
      const ox = cx + Math.cos(a) * R * 1.32;
      const oy = cy + Math.sin(a) * R * 0.42 - R * 0.1;
      const sx = morph < 1 ? star.x : ox * (1 - settle) + (cx + R * 0.9) * settle;
      const sy = morph < 1 ? star.y : oy * (1 - settle) + (cy - R * 0.9) * settle;
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#f2a93b';
      ctx.beginPath();
      ctx.ellipse(cx, cy - R * 0.1, R * 1.32, R * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 26);
      g.addColorStop(0, 'rgba(255,211,138,0.9)');
      g.addColorStop(1, 'rgba(242,169,59,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3dc';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 9);
      ctx.lineTo(sx + 2.2, sy - 2.2);
      ctx.lineTo(sx + 9, sy);
      ctx.lineTo(sx + 2.2, sy + 2.2);
      ctx.lineTo(sx, sy + 9);
      ctx.lineTo(sx - 2.2, sy + 2.2);
      ctx.lineTo(sx - 9, sy);
      ctx.lineTo(sx - 2.2, sy - 2.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
