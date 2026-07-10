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
import { changePassword, setAuthFormApiError } from "@/features/auth/api/auth-flow-api"
import { AuthFormRootError } from "@/features/auth/components/auth-form-root-error"
import {
  createResetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/shared/schemas/auth.schema"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

export function ResetPasswordForm() {
  const { t } = useTranslation("auth")
  const { t: tv } = useTranslation("validation")
  const navigate = useNavigate()
  const clearSession = useAuthStore((s) => s.clearSession)
  const clearUser = useUserStore((s) => s.clearUser)

  const resetPasswordSchema = useMemo(() => createResetPasswordSchema(tv), [tv])

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: ResetPasswordFormValues) => {
      await changePassword(values.newPassword)
    },
    onSuccess: () => {
      clearUser()
      clearSession()
      toast.success(t("resetPassword.success"))
      navigate("/login", { replace: true })
    },
    onError: (err: unknown) => {
      setAuthFormApiError(form.setError, err, t("resetPassword.failed"))
    },
  })

  const onSubmit = (values: ResetPasswordFormValues) => {
    form.clearErrors("root")
    mutation.mutate(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormInputText
          form={form}
          name="newPassword"
          type="password"
          label={t("resetPassword.newPassword")}
          autoComplete="new-password"
          required
        />
        <FormInputText
          form={form}
          name="confirmPassword"
          type="password"
          label={t("resetPassword.confirmPassword")}
          autoComplete="new-password"
          required
        />
        <p className="text-muted-foreground text-xs">{t("resetPassword.hint")}</p>

        <AuthFormRootError message={form.formState.errors.root?.message} />

        <Button
          type="submit"
          className="w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? t("resetPassword.submitting") : t("resetPassword.submit")}
        </Button>
      </form>
    </Form>
  )
}
