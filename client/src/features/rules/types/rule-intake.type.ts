export const CONTENT_PURPOSES = [
  "social_marketing",
  "thought_leadership",
  "internal_comms",
  "educational",
  "ecommerce",
  "other",
] as const

export type ContentPurpose = (typeof CONTENT_PURPOSES)[number]

export type RuleIntakeMode = "guided" | "express"

export type RuleIntakeChannel = {
  channel: string
  priority: "high" | "medium" | "low"
  contentStyle?: string
}

export type RuleIntakeAnswers = {
  mode: RuleIntakeMode
  contentPurpose?: ContentPurpose
  contentPurposeNotes?: string
  additionalNotes?: string
  brandName?: string
  industry?: string
  brandDescription?: string
  brandTone?: string[]
  brandVoice?: string
  callToAction?: string
  audienceDescription?: string
  locations?: string[]
  primaryLanguage?: string
  targetLanguages?: string[]
  ageRange?: { min: number; max: number }
  channels?: RuleIntakeChannel[]
  goals?: string[]
  keywords?: string[]
  useHashtags?: boolean
  hashtagStrategy?: string[]
  contentFormats?: string[]
  postingFrequency?: "daily" | "weekly" | "custom"
  duration?: { startDate?: string; endDate?: string }
  dos?: string[]
  donts?: string[]
  requiredElements?: string[]
  useSeo?: boolean
  primarySeoKeywords?: string[]
}

export function createDefaultRuleIntakeAnswers(
  mode: RuleIntakeMode = "guided",
): RuleIntakeAnswers {
  return {
    mode,
    useHashtags: true,
    useSeo: true,
    brandTone: [],
    locations: [],
    targetLanguages: [],
    channels: [],
    goals: [],
    keywords: [],
    hashtagStrategy: [],
    contentFormats: [],
    dos: [],
    donts: [],
    requiredElements: [],
    primarySeoKeywords: [],
    postingFrequency: "weekly",
  }
}

export function channelIdsToIntakeChannels(
  ids: string[],
  existing: RuleIntakeChannel[] = [],
): RuleIntakeChannel[] {
  return ids.map((id) => {
    const prev = existing.find((c) => c.channel === id)
    return {
      channel: id,
      priority: prev?.priority ?? "medium",
      contentStyle: prev?.contentStyle ?? "",
    }
  })
}

export function intakeChannelsToIds(channels: RuleIntakeChannel[] | undefined): string[] {
  return channels?.map((c) => c.channel) ?? []
}

export function toRuleIntakePayload(answers: RuleIntakeAnswers): RuleIntakeAnswers {
  const { mode, ...rest } = answers
  return { mode, ...rest }
}
