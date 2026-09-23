import { useEffect } from 'react';
import type React from 'react';
// @ts-ignore
import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { mapMotion } from './components/ChamberMap';

gsap.registerPlugin(ScrollTrigger);

/* One easing family for the whole site: exponential out, never overshoot. */
export const EASE = 'expo.out';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lenis: any = null;

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.6 });
  else el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

/* Weighted smooth scroll, driven by GSAP's ticker so ScrollTrigger stays in lockstep. */
export function useSmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const instance = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95 });
    lenis = instance;
    instance.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      instance.destroy();
      lenis = null;
    };
  }, []);
}

/* Lock page scroll while a modal/menu is open (Lenis ignores body overflow). */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    lenis?.stop();
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      lenis?.start();
      document.documentElement.style.overflow = prev;
    };
  }, [locked]);
}

/* The nav takes the colour of whichever section sits under it. */
export function useNavTheme(set: (t: string) => void) {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-theme]'));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) set((e.target as HTMLElement).dataset.theme || 'ink'); });
      },
      { rootMargin: '0px 0px -92% 0px', threshold: 0 },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [set]);
}

/**
 * The page's choreography. Each effect has one job:
 *  hero      the headline yields and the world map tilts down into a chamber floor
 *  manifesto words light up as they are read (scrubbed, reversible)
 *  clauses   resolution clauses rise once and their verbs are underlined
 *  table     the council table is drawn as it enters
 *  photo     the General Assembly opens from a slit to the full frame
 *  lexicon   the three words drift against the scroll for depth
 *  wordmark  the footer signature sets itself letter by letter
 */
export function useChoreography() {
  useEffect(() => {
    if (prefersReducedMotion()) {
      mapMotion.tilt = 0; mapMotion.drift = 0; mapMotion.fade = 1;
      return;
    }
    const mm = gsap.matchMedia();
    const ctx = gsap.context(() => {
      /* HERO */
      const heroTl = gsap.timeline({
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom bottom', scrub: 0.4 },
        defaults: { ease: 'none' },
      });
      heroTl
        .to(mapMotion, { tilt: 1, drift: 1, duration: 1 }, 0)
        .to('.hero-headline .line-inner', { yPercent: -135, stagger: 0.06, duration: 0.45, ease: 'power2.in' }, 0.08)
        .to('.hero-aside, .hero-meta, .hero-scroll', { autoAlpha: 0, y: -24, duration: 0.3 }, 0.05)
        .to(mapMotion, { fade: 0.22, duration: 0.35 }, 0.65);

      /* MANIFESTO */
      gsap.utils.toArray<HTMLElement>('.manifesto-text').forEach((el) => {
        gsap.fromTo(el.querySelectorAll('.w'), { opacity: 0.16 }, {
          opacity: 1, ease: 'none', stagger: 0.1,
          scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 45%', scrub: true },
        });
      });

      /* RESOLUTION CLAUSES */
      gsap.utils.toArray<HTMLElement>('.clause').forEach((el) => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 86%', once: true } });
        tl.from(el, { y: 40, autoAlpha: 0, duration: 1.2, ease: EASE });
        const rule = el.querySelector('.verb-rule');
        if (rule) tl.from(rule, { scaleX: 0, duration: 1.1, ease: EASE }, 0.25);
      });
      gsap.from('.doc-head > *', {
        y: 24, autoAlpha: 0, duration: 1.1, stagger: 0.08, ease: EASE,
        scrollTrigger: { trigger: '.doc-head', start: 'top 85%', once: true },
      });

      /* COUNCIL TABLE */
      // pathLength="1" on the path makes the dash maths independent of its size.
      gsap.fromTo('.table-path', { strokeDasharray: 1, strokeDashoffset: 1 }, {
        strokeDashoffset: 0, ease: 'none',
        scrollTrigger: { trigger: '.hall-chamber', start: 'top 85%', end: 'center 55%', scrub: 0.6 },
      });

      /* SECTION HEADINGS: one masked line rise, once */
      gsap.utils.toArray<HTMLElement>('.rise .line-inner').forEach((el) => {
        gsap.from(el, { yPercent: 105, duration: 1.3, ease: EASE, scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
      });

      /* LEXICON */
      gsap.utils.toArray<HTMLElement>('.lex-word').forEach((el, i) => {
        gsap.fromTo(el, { xPercent: i % 2 ? 8 : -8 }, {
          xPercent: i % 2 ? -4 : 4, ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      });

      /* WORDMARK */
      gsap.from('.wordmark .ch', {
        yPercent: 100, duration: 1.2, stagger: 0.035, ease: EASE,
        scrollTrigger: { trigger: '.wordmark', start: 'top 95%', once: true },
      });
    });

    /* PHOTO: pinned expansion only where there is room for it.
       Transforms only (GPU-composited): the frame scales up from a small window
       while the photo counter-scales, so it looks clipped without repainting a
       clip-path every frame. */
    mm.add('(min-width: 720px)', () => {
      const frame = document.querySelector<HTMLElement>('.assembly-frame');
      const img = document.querySelector<HTMLElement>('.assembly-img');
      if (!frame || !img) return;
      const state = { p: 0 };
      const render = () => {
        const t = state.p;
        const sx = 0.28 + 0.72 * t;          // window width, fraction of the screen
        const sy = 0.44 + 0.56 * t;          // window height
        const zoom = 1.3 - 0.3 * t;          // slow push-out on the photo itself
        frame.style.transform = `scale(${sx}, ${sy})`;
        img.style.transform = `scale(${zoom / sx}, ${zoom / sy})`;
      };
      render();
      const tl = gsap.timeline({
        scrollTrigger: { trigger: '.assembly', start: 'top top', end: '+=100%', scrub: true, pin: true },
        defaults: { ease: 'none' },
      });
      tl.to(state, { p: 1, duration: 1, ease: 'power1.inOut', onUpdate: render }, 0)
        .from('.assembly-caption .line-inner', { yPercent: 110, stagger: 0.08, duration: 0.35, ease: 'power2.out' }, 0.55);
      return () => { frame.style.transform = ''; img.style.transform = ''; };
    });

    const refresh = () => ScrollTrigger.refresh();
    const t = setTimeout(refresh, 400);
    document.fonts?.ready.then(refresh);
    window.addEventListener('load', refresh);
    return () => {
      clearTimeout(t);
      window.removeEventListener('load', refresh);
      ctx.revert();
      mm.revert();
    };
  }, []);
}

/**
 * Adds `is-in` to an element the first time it scrolls into view. Children
 * animate with CSS from there, so rows and seats that arrive later from live
 * data animate in on their own. Hidden states only apply under `.motion-ok`.
 */
export function useReveal<T extends HTMLElement>(ref: React.RefObject<T | null>, margin = '0px 0px -12% 0px') {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect(); }
    }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
}
