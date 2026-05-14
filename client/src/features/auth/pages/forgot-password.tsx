import { useMutation } from "@tanstack/react-query"
import { KeyRound } from "lucide-react"
import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

import { authFlowErrorMessage, resendOtp } from "@/features/auth/api/auth-flow-api"
import { AuthCardPanel } from "@/features/auth/components/auth-card-panel"
import { AuthInlineLink, AuthLinkFooter } from "@/features/auth/components/auth-link-footer"
import { AuthPageHeader } from "@/features/auth/components/auth-page-header"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextParam = searchParams.get("next")?.trim()

  const [email, setEmail] = useState("")

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = email.trim()
      if (!trimmed) {
        throw new Error("Email is required.")
      }
      await resendOtp(trimmed)
      return trimmed
    },
    onSuccess: (trimmedEmail) => {
      toast.success("If an account exists, we sent a verification code.")
      navigate(`/verify-otp?mode=forgot&email=${encodeURIComponent(trimmedEmail)}`, {
        replace: true,
      })
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error && e.message === "Email is required."
          ? e.message
          : authFlowErrorMessage(e, "Unable to send OTP. Please try again."),
      ),
  })

  return (
    <AuthPageShell>
      <AuthCardPanel>
        <CardHeader className="space-y-0 border-b border-border/60 pb-6">
          <AuthPageHeader
            icon={KeyRound}
            title="Forgot password"
            description="We'll email you a code to verify your account."
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <Button
            className="w-full"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Sending…" : "Continue to OTP"}
          </Button>
          <AuthLinkFooter>
            <p>
              Back to{" "}
              <AuthInlineLink
                to={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : "/login"}
              >
                Sign in
              </AuthInlineLink>
            </p>
          </AuthLinkFooter>
        </CardContent>
      </AuthCardPanel>
    </AuthPageShell>
  )
}
