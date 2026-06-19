import { useTranslation } from "react-i18next"

import { AuthCardSection } from "@/features/auth/components/auth-card-section"
import { AuthInlineLink } from "@/features/auth/components/auth-link-footer"
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"

export default function ForgotPasswordPage() {
  const { t } = useTranslation("auth")

  return (
    <AuthPageShell>
      <AuthCardSection
        title={t("forgotPassword.title")}
        subtitle={t("forgotPasswordSubtitle")}
        footer={
          <p>
            {t("forgotPassword.backToSignIn")}{" "}
            <AuthInlineLink to="/login">{t("forgotPassword.signIn")}</AuthInlineLink>
          </p>
        }
      >
        <ForgotPasswordForm />
      </AuthCardSection>
    </AuthPageShell>
  )
}
