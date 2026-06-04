import i18n from "@/i18n"

export function laneNodeShortLabel(wfType: string): string {
  return i18n.t(`workflow:nodeTypesShort.${wfType}`, { defaultValue: wfType })
}

/** e.g. "Summary For Facebook" */
export function formatLaneNodeLabel(
  wfType: string,
  channelLabel: string,
): string {
  const typeLabel = laneNodeShortLabel(wfType)
  const channel = channelLabel.trim()
  if (!channel) return typeLabel
  return i18n.t("workflow:laneNodeLabel.forChannel", {
    type: typeLabel,
    channel,
  })
}
