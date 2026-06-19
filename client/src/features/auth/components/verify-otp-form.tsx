import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import FormInputText from "@/components/common/form/form-input-text"
import { Button } from "@/components/ui/button"
import { Form, FormField, FormItem, FormMessage } from "@/components/ui/form"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { me } from "@/features/admin/api/auth-api"
import {
  resendOtp,
  setAuthFormApiError,
  verifyOtp,
} from "@/features/auth/api/auth-flow-api"
import { AuthFormRootError } from "@/features/auth/components/auth-form-root-error"
import { AuthOtpBlock } from "@/features/auth/components/auth-otp-block"
import { mapLocalUserToUser } from "@/shared/lib/map-local-user"
import {
  createVerifyOtpSchema,
  type VerifyOtpFormValues,
} from "@/shared/schemas/auth.schema"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

type VerifyOtpFormProps = {
  defaultEmail?: string
  emailLocked?: boolean
  isForgotPasswordFlow?: boolean
  next?: string
}

export function VerifyOtpForm({
  defaultEmail = "",
  emailLocked = false,
  isForgotPasswordFlow = false,
  next = "/dashboard",
}: VerifyOtpFormProps) {
  const { t } = useTranslation("auth")
  const { t: tv } = useTranslation("validation")
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const setUser = useUserStore((s) => s.setUser)

  const verifyOtpSchema = useMemo(() => createVerifyOtpSchema(tv), [tv])

  const form = useForm<VerifyOtpFormValues>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: {
      email: defaultEmail,
      code: "",
    },
  })

  useEffect(() => {
    if (defaultEmail) {
      form.setValue("email", defaultEmail)
    }
  }, [defaultEmail, form])

  const resendMutation = useMutation({
    mutationFn: async () => {
      const email = form.getValues("email").trim()
      await resendOtp(email)
    },
    onSuccess: () => toast.success(t("verifyOtp.resendSuccess")),
    onError: (err: unknown) => {
      setAuthFormApiError(form.setError, err, t("verifyOtp.resendFailed"))
    },
  })

  const verifyMutation = useMutation({
    mutationFn: async (values: VerifyOtpFormValues) => {
      const res = await verifyOtp({ email: values.email.trim(), otp: values.code })
      if (!res.accessToken) {
        throw new Error(t("verifyOtp.tokenMissing"))
      }
      return { res, email: values.email.trim() }
    },
    onSuccess: async ({ res, email }) => {
      if (isForgotPasswordFlow) {
        navigate(
          `/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(res.accessToken!)}`,
          { replace: true },
        )
        return
      }

      if (!res.refreshToken || !res.accessToken) {
        form.setError("root", { message: t("verifyOtp.noRefreshToken") })
        return
      }

      const accessToken = res.accessToken
      const refreshToken = res.refreshToken

      setSession({ accessToken, refreshToken })

      try {
        const meResp = await me()
        const role = meResp?.auth?.localUser?.role ?? null
        setSession({
          accessToken,
          refreshToken,
          role: role ?? undefined,
        })
        const lu = meResp?.auth?.localUser
        if (lu && typeof lu === "object") {
          setUser(mapLocalUserToUser(lu as Parameters<typeof mapLocalUserToUser>[0]))
        }
      } catch {
        // session still has tokens; user can refresh profile later
      }

      toast.success(t("verifyOtp.emailVerified"))
      navigate(next, { replace: true })
    },
    onError: (err: unknown) => {
      setAuthFormApiError(form.setError, err, t("verifyOtp.failed"))
    },
  })

  const onSubmit = (values: VerifyOtpFormValues) => {
    form.clearErrors("root")
    verifyMutation.mutate(values)
  }

  const onResend = () => {
    form.clearErrors("root")
    resendMutation.mutate()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormInputText
          form={form}
          name="email"
          type="email"
          label={t("verifyOtp.email")}
          autoComplete="email"
          disabled={emailLocked}
          className={emailLocked ? "bg-muted/50 text-muted-foreground" : undefined}
          required
        />

        <FormField
          control={form.control}
          name="code"
          render={({ field, fieldState }) => (
            <FormItem>
              <AuthOtpBlock label={t("verifyOtp.code")}>
                <InputOTP
                  maxLength={6}
                  value={field.value}
                  onChange={field.onChange}
                  containerClassName="w-full justify-center"
                  aria-invalid={fieldState.invalid}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </AuthOtpBlock>
              <FormMessage className="text-center text-xs" />
            </FormItem>
          )}
        />

        <AuthFormRootError message={form.formState.errors.root?.message} />

        <Button
          type="submit"
          className="w-full"
          disabled={verifyMutation.isPending}
        >
          {verifyMutation.isPending
            ? t("verifyOtp.submitting")
            : isForgotPasswordFlow
              ? t("verifyOtp.submitForgot")
              : t("verifyOtp.submitSignup")}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={resendMutation.isPending}
          onClick={onResend}
        >
          {resendMutation.isPending
            ? t("verifyOtp.resendSubmitting")
            : t("verifyOtp.resend")}
        </Button>
      </form>
    </Form>
  )
}
