import { useMutation } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

import { login, me } from "@/features/admin/api/auth-api"
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
    <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Sign in using your Authorize Server credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <Button
            className="w-full"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Signing in..." : "Sign in"}
          </Button>

          <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
            <Link className="text-primary underline underline-offset-4" to={forgotHref}>
              Forgot password?
            </Link>
            <span>
              No account?{" "}
              <Link className="text-primary underline underline-offset-4" to={signupHref}>
                Create one
              </Link>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
