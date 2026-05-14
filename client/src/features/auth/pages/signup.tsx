import { useMutation } from "@tanstack/react-query"
import { motion, useReducedMotion } from "framer-motion"
import { UserPlus } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

import { authFlowErrorMessage, signup } from "@/features/auth/api/auth-flow-api"
import { AuthCardPanel } from "@/features/auth/components/auth-card-panel"
import { AuthInlineLink, AuthLinkFooter } from "@/features/auth/components/auth-link-footer"
import { AuthPageHeader } from "@/features/auth/components/auth-page-header"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"
import { AuthPasswordField } from "@/features/auth/components/auth-password-field"

export default function SignupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextParam = searchParams.get("next")?.trim()
  const reduceMotion = useReducedMotion()

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    loginName: "",
    loginEmail: "",
    password: "",
    phoneNumber: "",
  })

  const verifyHref = useMemo(() => {
    const emailQ = `email=${encodeURIComponent(form.loginEmail.trim())}`
    const nextQ = nextParam ? `&next=${encodeURIComponent(nextParam)}` : ""
    return `/verify-otp?${emailQ}${nextQ}`
  }, [form.loginEmail, nextParam])

  const canSubmit = useMemo(
    () =>
      Boolean(
        form.firstName.trim() &&
          form.lastName.trim() &&
          form.loginName.trim() &&
          form.loginEmail.trim() &&
          form.password,
      ),
    [form],
  )

  const mutation = useMutation({
    mutationFn: async () => {
      const email = form.loginEmail.trim()
      await signup({
        email,
        username: form.loginName.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(form.phoneNumber.trim() ? { phoneNumber: form.phoneNumber.trim() } : {}),
      })
      return email
    },
    onSuccess: () => {
      toast.success("Account created — verify the code we sent to your email.")
      navigate(verifyHref, { replace: true })
    },
    onError: (e: unknown) =>
      toast.error(authFlowErrorMessage(e, "Sign up failed. Please try again.")),
  })

  const nameCellProps = reduceMotion
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
      }

  return (
    <AuthPageShell>
      <AuthCardPanel>
        <CardHeader className="space-y-0 border-b border-border/60 pb-6">
          <AuthPageHeader
            icon={UserPlus}
            title="Create account"
            description="Sign up, then verify the OTP sent to your email."
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-3">
            <motion.div
              {...nameCellProps}
              transition={
                reduceMotion
                  ? undefined
                  : { type: "spring", stiffness: 400, damping: 30, delay: 0 }
              }
            >
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                  autoComplete="given-name"
                />
              </div>
            </motion.div>
            <motion.div
              {...nameCellProps}
              transition={
                reduceMotion
                  ? undefined
                  : { type: "spring", stiffness: 400, damping: 30, delay: 0.06 }
              }
            >
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                  autoComplete="family-name"
                />
              </div>
            </motion.div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={form.loginName}
              onChange={(e) => setForm((p) => ({ ...p, loginName: e.target.value }))}
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.loginEmail}
              onChange={(e) => setForm((p) => ({ ...p, loginEmail: e.target.value }))}
              autoComplete="email"
            />
          </div>
          <AuthPasswordField
            id="password"
            label="Password"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            autoComplete="new-password"
          />
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone (optional)</Label>
            <Input
              id="phoneNumber"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1 234 567 8900"
              value={form.phoneNumber}
              onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))}
            />
          </div>

          <Button
            className="w-full"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Creating account..." : "Sign up"}
          </Button>

          <AuthLinkFooter>
            <p>
              Already have an account?{" "}
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
