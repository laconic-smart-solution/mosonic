import { useIsDarkMode } from "@/features/rules/lib/rule-flow-theme"

export type WorkflowFlowVisualTheme = {
  backgroundDotColor: string
  edgeColor: string
  edgeColorMuted: string
  minimapMaskColor: string
  handleFill: string
  handleRing: string
  cardShadow: string
  dropHintBg: string
  dropHintBorder: string
  placeholderHoverBg: string
}

const LIGHT_THEME: WorkflowFlowVisualTheme = {
  backgroundDotColor: "#D9DEE6",
  edgeColor: "#00A589",
  edgeColorMuted: "#CBD5E1",
  minimapMaskColor: "rgba(247, 244, 239, 0.72)",
  handleFill: "#ffffff",
  handleRing: "#ffffff",
  cardShadow: "drop-shadow(0 2px 6px rgba(0,0,0,0.08))",
  dropHintBg: "rgba(224, 250, 245, 0.5)",
  dropHintBorder: "rgba(0, 165, 137, 0.7)",
  placeholderHoverBg: "rgba(224, 250, 245, 0.4)",
}

const DARK_THEME: WorkflowFlowVisualTheme = {
  backgroundDotColor: "#2A3444",
  edgeColor: "#2DD4BF",
  edgeColorMuted: "#3D4F63",
  minimapMaskColor: "rgba(9, 12, 17, 0.78)",
  handleFill: "#171D26",
  handleRing: "#252D3B",
  cardShadow: "drop-shadow(0 2px 8px rgba(0,0,0,0.35))",
  dropHintBg: "rgba(0, 92, 77, 0.28)",
  dropHintBorder: "rgba(45, 212, 191, 0.65)",
  placeholderHoverBg: "rgba(0, 92, 77, 0.22)",
}

export function getWorkflowFlowVisualTheme(
  isDark: boolean,
): WorkflowFlowVisualTheme {
  return isDark ? DARK_THEME : LIGHT_THEME
}

export function useWorkflowFlowVisualTheme(): WorkflowFlowVisualTheme {
  return getWorkflowFlowVisualTheme(useIsDarkMode())
}
