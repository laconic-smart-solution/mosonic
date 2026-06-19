import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { AdminApiUsageProviderPanel } from "../components/admin-api-usage-provider-panel"
import {
  useAdminApiUsage,
  useAdminApiUsagePrepaidUpdate,
} from "../hooks/use-admin-api-usage"
import {
  API_USAGE_PROVIDER_CONFIG,
  type ApiProviderId,
} from "../types/api-usage.types"

const TAB_IDS = ["chatgpt", "heygen", "zernio"] as const
type TabId = (typeof TAB_IDS)[number]

const TAB_TO_PROVIDER: Record<TabId, ApiProviderId> = {
  chatgpt: "openai",
  heygen: "heygen",
  zernio: "zernio",
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function getDefaultDateRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 180)
  return { from: toDateInputValue(from), to: toDateInputValue(to) }
}

function parseTab(value: string | null): TabId {
  if (value && (TAB_IDS as readonly string[]).includes(value)) {
    return value as TabId
  }
  return "chatgpt"
}

export default function AdminApiUsagePage() {
  const { t } = useTranslation("admin")
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseTab(searchParams.get("tab"))
  const defaultRange = useMemo(() => getDefaultDateRange(), [])
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)

  const dateParams = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
    }),
    [from, to],
  )

  const { data, isLoading, isFetching, error, refetch } = useAdminApiUsage(dateParams)
  const openaiUpdate = useAdminApiUsagePrepaidUpdate("openai")
  const heygenUpdate = useAdminApiUsagePrepaidUpdate("heygen")
  const zernioUpdate = useAdminApiUsagePrepaidUpdate("zernio")

  const updateByProvider = useMemo(
    () => ({
      openai: openaiUpdate,
      heygen: heygenUpdate,
      zernio: zernioUpdate,
    }),
    [openaiUpdate, heygenUpdate, zernioUpdate],
  )

  const providerId = TAB_TO_PROVIDER[activeTab]
  const config = API_USAGE_PROVIDER_CONFIG[providerId]
  const providerData = data?.[providerId]
  const updateMutation = updateByProvider[providerId]

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl tracking-tight text-foreground">
            {t("apiUsage.title")}
          </h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="api-usage-from" className="text-[12px] text-muted-foreground">
              {t("apiUsage.dateFrom")}
            </Label>
            <Input
              id="api-usage-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40 [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="api-usage-to" className="text-[12px] text-muted-foreground">
              {t("apiUsage.dateTo")}
            </Label>
            <Input
              id="api-usage-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40 [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setSearchParams({ tab: value })
        }}
      >
        <TabsList variant="default" aria-label={t("apiUsage.tabsLabel")}>
          {TAB_IDS.map((tabId) => (
            <TabsTrigger key={tabId} value={tabId}>
              {t(`apiUsage.tabs.${tabId}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <AdminApiUsageProviderPanel
        key={providerId}
        providerId={providerId}
        i18nPrefix={config.i18nPrefix}
        brandColor={config.brandColor}
        billingUrl={config.billingUrl}
        data={providerData}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRefresh={() => {
          void refetch()
        }}
        onSavePrepaid={(amount) => updateMutation.mutateAsync(amount)}
        isSaving={updateMutation.isPending}
      />
    </div>
  )
}
