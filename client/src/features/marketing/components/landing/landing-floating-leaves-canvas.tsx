import { useReducedMotion } from "framer-motion"
import { useEffect, useRef } from "react"

import {
  landingFloatingLeavesPalette,
  type LandingFloatingLeavesPalette,
} from "@/features/marketing/lib/landing-floating-leaves-colors"

type FloatingLeaf = {
  x: number
  y: number
  size: number
  rotation: number
  rotSpeed: number
  vx: number
  vy: number
  phase: number
  alpha: number
  tone: "amber" | "teal"
}

function drawBambooLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation: number,
  color: string,
  alpha: number,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.globalAlpha = alpha

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(-size * 0.05, 0)
  ctx.bezierCurveTo(size * 0.15, -size * 0.42, size * 0.85, -size * 0.28, size, 0)
  ctx.bezierCurveTo(size * 0.85, size * 0.28, size * 0.15, size * 0.42, -size * 0.05, 0)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = color
  ctx.globalAlpha = alpha * 0.7
  ctx.lineWidth = Math.max(0.5, size * 0.045)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(size * 0.88, 0)
  ctx.stroke()

  ctx.restore()
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: LandingFloatingLeavesPalette,
) {
  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, w, h)

  const primaryGlow = ctx.createRadialGradient(
    w * 0.3,
    h * 0.2,
    0,
    w * 0.3,
    h * 0.2,
    w * 0.5,
  )
  primaryGlow.addColorStop(0, palette.radialPrimary)
  primaryGlow.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = primaryGlow
  ctx.fillRect(0, 0, w, h)

  const secondaryGlow = ctx.createRadialGradient(
    w * 0.8,
    h * 0.8,
    0,
    w * 0.8,
    h * 0.8,
    w * 0.5,
  )
  secondaryGlow.addColorStop(0, palette.radialSecondary)
  secondaryGlow.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = secondaryGlow
  ctx.fillRect(0, 0, w, h)
}

function buildLeaves(w: number, h: number): FloatingLeaf[] {
  const count = Math.max(16, Math.floor((w * h) / 38000))
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    size: 7 + Math.random() * 10,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.008,
    vx: 0.12 + Math.random() * 0.28,
    vy: 0.18 + Math.random() * 0.42,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.48 + Math.random() * 0.42,
    tone: Math.random() > 0.28 ? "amber" : "teal",
  }))
}

export function LandingFloatingLeavesCanvas() {
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
    let leaves: FloatingLeaf[] = []
    let raf = 0
    const paletteRef = { current: landingFloatingLeavesPalette() }

    function refreshPalette() {
      paletteRef.current = landingFloatingLeavesPalette()
      if (w > 0 && h > 0) {
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
      leaves = buildLeaves(w, h)
    }

    function frame(time: number) {
      const palette = paletteRef.current
      const t = time / 1000

      paintBackground(ctx, w, h, palette)

      leaves.forEach((leaf) => {
        if (!reduceMotion) {
          leaf.x += leaf.vx
          leaf.y += leaf.vy
          leaf.rotation += leaf.rotSpeed + Math.sin(t * 0.6 + leaf.phase * 6) * 0.004

          if (leaf.x > w + leaf.size) leaf.x = -leaf.size
          if (leaf.x < -leaf.size) leaf.x = w + leaf.size
          if (leaf.y > h + leaf.size) {
            leaf.y = -leaf.size
            leaf.x = Math.random() * w
          }
        }

        const swayX = leaf.x + Math.sin(t * 0.8 + leaf.phase * 5) * 8
        const color = leaf.tone === "amber" ? palette.leafAmber : palette.leafTeal

        drawBambooLeaf(ctx, swayX, leaf.y, leaf.size, leaf.rotation, color, leaf.alpha)
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
      className="pointer-events-none fixed inset-0 z-0 block h-full w-full"
      aria-hidden
    />
  )
}
