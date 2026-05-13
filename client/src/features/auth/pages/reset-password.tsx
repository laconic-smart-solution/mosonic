import { useMutation } from "@tanstack/react-query"
import { Lock } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { CardContent, CardHeader } from "@/components/ui/card"
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
        throw new Error("Missing token or invalid passwords.")
      }
      await changePassword(newPassword, accessToken)
    },
    onSuccess: () => {
      clearUser()
      clearSession()
      toast.success("Password updated. Sign in with your new password.")
      navigate("/login", { replace: true })
    },
    onError: (e: unknown) =>
      toast.error(authFlowErrorMessage(e, "Password reset failed. Please try again.")),
  })

  return (
    <AuthPageShell>
      <AuthCardPanel>
        <CardHeader className="space-y-0 border-b border-border/60 pb-6">
          <AuthPageHeader
            icon={Lock}
            title="Reset password"
            description={
              email
                ? `Choose a new password for ${email}.`
                : "Choose a new password for your account."
            }
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {!accessToken && (
            <AuthAlertInline>
              Missing reset token. Go back to{" "}
              <AuthInlineLink to="/forgot-password">forgot password</AuthInlineLink> and verify your OTP
              again.
            </AuthAlertInline>
          )}
          <AuthPasswordField
            id="new-password"
            label="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            disabled={!accessToken}
          />
          <AuthPasswordField
            id="confirm-password"
            label="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={!accessToken}
          />
          <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>
          <Button
            className="w-full"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Updating…" : "Update password"}
          </Button>
          <AuthLinkFooter>
            <AuthTextLink to="/login">Back to sign in</AuthTextLink>
          </AuthLinkFooter>
        </CardContent>
      </AuthCardPanel>
    </AuthPageShell>
  )
}
