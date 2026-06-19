import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"

import { AuthCardSection } from "@/features/auth/components/auth-card-section"
import { AuthInlineLink } from "@/features/auth/components/auth-link-footer"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"
import { SignupForm } from "@/features/auth/components/signup-form"

export default function SignupPage() {
  const { t } = useTranslation("auth")
  const [searchParams] = useSearchParams()
  const nextParam = searchParams.get("next")?.trim()

  return (
    <AuthPageShell>
      <AuthCardSection
        title={t("signUp.title")}
        subtitle={t("signUpSubtitle")}
        footer={
          <p>
            {t("signUp.hasAccount")}{" "}
            <AuthInlineLink
              to={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : "/login"}
            >
              {t("signUp.signIn")}
            </AuthInlineLink>
          </p>
        }
      >
        <SignupForm />
      </AuthCardSection>
    </AuthPageShell>
  )
}
