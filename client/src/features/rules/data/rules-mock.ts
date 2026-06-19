import type { TFunction } from "i18next"
import type { Edge, Node } from "@xyflow/react"
import {
  DISTRIBUTION_CHANNELS,
  channelLabel,
  resolveDistributionChannelId,
} from "@/shared/constants/distribution-channels"
import type { ChipColor } from "@/lib/tokens"
import { randomUuid } from "@/lib/random-uuid"

export type RuleStatus = "active" | "archived" | "draft" | "processing" | "failed"

export type RuleEntity = {
  ruleId: string
  name: string
  brand: {
    brandName: string
    industry: string
    brandDescription: string
    brandTone: string[]
    brandVoice: string
    brandRestrictions: string[]
    callToAction: string
  }
  audience: {
    description: string
    ageRange: { min: number; max: number }
    gender: "all" | "male" | "female"
    location: string[]
    interests: string[]
    painPoints: string[]
    language: string
    targetLanguages: string[]
  }
  campaign: {
    goals: string[]
    keywords: string[]
    hashtagStrategy: string[]
    contentFormats: string[]
    duration: {
      startDate: string
      endDate: string
    }
    postingFrequency: "daily" | "weekly" | "custom"
    customSchedule: string[]
  }
  channels: Array<{
    channel: string
    priority: "high" | "medium" | "low"
    contentStyle: string
  }>
  contentGuidelines: {
    dos: string[]
    donts: string[]
    requiredElements: string[]
    seoGuidelines: {
      primaryKeywords: string[]
      secondaryKeywords: string[]
      keywordDensity: string
    }
  }
  originalInput: {
    type: "file" | "url" | "text"
    storedAt: string
  }
  status: RuleStatus
  versions: Array<{
    versionNumber: number
    changedFields: string[]
    changedBy: "user" | "system_suggestion"
    snapshot: Record<string, unknown>
    createdAt: string
  }>
  createdAt: string
  updatedAt: string
}

export type RuleSummary = {
  ruleId: string
  name: string
  tones: string[]
  channels: string[]
  status: RuleStatus
  edited: string
}

export type RuleFlowNodeData = {
  label: string
  level: 0 | 1 | 2 | 3
  editable: boolean
  fieldPath?: string
  editValue?: string
}

export const STATUS_COLOR: Record<RuleStatus, ChipColor> = {
  active: "green",
  draft: "amber",
  archived: "gray",
  processing: "amber",
  failed: "gray",
}

export const CHANNELS_ALL = ["facebook", "instagram", "x", "line", "linkedin", "youtube"] as const

export const RULE_DISTRIBUTION_CHANNEL_IDS = DISTRIBUTION_CHANNELS.map((c) => c.id)

export function isRuleChannelFieldPath(fieldPath: string | undefined): boolean {
  return Boolean(fieldPath?.match(/^channels\[\d+\]\.channel$/))
}

