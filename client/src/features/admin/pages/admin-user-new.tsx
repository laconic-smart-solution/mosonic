import { useMutation } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

import { adminCreateUser } from "../api/admin-api"

type Role = "ADMIN" | "CUSTOMER"

export default function AdminUserNewPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [role, setRole] = useState<Role>("CUSTOMER")

  const canSubmit = useMemo(() => email.trim() && username.trim() && password.trim(), [email, username, password])

  const mutation = useMutation({
    mutationFn: async () => {
      return await adminCreateUser({
        email: email.trim(),
        username: username.trim(),
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        role,
      })
    },
    onSuccess: () => {
      toast.success("User created")
      navigate("/admin/users")
    },
    onError: (e: any) => toast.error(e?.message ?? "Create user failed"),
  })

  return (
      <div className="space-y-6 p-6">
        <div>
          <div className="text-xl font-semibold">Create user</div>
          <div className="text-sm text-muted-foreground">Creates user in SSO then saves local user with selected role.</div>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>User details</CardTitle>
            <CardDescription>These fields are sent to Authorize Server sign-up.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
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
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                    <SelectItem value="CUSTOMER">CUSTOMER</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Creating..." : "Create"}
            </Button>
          </CardContent>
        </Card>
      </div>
  )
}

