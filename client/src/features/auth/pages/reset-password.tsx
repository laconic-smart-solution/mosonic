import { useMutation } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

import { authFlowErrorMessage, changePassword } from "@/features/auth/api/auth-flow-api"
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
    <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>
            {email
              ? `Choose a new password for ${email}.`
              : "Choose a new password for your account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!accessToken && (
            <p className="text-sm text-destructive">
              Missing reset token. Go back to{" "}
              <Link className="underline underline-offset-4" to="/forgot-password">
                forgot password
              </Link>{" "}
              and verify your OTP again.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>
          <Button
            className="w-full"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Updating…" : "Update password"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link className="text-primary underline underline-offset-4" to="/login">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
