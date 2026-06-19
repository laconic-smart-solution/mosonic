import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import FormInputText from "@/components/common/form/form-input-text"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { resendOtp, setAuthFormApiError } from "@/features/auth/api/auth-flow-api"
import { AuthFormRootError } from "@/features/auth/components/auth-form-root-error"
import {
  createForgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/shared/schemas/auth.schema"

export function ForgotPasswordForm() {
  const { t } = useTranslation("auth")
  const { t: tv } = useTranslation("validation")
  const navigate = useNavigate()

  const forgotPasswordSchema = useMemo(() => createForgotPasswordSchema(tv), [tv])

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: ForgotPasswordFormValues) => {
      const trimmed = values.email.trim()
      await resendOtp(trimmed)
      return trimmed
    },
    onSuccess: (trimmedEmail) => {
      toast.success(t("forgotPassword.success"))
      navigate(`/verify-otp?mode=forgot&email=${encodeURIComponent(trimmedEmail)}`, {
        replace: true,
      })
    },
    onError: (err: unknown) => {
      setAuthFormApiError(form.setError, err, t("forgotPassword.failed"))
    },
  })

  const onSubmit = (values: ForgotPasswordFormValues) => {
    form.clearErrors("root")
    mutation.mutate(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormInputText
          form={form}
          name="email"
          type="email"
          label={t("forgotPassword.email")}
          autoComplete="email"
          placeholder={t("forgotPassword.emailPlaceholder")}
          required
        />

        <AuthFormRootError message={form.formState.errors.root?.message} />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
        </Button>
      </form>
    </Form>
  )
}
