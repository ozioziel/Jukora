import {
  ArrowRight,
  Armchair,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CookingPot,
  Flame,
  PackageCheck,
  Refrigerator,
  ShieldCheck,
  UtensilsCrossed,
  Wallet,
  Wind,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { SECTOR_COLOR, type Sector } from '@/components/house/House2D';
import { HouseSprite } from '@/components/house/HouseSprite';
import { Jucumari2D } from '@/components/jucumari/Jucumari2D';
import { type SkyKey, useSetSky } from '@/components/sky/Sky';
import { Dialog } from '@/components/ui';

/**
 * Inicio: galería en arco de negocios (el fondo toma la carta activa, difuminada) y un recorrido por
 * paneles de pantalla completa que presenta la app con scroll. GSAP ScrollTrigger anima cada panel de
 * forma reversible; el jucumari viaja entre paneles (oso → constelación → estrella → oso).
 * Con movimiento reducido todo el contenido queda visible y quieto.
 */

const CARDS: { sector: Exclude<Sector, 'new'>; sky: SkyKey }[] = [
  { sector: 'restaurant', sky: 'card-restaurant' },
  { sector: 'cafe', sky: 'card-cafe' },
  { sector: 'workshop', sky: 'card-workshop' },
  { sector: 'store', sky: 'card-store' },
  { sector: 'studio', sky: 'card-studio' },
  { sector: 'other', sky: 'card-other' },
];
const PANEL_SKY: SkyKey[] = ['bg-alba', 'card-cafe', 'bg-noche', 'bg-ocaso', 'card-workshop', 'bg-alba'];
const TARGETS = ['/espacio', '/espacio', '/explorar', '/explorar', '#proteccion', '/espacio'];
const LIST_ICONS = [Flame, CookingPot, Refrigerator, Armchair, Wind, UtensilsCrossed];
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type PanelCopy = { title: string; body: string; cta: string };

export default function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const setSky = useSetSky();
  const [active, setActive] = useState(0);
  const [inStory, setInStory] = useState(false);
  const [protection, setProtection] = useState(false);
  const [idea, setIdea] = useState('');
  const panels = t('home.panels', { returnObjects: true }) as PanelCopy[];
  // Escenario fijo con capítulos en escritorio; en pantallas chicas o con movimiento reducido, paneles apilados.
  const [mode] = useState<'pinned' | 'stacked'>(() => (reduced() || window.innerWidth < 900 ? 'stacked' : 'pinned'));

  // En la portada el cielo sigue a la carta activa; en el recorrido lo maneja cada capítulo.
  useEffect(() => {
    if (!inStory) setSky({ key: CARDS[active]!.sky, blur: 16 });
  }, [active, inStory, setSky]);

  const go = (target: string) => (target === '#proteccion' ? setProtection(true) : void nav(target));
  const text = (p: PanelCopy, i: number, n: number) => (
    <div className="on-sky max-w-xl">
      <div data-form className="mb-5 flex items-center gap-3 font-mono text-xs tracking-[0.3em] text-white/85">
        {String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
      </div>
      <h2 data-form id={`panel-${i}`} className="display text-4xl text-white md:text-6xl">
        {p.title}
      </h2>
      <p data-form className="mt-5 max-w-md text-lg text-white/90">
        {p.body}
      </p>
      {i === 0 ? (
        <form
          data-form
          className="mt-8 flex max-w-lg flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void nav('/espacio', { state: { idea: idea.trim() } });
          }}
        >
          <label htmlFor="home-idea" className="sr-only">
            {t('space.title')}
          </label>
          <input id="home-idea" className="field" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={t('space.title')} />
          <button className="btn btn-primary btn-lg shrink-0">
            {p.cta} <ArrowRight size={18} />
          </button>
        </form>
      ) : (
        <div data-form className="mt-8">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => go(TARGETS[i]!)}>
            {TARGETS[i] === '#proteccion' && <ShieldCheck size={18} />} {p.cta} <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div data-hero>
        <Hero active={active} setActive={setActive} />
      </div>
      <div className="pallay" aria-hidden="true" />
      {mode === 'pinned' ? (
        <StoryPinned panels={panels} text={text} onActive={setInStory} />
      ) : (
        <StoryStacked panels={panels} text={text} onActive={setInStory} />
      )}

      <Dialog open={protection} onClose={() => setProtection(false)} title={t('order.checkoutTitle')}>
        <p className="text-cream/90">{t('order.protection')}</p>
        <p className="mt-3 text-sm text-muted">{t('order.limits')}</p>
        <p className="mt-3 text-sm text-muted">{t('home.protectionNote')}</p>
      </Dialog>
    </div>
  );
}

