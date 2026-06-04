import { Controller, useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { cn } from "@/lib/utils"
import {
  FieldLabel,
  FormSection,
  FullRow,
} from "./rule-form-helpers"
import { parseCommaList, ruleControlClassName } from "./rule-form-utils"

export function ChannelsSectionForm() {
  const { t } = useTranslation("rules")
  const { control, getValues } = useFormContext<RuleEntity>()

  return (
    <FormSection
      id="detail-channels"
      title={t("form.channels.title")}
      subtitle={t("form.channels.subtitle")}
    >
      <FullRow>
        <div>
          <FieldLabel hint={t("form.channels.distributionHint")}>
            {t("form.channels.distribution")}
          </FieldLabel>
          <Controller
            control={control}
            name="channels"
            render={({ field }) => (
              <textarea
                rows={4}
                className={cn(ruleControlClassName, "min-h-24 resize-y")}
                value={field.value.map((c) => c.channel).join(", ")}
                onChange={(event) => {
                  const previous = getValues("channels")
                  field.onChange(
                    parseCommaList(event.target.value).map((channel, index) => ({
                      channel,
                      priority: previous[index]?.priority ?? "medium",
                      contentStyle: previous[index]?.contentStyle ?? "custom style",
                    })),
                  )
                }}
              />
            )}
          />
        </div>
      </FullRow>
    </FormSection>
  )
}
