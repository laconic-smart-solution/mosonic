import type { ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { STATUS_COLOR, type RuleEntity, type RuleStatus } from "@/features/rules/data/rules-mock"
import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import { RuleChip, type RuleChipTone } from "./rule-chip"

const NAV = [
  { id: "detail-overview", label: "Overview" },
  { id: "detail-brand", label: "Brand" },
  { id: "detail-audience", label: "Audience" },
  { id: "detail-campaign", label: "Campaign" },
  { id: "detail-channels", label: "Channels" },
  { id: "detail-guidelines", label: "Guidelines" },
] as const

function statusToChipTone(status: RuleStatus): RuleChipTone {
  const token = STATUS_COLOR[status]
  if (token === "green") return "green"
  if (token === "amber") return "amber"
  return "gray"
}

function parseCommaList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

const control =
  "w-full rounded-lg border border-border/90 bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"

type RuleDetailViewProps = {
  rule: RuleEntity
  onRuleChange: (next: RuleEntity) => void
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>
      {hint ? <p className="mt-0.5 text-[11px] font-normal normal-case text-muted-foreground/80">{hint}</p> : null}
    </div>
  )
}

function FormSection({
  id,
  title,
  subtitle,
  children,
}: {
  id: string
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 border-b border-border/50 pb-10 last:border-b-0 last:pb-0"
    >
      <div className="mb-5 flex items-start gap-3">
        <div
          className="mt-1 h-9 w-1 shrink-0 rounded-full"
          style={{ background: T.accent }}
          aria-hidden
        />
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-6">{children}</div>
    </section>
  )
}

