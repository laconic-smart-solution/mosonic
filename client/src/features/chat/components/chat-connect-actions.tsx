import { useTranslation } from "react-i18next"
import { Link2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { channelLabel } from "@/shared/constants/distribution-channels"
import type { StartOauthMarker, StartRednoteQrMarker } from "../lib/parse-start-oauth"

/** Connect chips shown under the assistant message (not inside the step accordion). */
export function ChatConnectActions({
  oauth,
  rednote,
  onStartRednoteQr,
}: {
  oauth: StartOauthMarker[]
  rednote: StartRednoteQrMarker | null
  onStartRednoteQr?: (socketRoom: string) => void
}) {
  const { t } = useTranslation("chat")
  if (oauth.length === 0 && !rednote) return null

  return (
    <div className="flex flex-wrap gap-2">
      {oauth.map((marker) => (
        <Button
          key={marker.platform}
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => {
            window.location.href = marker.connectUrl
          }}
        >
          <Link2 data-icon="inline-start" />
          {t("stepTrace.connectAction", {
            platform: channelLabel(marker.platform) || marker.platform,
          })}
        </Button>
      ))}
      {rednote ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => onStartRednoteQr?.(rednote.socketRoom)}
        >
          <Link2 data-icon="inline-start" />
          {t("stepTrace.connectRednoteAction")}
        </Button>
      ) : null}
    </div>
  )
}
