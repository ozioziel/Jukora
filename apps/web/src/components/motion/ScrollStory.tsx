import { type ReactNode, useEffect, useRef } from 'react';
import { ParticleStory } from '@/scenes/particleStory';

/**
 * Historia con scroll natural (sin scroll-jacking): una capa de partículas persistente detrás de
 * paneles semánticos. GSAP ScrollTrigger sincroniza el progreso con suavizado (`scrub`), y como el
 * dibujo depende solo del progreso, retroceder reconstruye cada figura.
 */
export function ScrollStory({ panels }: { panels: ReactNode[] }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = container.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const small = window.innerWidth < 760;
    let story: ParticleStory;
    try {
      story = new ParticleStory(cv, { count: small ? 300 : 560, reducedMotion: reduced });
    } catch {
      return; // sin canvas: el contenido sigue completo y accesible
    }
    const fit = () => story.resize(cv.parentElement!.clientWidth, window.innerHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.documentElement);

    // Animar solo cuando la escena está a la vista y la pestaña visible.
    const io = new IntersectionObserver(([e]) => (e?.isIntersecting && !document.hidden ? story.start() : story.stop()), { threshold: 0 });
    io.observe(el);
    const onVis = () => (document.hidden ? story.stop() : story.start());
    document.addEventListener('visibilitychange', onVis);

    let cleanupScroll = () => {};
    if (reduced) {
      // Sin movimiento: figura estable del panel visible, sin transiciones.
      const sections = [...el.querySelectorAll<HTMLElement>('[data-panel]')];
      const pio = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) story.setProgress(Number(e.target.getAttribute('data-panel')) + 0.45);
        },
        { threshold: 0.5 },
      );
      sections.forEach((s) => pio.observe(s));
      story.setProgress(0.45);
      cleanupScroll = () => pio.disconnect();
    } else {
      story.playIntro();
      let killed = false;
      void (async () => {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
        if (killed) return;
        gsap.registerPlugin(ScrollTrigger);
        const state = { p: 0 };
        const tween = gsap.to(state, {
          p: panels.length,
          ease: 'none',
          onUpdate: () => story.setProgress(state.p),
          scrollTrigger: { trigger: el, start: 'top top', end: 'bottom bottom', scrub: 0.7, invalidateOnRefresh: true },
        });
        cleanupScroll = () => {
          tween.scrollTrigger?.kill();
          tween.kill();
        };
      })();
      const prev = cleanupScroll;
      cleanupScroll = () => {
        killed = true;
        prev();
      };
    }
    return () => {
      cleanupScroll();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      story.destroy();
    };
  }, [panels.length]);

  return (
    <div ref={container} className="relative">
      <div className="pointer-events-none sticky top-0 -mb-[100dvh] h-[100dvh] w-full overflow-hidden" aria-hidden="true">
        {/* En móvil la figura queda detrás del texto: se atenúa para no restar legibilidad. */}
        <canvas ref={canvas} className="block h-full w-full max-md:opacity-35" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-night to-transparent" />
      </div>
      {panels.map((panel, i) => (
        <section key={i} data-panel={i} className={`relative ${i === panels.length - 1 ? 'min-h-[110dvh]' : 'min-h-[140dvh]'}`}>
          {panel}
        </section>
      ))}
    </div>
  );
}
