import { useMutation, useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"

import AdminRouteGuard from "../components/admin-route-guard"
import { adminDeleteUser, adminListUsers, adminUpdateUserRole, adminUpdateUserStatus } from "../api/admin-api"

type Role = "ADMIN" | "CUSTOMER"
type Status = "ACTIVE" | "DISABLED"

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState("")
  const [role, setRole] = useState<Role | "all">("all")
  const [status, setStatus] = useState<Status | "all">("all")

  const queryKey = useMemo(() => ["admin", "users", { q, role, status }], [q, role, status])
  const users = useQuery({
    queryKey,
    queryFn: () =>
      adminListUsers({
        q: q.trim() || undefined,
        role: role === "all" ? undefined : role,
        status: status === "all" ? undefined : status,
        page: 1,
        limit: 20,
      }),
  })

  const roleMutation = useMutation({
    mutationFn: async (args: { userId: string; role: Role }) => adminUpdateUserRole(args.userId, args.role),
    onSuccess: () => users.refetch(),
    onError: (e: any) => toast.error(e?.message ?? "Update role failed"),
  })
  const statusMutation = useMutation({
    mutationFn: async (args: { userId: string; status: Status }) => adminUpdateUserStatus(args.userId, args.status),
    onSuccess: () => users.refetch(),
    onError: (e: any) => toast.error(e?.message ?? "Update status failed"),
  })
  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => adminDeleteUser(userId),
    onSuccess: () => users.refetch(),
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  })

  return (
    <AdminRouteGuard>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Users</div>
            <div className="text-sm text-muted-foreground">Manage local users mirrored from SSO.</div>
          </div>
          <Button onClick={() => navigate("/admin/users/new")}>Create user</Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Search</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email/username/name/SSO id" />
            <div className="flex gap-2">
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                  <SelectItem value="CUSTOMER">CUSTOMER</SelectItem>
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="DISABLED">DISABLED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users.data?.data ?? []).map((u: any) => (
                  <TableRow key={u.userId}>
                    <TableCell className="font-medium">{u.email ?? "-"}</TableCell>
                    <TableCell>{u.username ?? "-"}</TableCell>
                    <TableCell>{u.role}</TableCell>
                    <TableCell>{u.status}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={roleMutation.isPending}
                          onClick={() =>
                            roleMutation.mutate({
                              userId: u.userId,
                              role: u.role === "ADMIN" ? "CUSTOMER" : "ADMIN",
                            })
                          }
                        >
                          Toggle role
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={statusMutation.isPending}
                          onClick={() =>
                            statusMutation.mutate({
                              userId: u.userId,
                              status: u.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                            })
                          }
                        >
                          Toggle status
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(u.userId)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!users.isFetching && (users.data?.data?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No users
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminRouteGuard>
  )
}

