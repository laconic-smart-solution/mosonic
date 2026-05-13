import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { adminGetUserStats } from "../api/admin-api"

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  )
}

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const stats = useQuery({
    queryKey: ["admin", "stats", "users"],
    queryFn: adminGetUserStats,
  })

  return (
    <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Admin</div>
            <div className="text-sm text-muted-foreground">User management and stats.</div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/admin/users")}>
              Users
            </Button>
            <Button onClick={() => navigate("/admin/users/new")}>Create user</Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Total users" value={stats.data?.total ?? 0} />
          <StatCard title="Admins" value={stats.data?.admins ?? 0} />
          <StatCard title="Customers" value={stats.data?.customers ?? 0} />
          <StatCard title="Disabled" value={stats.data?.disabled ?? 0} />
          <StatCard title="New (7d)" value={stats.data?.new7d ?? 0} />
          <StatCard title="New (30d)" value={stats.data?.new30d ?? 0} />
        </div>
      </div>
  )
}

