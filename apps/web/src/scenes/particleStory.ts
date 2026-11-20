import { FIGURES, type Pt, samplePoints } from './figures';

/** Generador determinista: mismas partículas en cada visita y al volver con el scroll. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const FORM_END = 0.3;
const HOLD_END = 0.65;
const CAMERA = [
  { s: 1, x: 0, y: 0 },
  { s: 0.95, x: 0.02, y: 0.02 },
  { s: 1.05, x: 0, y: 0.03 },
  { s: 1.02, x: 0, y: 0 },
  { s: 0.92, x: -0.02, y: 0.01 },
  { s: 1.1, x: 0, y: 0.04 },
];

export interface StoryOptions {
  count: number;
  reducedMotion: boolean;
}

/**
 * Escena de partículas para el Inicio. El dibujo es una función pura del progreso de scroll
 * (0..figuras), así que avanzar y retroceder reconstruye exactamente cada estado.
 */
export class ParticleStory {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private progress = 0;
  private intro = 1;
  private introStart = 0;
  private raf = 0;
  private running = false;
  private readonly n: number;
  private readonly targets: Pt[][];
  private readonly segs: Int16Array[];
  private readonly scatter: Pt[][];
  private readonly cloud: Pt[];
  private readonly delays: Float32Array[];
  private readonly seeds: Float32Array;
  private stars: { x: number; y: number; r: number; a: number }[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: StoryOptions,
  ) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('canvas_2d_unavailable');
    this.ctx = ctx;
    this.n = opts.count;
    const r = rng(20261120);
    this.seeds = Float32Array.from({ length: this.n }, () => r());
    const sampled = FIGURES.map((f) => samplePoints(f, this.n));
    this.targets = sampled.map((s) => s.pts);
    this.segs = sampled.map((s) => s.seg);
    this.cloud = Array.from({ length: this.n }, () => [r() * 2.4 - 1.2, r() * 2 - 1] as Pt);
    // Dispersión dirigida: cada figura se abre hacia afuera con una curva orgánica.
    this.scatter = this.targets.map((pts, k) =>
      pts.map(([x, y], i) => {
        const a = this.seeds[i]! * Math.PI * 2 + k;
        const rad = 0.25 + 0.45 * r();
        return [x * 1.35 + Math.cos(a) * rad, y * 1.25 + Math.sin(a) * rad * 0.8] as Pt;
      }),
    );
    this.delays = FIGURES.map((fig, k) => {
      const pts = this.targets[k]!;
      return Float32Array.from(pts, ([x, y], i) => {
        switch (fig.stagger) {
          case 'draw':
            return i / this.n; // las líneas se dibujan en orden
          case 'layers':
            return clamp((y + 0.6) / 1.2) * 0.9; // de arriba hacia abajo, por capas
          case 'groups':
            return x < -0.3 ? 0 : x < 0.3 ? 0.35 : 0.7; // un objeto tras otro
          case 'orbit':
            return (Math.atan2(y, x) / (Math.PI * 2) + 0.5) * 0.9; // barrido circular
          case 'close':
            return (1 - Math.abs(x)) * 0.8; // el escudo se cierra desde los lados
          case 'rise':
            return clamp((x + 1) / 2) * 0.8; // la ciudad se levanta de izquierda a derecha
        }
      });
    });
  }

  resize(width: number, height: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, width < 700 ? 1.25 : 1.5);
    this.w = width;
    this.h = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const r = rng(7);
    this.stars = Array.from({ length: Math.round((width * height) / 9000) }, () => ({
      x: r() * width,
      y: r() * height,
      r: r() * 1.1 + 0.2,
      a: r() * 0.5 + 0.1,
    }));
    this.draw(performance.now());
  }

  setProgress(p: number) {
    this.progress = clamp(p, 0, FIGURES.length - 1e-6);
    if (!this.running) this.draw(performance.now());
  }

  playIntro() {
    if (this.opts.reducedMotion) return;
    this.intro = 0;
    this.introStart = performance.now();
  }

  start() {
    if (this.running || this.opts.reducedMotion) {
      this.draw(performance.now());
      return;
    }
    this.running = true;
    const loop = (t: number) => {
      if (!this.running) return;
      this.draw(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
  }

  private layout(k: number) {
    const desktop = this.w >= 900;
    const cam = CAMERA[k] ?? CAMERA[0]!;
    const base = desktop ? Math.min(this.w * 0.27, this.h * 0.4) : Math.min(this.w * 0.42, this.h * 0.24);
    return {
      cx: (desktop ? this.w * 0.7 : this.w * 0.5) + cam.x * this.w,
      cy: (desktop ? this.h * 0.52 : this.h * 0.3) + cam.y * this.h,
      s: base * cam.s,
    };
  }

  private draw(time: number) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    for (const s of this.stars) {
      ctx.globalAlpha = s.a * (this.opts.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(time / 1400 + s.x));
      ctx.fillStyle = '#f3e9d7';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    if (this.intro < 1) this.intro = clamp((time - this.introStart) / 1800);
    const P = this.progress;
    const k = Math.min(FIGURES.length - 1, Math.floor(P));
    const t = P - k;
    const last = k === FIGURES.length - 1;
    const form = k === 0 ? easeInOut(this.intro) : clamp(t / FORM_END);
    const disperse = last ? 0 : clamp((t - HOLD_END) / (1 - HOLD_END));
    const from = k === 0 ? this.cloud : this.scatter[k - 1]!;
    const target = this.targets[k]!;
    const scat = this.scatter[k]!;
    const delays = this.delays[k]!;
    const L = this.layout(k);
    const Lprev = this.layout(Math.max(0, k - 1));
    const Lnext = this.layout(Math.min(FIGURES.length - 1, k + 1));
    const rot = FIGURES[k]!.stagger === 'orbit' ? (t - 0.5) * 0.5 : 0;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const breathe = this.opts.reducedMotion ? 0 : 1;

    const xs = new Float32Array(this.n);
    const ys = new Float32Array(this.n);
    const alive = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const d = delays[i]!;
      const fi = easeOut(clamp((form - d * 0.6) / 0.4));
      const di = easeIn(clamp((disperse - (1 - d) * 0.3) / 0.7));
      const [tx0, ty0] = target[i]!;
      const tx = tx0 * cos - ty0 * sin;
      const ty = tx0 * sin + ty0 * cos;
      const [fx, fy] = from[i]!;
      const [sx, sy] = scat[i]!;
      const seed = this.seeds[i]!;
      const wob = breathe * (1 - di) * fi;
      const wx = Math.sin(time / 1700 + seed * 40) * 0.012 * wob;
      const wy = Math.cos(time / 1900 + seed * 30) * 0.012 * wob;
      // Desde la dispersión anterior (en el encuadre anterior) hacia la figura actual…
      let x = (fx * Lprev.s + Lprev.cx) * (1 - fi) + ((tx + wx) * L.s + L.cx) * fi;
      let y = (fy * Lprev.s + Lprev.cy) * (1 - fi) + ((ty + wy) * L.s + L.cy) * fi;
      // …y luego se abre hacia la siguiente figura sin desaparecer.
      x = x * (1 - di) + (sx * Lnext.s + Lnext.cx) * di;
      y = y * (1 - di) + (sy * Lnext.s + Lnext.cy) * di;
      xs[i] = x;
      ys[i] = y;
      alive[i] = fi * (1 - di);
    }

    // Líneas de constelación entre puntos vecinos de la misma línea.
    const segs = this.segs[k]!;
    const fig = FIGURES[k]!;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#f3e9d7';
    const maxGap = L.s * 0.16;
    for (let i = 1; i < this.n; i++) {
      if (segs[i]! < 0 || segs[i] !== segs[i - 1]) continue;
      const a = Math.min(alive[i]!, alive[i - 1]!);
      if (a < 0.05) continue;
      const dx = xs[i]! - xs[i - 1]!;
      const dy = ys[i]! - ys[i - 1]!;
      if (dx * dx + dy * dy > maxGap * maxGap) continue;
      ctx.globalAlpha = a * 0.22;
      ctx.beginPath();
      ctx.moveTo(xs[i - 1]!, ys[i - 1]!);
      ctx.lineTo(xs[i]!, ys[i]!);
      ctx.stroke();
    }
    if (fig.edges) {
      ctx.strokeStyle = '#f2a93b';
      fig.edges.forEach(([a, b], ei) => {
        const drawn = clamp(form * fig.edges!.length - ei); // el oso se traza línea por línea
        const al = Math.min(alive[a]!, alive[b]!) * drawn;
        if (al < 0.02) return;
        ctx.globalAlpha = al * 0.55;
        ctx.beginPath();
        ctx.moveTo(xs[a]!, ys[a]!);
        ctx.lineTo(xs[a]! + (xs[b]! - xs[a]!) * drawn, ys[a]! + (ys[b]! - ys[a]!) * drawn);
        ctx.stroke();
      });
    }

    // Partículas: núcleo crema y halo ámbar en los nodos principales.
    for (let i = 0; i < this.n; i++) {
      const seed = this.seeds[i]!;
      const tw = this.opts.reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(time / 900 + seed * 60);
      const isNode = fig.nodes && i < fig.nodes.length;
      const a = (0.25 + 0.75 * alive[i]!) * tw;
      if (isNode && alive[i]! > 0.1) {
        ctx.globalAlpha = 0.18 * alive[i]!;
        ctx.fillStyle = '#f2a93b';
        ctx.beginPath();
        ctx.arc(xs[i]!, ys[i]!, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = isNode ? '#ffd38a' : seed > 0.86 ? '#f2a93b' : '#f3e9d7';
      const r = isNode ? 2.2 : 0.7 + seed * 0.9;
      ctx.beginPath();
      ctx.arc(xs[i]!, ys[i]!, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
