import { useTranslation } from "react-i18next"

import { AuthCardSection } from "@/features/auth/components/auth-card-section"
import { AuthTextLink, AuthLinkFooter } from "@/features/auth/components/auth-link-footer"
import { LoginForm } from "@/features/auth/components/login-form"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"

export default function LoginPage() {
  const { t } = useTranslation("auth")

  return (
    <AuthPageShell>
      <AuthCardSection
        title={t("welcomeBack")}
        subtitle={t("signInSubtitle")}
        footer={
          <AuthLinkFooter>
            <AuthTextLink to="/forgot-password">{t("signIn.forgotPassword")}</AuthTextLink>
            <span>
              {t("signIn.noAccount")}{" "}
              <AuthTextLink to="/signup">{t("signIn.createOne")}</AuthTextLink>
            </span>
          </AuthLinkFooter>
        }
      >
        <LoginForm />
      </AuthCardSection>
    </AuthPageShell>
  )
}
