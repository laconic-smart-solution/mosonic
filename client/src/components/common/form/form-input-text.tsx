import { Eye, EyeOff } from "lucide-react"
import { useState, type ComponentProps, type HTMLInputTypeAttribute, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type FormInputTextProps<T extends FieldValues> = Omit<
  ComponentProps<"input">,
  "form"
> & {
  form: UseFormReturn<T>
  name: Path<T>
  label: string | ReactNode
  type?: HTMLInputTypeAttribute
  wrapperClass?: string
  labelClass?: string
  description?: ReactNode
}

function FormInputText<T extends FieldValues>({
  form,
  name,
  label,
  type = "text",
  wrapperClass,
  labelClass,
  description,
  className,
  required,
  disabled,
  ...props
}: FormInputTextProps<T>) {
  const { t } = useTranslation("common")
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === "password"

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("space-y-2", wrapperClass)}>
          <FormLabel className={cn("text-foreground", labelClass)}>
            {label}
            {required ? <span className="text-destructive ml-1">*</span> : null}
          </FormLabel>
          <div className="relative">
            <FormControl>
              <Input
                {...field}
                {...props}
                disabled={disabled}
                type={isPassword && showPassword ? "text" : type}
                value={
                  typeof field.value === "string" || typeof field.value === "number"
                    ? field.value
                    : ""
                }
                className={cn(isPassword && "pr-10", className)}
              />
            </FormControl>
            {isPassword ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors disabled:opacity-50"
                aria-label={
                  showPassword ? t("hidePassword") : t("showPassword")
                }
              >
                {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            ) : null}
          </div>
          {description ? (
            <p className="text-muted-foreground text-xs">{description}</p>
          ) : null}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  )
}

export default FormInputText
