import { isDarkThemeActive } from "@/features/home/lib/home-canvas-colors"

export type LandingHeroCanvasPalette = {
  stalkFar: string
  stalkMid: string
  stalkNear: string
  nodeLine: string
  leaf: string
  particleRgb: { r: number; g: number; b: number }
}

export function landingHeroCanvasPalette(): LandingHeroCanvasPalette {
  if (isDarkThemeActive()) {
    return {
      stalkFar: "rgba(247,244,239,0.08)",
      stalkMid: "rgba(0,201,167,0.32)",
      stalkNear: "rgba(0,201,167,0.85)",
      nodeLine: "rgba(255, 255, 255, 0.57)",
      leaf: "rgba(245,166,35,0.75)",
      particleRgb: { r: 0, g: 201, b: 167 },
    }
  }

  return {
    stalkFar: "rgba(15,31,61,0.1)",
    stalkMid: "rgba(0,165,137,0.38)",
    stalkNear: "rgba(0,165,137,0.82)",
    nodeLine: "rgba(15, 31, 61, 0.46)",
    leaf: "rgba(245,166,35,0.9)",
    particleRgb: { r: 0, g: 165, b: 137 },
  }
}

export function stalkColorForDepth(
  depth: number,
  palette: LandingHeroCanvasPalette,
): string {
  if (depth > 0.7) return palette.stalkNear
  if (depth > 0.35) return palette.stalkMid
  return palette.stalkFar
}