function FullRow({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>
}

export function RuleDetailView({ rule, onRuleChange }: RuleDetailViewProps) {
  return (
    <div className="mx-auto flex max-w-6xl gap-8 lg:gap-10">
      <nav
        aria-label="Rule sections"
        className="hidden w-44 shrink-0 lg:block"
      >
        <div className="sticky top-2 space-y-0.5 rounded-xl border border-border/60 bg-muted/20 p-2">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="block rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="min-w-0 flex-1 rounded-2xl border border-border/70 bg-linear-to-b from-card/90 to-card/40 p-6 shadow-sm ring-1 ring-black/3 sm:p-8 dark:ring-white/6">
        <div className="-mx-1 mb-6 flex gap-1 overflow-x-auto pb-1 lg:hidden">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="shrink-0 rounded-full border border-border/70 bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </div>
        <header
          id="detail-overview"
          className="scroll-mt-6 border-b border-border/50 pb-8"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Campaign rule</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <Input
                value={rule.name}
                onChange={(e) => onRuleChange({ ...rule, name: e.target.value })}
                className="h-auto border-0 bg-transparent px-0 py-0 text-xl font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-2xl"
              />
              <p className="font-mono text-[11px] text-muted-foreground break-all">
                {rule.ruleId}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-3 py-2">
              <span className="text-[11px] text-muted-foreground">Status</span>
              <RuleChip label={rule.status} color={statusToChipTone(rule.status)} />
            </div>
          </div>
        </header>

        <div className="mt-8 space-y-10">
          <FormSection
            id="detail-brand"
            title="Brand"
            subtitle="Voice, positioning, and how the brand shows up in content."
          >
            <div>
              <FieldLabel>Brand name</FieldLabel>
              <Input
                value={rule.brand.brandName}
                onChange={(e) =>
                  onRuleChange({
                    ...rule,
                    brand: { ...rule.brand, brandName: e.target.value },
                  })
                }
                className={cn(control, "h-10")}
              />
            </div>
            <div>
              <FieldLabel>Industry</FieldLabel>
              <Input
                value={rule.brand.industry}
                onChange={(e) =>
                  onRuleChange({
                    ...rule,
                    brand: { ...rule.brand, industry: e.target.value },
                  })
                }
                className={cn(control, "h-10")}
              />
            </div>
            <FullRow>
              <div>
                <FieldLabel>Description</FieldLabel>
                <textarea
                  rows={3}
                  className={cn(control, "min-h-20 resize-y")}
                  value={rule.brand.brandDescription}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      brand: { ...rule.brand, brandDescription: e.target.value },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel>Brand voice</FieldLabel>
                <textarea
                  rows={3}
                  className={cn(control, "min-h-20 resize-y")}
                  value={rule.brand.brandVoice}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      brand: { ...rule.brand, brandVoice: e.target.value },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Tone</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.brand.brandTone.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      brand: { ...rule.brand, brandTone: parseCommaList(e.target.value) },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Restrictions</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.brand.brandRestrictions.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      brand: { ...rule.brand, brandRestrictions: parseCommaList(e.target.value) },
                    })
                  }
                />
              </div>
            </FullRow>
            <div>
              <FieldLabel>Call to action</FieldLabel>
              <Input
                value={rule.brand.callToAction}
                onChange={(e) =>
                  onRuleChange({
                    ...rule,
                    brand: { ...rule.brand, callToAction: e.target.value },
                  })
                }
                className={cn(control, "h-10")}
              />
            </div>
          </FormSection>

          <FormSection
            id="detail-audience"
            title="Audience"
            subtitle="Who you are targeting and how they behave."
          >
            <FullRow>
              <div>
                <FieldLabel>Audience description</FieldLabel>
                <textarea
                  rows={3}
                  className={cn(control, "min-h-20 resize-y")}
                  value={rule.audience.description}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      audience: { ...rule.audience, description: e.target.value },
                    })
                  }
                />
              </div>
            </FullRow>
            <div>
              <FieldLabel>Age min</FieldLabel>
              <Input
                type="number"
                value={rule.audience.ageRange.min}
                onChange={(e) =>
                  onRuleChange({
                    ...rule,
                    audience: {
                      ...rule.audience,
                      ageRange: {
                        ...rule.audience.ageRange,
                        min: Number.parseInt(e.target.value, 10) || 0,
                      },
                    },
                  })
                }
                className={cn(control, "h-10")}
              />
            </div>
            <div>
              <FieldLabel>Age max</FieldLabel>
              <Input
                type="number"
                value={rule.audience.ageRange.max}
                onChange={(e) =>
                  onRuleChange({
                    ...rule,
                    audience: {
                      ...rule.audience,
                      ageRange: {
                        ...rule.audience.ageRange,
                        max: Number.parseInt(e.target.value, 10) || 0,
                      },
                    },
                  })
                }
                className={cn(control, "h-10")}
              />
            </div>
            <div>
              <FieldLabel>Gender</FieldLabel>
              <select
                className={cn(control, "h-10 cursor-pointer")}
                value={rule.audience.gender}
                onChange={(e) =>
                  onRuleChange({
                    ...rule,
                    audience: {
                      ...rule.audience,
                      gender: e.target.value as RuleEntity["audience"]["gender"],
                    },
                  })
                }
              >
                <option value="all">All</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <FieldLabel>Primary language</FieldLabel>
              <Input
                value={rule.audience.language}
                onChange={(e) =>
                  onRuleChange({
                    ...rule,
                    audience: { ...rule.audience, language: e.target.value },
                  })
                }
                className={cn(control, "h-10")}
              />
            </div>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Locations</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.audience.location.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      audience: { ...rule.audience, location: parseCommaList(e.target.value) },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Interests</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.audience.interests.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      audience: { ...rule.audience, interests: parseCommaList(e.target.value) },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Pain points</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.audience.painPoints.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      audience: { ...rule.audience, painPoints: parseCommaList(e.target.value) },
                    })
                  }
                />
              </div>
            </FullRow>
            <div>
              <FieldLabel hint="Comma-separated values">Target languages</FieldLabel>
              <Input
                value={rule.audience.targetLanguages.join(", ")}
                onChange={(e) =>
                  onRuleChange({
                    ...rule,
                    audience: {
                      ...rule.audience,
                      targetLanguages: parseCommaList(e.target.value),
                    },
                  })
                }
                className={cn(control, "h-10")}
              />
            </div>
          </FormSection>

          <FormSection
            id="detail-campaign"
            title="Campaign"
            subtitle="Goals, discovery, and publishing rhythm."
          >
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Goals</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.campaign.goals.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      campaign: { ...rule.campaign, goals: parseCommaList(e.target.value) },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Keywords</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.campaign.keywords.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      campaign: { ...rule.campaign, keywords: parseCommaList(e.target.value) },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Hashtags</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.campaign.hashtagStrategy.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      campaign: {
                        ...rule.campaign,
                        hashtagStrategy: parseCommaList(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Content formats</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.campaign.contentFormats.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      campaign: {
                        ...rule.campaign,
                        contentFormats: parseCommaList(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </FullRow>
            <div>
              <FieldLabel>Posting frequency</FieldLabel>
              <select
                className={cn(control, "h-10 cursor-pointer")}
                value={rule.campaign.postingFrequency}
                onChange={(e) =>
                  onRuleChange({
                    ...rule,
                    campaign: {
                      ...rule.campaign,
                      postingFrequency: e.target.value as RuleEntity["campaign"]["postingFrequency"],
                    },
                  })
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Custom schedule</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.campaign.customSchedule.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      campaign: {
                        ...rule.campaign,
                        customSchedule: parseCommaList(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </FullRow>
          </FormSection>

          <FormSection
            id="detail-channels"
            title="Channels"
            subtitle="Where this rule applies. Enter channel names separated by commas."
          >
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated channel names">Distribution</FieldLabel>
                <textarea
                  rows={4}
                  className={cn(control, "min-h-24 resize-y")}
                  value={rule.channels.map((c) => c.channel).join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      channels: parseCommaList(e.target.value).map((channel) => ({
                        channel,
                        priority: "medium" as const,
                        contentStyle: "custom style",
                      })),
                    })
                  }
                />
              </div>
            </FullRow>
          </FormSection>

          <FormSection
            id="detail-guidelines"
            title="Guidelines"
            subtitle="Guardrails and SEO hints for generated content."
          >
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Dos</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.contentGuidelines.dos.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      contentGuidelines: {
                        ...rule.contentGuidelines,
                        dos: parseCommaList(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Don&apos;ts</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.contentGuidelines.donts.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      contentGuidelines: {
                        ...rule.contentGuidelines,
                        donts: parseCommaList(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Required elements</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.contentGuidelines.requiredElements.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      contentGuidelines: {
                        ...rule.contentGuidelines,
                        requiredElements: parseCommaList(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Primary SEO keywords</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.contentGuidelines.seoGuidelines.primaryKeywords.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      contentGuidelines: {
                        ...rule.contentGuidelines,
                        seoGuidelines: {
                          ...rule.contentGuidelines.seoGuidelines,
                          primaryKeywords: parseCommaList(e.target.value),
                        },
                      },
                    })
                  }
                />
              </div>
            </FullRow>
            <FullRow>
              <div>
                <FieldLabel hint="Comma-separated values">Secondary SEO keywords</FieldLabel>
                <textarea
                  rows={2}
                  className={cn(control, "min-h-16 resize-y")}
                  value={rule.contentGuidelines.seoGuidelines.secondaryKeywords.join(", ")}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      contentGuidelines: {
                        ...rule.contentGuidelines,
                        seoGuidelines: {
                          ...rule.contentGuidelines.seoGuidelines,
                          secondaryKeywords: parseCommaList(e.target.value),
                        },
                      },
                    })
                  }
                />
              </div>
            </FullRow>
            <div>
              <FieldLabel>Keyword density note</FieldLabel>
              <Input
                value={rule.contentGuidelines.seoGuidelines.keywordDensity}
                onChange={(e) =>
                  onRuleChange({
                    ...rule,
                    contentGuidelines: {
                      ...rule.contentGuidelines,
                      seoGuidelines: {
                        ...rule.contentGuidelines.seoGuidelines,
                        keywordDensity: e.target.value,
                      },
                    },
                  })
                }
                className={cn(control, "h-10")}
              />
            </div>
          </FormSection>
        </div>
      </div>
    </div>
  )
}
