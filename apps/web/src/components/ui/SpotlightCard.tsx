'use client'

import React, { useRef, useState } from 'react'
import { motion, useMotionTemplate, useMotionValue } from 'motion/react'

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
  spotlightColor?: string
  borderColor?: string
}

export function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(99, 102, 241, 0.15)',
  borderColor = 'rgba(255, 255, 255, 0.12)',
  ...props
}: SpotlightCardProps) {
  const mouseX = useMotionValue(-1000)
  const mouseY = useMotionValue(-1000)
  const [isHovered, setIsHovered] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  const background = useMotionTemplate`radial-gradient(350px circle at ${mouseX}px ${mouseY}px, ${spotlightColor}, transparent 80%)`
  const borderBackground = useMotionTemplate`radial-gradient(250px circle at ${mouseX}px ${mouseY}px, rgba(168, 85, 247, 0.4), transparent 70%)`

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
      className={`group relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-slate-900/60 p-6 backdrop-blur-xl transition-all duration-300 hover:border-indigo-300/50 dark:hover:border-white/20 hover:shadow-2xl hover:shadow-indigo-500/5 dark:hover:shadow-indigo-500/10 ${className}`}
      {...props}
    >
      {/* Spotlight highlight over border */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: borderBackground }}
      />

      {/* Spotlight glow inside card */}
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background }}
      />

      {/* Content wrapper */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
