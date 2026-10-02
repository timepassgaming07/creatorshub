'use client'

/**
 * ScrollReveal — viewport-triggered entrance animation wrapper.
 *
 * Uses framer-motion `whileInView` to elegantly reveal children as they
 * scroll into the viewport. Supports multiple animation variants and
 * stagger delays for sequenced grid reveals.
 */
import { type ReactNode } from 'react'
import { motion, type Variants } from 'motion/react'

type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'scale' | 'blur' | 'none'

interface ScrollRevealProps {
  children: ReactNode
  direction?: RevealDirection
  delay?: number
  duration?: number
  amount?: number
  className?: string
  once?: boolean
}

function getVariants(direction: RevealDirection, duration: number): Variants {
  const distance = 40
  const ease = 'easeOut'

  switch (direction) {
    case 'up':
      return {
        hidden: { opacity: 0, y: distance, filter: 'blur(4px)' },
        visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration, ease } },
      }
    case 'down':
      return {
        hidden: { opacity: 0, y: -distance, filter: 'blur(4px)' },
        visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration, ease } },
      }
    case 'left':
      return {
        hidden: { opacity: 0, x: distance, filter: 'blur(4px)' },
        visible: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration, ease } },
      }
    case 'right':
      return {
        hidden: { opacity: 0, x: -distance, filter: 'blur(4px)' },
        visible: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration, ease } },
      }
    case 'scale':
      return {
        hidden: { opacity: 0, scale: 0.9, filter: 'blur(6px)' },
        visible: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration, ease } },
      }
    case 'blur':
      return {
        hidden: { opacity: 0, filter: 'blur(12px)' },
        visible: { opacity: 1, filter: 'blur(0px)', transition: { duration, ease } },
      }
    case 'none':
    default:
      return {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration, ease } },
      }
  }
}

export function ScrollReveal({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.6,
  amount = 0.15,
  className = '',
  once = true,
}: ScrollRevealProps) {
  const variants = getVariants(direction, duration)

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      variants={variants}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
