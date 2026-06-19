import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"

import { AuthCardSection } from "@/features/auth/components/auth-card-section"
import { AuthTextLink, AuthLinkFooter } from "@/features/auth/components/auth-link-footer"
import { LoginForm } from "@/features/auth/components/login-form"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"

export default function LoginPage() {
  const { t } = useTranslation("auth")
  const [searchParams] = useSearchParams()

  const next = searchParams.get("next")?.trim() || "/dashboard"

  const signupHref = useMemo(
    () => (next !== "/dashboard" ? `/signup?next=${encodeURIComponent(next)}` : "/signup"),
    [next],
  )
  const forgotHref = useMemo(
    () =>
      next !== "/dashboard" ? `/forgot-password?next=${encodeURIComponent(next)}` : "/forgot-password",
    [next],
  )

  return (
    <AuthPageShell>
      <AuthCardSection
        title={t("welcomeBack")}
        subtitle={t("signInSubtitle")}
        footer={
          <AuthLinkFooter>
            <AuthTextLink to={forgotHref}>{t("signIn.forgotPassword")}</AuthTextLink>
            <span>
              {t("signIn.noAccount")}{" "}
              <AuthTextLink to={signupHref}>{t("signIn.createOne")}</AuthTextLink>
            </span>
          </AuthLinkFooter>
        }
      >
        <LoginForm />
      </AuthCardSection>
    </AuthPageShell>
  )
}
