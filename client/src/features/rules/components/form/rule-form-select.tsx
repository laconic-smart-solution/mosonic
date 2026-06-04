import { Controller, useFormContext, type FieldPath } from "react-hook-form"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { cn } from "@/lib/utils"
import { FieldLabel } from "./rule-form-helpers"
import { ruleControlClassName } from "./rule-form-utils"

type Option = {
  value: string
  label: string
}

type Props = {
  name: FieldPath<RuleEntity>
  label: string
  options: Option[]
}

export function RuleFormSelect({ name, label, options }: Props) {
  const { control } = useFormContext<RuleEntity>()

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <select
            className={cn(ruleControlClassName, "h-10 cursor-pointer")}
            value={String(field.value ?? "")}
            onChange={(event) => field.onChange(event.target.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      />
    </div>
  )
}
