import { Controller, FormProvider, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { STATUS_COLOR, type RuleEntity, type RuleStatus } from "@/features/rules/data/rules-mock"
import { AudienceSectionForm } from "@/features/rules/components/form/audience-section-form"
import { BrandSectionForm } from "@/features/rules/components/form/brand-section-form"
import { CampaignSectionForm } from "@/features/rules/components/form/campaign-section-form"
import { ChannelsSectionForm } from "@/features/rules/components/form/channels-section-form"
import { GuidelinesSectionForm } from "@/features/rules/components/form/guidelines-section-form"
import { AutonomySectionForm } from "@/features/rules/components/form/autonomy-section-form"
import { RuleChip, type RuleChipTone } from "./rule-chip"

const NAV_IDS = [
  "detail-overview",
  "detail-brand",
  "detail-audience",
  "detail-campaign",
  "detail-channels",
  "detail-guidelines",
  "detail-autonomy",
] as const

const NAV_KEYS = [
  "overview",
  "brand",
  "audience",
  "campaign",
  "channels",
  "guidelines",
  "autonomy",
] as const

function statusToChipTone(status: RuleStatus): RuleChipTone {
  const token = STATUS_COLOR[status]
  if (token === "green") return "green"
  if (token === "amber") return "amber"
  return "gray"
}

type RuleDetailViewProps = {
  form: UseFormReturn<RuleEntity>
  ruleId: string
}

export function RuleDetailView({ form, ruleId }: RuleDetailViewProps) {
  const { t } = useTranslation("rules")
  const status = form.watch("status")

  const navItems = NAV_IDS.map((id, index) => ({
    id,
    label: t(`detail.nav.${NAV_KEYS[index]}`),
  }))

  return (
    <FormProvider {...form}>
      <div className="flex w-full gap-8 lg:gap-10">
        <nav
          aria-label={t("detail.navAria")}
          className="hidden w-44 shrink-0 lg:block"
        >
          <div className="sticky top-2 space-y-0.5 rounded-xl border border-border/60 bg-muted/20 p-2">
            {navItems.map((item) => (
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
            {navItems.map((item) => (
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
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("detail.campaignRule")}
            </p>
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <Controller
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      className="h-auto border-0 bg-transparent px-0 py-0 text-xl font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-2xl"
                    />
                  )}
                />
                <p className="font-mono text-[11px] text-muted-foreground break-all">
                  {ruleId}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                <span className="text-[11px] text-muted-foreground">{t("detail.status")}</span>
                <RuleChip label={t(`status.${status}`)} color={statusToChipTone(status)} />
              </div>
            </div>
          </header>

          <div className="mt-8 space-y-10">
            <BrandSectionForm />
            <AudienceSectionForm />
            <CampaignSectionForm />
            <ChannelsSectionForm />
            <GuidelinesSectionForm />
            <AutonomySectionForm />
          </div>
        </div>
      </div>
    </FormProvider>
  )
}
