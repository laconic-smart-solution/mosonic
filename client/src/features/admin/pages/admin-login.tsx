import { useMutation } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

import { login, me } from "../api/auth-api"
import { useAuthStore } from "@/shared/stores/auth.store"

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const canSubmit = useMemo(() => username.trim() && password.trim(), [username, password])

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await login({ username: username.trim(), password })
      if (!res.accessToken || !res.refreshToken) {
        throw new Error("Login succeeded but token missing in response")
      }
      setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken })

      // Fetch /auth/me to learn local role (ADMIN/CUSTOMER)
      const meResp = await me()
      const role = meResp?.auth?.localUser?.role ?? null
      setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken, role })

      return { ...res, me: meResp }
    },
    onSuccess: () => {
      toast.success("Logged in")
      navigate("/admin", { replace: true })
    },
    onError: (e: any) => toast.error(e?.message ?? "Login failed"),
  })

  return (
    <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Admin login</CardTitle>
          <CardDescription>Sign in using your Authorize Server credentials.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Signing in..." : "Sign in"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

