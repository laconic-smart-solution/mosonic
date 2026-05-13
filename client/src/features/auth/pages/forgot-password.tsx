import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

import { authFlowErrorMessage, resendOtp } from "@/features/auth/api/auth-flow-api"

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
    <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Forgot password</CardTitle>
          <CardDescription>We&apos;ll email you a code to verify your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <p className="text-center text-sm text-muted-foreground">
            Back to{" "}
            <Link
              className="text-primary underline underline-offset-4"
              to={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : "/login"}
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
