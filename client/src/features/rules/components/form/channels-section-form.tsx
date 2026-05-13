import { Controller, useFormContext } from "react-hook-form"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { cn } from "@/lib/utils"
import {
  FieldLabel,
  FormSection,
  FullRow,
} from "./rule-form-helpers"
import { parseCommaList, ruleControlClassName } from "./rule-form-utils"

export function ChannelsSectionForm() {
  const { control, getValues } = useFormContext<RuleEntity>()

  return (
    <FormSection
      id="detail-channels"
      title="Channels"
      subtitle="Where this rule applies. Enter channel names separated by commas."
    >
      <FullRow>
        <div>
          <FieldLabel hint="Comma-separated channel names">Distribution</FieldLabel>
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
