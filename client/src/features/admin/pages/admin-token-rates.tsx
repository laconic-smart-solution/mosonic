import { useEffect, useState } from "react"
import { Save } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { PageShell } from "@/components/app/page-shell"
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

import {
  useAdminTokenRateUpdate,
  useAdminTokenRates,
} from "../hooks/use-admin-token-rates"

const panelClass =
  "overflow-hidden rounded-2xl border border-border bg-card"

type TokenRateRow = {
  provider: string
  model: string
  inputPerMToken: number
  outputPerMToken: number
  reasoningPerMToken: number | null
  sampleCredits: number
}

type Draft = {
  inputPerMToken: string
  outputPerMToken: string
  reasoningPerMToken: string
}

const EMPTY: TokenRateRow[] = []

function rowKey(row: { provider: string; model: string }) {
  return `${row.provider}:${row.model}`
}

export default function AdminTokenRatesPage() {
  const { t } = useTranslation("admin")
  const { data, isLoading, isError, error } = useAdminTokenRates()
  const rows = (data as TokenRateRow[] | undefined) ?? EMPTY
  const update = useAdminTokenRateUpdate()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  useEffect(() => {
    if (!data?.length) return
    const next: Record<string, Draft> = {}
    for (const row of data as TokenRateRow[]) {
      next[rowKey(row)] = {
        inputPerMToken: String(row.inputPerMToken),
        outputPerMToken: String(row.outputPerMToken),
        reasoningPerMToken:
          row.reasoningPerMToken == null ? "" : String(row.reasoningPerMToken),
      }
    }
    setDrafts(next)
  }, [data])

  function handleSave(row: TokenRateRow) {
    const draft = drafts[rowKey(row)]
    const inputPerMToken = Number(draft?.inputPerMToken)
    const outputPerMToken = Number(draft?.outputPerMToken)
    const reasoningRaw = draft?.reasoningPerMToken?.trim() ?? ""
    const reasoningPerMToken =
      reasoningRaw === "" ? null : Number(reasoningRaw)
    if (
      !Number.isFinite(inputPerMToken) ||
      inputPerMToken < 0 ||
      !Number.isFinite(outputPerMToken) ||
      outputPerMToken < 0 ||
      (reasoningPerMToken != null &&
        (!Number.isFinite(reasoningPerMToken) || reasoningPerMToken < 0))
    ) {
      toast.error(t("tokenRates.invalidUsd"))
      return
    }
    update.mutate(
      {
        model: row.model,
        provider: row.provider,
        inputPerMToken,
        outputPerMToken,
        reasoningPerMToken,
      },
      {
        onSuccess: () => toast.success(t("tokenRates.saved")),
        onError: () => toast.error(t("tokenRates.saveFailed")),
      },
    )
  }

  return (
    <PageShell>
      <div className="w-full space-y-6">
        <div>
          <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
            {t("tokenRates.title")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("tokenRates.subtitle")}{" "}
            <Link
              to="/admin/credit"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("tokenRates.creditSettingsLink")}
            </Link>
            .
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("tokenRates.creditHint")}
          </p>
        </div>

        <div className={panelClass}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tokenRates.colModel")}</TableHead>
                <TableHead className="w-[130px]">
                  {t("tokenRates.colInput")}
                </TableHead>
                <TableHead className="w-[130px]">
                  {t("tokenRates.colOutput")}
                </TableHead>
                <TableHead className="w-[130px]">
                  {t("tokenRates.colReasoning")}
                </TableHead>
                <TableHead className="w-[140px]">
                  {t("tokenRates.colSampleCredits")}
                </TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("tokenRates.loading")}
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-destructive"
                  >
                    {t("tokenRates.loadFailed")}
                    {error instanceof Error && error.message
                      ? ` (${error.message})`
                      : ""}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("tokenRates.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const key = rowKey(row)
                  const draft = drafts[key]
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">
                        <div>{row.model}</div>
                        <div className="text-xs font-normal text-muted-foreground">
                          {row.provider}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-9 font-mono tabular-nums"
                          value={draft?.inputPerMToken ?? String(row.inputPerMToken)}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: {
                                ...(prev[key] ?? {
                                  inputPerMToken: "",
                                  outputPerMToken: "",
                                  reasoningPerMToken: "",
                                }),
                                inputPerMToken: e.target.value,
                              },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-9 font-mono tabular-nums"
                          value={
                            draft?.outputPerMToken ?? String(row.outputPerMToken)
                          }
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: {
                                ...(prev[key] ?? {
                                  inputPerMToken: "",
                                  outputPerMToken: "",
                                  reasoningPerMToken: "",
                                }),
                                outputPerMToken: e.target.value,
                              },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-9 font-mono tabular-nums"
                          placeholder="—"
                          value={draft?.reasoningPerMToken ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: {
                                ...(prev[key] ?? {
                                  inputPerMToken: "",
                                  outputPerMToken: "",
                                  reasoningPerMToken: "",
                                }),
                                reasoningPerMToken: e.target.value,
                              },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm tabular-nums text-muted-foreground">
                        {row.sampleCredits.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={update.isPending}
                          onClick={() => handleSave(row)}
                        >
                          <Save className="size-4" />
                          {t("tokenRates.save")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageShell>
  )
}
