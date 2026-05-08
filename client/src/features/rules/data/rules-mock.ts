import type { Edge, Node } from "@xyflow/react"
import type { ChipColor } from "@/lib/tokens"

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
  fieldKey?: string
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

const NOW = "2026-05-05T14:00:00.000Z"

export const RULES_MOCK: RuleEntity[] = [
  {
    ruleId: "b0872dad-ec95-4f9e-a1e4-0b39bd14d112",
    name: "Black Friday Campaign 2024",
    brand: {
      brandName: "NeuralTex",
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

export function buildRuleFlow(rule: RuleEntity): { nodes: Node[]; edges: Edge[] } {
  const ring1 = 260
  const ring2 = 470
  const ring3 = 680
  const ring4 = 850
  const center = { x: 0, y: 0 }
  const sections = [
    {
      key: "brand",
      title: "Brand",
      fields: [
        { key: "brandName", label: "Brand name", value: rule.brand.brandName },
        { key: "brandTone", label: "Brand tone", value: rule.brand.brandTone },
        { key: "callToAction", label: "CTA", value: rule.brand.callToAction },
      ],
    },
    {
      key: "audience",
      title: "Audience",
      fields: [
        { key: "description", label: "Description", value: rule.audience.description },
        { key: "location", label: "Location", value: rule.audience.location },
        { key: "interests", label: "Interests", value: rule.audience.interests },
      ],
    },
    {
      key: "campaign",
      title: "Campaign",
      fields: [
        { key: "goals", label: "Goals", value: rule.campaign.goals },
        { key: "keywords", label: "Keywords", value: rule.campaign.keywords },
        { key: "contentFormats", label: "Formats", value: rule.campaign.contentFormats },
      ],
    },
    {
      key: "channels",
      title: "Channels",
      fields: [
        {
          key: "names",
          label: "Channel names",
          value: rule.channels.map((item) => item.channel),
        },
      ],
    },
    {
      key: "contentGuidelines",
      title: "Guidelines",
      fields: [
        { key: "dos", label: "Dos", value: rule.contentGuidelines.dos },
        { key: "donts", label: "Donts", value: rule.contentGuidelines.donts },
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
      const t = fieldCount === 1 ? 0.5 : fieldIndex / (fieldCount - 1)
      const fieldAngle = sectionAngle - fieldSpan / 2 + t * fieldSpan
      const fieldPos = polarPoint(ring2, fieldAngle)
      const isArray = Array.isArray(field.value)
      const fieldValueLabel = isArray ? `${field.value.length} items` : String(field.value)

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
            fieldKey: section.key,
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
            label: item,
            level: 3,
            editable: true,
            fieldKey: section.key,
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
  nodeId: string,
  nextValue: string,
): RuleEntity {
  if (nodeId === "brand") {
    const [brandName = rule.brand.brandName, tonesRaw = "", ctaRaw = ""] = nextValue.split("\n")
    return {
      ...rule,
      brand: {
        ...rule.brand,
        brandName: brandName.trim() || rule.brand.brandName,
        brandTone: tonesRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        callToAction: ctaRaw.replace("CTA:", "").trim() || rule.brand.callToAction,
      },
    }
  }
  if (nodeId === "audience") {
    const [description = "", locationsRaw = ""] = nextValue.split("\n")
    return {
      ...rule,
      audience: {
        ...rule.audience,
        description: description.trim() || rule.audience.description,
        location: locationsRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
    }
  }
  if (nodeId === "campaign") {
    return { ...rule, campaign: { ...rule.campaign, goals: nextValue.split(",").map((s) => s.trim()) } }
  }
  if (nodeId === "channels") {
    return {
      ...rule,
      channels: nextValue
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((channel) => ({ channel, priority: "medium", contentStyle: "custom style" })),
    }
  }
  if (nodeId === "contentGuidelines") {
    const [dosRaw = "", dontsRaw = ""] = nextValue.split("\nDonts:")
    return {
      ...rule,
      contentGuidelines: {
        ...rule.contentGuidelines,
        dos: dosRaw.replace("Dos:", "").split(",").map((s) => s.trim()).filter(Boolean),
        donts: dontsRaw.split(",").map((s) => s.trim()).filter(Boolean),
      },
    }
  }
  return rule
}

export function createRuleFromPrompt(prompt: string): RuleEntity {
  const id = crypto.randomUUID()
  return {
    ...DEFAULT_GENERATED_RULE,
    ruleId: id,
    name: `Rule from prompt: ${prompt.slice(0, 22) || "Untitled"}`,
    originalInput: { type: "text", storedAt: `s3://bucket/rules/${id}/original.txt` },
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }
}