/* ─────────────── Portada: galería en arco ─────────────── */
function Hero({ active, setActive }: { active: number; setActive: (n: number) => void }) {
  const { t } = useTranslation();
  const [touched, setTouched] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900);
  useEffect(() => {
    const r = () => setNarrow(window.innerWidth < 900);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  // Avance suave solo hasta que la persona toque la galería; nunca con movimiento reducido.
  useEffect(() => {
    if (touched || reduced()) return;
    const h = window.setInterval(() => !document.hidden && window.scrollY < 200 && setActive((active + 1) % CARDS.length), 6000);
    return () => window.clearInterval(h);
  }, [touched, active, setActive]);
  const go = (k: number) => {
    setTouched(true);
    setActive((k + CARDS.length) % CARDS.length);
  };
  const name = (s: Sector) => (s === 'other' ? t('home.hero.otherName') : t(`sectors.${s}`));
  const step = narrow ? 150 : 236;

  return (
    <section className="relative flex min-h-[calc(100dvh-80px)] flex-col items-center overflow-clip px-4 pt-10 pb-8 text-center">
      <h1 className="display on-sky max-w-[980px] text-[clamp(30px,3.9vw,56px)] text-white">
        {t('home.hero.title1')}{' '}
        <em className="bg-gradient-to-r from-amarillo via-naranja to-fucsia bg-clip-text not-italic text-transparent drop-shadow-[0_2px_10px_rgb(18_20_56/0.35)]">
          {t('home.hero.title2')}
        </em>
      </h1>
      <p className="on-sky mx-auto mt-4 max-w-[700px] text-lg text-white/90">{t('home.hero.lead')}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2.5 text-[13px] font-bold text-white">
        <span className="float-y rounded-full border border-white/35 bg-[rgb(28_30_70/0.38)] px-3 py-1.5 backdrop-blur">
          {t('home.hero.factSearches', { n: 10 })}
        </span>
        <span className="float-y rounded-full border border-white/35 bg-[rgb(28_30_70/0.38)] px-3 py-1.5 backdrop-blur [animation-delay:-3s]">
          {t('home.hero.factEscrow')}
        </span>
      </div>

      <div
        role="region"
        aria-roledescription="carrusel"
        aria-label={t('home.hero.carousel')}
        className="relative mt-7 mb-4 h-[430px] w-full [perspective:1500px] max-md:h-[360px]"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(active + 1);
          if (e.key === 'ArrowLeft') go(active - 1);
        }}
      >
        <button type="button" aria-label={t('home.hero.prev')} className="btn btn-icon absolute top-[175px] left-[max(16px,calc(50%-560px))] z-30 max-md:top-[140px]" onClick={() => go(active - 1)}>
          <ChevronLeft size={22} />
        </button>
        <div className="absolute inset-0 [transform-style:preserve-3d]">
          {CARDS.map((c, k) => {
            let o = k - active;
            if (o > CARDS.length / 2) o -= CARDS.length;
            if (o < -CARDS.length / 2) o += CARDS.length;
            const a = Math.abs(o);
            const style = {
              '--c': SECTOR_COLOR[c.sector],
              transform: `translateX(${o * step}px) translateZ(${-a * 140}px) rotateY(${-o * 22}deg)`,
              zIndex: 10 - a,
              opacity: a > (narrow ? 1 : 2) ? 0 : 1,
              filter: `brightness(${1 - a * 0.1})`,
              pointerEvents: a > 2 ? 'none' : undefined,
              animationDelay: `${-k * 1.2}s`,
            } as CSSProperties;
            return (
              <button
                key={c.sector}
                type="button"
                className="flow-card lglass"
                style={style}
                aria-current={o === 0}
                tabIndex={o === 0 ? 0 : -1}
                onClick={() => go(k)}
              >
                <div className="pic" style={{ backgroundImage: `url(/escenas/${c.sky}.webp)` }}>
                  <HouseSprite sector={c.sector} reflect className="absolute bottom-[13%] left-[18%] z-[2] w-[64%]" />
                </div>
                <span className="absolute top-[18px] left-[18px] z-[3] rounded-lg border border-[color-mix(in_oklab,var(--c)_35%,transparent)] bg-white/85 px-2.5 py-1.5 text-[11px] font-bold tracking-[0.12em] text-[color-mix(in_oklab,var(--c)_70%,#1c1a33)] uppercase">
                  {name(c.sector)}
                </span>
                <span className="absolute inset-x-0 bottom-0 h-[112px] px-[18px] pt-3 max-md:h-[100px]">
                  <span className="absolute inset-x-2 top-0 h-1 rounded-sm bg-[linear-gradient(90deg,transparent,var(--c),transparent)] opacity-70" />
                  <span className="mt-2.5 mb-1 block font-display text-[21px] font-extrabold max-md:text-lg">{name(c.sector)}</span>
                  <span className="block text-[13.5px] leading-snug text-ink-2">{t(`home.hero.blurbs.${c.sector}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" aria-label={t('home.hero.next')} className="btn btn-icon absolute top-[175px] right-[max(16px,calc(50%-560px))] z-30 max-md:top-[140px]" onClick={() => go(active + 1)}>
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="flex justify-center gap-2" aria-hidden="true">
        {CARDS.map((c, k) => (
          <i key={c.sector} className={`h-2 rounded-full transition-all duration-500 ${k === active ? 'w-7 bg-amarillo' : 'w-2 bg-white/40'}`} />
        ))}
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-3.5">
        <Link to="/espacio" className="btn btn-primary btn-lg">
          {t('home.hero.start', { name: name(CARDS[active]!.sector) })} <ArrowRight size={18} />
        </Link>
        <Link to="/explorar" className="btn btn-lg">
          {t('home.hero.explore')}
        </Link>
      </div>
      <p className="on-sky mt-4 text-sm text-white/80">
        <Link to="/espacio" className="underline decoration-amarillo/60 underline-offset-4 hover:text-white">
          {t('home.skip')}
        </Link>{' '}
        · {t('home.scrollHint')}
      </p>
    </section>
  );
}

/* ─────────────── Recorrido por capítulos ───────────────
   Escritorio: un escenario fijo (sticky) con un capítulo por pantalla e imán de scroll. Al pasar de
   capítulo, el jucumari se vuelve constelación → estrella, la estrella viaja al centro, estalla y
   «forma» el siguiente panel (iris de luz + piezas que salen de la estrella hasta su lugar), ~1,6 s.
   Mientras se hace scroll dentro de un capítulo, el texto gigante y el visual se desplazan (--lp). */
type TextFn = (p: PanelCopy, i: number, n: number) => ReactNode;
const STAR_PATH = 'M20 2l4.5 13.5L38 20l-13.5 4.5L20 38l-4.5-13.5L2 20l13.5-4.5z';

function GuideFigure() {
  return (
    <>
      <div data-bear>
        <Jucumari2D className="w-full drop-shadow-[0_18px_24px_rgb(0_0_0/0.35)]" />
      </div>
      <div data-cons className="absolute inset-0 opacity-0">
        <Jucumari2D mode="constellation" className="w-full" />
      </div>
    </>
  );
}

function StoryPinned({ panels, text, onActive }: { panels: PanelCopy[]; text: TextFn; onActive: (b: boolean) => void }) {
  const { t } = useTranslation();
  const setSky = useSetSky();
  const N = panels.length;
  const wrap = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const jump = useRef<(i: number) => void>(() => {});
  const [current, setCurrent] = useState(-1);
  const giant = t('home.giant', { returnObjects: true }) as string[];

  useEffect(() => {
    const el = wrap.current;
    const sg = stage.current;
    if (!el || !sg) return;
    let killed = false;
    let cleanup = () => {};
    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
      if (killed) return;
      gsap.registerPlugin(ScrollTrigger);
      const layers = [...sg.querySelectorAll<HTMLElement>('[data-layer]')];
      const star = sg.querySelector<HTMLElement>('[data-star]')!;
      const ring = sg.querySelector<HTMLElement>('[data-ring]')!;
      const guide = sg.querySelector<HTMLElement>('[data-guide]')!;
      const bear = guide.querySelector('[data-bear]');
      const cons = guide.querySelector('[data-cons]');
      const tails = [...sg.querySelectorAll<HTMLElement>('[data-tail]')];
      gsap.set(layers, { autoAlpha: 0 });
      gsap.set([star, ring, ...tails], { autoAlpha: 0 });
      let shown = -1;
      let tl: ReturnType<typeof gsap.timeline> | null = null;
      const guideX = (i: number) => (i % 2 ? sg.clientWidth - guide.offsetWidth - 48 : 0);

      const form = (next: number) => {
        if (next === shown) return;
        const prev = shown;
        shown = next;
        setCurrent(next);
        setSky({ key: PANEL_SKY[next]!, blur: 8 });
        tl?.progress(1).kill();
        const from = prev >= 0 ? layers[prev]! : null;
        const to = layers[next]!;
        const sr = sg.getBoundingClientRect();
        const cx = sr.left + sr.width / 2;
        const cy = sr.top + sr.height / 2;
        const g = guide.getBoundingClientRect();
        const items = [...to.querySelectorAll<HTMLElement>('[data-form]')];
        gsap.set(items, { clearProps: 'transform,opacity,filter' });
        const pts = items.map((it) => {
          const r = it.getBoundingClientRect();
          return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) };
        });
        const T = gsap.timeline({ defaults: { ease: 'power2.inOut' } });
        T.timeScale(1.12);
        // 1. el panel actual se recoge entero hacia el centro
        if (from) {
          T.to(from.querySelector('.container-x'), { scale: 0.7, opacity: 0, filter: 'blur(10px)', duration: 0.5, ease: 'power2.in' }, 0);
          T.to(from.querySelector('.giant'), { opacity: 0, duration: 0.4 }, 0);
        }
        // 2. el oso se vuelve constelación y se concentra en una estrella
        T.to(bear, { opacity: 0, duration: 0.25 }, 0)
          .fromTo(cons, { opacity: 0, scale: 1 }, { opacity: 1, duration: 0.2 }, 0.05)
          .to(cons, { scale: 0.15, opacity: 0, duration: 0.3 }, 0.28);
        // 3. la estrella nace en el oso y vuela al centro con su estela
        const sx = g.left + g.width / 2 - cx;
        const sy = g.top + g.height * 0.45 - cy;
        T.fromTo(star, { x: sx, y: sy, scale: 0.45, autoAlpha: 1, rotate: 0 }, { x: 0, y: 0, scale: 1.1, rotate: 200, duration: 0.55 }, 0.32)
          .to(star, { scale: 1.9, duration: 0.14, ease: 'power1.out' }, 0.87)
          .to(star, { scale: 0.2, autoAlpha: 0, duration: 0.35, ease: 'power2.in' }, 1.0);
        tails.forEach((tail, k) =>
          T.fromTo(
            tail,
            { x: sx, y: sy, autoAlpha: 0.75 - k * 0.18, scale: 1 - k * 0.22 },
            { x: 0, y: 0, duration: 0.55, ease: 'power2.inOut' },
            0.32 + (k + 1) * 0.045,
          ).to(tail, { autoAlpha: 0, duration: 0.15 }, 0.9),
        );
        // 4. estalla: anillo de luz e iris que abre el panel siguiente
        T.fromTo(ring, { scale: 0.1, autoAlpha: 0.95 }, { scale: 9, autoAlpha: 0, duration: 0.9, ease: 'power2.out' }, 0.95)
          .set(to, { autoAlpha: 1, zIndex: 3 }, 0.95)
          .fromTo(to, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(150% at 50% 50%)', duration: 0.85, ease: 'power2.out' }, 0.95);
        if (from) {
          T.set(from, { autoAlpha: 0, zIndex: 1 }, 1.8);
          T.set([from.querySelector('.container-x'), from.querySelector('.giant')], { clearProps: 'transform,opacity,filter' }, 1.81);
        }
        T.fromTo(to.querySelector('.giant'), { opacity: 0 }, { opacity: 1, duration: 0.6 }, 1.1);
        // 5. cada pieza sale de la estrella hasta su lugar
        items.forEach((it, k) =>
          T.fromTo(
            it,
            { x: pts[k]!.x, y: pts[k]!.y, scale: 0.12, opacity: 0, filter: 'blur(6px)' },
            { x: 0, y: 0, scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.8, ease: 'power3.out' },
            1.0 + k * 0.045,
          ),
        );
        // 6. el oso vuelve a formarse en su lado del panel nuevo
        T.set(guide, { x: guideX(next) }, 1.0)
          .fromTo(cons, { scale: 0.15, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35 }, 1.3)
          .to(cons, { opacity: 0, duration: 0.3 }, 1.7)
          .to(bear, { opacity: 1, duration: 0.35 }, 1.65)
          .add(() => {
            gsap.set(to, { clearProps: 'clipPath' });
          });
        tl = T;
      };
      const reset = () => {
        tl?.progress(1).kill();
        shown = -1;
        setCurrent(-1);
        gsap.set(layers, { autoAlpha: 0 });
      };

      // Entrada con borde curvo (como el horizonte de un planeta) mientras el escenario sube.
      const rim = gsap.fromTo(
        sg,
        { clipPath: 'ellipse(70% 55% at 50% 100%)' },
        { clipPath: 'ellipse(150% 150% at 50% 100%)', ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'top top', scrub: true } },
      );
      const enter = ScrollTrigger.create({
        trigger: el,
        start: 'top 55%',
        onEnter: () => {
          onActive(true);
          form(0);
        },
        onLeaveBack: () => {
          onActive(false);
          reset();
        },
      });
      const st = ScrollTrigger.create({
        trigger: el,
        start: 'top top',
        end: 'bottom bottom',
        snap: { snapTo: 1 / (N - 1), duration: { min: 0.3, max: 0.8 }, delay: 0.15, ease: 'power1.inOut' },
        onUpdate: (self) => {
          const f = self.progress * (N - 1);
          const idx = Math.round(f);
          sg.style.setProperty('--lp', (f - idx + 0.5).toFixed(3));
          if (self.isActive) form(idx);
        },
      });
      jump.current = (i: number) => window.scrollTo({ top: st.start + (st.end - st.start) * (i / (N - 1)), behavior: 'smooth' });
      cleanup = () => {
        tl?.kill();
        rim.scrollTrigger?.kill();
        rim.kill();
        enter.kill();
        st.kill();
      };
    })();
    return () => {
      killed = true;
      cleanup();
    };
  }, [N, onActive, setSky]);

  return (
    <section ref={wrap} className="relative" style={{ height: `${(N - 1) * 110 + 100}vh` }} aria-label={t('home.scrollHint')}>
      <div ref={stage} className="story-stage sticky top-0 h-[100dvh] overflow-hidden" style={{ '--lp': 0.5 } as CSSProperties}>
        {panels.map((p, i) => (
          <div key={p.title} data-layer role="group" aria-labelledby={`panel-${i}`} aria-hidden={current !== i} inert={current !== i} className="absolute inset-0">
            <div
              className="absolute -inset-10 bg-cover bg-center [animation:pan_46s_ease-in-out_infinite_alternate] [filter:blur(7px)_brightness(0.92)]"
              style={{ backgroundImage: `url(/escenas/${PANEL_SKY[i]}.webp)` }}
            />
            <div className="sky-veil" />
            <span className="giant" aria-hidden="true">
              {giant[i]}
            </span>
            <div className={`container-x relative z-[2] grid h-full items-center gap-12 pt-16 lg:grid-cols-2 ${i % 2 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
              {text(p, i, N)}
              <div data-visual className="[perspective:1200px] [transform:translateY(calc((0.5-var(--lp))*90px))]">
                <PanelVisual index={i} />
              </div>
            </div>
          </div>
        ))}
        <div data-guide aria-hidden="true" className="pointer-events-none absolute bottom-6 left-6 z-[5] w-[150px]">
          <GuideFigure />
        </div>
        <span
          data-ring
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 z-[6] -mt-10 -ml-10 h-20 w-20 rounded-full border-2 border-[#ffe6b0] shadow-[0_0_40px_10px_rgb(255_214_140/0.55),inset_0_0_30px_rgb(255_214_140/0.5)]"
        />
        {[0, 1, 2].map((k) => (
          <span
            key={k}
            data-tail
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 z-[6] -mt-3 -ml-3 h-6 w-6 rounded-full bg-[radial-gradient(circle,#fff3d6_0%,rgb(255_210_122/0.7)_40%,transparent_70%)]"
          />
        ))}
        <svg
          data-star
          viewBox="0 0 40 40"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 z-[7] -mt-7 -ml-7 h-14 w-14 text-[#fff3d6] [filter:drop-shadow(0_0_18px_#ffd27a)_drop-shadow(0_0_40px_#dc7434)]"
        >
          <path d={STAR_PATH} fill="currentColor" />
        </svg>
        <div className="absolute top-1/2 right-5 z-[8] flex -translate-y-1/2 flex-col gap-2.5">
          {panels.map((p, i) => (
            <button
              key={p.title}
              type="button"
              aria-label={`${t('home.chapter', { n: i + 1 })}: ${p.title}`}
              aria-current={current === i}
              onClick={() => jump.current(i)}
              className={`w-2.5 rounded-full transition-all duration-500 ${current === i ? 'h-8 bg-amarillo' : 'h-2.5 bg-white/55 hover:bg-white/85'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Móvil y movimiento reducido: paneles apilados; cada uno se arma al entrar (reversible). */
function StoryStacked({ panels, text, onActive }: { panels: PanelCopy[]; text: TextFn; onActive: (b: boolean) => void }) {
  const setSky = useSetSky();
  const root = useRef<HTMLDivElement>(null);
  const N = panels.length;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            onActive(true);
            setSky({ key: PANEL_SKY[Number((e.target as HTMLElement).dataset.panel)]!, blur: 8 });
          }
      },
      { threshold: 0.5 },
    );
    el.querySelectorAll('[data-panel]').forEach((s) => io.observe(s));
    const hero = document.querySelector('[data-hero]');
    const ho = new IntersectionObserver(([e]) => e?.isIntersecting && onActive(false), { threshold: 0.35 });
    if (hero) ho.observe(hero);
    return () => {
      io.disconnect();
      ho.disconnect();
    };
  }, [onActive, setSky]);
  useEffect(() => {
    const el = root.current;
    if (!el || reduced()) return;
    let killed = false;
    let cleanup = () => {};
    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
      if (killed) return;
      gsap.registerPlugin(ScrollTrigger);
      const ctx = gsap.context(() => {
        el.querySelectorAll<HTMLElement>('.story-panel').forEach((sec) => {
          gsap.fromTo(
            sec.querySelectorAll('[data-form]'),
            { y: 60, opacity: 0, scale: 0.9, filter: 'blur(8px)' },
            { y: 0, opacity: 1, scale: 1, filter: 'blur(0px)', stagger: 0.08, ease: 'power2.out', scrollTrigger: { trigger: sec, start: 'top 85%', end: 'top 30%', scrub: 0.8 } },
          );
          const fill = sec.querySelector<HTMLElement>('[data-fill]');
          if (fill) gsap.fromTo(fill, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: sec, start: 'top 60%', end: 'bottom 70%', scrub: 0.6 } });
        });
      }, el);
      cleanup = () => ctx.revert();
    })();
    return () => {
      killed = true;
      cleanup();
    };
  }, []);
  return (
    <div ref={root}>
      {panels.map((p, i) => (
        <section key={p.title} data-panel={i} className="story-panel" aria-labelledby={`panel-${i}`}>
          <div className={`container-x grid items-center gap-12 py-24 lg:grid-cols-2 ${i % 2 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
            {text(p, i, N)}
            <div data-visual className="[perspective:1200px]">
              <PanelVisual index={i} />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
/* ─────────────── Visual de cada panel ─────────────── */
function PanelVisual({ index }: { index: number }) {
  const { t } = useTranslation();
  const demo = t('home.demo', { returnObjects: true }) as {
    chatBot: string;
    chatMe: string;
    chatBot2: string;
    list: string[];
    offers: string;
    escrowSteps: string[];
    example: string;
  };
  const box = 'lglass rounded-3xl p-6';
  switch (index) {
    case 0:
      return (
        <div data-form className={`${box} float-y mx-auto flex max-w-md flex-col gap-3`}>
          <Bubble>{demo.chatBot}</Bubble>
          <Bubble me>
            {demo.chatMe}
          </Bubble>
          <Bubble>{demo.chatBot2}</Bubble>
        </div>
      );
    case 1:
      return (
        <div className="mx-auto grid max-w-lg grid-cols-3 gap-4">
          {(['restaurant', 'cafe', 'workshop', 'store', 'studio', 'other'] as const).map((s, i) => (
            <div
              key={s}
              data-form
              className="house-hover lglass float-y rounded-2xl p-3"
              style={{ '--c': SECTOR_COLOR[s], animationDelay: `${-i}s` } as CSSProperties}
            >
              <HouseSprite sector={s} className="mx-auto w-[92%]" />
              <p className="mt-1 truncate text-center font-display text-xs font-bold">{t(`sectors.${s}`)}</p>
            </div>
          ))}
        </div>
      );
    case 2:
      return (
        <div data-form className={`${box} float-y mx-auto max-w-md`}>
          <ul className="space-y-2.5">
            {demo.list.map((item, i) => {
              const Icon = LIST_ICONS[i % LIST_ICONS.length]!;
              return (
                <li key={item} className="flex items-center gap-3 rounded-xl border border-ink/8 bg-white/80 px-3 py-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--color-naranja)_18%,#fff)] text-naranja">
                    <Icon size={18} />
                  </span>
                  <span className="flex-1 text-sm font-semibold">{item}</span>
                  <span className="text-xs text-ink-2">×{(i % 3) + 1}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-right text-[11px] tracking-wider text-ink-2 uppercase">{demo.example}</p>
        </div>
      );
    case 3:
      return (
        <div className="relative mx-auto h-[380px] max-w-lg [transform-style:preserve-3d]">
          {[
            { c: 'var(--color-amarillo)', x: '0%', y: 20, r: 12, title: 'Parrilla a gas', meta: 'USD 450 · 2 días' },
            { c: 'var(--color-verde)', x: '30%', y: 150, r: 0, title: 'Frío Andino', meta: 'Cochabamba · verificada' },
            { c: 'var(--color-fucsia)', x: '52%', y: 0, r: -12, title: `3 ${demo.offers}`, meta: demo.example },
          ].map((o, i) => (
            <div key={o.title} data-form className="absolute w-[56%]" style={{ left: o.x, top: o.y }}>
              {/* el mazo se abanica con el scroll del capítulo (--lp); la capa exterior queda libre para la formación */}
              <div
                className="lglass float-y rounded-2xl p-5"
                style={
                  {
                    '--c': o.c,
                    transform: `translateX(calc((var(--lp, 0.5) - 0.5) * ${(i - 1) * 90}px)) rotateY(calc(${o.r}deg + (var(--lp, 0.5) - 0.5) * ${o.r * 2.4}deg)) rotate(calc((var(--lp, 0.5) - 0.5) * ${(i - 1) * 8}deg))`,
                    animationDelay: `${-i * 1.5}s`,
                  } as CSSProperties
                }
              >
                <span className="text-[11px] font-bold tracking-[0.14em] text-[color-mix(in_oklab,var(--c)_70%,#1c1a33)] uppercase">
                  {i === 1 ? <BadgeCheck size={14} className="mr-1 inline" /> : null}
                  {demo.example}
                </span>
                <p className="mt-1.5 font-display text-lg font-extrabold">{o.title}</p>
                <p className="text-sm text-ink-2">{o.meta}</p>
              </div>
            </div>
          ))}
        </div>
      );
    case 4:
      return (
        <div data-form className={`${box} float-y mx-auto max-w-md`}>
          <div className="relative pl-12">
            <span className="absolute top-3 bottom-3 left-[19px] w-1 rounded bg-ink/10" />
            <span
              data-fill
              className="absolute top-3 bottom-3 left-[19px] w-1 origin-top rounded bg-oro [transform:scaleY(clamp(0.05,calc((var(--lp,1)-0.12)*1.6),1))]"
            />
            {demo.escrowSteps.map((s, i) => {
              const Icon = [Wallet, PackageCheck, ShieldCheck][i]!;
              return (
                <div key={s} className="relative mb-4 flex items-center gap-3 last:mb-0">
                  <span className="absolute -left-12 grid h-10 w-10 place-items-center rounded-full border-2 border-oro bg-white text-oro">
                    <Icon size={18} />
                  </span>
                  <span className="rounded-xl bg-white/85 px-4 py-3 text-sm font-semibold">{s}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-ink-2">{t('home.protectionNote')}</p>
        </div>
      );
    default:
      return (
        <div className="relative mx-auto max-w-md">
          <div data-form className="mx-auto w-[66%]">
            <Jucumari2D className="float-y w-full drop-shadow-[0_26px_30px_rgb(0_0_0/0.35)]" />
          </div>
          <div className="mt-2 flex justify-center gap-3">
            {(['restaurant', 'cafe', 'store'] as const).map((s) => (
              <div key={s} data-form className="house-hover w-24">
                <HouseSprite sector={s} />
              </div>
            ))}
          </div>
        </div>
      );
  }
}

function Bubble({ children, me = false, stack = false }: { children: ReactNode; me?: boolean; stack?: boolean }) {
  return (
    <p data-form={stack ? '' : undefined} className={`msg ${me ? 'msg-me' : 'msg-bot'}`}>
      {children}
    </p>
  );
}
