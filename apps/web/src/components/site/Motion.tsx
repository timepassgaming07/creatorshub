'use client'

/**
 * Scroll choreography for the marketing pages, with GSAP.
 *
 * Markup opts in with data attributes, so the pages stay server-rendered:
 * - data-reveal: rises into place when it scrolls into view
 * - data-reveal-group: its direct children reveal one after another
 * - data-parallax="0.15": drifts against the scroll by that fraction
 * - data-phone-scroll: content inside a fixed-height frame drifts to its end and back
 * - data-tilt inside data-tilt-zone: leans toward the pointer
 * - data-count: a figure counts up to the value already printed in it
 * - data-grow: a bar segment grows from the left
 * - data-build: the pinned section whose phone assembles step by step as you scroll
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

    const cleanups: (() => void)[] = []
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
      // The hero phone leans toward the pointer.
      const zone = node.querySelector<HTMLElement>('[data-tilt-zone]')
      const tilt = zone?.querySelector<HTMLElement>('[data-tilt]')
      if (zone && tilt) {
        gsap.set(tilt, { transformPerspective: 1100 })
        const turnY = gsap.quickTo(tilt, 'rotationY', { duration: 0.8, ease: 'power3.out' })
        const turnX = gsap.quickTo(tilt, 'rotationX', { duration: 0.8, ease: 'power3.out' })
        const onMove = (event: PointerEvent) => {
          const box = zone.getBoundingClientRect()
          turnY(((event.clientX - box.left) / box.width - 0.5) * 16)
          turnX(-((event.clientY - box.top) / box.height - 0.5) * 10)
        }
        const onLeave = () => {
          turnY(0)
          turnX(0)
        }
        zone.addEventListener('pointermove', onMove)
        zone.addEventListener('pointerleave', onLeave)
        cleanups.push(() => {
          zone.removeEventListener('pointermove', onMove)
          zone.removeEventListener('pointerleave', onLeave)
        })
      }

      // Figures count up to the value the server already printed.
      gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
        const text = el.textContent
        const match = /[\d,]+(\.\d+)?/.exec(text)
        if (!match) return
        const target = Number(match[0].replace(/,/g, ''))
        const decimals = match[1] ? match[1].length - 1 : 0
        const [before, after] = [
          text.slice(0, match.index),
          text.slice(match.index + match[0].length),
        ]
        const state = { value: 0 }
        gsap.to(state, {
          value: target,
          duration: 1.4,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          onUpdate: () => {
            el.textContent =
              before +
              state.value.toLocaleString('en-IN', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
              }) +
              after
          },
        })
      })

      gsap.utils.toArray<HTMLElement>('[data-grow]').forEach((el, index) => {
        gsap.from(el, {
          scaleX: 0,
          transformOrigin: 'left center',
          duration: 1.1,
          delay: index * 0.12,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 92%', once: true },
        })
      })

      // The store builds itself: pinned and scrubbed on wide screens, a plain
      // reveal on phones, where pinning fights the browser's own scrolling.
      const build = node.querySelector<HTMLElement>('[data-build]')
      if (build) {
        const part = (name: string) => build.querySelectorAll<HTMLElement>(`[data-b="${name}"]`)
        const media = gsap.matchMedia()
        media.add('(min-width: 1024px)', () => {
          const list = build.querySelector<HTMLElement>('[data-build-steps]')
          const steps = build.querySelectorAll<HTMLElement>('[data-build-step]')
          list?.setAttribute('data-armed', '')
          const mark = (index: number) => {
            steps.forEach((step, i) => {
              step.toggleAttribute('data-active', i === index)
            })
          }
          mark(0)
          const timeline = gsap.timeline({
            defaults: { ease: 'power2.out' },
            scrollTrigger: {
              trigger: build,
              pin: build.querySelector('[data-build-pin]'),
              start: 'top top',
              end: '+=2400',
              scrub: 0.7,
              onUpdate: (self) => {
                mark(Math.min(3, Math.floor(self.progress * 4)))
              },
            },
          })
          const today = part('today')[0]
          const count = { value: 0 }
          timeline
            .from(part('banner'), { scaleY: 0, transformOrigin: 'top center', autoAlpha: 0 })
            .from(part('avatar'), { scale: 0, autoAlpha: 0, ease: 'back.out(2)' }, '<0.2')
            .from([...part('name'), ...part('tagline')], { y: 14, autoAlpha: 0, stagger: 0.15 })
            .addLabel('links', '+=0.4')
            .from(
              part('social'),
              { scale: 0, autoAlpha: 0, stagger: 0.12, ease: 'back.out(2)' },
              'links',
            )
            .from(part('link'), { y: 18, autoAlpha: 0 })
            .addLabel('products', '+=0.4')
            .from(part('product'), { y: 50, autoAlpha: 0, stagger: 0.25 }, 'products')
            .addLabel('paid', '+=0.4')
            .from(part('url'), { y: -12, autoAlpha: 0 }, 'paid')
            .from(part('toast'), { y: 40, autoAlpha: 0, ease: 'back.out(1.4)' })
            .to(count, {
              value: 2997,
              onUpdate: () => {
                if (today) today.textContent = `₹${Math.round(count.value).toLocaleString('en-IN')}`
              },
            })
            .to({}, { duration: 0.3 })
          return () => {
            list?.removeAttribute('data-armed')
            steps.forEach((step) => {
              step.removeAttribute('data-active')
            })
          }
        })
        media.add('(max-width: 1023px)', () => {
          gsap.from(build.querySelectorAll('[data-b]'), {
            y: 18,
            autoAlpha: 0,
            duration: 0.6,
            stagger: 0.08,
            ease: 'power2.out',
            scrollTrigger: { trigger: build, start: 'top 70%', once: true },
          })
        })
        cleanups.push(() => {
          media.revert()
        })
      }

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
      for (const cleanup of cleanups) cleanup()
      ctx.revert()
    }
  }, [])

  return <div ref={root}>{children}</div>
}
