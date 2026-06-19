import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"

import { AuthCardSection } from "@/features/auth/components/auth-card-section"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"
import { VerifyOtpForm } from "@/features/auth/components/verify-otp-form"

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
  const [searchParams] = useSearchParams()
  const mode = searchParams.get("mode")
  const isForgotPasswordFlow = mode === "forgot"
  const emailFromQuery = searchParams.get("email") || ""
  const emailLocked = Boolean(emailFromQuery.trim())

  const subtitle = emailFromQuery.trim() ? (
    <>
      {t("verifyOtp.sentTo")}{" "}
      <span className="font-medium text-foreground">{maskEmail(emailFromQuery)}</span>.
    </>
  ) : (
    t("verifyOtp.openLinkHint")
  )

  return (
    <AuthPageShell>
      <AuthCardSection title={t("verifyOtp.title")} subtitle={subtitle}>
        <VerifyOtpForm
          defaultEmail={emailFromQuery}
          emailLocked={emailLocked}
          isForgotPasswordFlow={isForgotPasswordFlow}
        />
      </AuthCardSection>
    </AuthPageShell>
  )
}
