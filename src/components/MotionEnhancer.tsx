'use client';

import { useEffect } from 'react';

const REVEAL_SELECTOR = [
  'main > header',
  'main > div > header',
  'main section',
  'main article',
  '.apple-card',
  '.golden-card',
  '.design-panel',
  '.design-panel-strong',
  '.listing-card',
  '.market-card',
].join(',');

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function MotionEnhancer() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const onPointerMove = (event: PointerEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        root.style.setProperty('--pointer-x', `${Math.round(event.clientX)}px`);
        root.style.setProperty('--pointer-y', `${Math.round(event.clientY)}px`);
      });
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((element) => {
        element.dataset.revealReady = 'true';
        element.classList.add('is-visible');
      });
      return () => {
        window.removeEventListener('pointermove', onPointerMove);
        if (frame) window.cancelAnimationFrame(frame);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
    );

    const prepare = () => {
      const elements = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
      elements.forEach((element, index) => {
        if (element.dataset.revealReady || element.closest('[role="dialog"]')) return;
        element.dataset.revealReady = 'true';
        element.style.setProperty('--reveal-delay', `${Math.min(index % 8, 7) * 36}ms`);
        observer.observe(element);
      });
    };

    prepare();
    const mutationObserver = new MutationObserver(prepare);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return null;
}
