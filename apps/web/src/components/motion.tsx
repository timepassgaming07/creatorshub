'use client'

/**
 * Reusable scroll-triggered animation wrappers using Framer Motion.
 *
 * These components provide staggered reveals, fade-ins, slide-ins, and
 * counter animations that trigger when elements enter the viewport.
 */
import { type ReactNode, useRef } from 'react'
import {
  motion,
  useInView,
  useMotionValue,
  useTransform,
  useSpring,
  type Variant,
} from 'motion/react'

// ---------------------------------------------------------------------------
// Fade-in on scroll
// ---------------------------------------------------------------------------

interface FadeInProps {
  children: ReactNode
  className?: string
  delay?: number
  duration?: number
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
  distance?: number
  once?: boolean
}

export function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.6,
  direction = 'up',
  distance = 30,
  once = true,
}: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once, margin: '-60px' })

  const directions: Record<'up' | 'down' | 'left' | 'right' | 'none', { x: number; y: number }> = {
    up: { x: 0, y: distance },
    down: { x: 0, y: -distance },
    left: { x: distance, y: 0 },
    right: { x: -distance, y: 0 },
    none: { x: 0, y: 0 },
  }

  const dir = directions[direction] ?? { x: 0, y: distance }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: dir.x, y: dir.y }}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: dir.x, y: dir.y }}
      transition={{
        duration,
        delay,
        ease: [0.25, 0.4, 0.25, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Staggered children container
// ---------------------------------------------------------------------------

interface StaggerProps {
  children: ReactNode
  className?: string
  staggerDelay?: number
  delay?: number
  once?: boolean
}

export function Stagger({
  children,
  className,
  staggerDelay = 0.1,
  delay = 0,
  once = true,
}: StaggerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once, margin: '-40px' })

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: delay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// A single stagger item child
interface StaggerItemProps {
  children: ReactNode
  className?: string
}

const staggerItemVariants: Record<string, Variant> = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] },
  },
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  return (
    <motion.div variants={staggerItemVariants} className={className}>
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Scale-in on scroll
// ---------------------------------------------------------------------------

interface ScaleInProps {
  children: ReactNode
  className?: string
  delay?: number
  once?: boolean
}

export function ScaleIn({ children, className, delay = 0, once = true }: ScaleInProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once, margin: '-60px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.25, 0.4, 0.25, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Animated counter
// ---------------------------------------------------------------------------

interface CounterProps {
  value: number
  suffix?: string
  prefix?: string
  className?: string
  duration?: number
}

export function Counter({ value, suffix = '', prefix = '', className, duration = 2 }: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })

  const motionValue = useMotionValue(0)
  const springValue = useSpring(motionValue, { duration: duration * 1000 })
  const rounded = useTransform(springValue, (v) => {
    if (value >= 1000) {
      return `${prefix}${Math.round(v).toLocaleString()}${suffix}`
    }
    return `${prefix}${Math.round(v)}${suffix}`
  })

  if (isInView) {
    motionValue.set(value)
  }

  return (
    <motion.span ref={ref} className={className}>
      {rounded}
    </motion.span>
  )
}

// ---------------------------------------------------------------------------
// Parallax wrapper
// ---------------------------------------------------------------------------

interface ParallaxProps {
  children: ReactNode
  className?: string
  speed?: number
}

export function Parallax({ children, className }: ParallaxProps) {
  return (
    <motion.div
      className={className}
      initial={{ y: 0 }}
      whileInView={{ y: 0 }}
      viewport={{ once: false }}
      style={{
        willChange: 'transform',
      }}
      transition={{ type: 'spring', stiffness: 100 }}
    >
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Hover lift card
// ---------------------------------------------------------------------------

interface HoverLiftProps {
  children: ReactNode
  className?: string
  as?: 'div' | 'article' | 'section'
}

export function HoverLift({ children, className, as = 'div' }: HoverLiftProps) {
  const Component = motion[as]
  return (
    <Component
      className={className}
      whileHover={{
        y: -6,
        transition: { duration: 0.25, ease: [0.25, 0.4, 0.25, 1] },
      }}
      whileTap={{ scale: 0.985 }}
    >
      {children}
    </Component>
  )
}
