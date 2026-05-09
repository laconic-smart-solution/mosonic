import { Controller, useFormContext, type FieldPath } from "react-hook-form"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { cn } from "@/lib/utils"
import { FieldLabel } from "./rule-form-helpers"
import { ruleControlClassName } from "./rule-form-utils"

type Props = {
  name: FieldPath<RuleEntity>
  label: string
  hint?: string
  rows?: number
  className?: string
}

export function RuleFormTextarea({
  name,
  label,
  hint,
  rows = 2,
  className,
}: Props) {
  const { control } = useFormContext<RuleEntity>()

  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <textarea
            rows={rows}
            className={cn(ruleControlClassName, "resize-y", className)}
            value={String(field.value ?? "")}
            onChange={(event) => field.onChange(event.target.value)}
          />
        )}
      />
    </div>
  )
}
