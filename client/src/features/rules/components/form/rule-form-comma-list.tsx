import { useEffect, useState } from "react"
import { Controller, useFormContext, type FieldPath } from "react-hook-form"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { cn } from "@/lib/utils"
import { FieldLabel } from "./rule-form-helpers"
import { parseCommaList, ruleControlClassName } from "./rule-form-utils"

type Props = {
  name: FieldPath<RuleEntity>
  label: string
  hint?: string
  rows?: number
  className?: string
}

export function RuleFormCommaList({
  name,
  label,
  hint = "Comma-separated values",
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
          <CommaListTextarea
            value={Array.isArray(field.value) ? field.value : []}
            rows={rows}
            className={className}
            onCommit={(next) => {
              field.onChange(parseCommaList(next))
              field.onBlur()
            }}
          />
        )}
      />
    </div>
  )
}

function CommaListTextarea({
  value,
  rows,
  className,
  onCommit,
}: {
  value: string[]
  rows: number
  className?: string
  onCommit: (value: string) => void
}) {
  const [draftValue, setDraftValue] = useState(value.join(", "))

  useEffect(() => {
    setDraftValue(value.join(", "))
  }, [value])

  return (
    <textarea
      rows={rows}
      className={cn(ruleControlClassName, "resize-y", className)}
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={() => onCommit(draftValue)}
    />
  )
}
