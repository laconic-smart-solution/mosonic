import { Link } from "react-router-dom"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"

export default function LogsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="text-sm text-muted-foreground">
          System and workflow logs will appear here as this area is built out.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>
            For recent workspace activity, use the dashboard in the meantime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            to="/dashboard"
            className={cn(buttonVariants({ variant: "secondary" }))}
          >
            Open dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
