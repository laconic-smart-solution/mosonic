import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

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
import { useResendCooldown } from "@/features/auth/hooks/use-resend-cooldown"
import { mapLocalUserToUser } from "@/shared/lib/map-local-user"
import { refreshQueriesAfterLogin } from "@/shared/queries/auth.query"
import {
  createVerifyOtpSchema,
  type VerifyOtpFormValues,
} from "@/shared/schemas/auth.schema"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

const OTP_LENGTH = 6

type VerifyOtpFormProps = {
  defaultEmail?: string
  emailLocked?: boolean
  isForgotPasswordFlow?: boolean
}

export function VerifyOtpForm({
  defaultEmail = "",
  emailLocked: _emailLocked = false,
  isForgotPasswordFlow = false,
}: VerifyOtpFormProps) {
  const { t } = useTranslation("auth")
  const { t: tv } = useTranslation("validation")
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const establishSession = useAuthStore((s) => s.establishSession)
  const setUser = useUserStore((s) => s.setUser)

  const verifyOtpSchema = useMemo(() => createVerifyOtpSchema(tv), [tv])
  const { secondsLeft, canResend, restart: restartResendCooldown } =
    useResendCooldown()
  const lastAutoSubmittedCodeRef = useRef("")

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
      if (!email) {
        throw new Error(t("verifyOtp.resendEmailRequired"))
      }
      await resendOtp(email)
    },
    onSuccess: () => {
      restartResendCooldown()
      lastAutoSubmittedCodeRef.current = ""
      toast.success(t("verifyOtp.resendSuccess"))
    },
    onError: (err: unknown) => {
      setAuthFormApiError(form.setError, err, t("verifyOtp.resendFailed"))
    },
  })

  const verifyMutation = useMutation({
    mutationFn: async (values: VerifyOtpFormValues) => {
      const res = await verifyOtp({
        email: values.email.trim(),
        otp: values.code,
      })
      if (res.otpVerified === false) {
        throw new Error(t("verifyOtp.failed"))
      }
      return { res, email: values.email.trim() }
    },
    onSuccess: async ({ email }) => {
      if (isForgotPasswordFlow) {
        // Cookies are set by Nest; reset-password uses the access cookie.
        navigate(
          `/reset-password?email=${encodeURIComponent(email)}`,
          { replace: true },
        )
        return
      }

      establishSession({
        otpVerified: true,
        pendingVerifyEmail: null,
      })

      try {
        const meResp = await me()
        const role = meResp?.auth?.localUser?.role ?? null
        establishSession({
          role:
            role === "ADMIN" || role === "CUSTOMER" ? role : undefined,
          otpVerified: true,
          pendingVerifyEmail: null,
        })
        const lu = meResp?.auth?.localUser
        if (lu && typeof lu === "object") {
          setUser(
            mapLocalUserToUser(lu as Parameters<typeof mapLocalUserToUser>[0]),
          )
        }
      } catch {
        // Cookie session exists; profile can load later.
      }

      toast.success(t("verifyOtp.emailVerified"))
      await refreshQueriesAfterLogin(queryClient)
      navigate("/dashboard", { replace: true })
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
    if (!canResend || resendMutation.isPending) return
    form.clearErrors("root")
    resendMutation.mutate()
  }

  const code = form.watch("code")
  const isVerifying = verifyMutation.isPending

  useEffect(() => {
    if (code.length < OTP_LENGTH) {
      lastAutoSubmittedCodeRef.current = ""
      return
    }
    if (!/^\d{6}$/.test(code)) return
    if (isVerifying) return
    if (lastAutoSubmittedCodeRef.current === code) return

    const email = form.getValues("email").trim()
    if (!email) return

    lastAutoSubmittedCodeRef.current = code
    form.clearErrors("root")
    verifyMutation.mutate({ email, code })
  }, [code, form, isVerifying, verifyMutation])

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="code"
          render={({ field, fieldState }) => (
            <FormItem>
              <AuthOtpBlock label={t("verifyOtp.code")}>
                <InputOTP
                  maxLength={OTP_LENGTH}
                  autoFocus
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
          disabled={!canResend || resendMutation.isPending}
          onClick={onResend}
        >
          {resendMutation.isPending
            ? t("verifyOtp.resendSubmitting")
            : canResend
              ? t("verifyOtp.resend")
              : t("verifyOtp.resendIn", { seconds: secondsLeft })}
        </Button>
      </form>
    </Form>
  )
}
