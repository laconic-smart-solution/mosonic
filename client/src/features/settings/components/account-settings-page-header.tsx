import type { ReactNode } from "react"
import { UserCog } from "lucide-react"
import { useTranslation } from "react-i18next"


type AccountSettingsPageHeaderProps = {
  className?: string
  /** Primary actions (e.g. profile + sync) aligned to the right on wide viewports. */
  actions?: ReactNode
}

export function AccountSettingsPageHeader({ className, actions }: AccountSettingsPageHeaderProps) {
  const { t } = useTranslation("settings")

  return (
    <header className={className}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <UserCog className="size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
            <h1 className="font-heading m-0 text-[26px] leading-tight tracking-tight text-foreground">
              {t("page.title")}
            </h1>
          </div>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {t("page.subtitle")}
          </p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 lg:pt-0.5">{actions}</div> : null}
      </div>
    </header>
  )
}
