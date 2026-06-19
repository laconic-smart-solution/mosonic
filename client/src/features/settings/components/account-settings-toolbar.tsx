import { Loader2, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

type AccountSettingsToolbarProps = {
  onSyncAccounts: () => void
  syncBusy: boolean
}

export function AccountSettingsToolbar({
  onSyncAccounts,
  syncBusy,
}: AccountSettingsToolbarProps) {
  const { t } = useTranslation("settings")

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={onSyncAccounts} disabled={syncBusy}>
        {syncBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
        {t("toolbar.syncAccounts")}
      </Button>
    </div>
  )
}
