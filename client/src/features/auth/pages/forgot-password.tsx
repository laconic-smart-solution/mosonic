import { useMutation } from "@tanstack/react-query"
import { KeyRound } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LanguageSwitcher } from "@/components/language-switcher"
import { toast } from "sonner"

import { authFlowErrorMessage, resendOtp } from "@/features/auth/api/auth-flow-api"
import { AuthCardPanel } from "@/features/auth/components/auth-card-panel"
import { AuthInlineLink, AuthLinkFooter } from "@/features/auth/components/auth-link-footer"
import { AuthPageHeader } from "@/features/auth/components/auth-page-header"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"

export default function ForgotPasswordPage() {
  const { t } = useTranslation("auth")
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextParam = searchParams.get("next")?.trim()

  const [email, setEmail] = useState("")

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = email.trim()
      if (!trimmed) {
        throw new Error(t("forgotPassword.emailRequired"))
      }
      await resendOtp(trimmed)
      return trimmed
    },
    onSuccess: (trimmedEmail) => {
      toast.success(t("forgotPassword.success"))
      navigate(`/verify-otp?mode=forgot&email=${encodeURIComponent(trimmedEmail)}`, {
        replace: true,
      })
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error && e.message === t("forgotPassword.emailRequired")
          ? e.message
          : authFlowErrorMessage(e, t("forgotPassword.failed")),
      ),
  })

  return (
    <AuthPageShell>
      <div className="mb-4 flex justify-end">
        <LanguageSwitcher />
      </div>
      <AuthCardPanel>
        <CardHeader className="space-y-0 border-b border-border/60 pb-6">
          <AuthPageHeader
            icon={KeyRound}
            title={t("forgotPassword.title")}
            description={t("forgotPassword.description")}
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="email">{t("forgotPassword.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder={t("forgotPassword.emailPlaceholder")}
            />
          </div>
          <Button
            className="w-full"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
          </Button>
          <AuthLinkFooter>
            <p>
              {t("forgotPassword.backToSignIn")}{" "}
              <AuthInlineLink
                to={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : "/login"}
              >
                {t("forgotPassword.signIn")}
              </AuthInlineLink>
            </p>
          </AuthLinkFooter>
        </CardContent>
      </AuthCardPanel>
    </AuthPageShell>
  )
}