export function ruleChannelIds(rule: RuleEntity): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rule.channels) {
    const id = resolveDistributionChannelId(row.channel)
    if (!id || seen.has(id)) continue
    if (!RULE_DISTRIBUTION_CHANNEL_IDS.includes(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function setRuleChannels(
  rule: RuleEntity,
  selectedIds: string[],
): RuleEntity {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const raw of selectedIds) {
    const id = resolveDistributionChannelId(raw)
    if (!id || seen.has(id)) continue
    if (!RULE_DISTRIBUTION_CHANNEL_IDS.includes(id)) continue
    seen.add(id)
    unique.push(id)
  }
  if (unique.length === 0) return rule

  const byId = new Map<string, RuleEntity["channels"][number]>()
  for (const row of rule.channels) {
    byId.set(resolveDistributionChannelId(row.channel), row)
  }

  const channels = unique.map((id) => {
    const existing = byId.get(id)
    if (existing) return { ...existing, channel: id }
    return {
      channel: id,
      priority: "medium" as const,
      contentStyle: "custom style",
    }
  })

  return { ...rule, channels }
}

const NOW = "2026-05-05T14:00:00.000Z"

export const RULES_MOCK: RuleEntity[] = [
  {
    ruleId: "b0872dad-ec95-4f9e-a1e4-0b39bd14d112",
    name: "Black Friday Campaign 2024",
    brand: {
      brandName: "Mosonic",
      industry: "SaaS / Technology",
      brandDescription: "AI-powered content orchestration platform for marketing teams.",
      brandTone: ["casual", "inspirational"],
      brandVoice: "Friendly but professional, simple words, practical messaging.",
      brandRestrictions: ["never mention competitors", "avoid technical jargon"],
      callToAction: "Shop Now",
    },
    audience: {
      description: "Thai SME owners aged 30-50",
      ageRange: { min: 30, max: 50 },
      gender: "all",
      location: ["Thailand", "Southeast Asia"],
      interests: ["digital marketing", "e-commerce"],
      painPoints: ["too much manual work", "high content costs"],
      language: "th",
      targetLanguages: ["th", "en"],
    },
    campaign: {
      goals: ["brand awareness", "conversions", "lead generation"],
      keywords: ["AI content", "automation", "save time"],
      hashtagStrategy: ["#AIContent", "#DigitalMarketing"],
      contentFormats: ["short post", "image caption", "promotional copy"],
      duration: { startDate: "2024-11-01", endDate: "2024-11-30" },
      postingFrequency: "daily",
      customSchedule: ["monday", "wednesday", "friday"],
    },
    channels: [
      { channel: "instagram", priority: "high", contentStyle: "visual-first, short caption" },
      { channel: "facebook", priority: "medium", contentStyle: "story-driven, longer text ok" },
      { channel: "linkedin", priority: "low", contentStyle: "professional, insight-driven" },
    ],
    contentGuidelines: {
      dos: ["use emojis", "keep sentences short", "be direct"],
      donts: ["avoid passive voice", "no technical terms", "never mention pricing"],
      requiredElements: ["always include CTA", "always mention brand name"],
      seoGuidelines: {
        primaryKeywords: ["AI content generator", "automated marketing"],
        secondaryKeywords: ["social media automation", "content AI"],
        keywordDensity: "natural, not forced",
      },
    },
    originalInput: {
      type: "text",
      storedAt: "s3://bucket/rules/b0872dad-ec95-4f9e-a1e4-0b39bd14d112/original.txt",
    },
    status: "active",
    versions: [
      {
        versionNumber: 1,
        changedFields: ["brand.brandTone", "campaign.keywords"],
        changedBy: "user",
        snapshot: {
          brand: { brandTone: ["formal"] },
          campaign: { keywords: ["old keyword"] },
        },
        createdAt: NOW,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    ruleId: "4f16a3db-c7d9-4457-a47f-cf7d53bce6d3",
    name: "Songkran Retail 2026",
    brand: {
      brandName: "FlowMall",
      industry: "E-commerce",
      brandDescription: "Online marketplace for seasonal promotions and local products.",
      brandTone: ["energetic", "friendly"],
      brandVoice: "High-energy social language with local context and clear offers.",
      brandRestrictions: ["avoid politics", "do not overpromise discounts"],
      callToAction: "Grab the deal",
    },
    audience: {
      description: "Urban Thai shoppers 20-38",
      ageRange: { min: 20, max: 38 },
      gender: "all",
      location: ["Thailand"],
      interests: ["shopping", "lifestyle", "food"],
      painPoints: ["limited budget", "too many options"],
      language: "th",
      targetLanguages: ["th"],
    },
    campaign: {
      goals: ["conversions", "brand awareness"],
      keywords: ["songkran sale", "flash deal"],
      hashtagStrategy: ["#SongkranSale", "#FlashDeal"],
      contentFormats: ["short post", "image caption"],
      duration: { startDate: "2026-04-08", endDate: "2026-04-20" },
      postingFrequency: "custom",
      customSchedule: ["tuesday", "thursday", "saturday"],
    },
    channels: [
      { channel: "facebook", priority: "high", contentStyle: "deal-focused, clear value" },
      { channel: "instagram", priority: "high", contentStyle: "visual promo, emoji-heavy" },
      { channel: "line", priority: "medium", contentStyle: "concise and actionable" },
    ],
    contentGuidelines: {
      dos: ["highlight urgency", "use short lines"],
      donts: ["avoid long paragraphs", "avoid English-only phrasing"],
      requiredElements: ["include campaign hashtag"],
      seoGuidelines: {
        primaryKeywords: ["songkran sale", "online promotion"],
        secondaryKeywords: ["thai retail offer"],
        keywordDensity: "natural, not forced",
      },
    },
    originalInput: {
      type: "url",
      storedAt: "s3://bucket/rules/4f16a3db-c7d9-4457-a47f-cf7d53bce6d3/original.url",
    },
    status: "draft",
    versions: [],
    createdAt: NOW,
    updatedAt: NOW,
  },
]

export const DEFAULT_GENERATED_RULE: RuleEntity = {
  ...RULES_MOCK[0],
  ruleId: "9d718cf2-8177-4f35-b247-2f8d8ec582c0",
  name: "Generated Default Rule",
  status: "draft",
}

export function getRuleSummaries(rules: RuleEntity[]): RuleSummary[] {
  return rules.map((rule) => ({
    ruleId: rule.ruleId,
    name: rule.name,
    tones: rule.brand.brandTone,
    channels: rule.channels.map((item) => item.channel),
    status: rule.status,
    edited: "just now",
  }))
}

export function buildRuleFlow(
  rule: RuleEntity,
  t: TFunction<"rules">,
): { nodes: Node[]; edges: Edge[] } {
  const ring1 = 260
  const ring2 = 470
  const ring3 = 680
  const ring4 = 850
  const center = { x: 0, y: 0 }
  const sections = [
    {
      key: "brand",
      title: t("tree.sections.brand"),
      fields: [
        { key: "brandName", label: t("tree.fields.brandName"), value: rule.brand.brandName },
        { key: "brandTone", label: t("tree.fields.brandTone"), value: rule.brand.brandTone },
        { key: "callToAction", label: t("tree.fields.callToAction"), value: rule.brand.callToAction },
      ],
    },
    {
      key: "audience",
      title: t("tree.sections.audience"),
      fields: [
        { key: "description", label: t("tree.fields.description"), value: rule.audience.description },
        { key: "location", label: t("tree.fields.location"), value: rule.audience.location },
        { key: "interests", label: t("tree.fields.interests"), value: rule.audience.interests },
      ],
    },
    {
      key: "campaign",
      title: t("tree.sections.campaign"),
      fields: [
        { key: "goals", label: t("tree.fields.goals"), value: rule.campaign.goals },
        { key: "keywords", label: t("tree.fields.keywords"), value: rule.campaign.keywords },
        { key: "contentFormats", label: t("tree.fields.formats"), value: rule.campaign.contentFormats },
      ],
    },
    {
      key: "channels",
      title: t("tree.sections.channels"),
      fields: [
        {
          key: "names",
          label: t("tree.fields.channelNames"),
          value: rule.channels.map((item) => item.channel),
        },
      ],
    },
    {
      key: "contentGuidelines",
      title: t("tree.sections.guidelines"),
      fields: [
        { key: "dos", label: t("tree.fields.dos"), value: rule.contentGuidelines.dos },
        { key: "donts", label: t("tree.fields.donts"), value: rule.contentGuidelines.donts },
      ],
    },
  ] as const

  const polarPoint = (radius: number, angle: number) => ({
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  })

  const nodes: Node<RuleFlowNodeData>[] = [
    {
      id: "root",
      type: "bubbleNode",
      position: center,
      data: {
        label: rule.name,
        level: 0,
        editable: false,
      },
    },
  ]

  const edges: Edge[] = []

  const sectionCount = sections.length
  const sectionAngles = sections.map((_, index) => {
    const start = -Math.PI / 2 // start from top
    return start + (index * (Math.PI * 2)) / sectionCount
  })

  sections.forEach((section, index) => {
    const sectionId = `sec-${section.key}`
    const sectionAngle = sectionAngles[index]
    const sectionPos = polarPoint(ring1, sectionAngle)

    nodes.push({
      id: sectionId,
      type: "bubbleNode",
      position: sectionPos,
      data: {
        label: section.title,
        level: 1,
        editable: false,
      },
    })

    edges.push({
      id: `edge-root-${sectionId}`,
      source: "root",
      target: sectionId,
      type: "smoothstep",
    })

    const fieldSpan = 0.75 // radians around each section branch
    const fieldCount = section.fields.length

    section.fields.forEach((field, fieldIndex) => {
      const fieldId = `field-${section.key}-${field.key}`
      const fieldRatio = fieldCount === 1 ? 0.5 : fieldIndex / (fieldCount - 1)
      const fieldAngle = sectionAngle - fieldSpan / 2 + fieldRatio * fieldSpan
      const fieldPos = polarPoint(ring2, fieldAngle)
      const isArray = Array.isArray(field.value)
      const fieldValueLabel = isArray
        ? t("tree.itemCount", { count: field.value.length })
        : String(field.value)

      nodes.push({
        id: fieldId,
        type: "bubbleNode",
        position: fieldPos,
        data: {
          label: field.label,
          level: 2,
          editable: false,
        },
      })

      edges.push({
        id: `edge-${sectionId}-${fieldId}`,
        source: sectionId,
        target: fieldId,
        type: "smoothstep",
      })

      if (!isArray) {
        const valueId = `value-${section.key}-${field.key}`
        nodes.push({
          id: valueId,
          type: "bubbleNode",
          position: polarPoint(ring3, fieldAngle),
          data: {
            label: fieldValueLabel,
            level: 3,
            editable: true,
            fieldPath: `${section.key}.${field.key}`,
            editValue: fieldValueLabel,
          },
        })
        edges.push({
          id: `edge-${fieldId}-${valueId}`,
          source: fieldId,
          target: valueId,
          type: "smoothstep",
        })
        return
      }

      const arrayValues = field.value as string[]
      const valueId = `value-${section.key}-${field.key}`
      nodes.push({
        id: valueId,
        type: "bubbleNode",
        position: polarPoint(ring3, fieldAngle),
        data: {
          label: fieldValueLabel,
          level: 3,
          editable: false,
        },
      })
      edges.push({
        id: `edge-${fieldId}-${valueId}`,
        source: fieldId,
        target: valueId,
        type: "smoothstep",
      })

      const itemSpan = Math.min(0.55, 0.14 * Math.max(arrayValues.length - 1, 1))
      arrayValues.forEach((item, itemIndex) => {
        const itemId = `item-${section.key}-${field.key}-${itemIndex}`
        const itemT = arrayValues.length === 1 ? 0.5 : itemIndex / (arrayValues.length - 1)
        const itemAngle = fieldAngle - itemSpan / 2 + itemT * itemSpan
        nodes.push({
          id: itemId,
          type: "bubbleNode",
          position: polarPoint(ring4, itemAngle),
          data: {
            label: section.key === "channels" ? channelLabel(item) : item,
            level: 3,
            editable: section.key !== "channels",
            fieldPath:
              section.key === "channels"
                ? `channels[${itemIndex}].channel`
                : `${section.key}.${field.key}[${itemIndex}]`,
            editValue: item,
          },
        })
        edges.push({
          id: `edge-${valueId}-${itemId}`,
          source: valueId,
          target: itemId,
          type: "smoothstep",
        })
      })
    })
  })

  return { nodes, edges }
}

export function updateRuleFromNode(
  rule: RuleEntity,
  fieldPath: string,
  nextValue: string,
): RuleEntity {
  const value = nextValue.trim()
  if (!value) return rule

  const updateArrayItem = (items: string[], index: number, itemValue: string) => {
    if (index < 0 || index >= items.length) return items
    const nextItems = [...items]
    nextItems[index] = itemValue
    return nextItems
  }

  const listItemMatch = fieldPath.match(/^([^.[\]]+)\.([^.[\]]+)\[(\d+)\]$/)
  if (listItemMatch) {
    const [, section, field, indexRaw] = listItemMatch
    const index = Number(indexRaw)
    if (!Number.isInteger(index)) return rule
    if (section === "brand" && field === "brandTone") {
      return {
        ...rule,
        brand: { ...rule.brand, brandTone: updateArrayItem(rule.brand.brandTone, index, value) },
      }
    }
    if (section === "audience" && field === "location") {
      return {
        ...rule,
        audience: { ...rule.audience, location: updateArrayItem(rule.audience.location, index, value) },
      }
    }
    if (section === "audience" && field === "interests") {
      return {
        ...rule,
        audience: { ...rule.audience, interests: updateArrayItem(rule.audience.interests, index, value) },
      }
    }
    if (section === "campaign" && field === "goals") {
      return {
        ...rule,
        campaign: { ...rule.campaign, goals: updateArrayItem(rule.campaign.goals, index, value) },
      }
    }
    if (section === "campaign" && field === "keywords") {
      return {
        ...rule,
        campaign: { ...rule.campaign, keywords: updateArrayItem(rule.campaign.keywords, index, value) },
      }
    }
    if (section === "campaign" && field === "contentFormats") {
      return {
        ...rule,
        campaign: {
          ...rule.campaign,
          contentFormats: updateArrayItem(rule.campaign.contentFormats, index, value),
        },
      }
    }
    if (section === "contentGuidelines" && field === "dos") {
      return {
        ...rule,
        contentGuidelines: {
          ...rule.contentGuidelines,
          dos: updateArrayItem(rule.contentGuidelines.dos, index, value),
        },
      }
    }
    if (section === "contentGuidelines" && field === "donts") {
      return {
        ...rule,
        contentGuidelines: {
          ...rule.contentGuidelines,
          donts: updateArrayItem(rule.contentGuidelines.donts, index, value),
        },
      }
    }
  }

  const channelFieldMatch = fieldPath.match(/^channels\[(\d+)\]\.channel$/)
  if (channelFieldMatch) {
    const index = Number(channelFieldMatch[1])
    if (!Number.isInteger(index) || index < 0 || index >= rule.channels.length) return rule
    return {
      ...rule,
      channels: rule.channels.map((channel, i) =>
        i === index ? { ...channel, channel: value } : channel,
      ),
    }
  }

  if (fieldPath === "brand.brandName") {
    return { ...rule, brand: { ...rule.brand, brandName: value } }
  }
  if (fieldPath === "brand.callToAction") {
    return { ...rule, brand: { ...rule.brand, callToAction: value } }
  }
  if (fieldPath === "audience.description") {
    return { ...rule, audience: { ...rule.audience, description: value } }
  }

  return rule
}

function parseListItemFieldPath(fieldPath: string): {
  listPath: string
  index: number
} | null {
  const channelMatch = fieldPath.match(/^channels\[(\d+)\]\.channel$/)
  if (channelMatch) {
    return { listPath: "channels", index: Number(channelMatch[1]) }
  }

  const commonMatch = fieldPath.match(/^([^.[\]]+\.[^.[\]]+)\[(\d+)\]$/)
  if (!commonMatch) return null
  return {
    listPath: commonMatch[1],
    index: Number(commonMatch[2]),
  }
}

export function addListItemFromNode(rule: RuleEntity, fieldPath: string): RuleEntity {
  const parsed = parseListItemFieldPath(fieldPath)
  if (!parsed || !Number.isInteger(parsed.index)) return rule
  const { listPath, index } = parsed

  if (listPath === "channels") {
    const nextChannels = [...rule.channels]
    const base = nextChannels[index] ?? {
      channel: "",
      priority: "medium" as const,
      contentStyle: "custom style",
    }
    nextChannels.splice(index + 1, 0, {
      ...base,
      channel: "new-channel",
    })
    return { ...rule, channels: nextChannels }
  }

  const updateStringList = (items: string[]) => {
    const next = [...items]
    next.splice(index + 1, 0, "new-item")
    return next
  }

  if (listPath === "brand.brandTone") {
    return { ...rule, brand: { ...rule.brand, brandTone: updateStringList(rule.brand.brandTone) } }
  }
  if (listPath === "audience.location") {
    return { ...rule, audience: { ...rule.audience, location: updateStringList(rule.audience.location) } }
  }
  if (listPath === "audience.interests") {
    return { ...rule, audience: { ...rule.audience, interests: updateStringList(rule.audience.interests) } }
  }
  if (listPath === "campaign.goals") {
    return { ...rule, campaign: { ...rule.campaign, goals: updateStringList(rule.campaign.goals) } }
  }
  if (listPath === "campaign.keywords") {
    return { ...rule, campaign: { ...rule.campaign, keywords: updateStringList(rule.campaign.keywords) } }
  }
  if (listPath === "campaign.contentFormats") {
    return {
      ...rule,
      campaign: {
        ...rule.campaign,
        contentFormats: updateStringList(rule.campaign.contentFormats),
      },
    }
  }
  if (listPath === "contentGuidelines.dos") {
    return {
      ...rule,
      contentGuidelines: {
        ...rule.contentGuidelines,
        dos: updateStringList(rule.contentGuidelines.dos),
      },
    }
  }
  if (listPath === "contentGuidelines.donts") {
    return {
      ...rule,
      contentGuidelines: {
        ...rule.contentGuidelines,
        donts: updateStringList(rule.contentGuidelines.donts),
      },
    }
  }
  return rule
}

export function removeListItemFromNode(rule: RuleEntity, fieldPath: string): RuleEntity {
  const parsed = parseListItemFieldPath(fieldPath)
  if (!parsed || !Number.isInteger(parsed.index)) return rule
  const { listPath, index } = parsed

  if (listPath === "channels") {
    if (rule.channels.length <= 1) return rule
    return {
      ...rule,
      channels: rule.channels.filter((_, i) => i !== index),
    }
  }

  const removeFrom = (items: string[]) => {
    if (items.length <= 1) return items
    return items.filter((_, i) => i !== index)
  }

  if (listPath === "brand.brandTone") {
    return { ...rule, brand: { ...rule.brand, brandTone: removeFrom(rule.brand.brandTone) } }
  }
  if (listPath === "audience.location") {
    return { ...rule, audience: { ...rule.audience, location: removeFrom(rule.audience.location) } }
  }
  if (listPath === "audience.interests") {
    return { ...rule, audience: { ...rule.audience, interests: removeFrom(rule.audience.interests) } }
  }
  if (listPath === "campaign.goals") {
    return { ...rule, campaign: { ...rule.campaign, goals: removeFrom(rule.campaign.goals) } }
  }
  if (listPath === "campaign.keywords") {
    return { ...rule, campaign: { ...rule.campaign, keywords: removeFrom(rule.campaign.keywords) } }
  }
  if (listPath === "campaign.contentFormats") {
    return {
      ...rule,
      campaign: {
        ...rule.campaign,
        contentFormats: removeFrom(rule.campaign.contentFormats),
      },
    }
  }
  if (listPath === "contentGuidelines.dos") {
    return {
      ...rule,
      contentGuidelines: {
        ...rule.contentGuidelines,
        dos: removeFrom(rule.contentGuidelines.dos),
      },
    }
  }
  if (listPath === "contentGuidelines.donts") {
    return {
      ...rule,
      contentGuidelines: {
        ...rule.contentGuidelines,
        donts: removeFrom(rule.contentGuidelines.donts),
      },
    }
  }
  return rule
}

export function createRuleFromPrompt(prompt: string): RuleEntity {
  const id = randomUuid()
  return {
    ...DEFAULT_GENERATED_RULE,
    ruleId: id,
    name: `Rule from prompt: ${prompt.slice(0, 22) || "Untitled"}`,
    originalInput: { type: "text", storedAt: `s3://bucket/rules/${id}/original.txt` },
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }
}
