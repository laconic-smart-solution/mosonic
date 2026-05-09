import { Controller, useFormContext, type FieldPath } from "react-hook-form"
import { Input } from "@/components/ui/input"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { cn } from "@/lib/utils"
import { FieldLabel } from "./rule-form-helpers"
import { ruleControlClassName } from "./rule-form-utils"

type Props = {
  name: FieldPath<RuleEntity>
  label: string
  hint?: string
  type?: "text" | "number"
  className?: string
}

export function RuleFormInput({
  name,
  label,
  hint,
  type = "text",
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
          <Input
            {...field}
            type={type}
            value={
              typeof field.value === "string" || typeof field.value === "number"
                ? field.value
                : ""
            }
            onChange={(event) => {
              const nextValue =
                type === "number"
                  ? Number.parseInt(event.target.value, 10) || 0
                  : event.target.value
              field.onChange(nextValue)
            }}
            className={cn(ruleControlClassName, "h-10", className)}
          />
        )}
      />
    </div>
  )
}
