import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Waypoints } from "lucide-react"

import { pipelineService } from "@/shared/services/pipeline.service"
import type { PipelineCardSnapshot } from "../lib/parse-pipeline-card"

const POLL_MS = 3000
const POLL_LIMIT_MS = 60_000
const TERMINAL = new Set(["completed", "failed", "paused"])

export function ChatPipelineCard({ snapshot }: { snapshot: PipelineCardSnapshot }) {
  const { t } = useTranslation("chat")
  const [view, setView] = useState(snapshot)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    setView(snapshot)
    setTimedOut(false)
  }, [snapshot.pipelineId, snapshot.status, snapshot.nodes.length])

  useEffect(() => {
    if (view.status !== "running") return
    let cancelled = false
    const started = Date.now()

    const tick = async () => {
      if (Date.now() - started > POLL_LIMIT_MS) {
        if (!cancelled) setTimedOut(true)
        return true
      }
      try {
        const data = await pipelineService.getById(view.pipelineId)
        if (cancelled) return false
        const nodes = [...data.nodes]
          .sort((a, b) => a.order - b.order)
          .map((node) => ({
            type: node.type,
            order: node.order,
            status: node.status,
            retryCount: node.retryCount ?? 0,
          }))
        const counts: Record<string, number> = {}
        for (const node of nodes) {
          counts[node.status] = (counts[node.status] ?? 0) + 1
        }
        const status = data.pipeline.status
        setView({
          action: "pipeline_status",
          pipelineId: data.pipeline.pipelineId,
          workflowId: data.pipeline.workflowRef,
          status,
          pausedNodeId: data.pipeline.pausedNodeId ?? null,
          contentPrompt: data.pipeline.contentPrompt ?? "",
          counts,
          nodes,
        })
        return status !== "running"
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
  }, [view.pipelineId, view.status])

  const statusKey = ["running", "completed", "failed", "paused"].includes(view.status)
    ? view.status
    : "unknown"
  const countText = Object.entries(view.counts)
    .map(([status, count]) => `${count} ${status}`)
    .join(" · ")

  return (
    <div className="w-full space-y-2 rounded-2xl border border-border bg-muted/20 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Waypoints className="size-3.5 shrink-0" aria-hidden />
            {t("pipelineCard.title")}
          </p>
          <p className="text-[11px] text-muted-foreground">{t(`pipelineCard.status.${statusKey}`)}</p>
        </div>
        <Link
          to="/pipelines"
          className="shrink-0 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
        >
          {t("pipelineCard.openPipelines")}
        </Link>
      </div>
      {view.contentPrompt ? (
        <p className="line-clamp-2 text-[11px] text-foreground">{view.contentPrompt}</p>
      ) : null}
      {countText ? <p className="text-[11px] text-muted-foreground">{countText}</p> : null}
      {view.status === "paused" ? (
        <p className="text-[11px] text-muted-foreground">{t("pipelineCard.pausedHint")}</p>
      ) : null}
      {timedOut && !TERMINAL.has(view.status) ? (
        <p className="text-[11px] text-muted-foreground">{t("pipelineCard.stillRunning")}</p>
      ) : null}
      {view.nodes.length > 0 ? (
        <ol className="space-y-1">
          {view.nodes.map((node, index) => (
            <li key={`${node.type}-${node.order}`} className="flex items-center gap-2 text-[11px]">
              <span className="w-4 text-muted-foreground">{index + 1}</span>
              <span>{t(`workflowCard.types.${node.type}`, { defaultValue: node.type })}</span>
              <span className="text-muted-foreground">{node.status}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
