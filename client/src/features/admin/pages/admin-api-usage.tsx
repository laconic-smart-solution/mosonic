import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"

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

  const { data, isLoading, isFetching, error, refetch } = useAdminApiUsage()
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
      <div>
        <h1 className="font-heading text-2xl tracking-tight text-foreground">
          {t("apiUsage.title")}
        </h1>
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
