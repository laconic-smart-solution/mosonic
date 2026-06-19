import { useEffect, useState } from "react"

import { useTheme } from "@/components/theme-provider"

export type BubbleLevelTheme = {
  bg: string
  border: string
  text: string
}

export type RuleFlowVisualTheme = {
  edgeColor: string
  edgeOpacity: number
  edgeWidth: number
  connectionLineColor: string
  backgroundDotColor: string
  nodeLevels: Record<0 | 1 | 2 | 3, BubbleLevelTheme>
}

const LIGHT_THEME: RuleFlowVisualTheme = {
  edgeColor: "#8A96A8",
  edgeOpacity: 0.55,
  edgeWidth: 1.5,
  connectionLineColor: "#7E8BA0",
  backgroundDotColor: "#D9DEE6",
  nodeLevels: {
    0: { bg: "#E7F7F3", border: "#00A589", text: "#0C4A43" },
    1: { bg: "#EDF2FF", border: "#6D79EE", text: "#2E3A8C" },
    2: { bg: "#FFF4E8", border: "#E29A4C", text: "#6E451B" },
    3: { bg: "#F5F0FF", border: "#A78BFA", text: "#4C1D95" },
  },
}

const DARK_THEME: RuleFlowVisualTheme = {
  edgeColor: "#5EEAD4",
  edgeOpacity: 0.42,
  edgeWidth: 1.6,
  connectionLineColor: "#2DD4BF",
  backgroundDotColor: "#2A3444",
  nodeLevels: {
    0: { bg: "#0A2E28", border: "#00C9A7", text: "#A7F3EC" },
    1: { bg: "#151D38", border: "#818CF8", text: "#C7D2FE" },
    2: { bg: "#2A1F0E", border: "#F59E0B", text: "#FDE68A" },
    3: { bg: "#1E1530", border: "#C4B5FD", text: "#E9D5FF" },
  },
}

export function getRuleFlowVisualTheme(isDark: boolean): RuleFlowVisualTheme {
  return isDark ? DARK_THEME : LIGHT_THEME
}

export function useIsDarkMode(): boolean {
  const { theme } = useTheme()
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false,
  )

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  if (theme === "dark") return true
  if (theme === "light") return false
  return systemDark
}

export function useRuleFlowVisualTheme(): RuleFlowVisualTheme {
  return getRuleFlowVisualTheme(useIsDarkMode())
}
