'use client'

/**
 * Loads the 3D hero after the page is interactive, in its own chunk, so
 * Three.js never delays the headline. Server components cannot opt out of
 * server rendering themselves, which is why this wrapper exists.
 */
import dynamic from 'next/dynamic'

export const HeroSceneLazy = dynamic(() => import('./HeroScene').then((mod) => mod.HeroScene), {
  ssr: false,
})
