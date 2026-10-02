'use client'

/**
 * Scroll choreography for the marketing pages, with GSAP.
 *
 * Markup opts in with data attributes, so the pages stay server-rendered:
 * - data-reveal: rises into place when it scrolls into view
 * - data-reveal-group: its direct children reveal one after another
 * - data-parallax="0.15": drifts against the scroll by that fraction
 * - data-phone-scroll: content inside a fixed-height frame drifts to its end and back
 *
 * Nothing moves for people who ask for reduced motion, and everything is
 * visible without JavaScript: GSAP only adds the starting offset once it runs.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

export function Motion({ children }: { readonly children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = root.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.registerPlugin(ScrollTrigger)

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          y: 28,
          autoAlpha: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        })
      })
      gsap.utils.toArray<HTMLElement>('[data-reveal-group]').forEach((group) => {
        gsap.from(group.children, {
          y: 24,
          autoAlpha: 0,
          duration: 0.8,
          ease: 'power3.out',
          stagger: 0.08,
          scrollTrigger: { trigger: group, start: 'top 85%', once: true },
        })
      })
      gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
        const amount = Number(el.dataset['parallax'] ?? '0.15')
        gsap.to(el, {
          yPercent: -amount * 100,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
        })
      })
      gsap.utils.toArray<HTMLElement>('[data-phone-scroll]').forEach((el) => {
        const distance = el.scrollHeight - (el.parentElement?.clientHeight ?? el.scrollHeight)
        if (distance <= 0) return
        gsap.to(el, {
          y: -distance,
          duration: Math.max(6, distance / 45),
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          repeatDelay: 1.6,
          delay: 2.4,
        })
      })
      // The hero lines arrive once, on load.
      gsap.from('[data-hero-line]', {
        y: 40,
        autoAlpha: 0,
        duration: 1.1,
        ease: 'expo.out',
        stagger: 0.09,
        delay: 0.1,
      })
    }, node)

    return () => {
      ctx.revert()
    }
  }, [])

  return <div ref={root}>{children}</div>
}
