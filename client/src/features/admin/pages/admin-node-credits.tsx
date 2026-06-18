import { useEffect, useMemo, useState } from "react"
import { Save } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { useAdminCreditConfig } from "../hooks/use-admin-credit"
import {
  useAdminNodeCreditUpdate,
  useAdminNodeCredits,
} from "../hooks/use-admin-node-credits"
import { creditsFromCostUsd } from "../lib/compute-node-credits"

const panelClass =
  "overflow-hidden rounded-2xl border border-border bg-card"

type NodeCreditRow = {
  nodeType: string
  costUsd: number
  costCredit: number
  isActive: boolean
  creditPriceUsd?: number
  marginTarget?: number
  overheadFactor?: number
}

const EMPTY_NODE_CREDIT_ROWS: NodeCreditRow[] = []

export default function AdminNodeCreditsPage() {
  const { t } = useTranslation("admin")
  const { t: tWorkflow } = useTranslation("workflow")
  const {
    data,
    isLoading,
    isError,
    error,
  } = useAdminNodeCredits()
  const rows = data ?? EMPTY_NODE_CREDIT_ROWS
  const { data: creditConfig } = useAdminCreditConfig()
  const update = useAdminNodeCreditUpdate()

  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const calcConfig = useMemo(
    () => ({
      creditPriceUsd: Number(creditConfig?.creditPriceUsd ?? 0.01),
      marginTarget: Number(creditConfig?.marginTarget ?? 3),
      overheadFactor: Number(creditConfig?.overheadFactor ?? 0),
    }),
    [creditConfig],
  )

  useEffect(() => {
    if (!data?.length) return
    const next: Record<string, string> = {}
    for (const row of data) {
      next[row.nodeType] = String(row.costUsd)
    }
    setDrafts((prev) => {
      const keys = Object.keys(next)
      if (
        keys.length === Object.keys(prev).length &&
        keys.every((k) => prev[k] === next[k])
      ) {
        return prev
      }
      return next
    })
  }, [data])

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.nodeType.localeCompare(b.nodeType)),
    [rows],
  )

  function nodeTypeLabel(nodeType: string): string {
    return tWorkflow(
      `nodeTypesBackend.${nodeType}` as "nodeTypesBackend.text_generation",
      { defaultValue: nodeType.replace(/_/g, " ") },
    )
  }

  function previewCredits(nodeType: string, fallbackUsd: number): number {
    const raw = drafts[nodeType]?.trim()
    const costUsd = raw !== "" ? Number(raw) : fallbackUsd
    if (!Number.isFinite(costUsd) || costUsd <= 0) return 0
    return creditsFromCostUsd(costUsd, calcConfig)
  }

  function handleSave(nodeType: string) {
    const raw = drafts[nodeType]?.trim() ?? ""
    const costUsd = Number(raw)
    if (!Number.isFinite(costUsd) || costUsd <= 0) {
      toast.error(t("nodeCredits.invalidUsd"))
      return
    }
    update.mutate(
      { nodeType, costUsd },
      {
        onSuccess: () => toast.success(t("nodeCredits.saved")),
        onError: () => toast.error(t("nodeCredits.saveFailed")),
      },
    )
  }

  return (
    <div className="min-h-full bg-background px-7 py-8 pb-20">
      <div className="mx-auto max-w-[860px] space-y-6">
        <div>
          <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
            {t("nodeCredits.title")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("nodeCredits.subtitle")}{" "}
            <Link
              to="/admin/credit"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("nodeCredits.creditSettingsLink")}
            </Link>
            .
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("nodeCredits.creditHint")}
          </p>
        </div>

        <div className={panelClass}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("nodeCredits.colMetric")}</TableHead>
                <TableHead className="w-[160px]">
                  {t("nodeCredits.colCostUsd")}
                </TableHead>
                <TableHead className="w-[120px]">
                  {t("nodeCredits.colCostCredit")}
                </TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("nodeCredits.loading")}
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-destructive"
                  >
                    {t("nodeCredits.loadFailed")}
                    {error instanceof Error && error.message
                      ? ` (${error.message})`
                      : ""}
                  </TableCell>
                </TableRow>
              ) : sortedRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("nodeCredits.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                sortedRows.map((row) => (
                  <TableRow key={row.nodeType}>
                    <TableCell className="font-medium">
                      {nodeTypeLabel(row.nodeType)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0.000001}
                        step="0.001"
                        className="h-9 font-mono tabular-nums"
                        value={drafts[row.nodeType] ?? String(row.costUsd)}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.nodeType]: e.target.value,
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm tabular-nums text-muted-foreground">
                      {previewCredits(row.nodeType, row.costUsd).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={update.isPending}
                        onClick={() => handleSave(row.nodeType)}
                      >
                        <Save className="size-4" />
                        {t("nodeCredits.save")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
