import { useReducedMotion } from "framer-motion"
import { useEffect, useRef } from "react"

import {
  landingHeroCanvasPalette,
  stalkColorForDepth,
  type LandingHeroCanvasPalette,
} from "@/features/marketing/lib/landing-hero-canvas-colors"

type Stalk = {
  x: number
  height: number
  width: number
  depth: number
  phase: number
  speed: number
  sway: number
  color: string
  hasLeaf: boolean
}

type Particle = {
  x: number
  y: number
  r: number
  speed: number
  drift: number
  alpha: number
}

export function LandingHeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext("2d")
    if (!context) return

    const el = canvas
    const ctx = context

    let w = 0
    let h = 0
    let dpr = 1
    let stalks: Stalk[] = []
    let particles: Particle[] = []
    let raf = 0
    const paletteRef = { current: landingHeroCanvasPalette() }

    function buildStalks() {
      const palette = paletteRef.current
      stalks = []
      const count = Math.max(11, Math.floor(w / 85))
      for (let i = 0; i < count; i++) {
        const depth = Math.random()
        const x = ((i + 0.5) / count) * w + (Math.random() - 0.5) * 50
        const height = h * (0.32 + depth * 0.5 + Math.random() * 0.12)
        stalks.push({
          x,
          height,
          width: 5 + depth * 13,
          depth,
          phase: Math.random() * Math.PI * 2,
          speed: 0.25 + Math.random() * 0.35,
          sway: 5 + depth * 16,
          color: stalkColorForDepth(depth, palette),
          hasLeaf: depth > 0.72 && Math.random() > 0.35,
        })
      }
      stalks.sort((a, b) => a.depth - b.depth)

      particles = []
      for (let i = 0; i < 26; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 1 + Math.random() * 1.8,
          speed: 0.12 + Math.random() * 0.3,
          drift: (Math.random() - 0.5) * 0.25,
          alpha: 0.15 + Math.random() * 0.35,
        })
      }
    }

    function refreshPalette() {
      paletteRef.current = landingHeroCanvasPalette()
      if (w > 0 && h > 0) {
        buildStalks()
        frame(performance.now())
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = el.clientWidth
      h = el.clientHeight
      el.width = w * dpr
      el.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildStalks()
    }

    function drawStalk(s: Stalk, t: number, palette: LandingHeroCanvasPalette) {
      const sway = Math.sin(t * s.speed + s.phase) * s.sway * (s.depth + 0.3)
      const baseX = s.x
      const baseY = h
      const topX = baseX + sway
      const topY = h - s.height

      ctx.save()
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.lineCap = "round"
      ctx.beginPath()
      ctx.moveTo(baseX, baseY)
      ctx.quadraticCurveTo(baseX + sway * 0.35, h - s.height * 0.5, topX, topY)
      ctx.stroke()

      ctx.lineWidth = 2
      ctx.strokeStyle = palette.nodeLine
      for (let n = 1; n < 5; n++) {
        const tt = n / 5
        const nx = baseX + sway * tt * tt
        const ny = h - s.height * tt
        ctx.beginPath()
        ctx.moveTo(nx - s.width / 2, ny)
        ctx.lineTo(nx + s.width / 2, ny)
        ctx.stroke()
      }

      if (s.hasLeaf) {
        ctx.fillStyle = palette.leaf
        ctx.beginPath()
        ctx.ellipse(topX + 5, topY - 3, 10, 4, Math.PI / 4 + sway * 0.02, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    function frame(time: number) {
      const palette = paletteRef.current
      const t = time / 1000
      ctx.clearRect(0, 0, w, h)

      stalks.forEach((s) => drawStalk(s, t, palette))

      const { r, g, b } = palette.particleRgb
      particles.forEach((p) => {
        if (!reduceMotion) {
          p.y -= p.speed
          p.x += p.drift
          if (p.y < -10) {
            p.y = h + 10
            p.x = Math.random() * w
          }
        }
        ctx.beginPath()
        ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      })

      if (!reduceMotion) {
        raf = requestAnimationFrame(frame)
      }
    }

    const themeObserver = new MutationObserver(() => {
      refreshPalette()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    resize()
    window.addEventListener("resize", resize)

    if (reduceMotion) {
      frame(0)
    } else {
      raf = requestAnimationFrame(frame)
    }

    return () => {
      themeObserver.disconnect()
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(raf)
    }
  }, [reduceMotion])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 block h-full w-full"
      aria-hidden
    />
  )
}
