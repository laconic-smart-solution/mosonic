import { Eye, EyeOff } from "lucide-react"
import { useId, useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type AuthPasswordFieldProps = Omit<
  ComponentProps<typeof Input>,
  "type" | "className"
> & {
  label: string
  /** When omitted, a stable id is generated from `useId`. */
  id?: string
  className?: string
  inputClassName?: string
}

export function AuthPasswordField({
  label,
  id: idProp,
  disabled,
  autoComplete,
  inputClassName,
  className,
  ...inputProps
}: AuthPasswordFieldProps) {
  const reactId = useId()
  const id = idProp ?? `auth-password-${reactId}`
  const [visible, setVisible] = useState(false)

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          disabled={disabled}
          autoComplete={autoComplete}
          className={cn("pr-10", inputClassName)}
          {...inputProps}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-1 top-1/2 size-8 -translate-y-1/2 rounded-full text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
    </div>
  )
}
