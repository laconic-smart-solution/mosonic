const SHORT_TYPE_LABEL: Record<string, string> = {
  keywords: "Keywords",
  intelligence: "Intelligence",
  text: "Text Generation",
  transcription: "Transcription",
  branch: "Branch",
  adapt: "Adapt",
  image: "Image",
  video: "Video",
  summarization: "Summary",
  translation: "Translation",
  merge: "Merge",
}

export function laneNodeShortLabel(wfType: string): string {
  return SHORT_TYPE_LABEL[wfType] ?? wfType
}

/** e.g. "Summary For Facebook" */
export function formatLaneNodeLabel(
  wfType: string,
  channelLabel: string,
): string {
  const typeLabel = laneNodeShortLabel(wfType)
  const channel = channelLabel.trim()
  if (!channel) return typeLabel
  return `${typeLabel} For ${channel}`
}
