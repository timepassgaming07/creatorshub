'use client'

/**
 * Plasma: a domain-warped noise field rendered with one WebGL fragment shader.
 *
 * The brand's signature surface. Cheap on purpose: a single full-screen
 * triangle, no textures, no library. It renders at most 1.5x device pixels,
 * stops when scrolled out of view or the tab is hidden, draws one still frame
 * for people who prefer reduced motion, and falls back to a CSS gradient when
 * WebGL is unavailable.
 */
import { useEffect, useRef, useState } from 'react'

const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const FRAGMENT = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_intensity;

// Hash and value noise, after Inigo Quilez.
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.045;

  // Two rounds of domain warping give the slow, folded silk look.
  vec2 q = vec2(fbm(p * 1.4 + vec2(0.0, t)), fbm(p * 1.4 + vec2(5.2, -t)));
  vec2 r = vec2(fbm(p * 1.6 + 3.0 * q + vec2(1.7, 9.2) + 0.6 * t),
                fbm(p * 1.6 + 3.0 * q + vec2(8.3, 2.8) - 0.4 * t));
  float f = fbm(p * 1.2 + 2.6 * r + (u_pointer - 0.5) * 0.35);

  // Obsidian, ember, magenta, violet.
  vec3 base = vec3(0.035, 0.032, 0.05);
  vec3 ember = vec3(0.96, 0.42, 0.13);
  vec3 magenta = vec3(0.80, 0.16, 0.42);
  vec3 violet = vec3(0.36, 0.22, 0.78);

  vec3 col = mix(base, violet, smoothstep(0.15, 0.85, length(q)));
  col = mix(col, magenta, smoothstep(0.35, 0.95, r.x) * 0.85);
  col = mix(col, ember, smoothstep(0.55, 1.05, f) * 0.95);
  col *= 0.55 + 0.75 * f * f;

  // Vignette and a gentle fade toward the bottom edge.
  float vignette = smoothstep(1.25, 0.25, length(p * vec2(0.85, 1.1)));
  col *= mix(0.25, 1.0, vignette);
  col = mix(base, col, u_intensity * smoothstep(0.0, 0.35, uv.y + 0.15));

  // Film grain keeps the gradient from banding on 8-bit displays.
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.025;
  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function Plasma({
  className = '',
  intensity = 1,
  interactive = true,
}: {
  readonly className?: string
  readonly intensity?: number
  readonly interactive?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
    })
    if (!gl) {
      setFallback(true)
      return
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!vs || !fs) {
      setFallback(true)
      return
    }
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFallback(true)
      return
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uResolution = gl.getUniformLocation(program, 'u_resolution')
    const uTime = gl.getUniformLocation(program, 'u_time')
    const uPointer = gl.getUniformLocation(program, 'u_pointer')
    const uIntensity = gl.getUniformLocation(program, 'u_intensity')
    gl.uniform1f(uIntensity, intensity)

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }
    let visible = true
    let frame = 0
    const start = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr))
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
      gl.uniform2f(uResolution, width, height)
    }

    const draw = (now: number) => {
      pointer.x += (pointer.tx - pointer.x) * 0.04
      pointer.y += (pointer.ty - pointer.y) * 0.04
      gl.uniform1f(uTime, reduceMotion ? 18 : (now - start) / 1000 + 18)
      gl.uniform2f(uPointer, pointer.x, pointer.y)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const loop = (now: number) => {
      if (!visible || document.hidden) {
        frame = 0
        return
      }
      draw(now)
      frame = requestAnimationFrame(loop)
    }

    const resizeObserver = new ResizeObserver(() => {
      resize()
      if (reduceMotion) draw(performance.now())
    })
    resizeObserver.observe(canvas)

    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false
      if (visible && !reduceMotion && frame === 0) frame = requestAnimationFrame(loop)
    })
    visibility.observe(canvas)

    const onVisibilityChange = () => {
      if (!document.hidden && visible && !reduceMotion && frame === 0)
        frame = requestAnimationFrame(loop)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.tx = (event.clientX - rect.left) / rect.width
      pointer.ty = 1 - (event.clientY - rect.top) / rect.height
    }
    if (interactive && !reduceMotion)
      window.addEventListener('pointermove', onPointer, { passive: true })

    resize()
    if (reduceMotion) draw(performance.now())
    else frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      visibility.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pointermove', onPointer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buffer)
    }
  }, [intensity, interactive])

  if (fallback) {
    return (
      <div
        aria-hidden="true"
        className={className}
        style={{
          background:
            'radial-gradient(60% 50% at 70% 30%, oklch(62% 0.2 35 / 0.75), transparent 70%), radial-gradient(50% 60% at 25% 70%, oklch(45% 0.2 300 / 0.7), transparent 70%), oklch(12% 0.01 280)',
        }}
      />
    )
  }

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />
}
