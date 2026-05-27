/** Read an RGB triplet from a CSS custom property on :root (resolved hex or rgb). */
export function readCssColorRgb(
  variable: string,
  fallback: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  if (typeof document === "undefined") return fallback

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim()

  if (!raw) return fallback

  if (raw.startsWith("#")) {
    let hex = raw.slice(1)
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("")
    }
    const n = Number.parseInt(hex, 16)
    if (Number.isNaN(n)) return fallback
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }

  const rgbMatch = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    }
  }

  return fallback
}

export function isDarkThemeActive(): boolean {
  if (typeof document === "undefined") return false
  return document.documentElement.classList.contains("dark")
}

export function homeNetworkCanvasColors(): {
  lineColor: string
  dotFill: string
} {
  const { r, g, b } = readCssColorRgb("--nt-accent", { r: 0, g: 165, b: 137 })
  const dark = isDarkThemeActive()
  const lineAlpha = dark ? 0.32 : 0.22
  const dotAlpha = dark ? 0.45 : 0.35
  return {
    lineColor: `rgba(${r},${g},${b},${lineAlpha})`,
    dotFill: `rgba(${r},${g},${b},${dotAlpha})`,
  }
}
