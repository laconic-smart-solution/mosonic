import { useMutation } from "@tanstack/react-query"
import { LogIn } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

import { login, me } from "@/features/admin/api/auth-api"
import { AuthCardPanel } from "@/features/auth/components/auth-card-panel"
import { AuthLinkFooter, AuthTextLink } from "@/features/auth/components/auth-link-footer"
import { AuthPageHeader } from "@/features/auth/components/auth-page-header"
import { AuthPageShell } from "@/features/auth/components/auth-page-shell"
import { AuthPasswordField } from "@/features/auth/components/auth-password-field"
import { mapLocalUserToUser } from "@/shared/lib/map-local-user"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setSession = useAuthStore((s) => s.setSession)
  const setUser = useUserStore((s) => s.setUser)

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

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

  const canSubmit = useMemo(() => username.trim() && password.trim(), [username, password])

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await login({ username: username.trim(), password })
      if (!res.accessToken || !res.refreshToken) {
        throw new Error("Login succeeded but token missing in response")
      }
      setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken })

      const meResp = await me()
      const role = meResp?.auth?.localUser?.role ?? null
      setSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        role: role ?? undefined,
      })

      const lu = meResp?.auth?.localUser
      if (lu && typeof lu === "object") {
        setUser(mapLocalUserToUser(lu as Parameters<typeof mapLocalUserToUser>[0]))
      }

      return { ...res, me: meResp }
    },
    onSuccess: () => {
      toast.success("Logged in")
      navigate(next, { replace: true })
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Login failed"),
  })

  return (
    <AuthPageShell>
      <AuthCardPanel>
        <CardHeader className="space-y-0 border-b border-border/60 pb-6">
          <AuthPageHeader
            icon={LogIn}
            title="Sign in"
            description="Sign in using your Authorize Server credentials."
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <AuthPasswordField
            id="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <Button
            className="w-full"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Signing in..." : "Sign in"}
          </Button>

          <AuthLinkFooter>
            <AuthTextLink to={forgotHref}>Forgot password?</AuthTextLink>
            <span>
              No account? <AuthTextLink to={signupHref}>Create one</AuthTextLink>
            </span>
          </AuthLinkFooter>
        </CardContent>
      </AuthCardPanel>
    </AuthPageShell>
  )
}
