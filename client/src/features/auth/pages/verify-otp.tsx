import { useMutation } from "@tanstack/react-query"
import { MailCheck } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { LanguageSwitcher } from "@/components/language-switcher"
import { toast } from "sonner"

import { me } from "@/features/admin/api/auth-api"
import { authFlowErrorMessage, resendOtp, verifyOtp } from "@/features/auth/api/auth-flow-api"
import { AuthCardPanel } from "@/features/auth/components/auth-card-panel"
import { AuthOtpBlock } from "@/features/auth/components/auth-otp-block"
import { AuthPageHeader } from "@/features/auth/components/auth-page-header"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"
import { mapLocalUserToUser } from "@/shared/lib/map-local-user"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

function maskEmail(raw: string): string {
  const email = raw.trim()
  const at = email.indexOf("@")
  if (at <= 0) return "****"
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (!local || !domain) return "****"
  const visibleLen = Math.min(6, Math.max(1, local.length - 1))
  return `${local.slice(0, visibleLen)}****@${domain}`
}

export default function VerifyOtpPage() {
  const { t } = useTranslation("auth")
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get("mode")
  const isForgotPasswordFlow = mode === "forgot"
  const emailFromQuery = searchParams.get("email") || ""
  const next = searchParams.get("next")?.trim() || "/dashboard"

  const [emailTouched, setEmailTouched] = useState(false)
  const [emailInput, setEmailInput] = useState("")
  const email = emailTouched ? emailInput : emailFromQuery || emailInput

  const setEmail = (value: string) => {
    setEmailTouched(true)
    setEmailInput(value)
  }

  const [otp, setOtp] = useState("")
  const setSession = useAuthStore((s) => s.setSession)
  const setUser = useUserStore((s) => s.setUser)

  const canSubmit = useMemo(() => otp.length === 6 && !!email.trim(), [email, otp.length])

  const resendMutation = useMutation({
    mutationFn: () => {
      const trimmed = email.trim()
      if (!trimmed) throw new Error(t("verifyOtp.resendEmailRequired"))
      return resendOtp(trimmed)
    },
    onSuccess: () => toast.success(t("verifyOtp.resendSuccess")),
    onError: (e: unknown) =>
      toast.error(authFlowErrorMessage(e, t("verifyOtp.resendFailed"))),
  })

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!canSubmit) throw new Error(t("verifyOtp.enterCode"))
      const res = await verifyOtp({ email: email.trim(), otp })
      if (!res.accessToken) {
        throw new Error(t("verifyOtp.tokenMissing"))
      }
      return res
    },
    onSuccess: async (res) => {
      if (isForgotPasswordFlow) {
        navigate(
          `/reset-password?email=${encodeURIComponent(email.trim())}&token=${encodeURIComponent(res.accessToken!)}`,
          { replace: true },
        )
        return
      }

      if (!res.refreshToken || !res.accessToken) {
        toast.error(t("verifyOtp.noRefreshToken"))
        return
      }

      const accessToken = res.accessToken
      const refreshToken = res.refreshToken

      setSession({
        accessToken,
        refreshToken,
      })

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
    onError: (e: unknown) =>
      toast.error(authFlowErrorMessage(e, t("verifyOtp.failed"))),
  })

  const emailLocked = Boolean(emailFromQuery.trim())

  return (
    <AuthPageShell>
      <div className="mb-4 flex justify-end">
        <LanguageSwitcher />
      </div>
      <AuthCardPanel>
        <CardHeader className="space-y-0 border-b border-border/60 pb-6">
          <AuthPageHeader
            icon={MailCheck}
            title={t("verifyOtp.title")}
            description={
              email.trim() ? (
                <>
                  {t("verifyOtp.sentTo")}{" "}
                  <span className="font-medium text-foreground">{maskEmail(email)}</span>.
                </>
              ) : (
                t("verifyOtp.openLinkHint")
              )
            }
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="verify-email">{t("verifyOtp.email")}</Label>
            <Input
              id="verify-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={emailLocked}
              className={emailLocked ? "bg-muted/50 text-muted-foreground" : undefined}
            />
          </div>

          <AuthOtpBlock>
            <InputOTP maxLength={6} value={otp} onChange={setOtp}>
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

          <Button
            className="w-full"
            disabled={!canSubmit || verifyMutation.isPending}
            onClick={() => verifyMutation.mutate()}
          >
            {verifyMutation.isPending
              ? t("verifyOtp.submitting")
              : isForgotPasswordFlow
                ? t("verifyOtp.submitForgot")
                : t("verifyOtp.submitSignup")}
          </Button>

          <Button
            variant="outline"
            className="w-full"
            disabled={resendMutation.isPending}
            onClick={() => resendMutation.mutate()}
          >
            {resendMutation.isPending
              ? t("verifyOtp.resendSubmitting")
              : t("verifyOtp.resend")}
          </Button>
        </CardContent>
      </AuthCardPanel>
    </AuthPageShell>
  )
}
