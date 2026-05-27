import { useEffect, useRef } from "react"

import {
  homeNetworkCanvasColors,
  readCssColorRgb,
} from "@/features/home/lib/home-canvas-colors"

const NB = 100
const LINK_DISTANCE = 200
const MOUSE_RADIUS = 300

type Dot = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

function buildDots(w: number, h: number): Dot[] {
  const dots: Dot[] = []
  for (let i = 0; i < NB; i++) {
    dots.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: -0.1 + Math.random() * 0.2,
      vy: -0.1 + Math.random() * 0.2,
      radius: Math.random() * 1.2 + 0.2,
    })
  }
  return dots
}

function stepDots(dots: Dot[], w: number, h: number) {
  for (const dot of dots) {
    if (dot.y < 0 || dot.y > h) {
      dot.vy = -dot.vy
    } else if (dot.x < 0 || dot.x > w) {
      dot.vx = -dot.vx
    }
    dot.x += dot.vx
    dot.y += dot.vy
  }
}

export function HomeNetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const dotsRef = useRef<Dot[]>([])
  const rafRef = useRef<number>(0)
  const colorsRef = useRef(homeNetworkCanvasColors())

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const refreshColors = () => {
      colorsRef.current = homeNetworkCanvasColors()
    }

    refreshColors()

    const themeObserver = new MutationObserver(() => {
      refreshColors()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    const syncSize = () => {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dotsRef.current = buildDots(w, h)
      mouseRef.current = { x: w * 0.3, y: h * 0.3 }
      refreshColors()
    }

    syncSize()

    const onPointerMove = (e: PointerEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }

    const onPointerLeave = () => {
      mouseRef.current = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }
    }

    const tick = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const dots = dotsRef.current
      const mouse = mouseRef.current
      const { lineColor, dotFill } = colorsRef.current

      ctx.clearRect(0, 0, w, h)

      const bg = readCssColorRgb("--background", { r: 247, g: 244, b: 239 })
      ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`
      ctx.fillRect(0, 0, w, h)

      ctx.fillStyle = dotFill
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 0.35

      for (let i = 0; i < dots.length; i++) {
        const a = dots[i]!
        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j]!
          const dx = a.x - b.x
          const dy = a.y - b.y
          if (
            dx < LINK_DISTANCE &&
            dy < LINK_DISTANCE &&
            dx > -LINK_DISTANCE &&
            dy > -LINK_DISTANCE
          ) {
            const mx = a.x - mouse.x
            const my = a.y - mouse.y
            if (
              mx < MOUSE_RADIUS &&
              my < MOUSE_RADIUS &&
              mx > -MOUSE_RADIUS &&
              my > -MOUSE_RADIUS
            ) {
              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(b.x, b.y)
              ctx.stroke()
            }
          }
        }
      }

      for (const dot of dots) {
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      stepDots(dots, w, h)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    window.addEventListener("resize", syncSize)
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    document.addEventListener("pointerleave", onPointerLeave)

    return () => {
      cancelAnimationFrame(rafRef.current)
      themeObserver.disconnect()
      window.removeEventListener("resize", syncSize)
      window.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("pointerleave", onPointerLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 block h-full w-full"
      aria-hidden
    />
  )
}
