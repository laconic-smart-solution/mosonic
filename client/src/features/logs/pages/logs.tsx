import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { PageShell } from "@/components/app/page-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"

export default function LogsPage() {
  const { t } = useTranslation("logs")

  return (
    <PageShell>
      <div className="flex w-full flex-col gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("page.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("activity.title")}</CardTitle>
            <CardDescription>{t("activity.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to="/dashboard"
              className={cn(buttonVariants({ variant: "secondary" }))}
            >
              {t("activity.openDashboard")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
