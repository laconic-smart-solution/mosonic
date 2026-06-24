import { useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import {
  RULE_DISTRIBUTION_CHANNEL_IDS,
  ruleChannelIds,
  setRuleChannels,
} from "@/features/rules/data/rules-mock"
import { cn } from "@/lib/utils"
import { channelLabel } from "@/shared/constants/distribution-channels"
import {
  FieldLabel,
  FormSection,
  FullRow,
} from "./rule-form-helpers"

export function ChannelsSectionForm() {
  const { t } = useTranslation("rules")
  const { watch, setValue } = useFormContext<RuleEntity>()
  const formValues = watch()
  const selectedIds = ruleChannelIds(formValues)

  function toggle(channelId: string) {
    const isSelected = selectedIds.includes(channelId)
    const next = isSelected
      ? selectedIds.filter((id) => id !== channelId)
      : [...selectedIds, channelId]

    if (next.length === 0) {
      toast.error(t("channelsDialog.atLeastOne"))
      return
    }

    setValue("channels", setRuleChannels(formValues, next).channels, {
      shouldDirty: true,
    })
  }

  return (
    <FormSection
      id="detail-channels"
      title={t("form.channels.title")}
      subtitle={t("form.channels.subtitle")}
    >
      <FullRow>
        <div className="space-y-3">
          <FieldLabel hint={t("form.channels.distributionHint")}>
            {t("form.channels.distribution")}
          </FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {RULE_DISTRIBUTION_CHANNEL_IDS.map((channelId) => {
              const inputId = `rule-detail-channel-${channelId}`
              const checked = selectedIds.includes(channelId)
              return (
                <label
                  key={channelId}
                  htmlFor={inputId}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                    checked
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:border-primary/30 hover:bg-muted/40",
                  )}
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={() => toggle(channelId)}
                  />
                  <Label htmlFor={inputId} className="cursor-pointer font-normal">
                    {channelLabel(channelId)}
                  </Label>
                </label>
              )
            })}
          </div>
        </div>
      </FullRow>
    </FormSection>
  )
}
