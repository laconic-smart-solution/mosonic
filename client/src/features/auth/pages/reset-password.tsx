import { useMutation } from "@tanstack/react-query"
import { Lock } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { CardContent, CardHeader } from "@/components/ui/card"
import { LanguageSwitcher } from "@/components/language-switcher"
import { toast } from "sonner"

import { authFlowErrorMessage, changePassword } from "@/features/auth/api/auth-flow-api"
import { AuthAlertInline } from "@/features/auth/components/auth-alert-inline"
import { AuthCardPanel } from "@/features/auth/components/auth-card-panel"
import { AuthInlineLink, AuthLinkFooter, AuthTextLink } from "@/features/auth/components/auth-link-footer"
import { AuthPageHeader } from "@/features/auth/components/auth-page-header"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"
import { AuthPasswordField } from "@/features/auth/components/auth-password-field"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

export default function ResetPasswordPage() {
  const { t } = useTranslation("auth")
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tokenFromQuery = searchParams.get("token") || ""
  const email = searchParams.get("email") || ""
  const storeToken = useAuthStore((s) => s.accessToken)
  const accessToken = tokenFromQuery || storeToken || ""

  const clearSession = useAuthStore((s) => s.clearSession)
  const clearUser = useUserStore((s) => s.clearUser)

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const canSubmit = useMemo(
    () =>
      Boolean(accessToken) &&
      newPassword.length >= 8 &&
      newPassword === confirmPassword,
    [accessToken, confirmPassword, newPassword],
  )

  const mutation = useMutation({
    mutationFn: async () => {
      if (!canSubmit || !accessToken) {
        throw new Error(t("resetPassword.invalidPasswords"))
      }
      await changePassword(newPassword, accessToken)
    },
    onSuccess: () => {
      clearUser()
      clearSession()
      toast.success(t("resetPassword.success"))
      navigate("/login", { replace: true })
    },
    onError: (e: unknown) =>
      toast.error(authFlowErrorMessage(e, t("resetPassword.failed"))),
  })

  return (
    <AuthPageShell>
      <div className="mb-4 flex justify-end">
        <LanguageSwitcher />
      </div>
      <AuthCardPanel>
        <CardHeader className="space-y-0 border-b border-border/60 pb-6">
          <AuthPageHeader
            icon={Lock}
            title={t("resetPassword.title")}
            description={
              email
                ? t("resetPassword.descriptionWithEmail", { email })
                : t("resetPassword.descriptionGeneric")
            }
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {!accessToken && (
            <AuthAlertInline>
              {t("resetPassword.missingToken")}{" "}
              <AuthInlineLink to="/forgot-password">
                {t("resetPassword.forgotPasswordLink")}
              </AuthInlineLink>{" "}
              {t("resetPassword.verifyAgain")}
            </AuthAlertInline>
          )}
          <AuthPasswordField
            id="new-password"
            label={t("resetPassword.newPassword")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            disabled={!accessToken}
          />
          <AuthPasswordField
            id="confirm-password"
            label={t("resetPassword.confirmPassword")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={!accessToken}
          />
          <p className="text-xs text-muted-foreground">{t("resetPassword.hint")}</p>
          <Button
            className="w-full"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t("resetPassword.submitting") : t("resetPassword.submit")}
          </Button>
          <AuthLinkFooter>
            <AuthTextLink to="/login">{t("resetPassword.backToSignIn")}</AuthTextLink>
          </AuthLinkFooter>
        </CardContent>
      </AuthCardPanel>
    </AuthPageShell>
  )
}
