import {
  isDarkThemeActive,
  readCssColorRgb,
} from "@/features/home/lib/home-canvas-colors"

export type LandingFloatingLeavesPalette = {
  background: string
  radialPrimary: string
  radialSecondary: string
  leafAmber: string
  leafTeal: string
}

export function landingFloatingLeavesPalette(): LandingFloatingLeavesPalette {
  const dark = isDarkThemeActive()
  const bg = readCssColorRgb("--background", dark ? { r: 9, g: 12, b: 17 } : { r: 247, g: 244, b: 239 })

  if (dark) {
    return {
      background: `rgb(${bg.r},${bg.g},${bg.b})`,
      radialPrimary: "rgba(0,201,167,0.06)",
      radialSecondary: "rgba(37,76,148,0.08)",
      leafAmber: "rgba(245,166,35,0.82)",
      leafTeal: "rgba(0,201,167,0.62)",
    }
  }

  return {
    background: `rgb(${bg.r},${bg.g},${bg.b})`,
    radialPrimary: "rgba(91,95,239,0.05)",
    radialSecondary: "rgba(139,92,246,0.04)",
    leafAmber: "rgba(245,166,35,0.95)",
    leafTeal: "rgba(0,165,137,0.52)",
  }
}
