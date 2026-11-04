import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, GitBranch, Lock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"
import { pipelineNodeTypeMeta } from "@/features/pipeline/lib/pipeline-node-icons"
import { workflowService } from "@/shared/services/workflow.service"
import { workflowCardTitle, type WorkflowCardNode, type WorkflowCardSnapshot } from "../lib/parse-workflow-card"

const POLL_MS = 2000
const POLL_LIMIT_MS = 60_000

type DisplayRow =
  | { kind: "node"; node: WorkflowCardNode }
  | { kind: "adapt"; nodes: WorkflowCardNode[] }

function displayRows(nodes: WorkflowCardNode[]): DisplayRow[] {
  const ordered = [...nodes].sort((a, b) => a.order - b.order)
  const rows: DisplayRow[] = []
  for (const node of ordered) {
    const last = rows.at(-1)
    if (node.type === "adapt" && last?.kind === "adapt") {
      last.nodes.push(node)
      continue
    }
    if (node.type === "adapt") {
      rows.push({ kind: "adapt", nodes: [node] })
      continue
    }
    rows.push({ kind: "node", node })
  }
  return rows
}

function statusBadgeClass(status: string): string {
  if (status === "ready") {
    return "border-teal-400/25 bg-teal-50 text-teal-700 dark:border-teal-700/40 dark:bg-teal-950/60 dark:text-teal-300"
  }
  if (status === "generating") {
    return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
  }
  if (status === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
  }
  return "border-border bg-muted text-muted-foreground"
}

function NodeIcon({ type }: { type: string }) {
  const meta = pipelineNodeTypeMeta(type)
  const Icon = meta.Icon
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md border",
        meta.chipClass,
        "dark:border-border dark:bg-muted/50",
      )}
    >
      <Icon className={cn("size-3", meta.iconClass)} aria-hidden />
    </span>
  )
}

const LANE_META: Record<string, { label: string; initials: string; className: string }> = {
  instagram: { label: "Instagram", initials: "In", className: "bg-gradient-to-br from-pink-500 to-fuchsia-700 text-white" },
  facebook: { label: "Facebook", initials: "F", className: "bg-[#1877F2] text-white" },
  linkedin: { label: "LinkedIn", initials: "Li", className: "bg-[#0A66C2] text-white" },
  youtube: { label: "YouTube", initials: "Yt", className: "bg-[#FF0000] text-white" },
  tiktok: { label: "TikTok", initials: "Tk", className: "bg-neutral-950 text-white" },
  rednote: { label: "RedNote", initials: "R", className: "bg-[#FF2442] text-white" },
}

/** One chip per channel, each with the platform mark - never run together. */
function LanePills({ lanes }: { lanes: string[] }) {
  if (lanes.length === 0) return null
  return (
    <span className="mt-1 flex min-w-0 flex-wrap gap-1">
      {lanes.map((lane) => {
        const meta = LANE_META[lane.toLowerCase()]
        return (
          <span
            key={lane}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-px pr-1.5 pl-0.5 text-[10px] leading-4 text-muted-foreground"
          >
            <span
              className={cn(
                "flex size-3.5 items-center justify-center rounded-full text-[7px] font-bold",
                meta?.className ?? "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              {meta?.initials ?? lane.slice(0, 1).toUpperCase()}
            </span>
            {meta?.label ?? lane}
          </span>
        )
      })}
    </span>
  )
}

export function ChatWorkflowCard({ snapshot }: { snapshot: WorkflowCardSnapshot }) {
  const { t } = useTranslation("chat")
  const [view, setView] = useState(snapshot)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    setView(snapshot)
    setTimedOut(false)
  }, [snapshot.workflowId, snapshot.ruleId, snapshot.status, snapshot.name, snapshot.nodes.length])

  useEffect(() => {
    if (view.status !== "generating") return
    let cancelled = false
    const started = Date.now()

    const tick = async () => {
      if (Date.now() - started > POLL_LIMIT_MS) {
        if (!cancelled) setTimedOut(true)
        return true
      }
      try {
        const data = await workflowService.getByRuleId(view.ruleId)
        if (cancelled || !data) return false
        if (data.workflow.workflowId !== view.workflowId && data.workflow.status === "generating") {
          return false
        }
        setView({
          action: "show_workflow",
          workflowId: data.workflow.workflowId,
          ruleId: data.workflow.ruleRef || view.ruleId,
          status: data.workflow.status,
          name: data.workflow.name,
          brandName: view.brandName,
          nodes: data.nodes.map((node) => ({
            nodeId: node.nodeId,
            type: node.type,
            order: node.order,
            lane: node.lane?.trim() ? node.lane : null,
            isLocked: node.isLocked,
          })),
        })
        return data.workflow.status !== "generating"
      } catch {
        return false
      }
    }

    void tick()
    const timer = setInterval(() => {
      void tick().then((done) => {
        if (done) clearInterval(timer)
      })
    }, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [view.status, view.ruleId, view.workflowId])

  const statusKey = ["generating", "ready", "failed", "archived"].includes(view.status)
    ? view.status
    : "unknown"
  const rows = displayRows(view.nodes)

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground">
          <GitBranch className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-5 text-foreground">
            {workflowCardTitle(view, t("workflowCard.title"))}
          </p>
          <Badge
            variant="outline"
            className={cn(
              "mt-1 px-1.5 py-0 text-[10px] font-semibold tracking-wide",
              statusBadgeClass(view.status),
            )}
          >
            {t(`workflowCard.status.${statusKey}`)}
          </Badge>
        </div>
        <Link
          to={`/workflow/${view.ruleId}`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "h-7 shrink-0 gap-1 px-2 text-[11px] font-medium",
          )}
        >
          {t("workflowCard.openCanvas")}
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </div>

      {rows.length > 0 ? (
        <ol className="relative space-y-0 px-3 py-2">
          {rows.map((row, index) => {
            const key = row.kind === "adapt" ? row.nodes[0]?.nodeId : row.node.nodeId
            const type = row.kind === "adapt" ? "adapt" : row.node.type
            const locked =
              row.kind === "adapt"
                ? row.nodes.some((node) => node.isLocked)
                : row.node.isLocked
            const lanes =
              row.kind === "adapt"
                ? row.nodes.map((node) => node.lane).filter((lane): lane is string => Boolean(lane))
                : row.node.lane
                  ? [row.node.lane]
                  : []
            return (
              <li key={key} className="relative flex gap-2 py-1.5">
                {index < rows.length - 1 ? (
                  <span
                    className="absolute top-8 bottom-0 left-[11px] w-px bg-border"
                    aria-hidden
                  />
                ) : null}
                <NodeIcon type={type} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="flex items-center gap-1 text-[12px] font-medium leading-4 text-foreground">
                    <span className="truncate">
                      {t(`workflowCard.types.${type}`, { defaultValue: type })}
                    </span>
                    {locked ? (
                      <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                    ) : null}
                  </p>
                  <LanePills lanes={lanes} />
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="px-3 py-3 text-[11px] text-muted-foreground">
          {timedOut ? t("workflowCard.stillGenerating") : t("workflowCard.waitingNodes")}
        </p>
      )}
    </div>
  )
}
