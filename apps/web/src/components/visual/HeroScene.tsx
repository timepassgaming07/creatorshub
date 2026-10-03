'use client'

/**
 * The landing hero's 3D layer: product cards and rupee coins drifting in depth
 * around the example store, following the pointer.
 *
 * Decoration only. It sits behind real HTML (the phone, the headline), is
 * aria-hidden, and the page reads the same without it: the CSS aurora under it
 * is the whole background when WebGL is missing.
 *
 * Colours come from the brand tokens at runtime, read through a 1x1 canvas so
 * oklch() resolves exactly as the browser paints it, and are re-read when the
 * theme changes. The render loop stops whenever the hero is off screen or the
 * tab is hidden, and reduced motion gets one still frame.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

type Brand = 'ember' | 'saffron' | 'rose' | 'violet'

type Palette = {
  readonly brand: Record<Brand, string>
  readonly surface: string
  readonly content: string
  readonly muted: string
  readonly dark: boolean
}

const CARDS: readonly {
  readonly title: string
  readonly kind: string
  readonly price: string
  readonly from: Brand
  readonly to: Brand
  readonly position: readonly [number, number, number]
  readonly rotation: readonly [number, number, number]
}[] = [
  {
    title: 'Golden Hour Presets',
    kind: 'Lightroom',
    price: '₹999',
    from: 'saffron',
    to: 'ember',
    position: [4.15, 1.75, -1.1],
    rotation: [0.08, -0.5, 0.12],
  },
  {
    title: 'Notion Life Planner',
    kind: 'Template',
    price: '₹499',
    from: 'violet',
    to: 'rose',
    position: [1.35, -2.05, -1.6],
    rotation: [-0.12, 0.38, -0.1],
  },
  {
    title: 'Monsoon Sample Pack',
    kind: 'Audio',
    price: '₹1,299',
    from: 'ember',
    to: 'violet',
    position: [5.55, -1.45, -0.4],
    rotation: [0.1, -0.62, -0.08],
  },
  {
    title: 'Skin-Tone Guide',
    kind: 'E-book',
    price: 'Free',
    from: 'rose',
    to: 'saffron',
    position: [0.55, 2.55, -3.4],
    rotation: [0.18, 0.25, 0.14],
  },
  {
    title: 'Wedding LUTs',
    kind: 'Video',
    price: '₹799',
    from: 'violet',
    to: 'saffron',
    position: [-4.7, -2.55, -4.6],
    rotation: [-0.1, 0.5, 0.2],
  },
]

const COINS: readonly (readonly [number, number, number])[] = [
  [2.1, 0.95, 0.7],
  [5.15, 0.35, 1.0],
  [-3.9, 2.35, -2.8],
]

const BEADS: readonly { readonly at: readonly [number, number, number]; readonly tone: Brand }[] = [
  { at: [3.0, -0.9, 1.4], tone: 'ember' },
  { at: [6.2, 2.4, -1.8], tone: 'violet' },
  { at: [-1.2, -2.9, -2.4], tone: 'saffron' },
  { at: [-5.6, 1.1, -3.6], tone: 'rose' },
]

const CARD_W = 1.25
const CARD_H = 1.65
const TEX_W = 512
const TEX_H = Math.round((TEX_W * CARD_H) / CARD_W)

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement)
  const value = (name: string) => style.getPropertyValue(name).trim() || 'gray'
  return {
    brand: {
      ember: value('--brand-ember'),
      saffron: value('--brand-saffron'),
      rose: value('--brand-rose'),
      violet: value('--brand-violet'),
    },
    surface: value('--surface-raised'),
    content: value('--content-primary'),
    muted: value('--content-tertiary'),
    dark: document.documentElement.getAttribute('data-theme') === 'dark',
  }
}

/** Resolve any CSS colour (oklch included) to an sRGB THREE.Color. */
function toColor(probe: CanvasRenderingContext2D, css: string): THREE.Color {
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = 'black'
  probe.fillStyle = css
  probe.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function paintCard(
  canvas: HTMLCanvasElement,
  card: (typeof CARDS)[number],
  palette: Palette,
  font: string,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = TEX_W
  const h = TEX_H
  ctx.clearRect(0, 0, w, h)

  // Card body
  roundedRect(ctx, 0, 0, w, h, 40)
  ctx.fillStyle = palette.surface
  ctx.fill()

  // Cover: two brand colours with a soft highlight, like a real product cover
  const pad = 22
  const coverH = h * 0.6
  ctx.save()
  roundedRect(ctx, pad, pad, w - pad * 2, coverH, 26)
  ctx.clip()
  const gradient = ctx.createLinearGradient(pad, pad, w - pad, pad + coverH)
  gradient.addColorStop(0, palette.brand[card.from])
  gradient.addColorStop(1, palette.brand[card.to])
  ctx.fillStyle = gradient
  ctx.fillRect(pad, pad, w - pad * 2, coverH)
  const glow = ctx.createRadialGradient(pad + 90, pad + 70, 10, pad + 90, pad + 70, 320)
  glow.addColorStop(0, 'rgba(255,255,255,0.55)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(pad, pad, w - pad * 2, coverH)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = `600 26px ${font}`
  ctx.fillText(card.kind.toUpperCase(), pad + 26, pad + coverH - 28)
  ctx.restore()

  // Title and price
  ctx.fillStyle = palette.content
  ctx.font = `600 38px ${font}`
  ctx.fillText(card.title, pad + 6, pad + coverH + 70, w - pad * 2 - 12)
  ctx.fillStyle = palette.muted
  ctx.font = `400 26px ${font}`
  ctx.fillText('Instant download', pad + 6, pad + coverH + 112)

  ctx.font = `600 34px ${font}`
  const priceW = ctx.measureText(card.price).width + 44
  roundedRect(ctx, pad + 4, h - pad - 72, priceW, 58, 29)
  ctx.fillStyle = palette.brand[card.to]
  ctx.fill()
  ctx.fillStyle = 'white'
  ctx.fillText(card.price, pad + 26, h - pad - 31)
}

function paintCoin(canvas: HTMLCanvasElement, palette: Palette, font: string) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const s = canvas.width
  ctx.clearRect(0, 0, s, s)
  const face = ctx.createRadialGradient(s * 0.35, s * 0.3, s * 0.05, s / 2, s / 2, s * 0.62)
  face.addColorStop(0, 'rgba(255,255,255,0.9)')
  face.addColorStop(0.25, palette.brand.saffron)
  face.addColorStop(1, palette.brand.ember)
  ctx.fillStyle = face
  ctx.fillRect(0, 0, s, s)
  ctx.lineWidth = s * 0.035
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(70,30,0,0.55)'
  ctx.font = `700 ${String(Math.round(s * 0.5))}px ${font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('₹', s / 2, s / 2 + s * 0.03)
}

export function HeroScene({ className }: { readonly className?: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = host.current
    if (!container) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
    } catch {
      return // No WebGL: the CSS aurora underneath is the background.
    }
    const lowPower = (navigator.hardwareConcurrency || 4) <= 4
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.25 : 1.75))
    renderer.setClearColor(0x000000, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.setAttribute('aria-hidden', 'true')
    renderer.domElement.className = 'size-full opacity-0 transition-opacity duration-1000'
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environment
    scene.environmentIntensity = 0.7

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    camera.position.set(0, 0, 10)

    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(-4, 6, 8)
    const warm = new THREE.PointLight(0xffffff, 40, 30)
    warm.position.set(5, 3, 5)
    const cool = new THREE.PointLight(0xffffff, 28, 30)
    cool.position.set(-4, -3, 4)
    scene.add(new THREE.AmbientLight(0xffffff, 0.35), key, warm, cool)

    const world = new THREE.Group()
    scene.add(world)

    const probeCanvas = document.createElement('canvas')
    probeCanvas.width = probeCanvas.height = 1
    const probe = probeCanvas.getContext('2d', { willReadFrequently: true })
    if (!probe) {
      renderer.dispose()
      renderer.domElement.remove()
      return
    }

    const disposables: { dispose: () => void }[] = [environment, pmrem]
    type Floater = {
      readonly object: THREE.Object3D
      readonly base: THREE.Vector3
      readonly spin: THREE.Euler
      readonly phase: number
      readonly speed: number
    }
    const floaters: Floater[] = []
    const float = (object: THREE.Object3D, speed: number) => {
      floaters.push({
        object,
        base: object.position.clone(),
        spin: object.rotation.clone(),
        phase: Math.random() * Math.PI * 2,
        speed,
      })
      world.add(object)
    }

    // Cards: a lacquered frame with the painted face on the front
    const frameGeometry = new RoundedBoxGeometry(CARD_W, CARD_H, 0.06, 4, 0.08)
    const faceGeometry = new THREE.PlaneGeometry(CARD_W, CARD_H)
    disposables.push(frameGeometry, faceGeometry)
    const frameMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.3,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    })
    disposables.push(frameMaterial)
    const cardFaces = CARDS.map((card) => {
      const canvas = document.createElement('canvas')
      canvas.width = TEX_W
      canvas.height = TEX_H
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
      const material = new THREE.MeshPhysicalMaterial({
        map: texture,
        transparent: true,
        roughness: 0.35,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2,
      })
      disposables.push(texture, material)
      const group = new THREE.Group()
      const frame = new THREE.Mesh(frameGeometry, frameMaterial)
      const face = new THREE.Mesh(faceGeometry, material)
      face.position.z = 0.032
      group.add(frame, face)
      group.position.set(...card.position)
      group.rotation.set(...card.rotation)
      float(group, 0.5 + Math.random() * 0.3)
      return { card, canvas, texture }
    })

    // Coins
    const coinGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 64)
    const coinCanvas = document.createElement('canvas')
    coinCanvas.width = coinCanvas.height = 256
    const coinTexture = new THREE.CanvasTexture(coinCanvas)
    coinTexture.colorSpace = THREE.SRGBColorSpace
    const coinEdge = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.28 })
    const coinFace = new THREE.MeshPhysicalMaterial({
      map: coinTexture,
      metalness: 0.75,
      roughness: 0.3,
      clearcoat: 1,
    })
    disposables.push(coinGeometry, coinTexture, coinEdge, coinFace)
    // The face is a flat disc on the rim, not the cylinder's own cap: the cap's
    // texture coordinates turn and mirror the glyph.
    const faceDisc = new THREE.CircleGeometry(0.4, 64)
    disposables.push(faceDisc)
    for (const at of COINS) {
      const coin = new THREE.Group()
      const rim = new THREE.Mesh(coinGeometry, coinEdge)
      rim.rotation.x = Math.PI / 2
      const front = new THREE.Mesh(faceDisc, coinFace)
      front.position.z = 0.041
      const back = new THREE.Mesh(faceDisc, coinFace)
      back.position.z = -0.041
      back.rotation.y = Math.PI
      coin.add(rim, front, back)
      coin.position.set(...at)
      coin.rotation.set(-0.25, 0.35, Math.random() * 0.6 - 0.3)
      float(coin, 0.8 + Math.random() * 0.4)
    }

    // Beads of light for depth
    const beadGeometry = new THREE.SphereGeometry(0.16, 32, 32)
    disposables.push(beadGeometry)
    const beadMaterials = BEADS.map(() => {
      const material = new THREE.MeshPhysicalMaterial({
        roughness: 0.1,
        clearcoat: 1,
        transmission: 0.2,
        thickness: 0.4,
      })
      disposables.push(material)
      return material
    })
    BEADS.forEach((bead, index) => {
      const material = beadMaterials[index]
      if (!material) return
      const mesh = new THREE.Mesh(beadGeometry, material)
      mesh.position.set(...bead.at)
      float(mesh, 0.6 + Math.random() * 0.5)
    })

    // Theme: everything visible is repainted from the tokens
    const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'
    const applyTheme = () => {
      const palette = readPalette()
      for (const face of cardFaces) {
        paintCard(face.canvas, face.card, palette, font)
        face.texture.needsUpdate = true
      }
      paintCoin(coinCanvas, palette, font)
      coinTexture.needsUpdate = true
      frameMaterial.color.copy(toColor(probe, palette.surface))
      coinEdge.color.copy(toColor(probe, palette.brand.saffron))
      BEADS.forEach((bead, index) => {
        beadMaterials[index]?.color.copy(toColor(probe, palette.brand[bead.tone]))
      })
      warm.color.copy(toColor(probe, palette.brand.ember))
      cool.color.copy(toColor(probe, palette.brand.violet))
      warm.intensity = palette.dark ? 55 : 30
      cool.intensity = palette.dark ? 40 : 18
      scene.environmentIntensity = palette.dark ? 0.55 : 0.85
    }

    // Size: fit the composition to the hero's shape
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container
      if (w === 0 || h === 0) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      const fit = THREE.MathUtils.clamp(camera.aspect / 1.75, 0.42, 1)
      world.scale.setScalar(fit)
      // Narrow screens stack the phone under the text, so the scene gathers
      // around the phone in the lower half and leaves the headline clear.
      world.position.x = camera.aspect < 1 ? -0.9 : 0
      world.position.y = camera.aspect < 1 ? -1.9 : 0
    }

    // Pointer and scroll drive the composition; both are eased each frame
    const pointer = { x: 0, y: 0 }
    const eased = { x: 0, y: 0, scroll: 0 }
    const onPointer = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1
    }

    const timer = new THREE.Timer()
    let frame = 0
    let visible = true
    let running = false
    let halted = false
    let startDelay = 0
    let armed = false
    let begun = false

    const draw = () => {
      timer.update()
      const t = timer.getElapsed()
      const scroll = Math.min(1, window.scrollY / Math.max(1, container.clientHeight))
      eased.x += (pointer.x - eased.x) * 0.05
      eased.y += (pointer.y - eased.y) * 0.05
      eased.scroll += (scroll - eased.scroll) * 0.08
      world.rotation.y = eased.x * 0.28
      world.rotation.x = eased.y * 0.16 + eased.scroll * 0.25
      camera.position.y = eased.scroll * 1.6
      for (const f of floaters) {
        const wave = t * f.speed + f.phase
        f.object.position.y = f.base.y + Math.sin(wave) * 0.16
        f.object.position.x = f.base.x + Math.cos(wave * 0.7) * 0.06
        f.object.rotation.x = f.spin.x + Math.sin(wave * 0.8) * 0.08
        f.object.rotation.y = f.spin.y + Math.cos(wave * 0.6) * 0.12
      }
      renderer.render(scene, camera)
    }

    // A device that cannot hold the frame budget (software WebGL, a tired
    // phone) keeps one still frame instead of taking the page's main thread.
    let sampled = 0
    let slowFrames = 0
    let last = 0
    const loop = (now: number) => {
      draw()
      if (last !== 0 && sampled < 10) {
        sampled += 1
        if (now - last > 48) slowFrames += 1
        if (sampled === 10 && slowFrames >= 6) {
          stop()
          halted = true
          return
        }
      }
      last = now
      frame = requestAnimationFrame(loop)
    }
    const start = () => {
      if (!armed || running || halted || reduceMotion || !visible || document.hidden) return
      last = 0
      running = true
      frame = requestAnimationFrame(loop)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting)
      if (visible) start()
      else stop()
    })
    observer.observe(container)
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    const resizeObserver = new ResizeObserver(() => {
      resize()
      if (begun && !running) draw()
    })
    resizeObserver.observe(container)
    const themeObserver = new MutationObserver(() => {
      applyTheme()
      if (begun && !running) draw()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    let cancelled = false
    // Nothing is drawn until the headline has landed: the first frame compiles
    // the shaders, which is the most expensive moment on a modest phone.
    const begin = () => {
      if (cancelled) return
      begun = true
      applyTheme()
      resize()
      draw()
      renderer.domElement.classList.remove('opacity-0')
      if (!reduceMotion) {
        window.addEventListener('pointermove', onPointer, { passive: true })
        document.addEventListener('visibilitychange', onVisibility)
        armed = true
        start()
      }
    }
    void document.fonts.ready.then(() => {
      startDelay = window.setTimeout(begin, reduceMotion ? 0 : 1500)
    })

    return () => {
      cancelled = true
      window.clearTimeout(startDelay)
      stop()
      observer.disconnect()
      resizeObserver.disconnect()
      themeObserver.disconnect()
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const item of disposables) item.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={host} aria-hidden="true" className={className} />
}
