import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"

import { AuthCardSection } from "@/features/auth/components/auth-card-section"
import { AuthTextLink } from "@/features/auth/components/auth-link-footer"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form"
import { useAuthStore } from "@/shared/stores/auth.store"

export default function ResetPasswordPage() {
  const { t } = useTranslation("auth")
  const [searchParams] = useSearchParams()
  const tokenFromQuery = searchParams.get("token") || ""
  const email = searchParams.get("email") || ""
  const storeToken = useAuthStore((s) => s.accessToken)
  const accessToken = tokenFromQuery || storeToken || ""

  const subtitle = email
    ? t("resetPassword.descriptionWithEmail", { email })
    : t("resetPasswordSubtitle")

  return (
    <AuthPageShell>
      <AuthCardSection
        title={t("resetPassword.title")}
        subtitle={subtitle}
        footer={<AuthTextLink to="/login">{t("resetPassword.backToSignIn")}</AuthTextLink>}
      >
        <ResetPasswordForm accessToken={accessToken} />
      </AuthCardSection>
    </AuthPageShell>
  )
}
