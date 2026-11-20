import { useEffect, useRef } from 'react';

/**
 * Halo circular estelar que sigue al puntero con inercia. No reemplaza el cursor, no intercepta
 * clics y no provoca renders de React: un solo overlay movido con transform en rAF.
 * Se desactiva en touch, con movimiento reducido y cuando la pestaña no está visible.
 */
export function CursorHalo() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia('(pointer: fine)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || reduce.matches) return;

    let x = -400;
    let y = -400;
    let tx = x;
    let ty = y;
    let scale = 1;
    let targetScale = 1;
    let raf = 0;
    let visible = false;

    const loop = () => {
      x += (tx - x) * 0.16;
      y += (ty - y) * 0.16;
      scale += (targetScale - scale) * 0.14;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      raf = requestAnimationFrame(loop);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX;
      ty = e.clientY;
      if (!visible) {
        visible = true;
        x = tx;
        y = ty;
        el.dataset.visible = 'true';
      }
      const interactive = (e.target as Element | null)?.closest?.('a, button, [role="button"], input, select, textarea, summary');
      targetScale = interactive ? 1.35 : 1;
      // Ocultarlo dentro de diálogos sensibles (firmas, pagos).
      el.dataset.hidden = (e.target as Element | null)?.closest?.('[data-no-halo]') ? 'true' : 'false';
    };
    const onLeave = () => {
      visible = false;
      el.dataset.visible = 'false';
    };
    const onDown = () => {
      el.dataset.flash = 'true';
      window.setTimeout(() => (el.dataset.flash = 'false'), 180);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onDown);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="cursor-halo pointer-events-none fixed top-0 left-0 z-[60]" data-visible="false">
      <svg viewBox="0 0 24 24" className="cursor-halo-star">
        <path d="M12 2.5l1.6 7.9 7.9 1.6-7.9 1.6L12 21.5l-1.6-7.9L2.5 12l7.9-1.6z" fill="currentColor" />
      </svg>
    </div>
  );
}
