'use client'

/**
 * GlowCard — premium glassmorphism card with animated border glow.
 *
 * Features:
 * - Rotating conic-gradient border glow on hover
 * - Frosted glass background that adapts to light/dark theme
 * - Subtle lift transform on hover
 * - Inner shimmer highlight
 */
import { type ReactNode, useRef, useState } from 'react'
import { motion, useMotionValue, useMotionTemplate } from 'motion/react'

interface GlowCardProps {
  children: ReactNode
  className?: string
  glowColor?: string
  hoverLift?: boolean
}

export function GlowCard({
  children,
  className = '',
  glowColor = 'rgba(99, 102, 241, 0.4)',
  hoverLift = true,
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  const spotlightBg = useMotionTemplate`radial-gradient(400px circle at ${mouseX}px ${mouseY}px, ${glowColor}, transparent 80%)`
  const borderGlow = useMotionTemplate`radial-gradient(300px circle at ${mouseX}px ${mouseY}px, rgba(139, 92, 246, 0.5), rgba(99, 102, 241, 0.2), transparent 70%)`

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        mouseX.set(-1000)
        mouseY.set(-1000)
      }}
      className={`group glow-card relative overflow-hidden rounded-3xl transition-all duration-500 ${
        hoverLift ? 'hover:-translate-y-1 hover:shadow-2xl' : ''
      } ${className}`}
    >
      {/* Animated border glow on hover */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: borderGlow }}
      />

      {/* Inner spotlight radial glow */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: spotlightBg }}
      />

      {/* Specular highlight top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
